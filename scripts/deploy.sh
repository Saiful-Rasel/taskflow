#!/usr/bin/env bash

set -Eeuo pipefail

# ==========================================================
# TaskFlow - Blue-Green Deployment
#
# Architecture:
# GitHub Actions -> S3 -> EC2 -> PM2 -> Nginx -> ALB
#
# Blue  : 127.0.0.1:5000
# Green : 127.0.0.1:5001
#
# Commands:
# ./deploy.sh deploy <40-character-commit-sha>
# ./deploy.sh rollback
# ==========================================================

# ----------------------------------------------------------
# 1. Configuration
# ----------------------------------------------------------

APP_USER="ubuntu"

APP_DIR="/opt/taskflow"
SHARED_DIR="$APP_DIR/shared"
RELEASES_DIR="$APP_DIR/releases"
CURRENT_LINK="$APP_DIR/current"

ENV_FILE="$SHARED_DIR/.env"
STATE_DIR="$SHARED_DIR/blue-green"

FRONTEND_DIR="/var/www/taskflow"
LEGACY_FRONTEND="$SHARED_DIR/frontend-legacy-backup"

NGINX_SITE="/etc/nginx/sites-available/taskflow"
NGINX_ENABLED="/etc/nginx/sites-enabled/taskflow"
NGINX_UPSTREAM="/etc/nginx/conf.d/taskflow-upstream.conf"

AWS_REGION="${AWS_REGION:-ap-south-1}"
S3_BUCKET="${S3_BUCKET:-taskflow-build-artifacts}"

BLUE_PORT=5000
GREEN_PORT=5001

BLUE_PROCESS="taskflow-api-blue"
GREEN_PROCESS="taskflow-api-green"

MODE="${1:-}"
COMMIT_SHA="${2:-}"

# ----------------------------------------------------------
# 2. Switch to ubuntu user
# ----------------------------------------------------------

if [[ "$(id -un)" != "$APP_USER" ]]; then
    if [[ "$EUID" -eq 0 ]]; then
        exec sudo -iu "$APP_USER" env \
            "AWS_REGION=$AWS_REGION" \
            "S3_BUCKET=$S3_BUCKET" \
            /bin/bash "$0" "$@"
    fi

    echo "ERROR: Run as ubuntu or root."
    exit 1
fi

# ----------------------------------------------------------
# 3. Basic validation
# ----------------------------------------------------------

if [[ "$MODE" != "deploy" && "$MODE" != "rollback" ]]; then
    echo "Usage:"
    echo "./deploy.sh deploy <COMMIT_SHA>"
    echo "./deploy.sh rollback"
    exit 1
fi

for command in node npm pm2 aws jq curl tar psql nginx systemctl rsync; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "ERROR: Required command missing: $command"
        exit 1
    fi
done

if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: Missing environment file: $ENV_FILE"
    exit 1
fi

mkdir -p "$SHARED_DIR" "$RELEASES_DIR" "$STATE_DIR"
chmod 600 "$ENV_FILE"

set -a
source "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "ERROR: DATABASE_URL is missing in $ENV_FILE."
    exit 1
fi

# ----------------------------------------------------------
# 4. Helper functions
# ----------------------------------------------------------

get_port() {
    case "$1" in
        blue)  echo "$BLUE_PORT" ;;
        green) echo "$GREEN_PORT" ;;
        *) return 1 ;;
    esac
}

get_process() {
    case "$1" in
        blue)  echo "$BLUE_PROCESS" ;;
        green) echo "$GREEN_PROCESS" ;;
        *) return 1 ;;
    esac
}

get_other_slot() {
    case "$1" in
        blue)  echo "green" ;;
        green) echo "blue" ;;
        *) return 1 ;;
    esac
}

get_release() {
    local slot="$1"
    local file="$STATE_DIR/slot-release-$slot"
    [[ -f "$file" ]] || return 1
    cat "$file"
}

check_health() {
    local port="$1"
    local name="$2"

    echo "Checking $name on port $port..."

    for attempt in {1..15}; do
        if curl -fsS --max-time 5 "http://127.0.0.1:$port/health" >/dev/null; then
            echo "PASS: $name is healthy."
            return 0
        fi
        echo "Attempt $attempt/15 failed. Retrying in 2s..."
        sleep 2
    done

    echo "FAIL: $name health check failed."
    return 1
}

switch_upstream() {
    local port="$1"
    local temp_file
    temp_file="$(mktemp)"

    cat > "$temp_file" <<EOF
upstream taskflow_backend {
    server 127.0.0.1:$port;
    keepalive 16;
}
EOF

    sudo mkdir -p /etc/nginx/conf.d
    sudo install -m 644 "$temp_file" "$NGINX_UPSTREAM"
    rm -f "$temp_file"

    if ! sudo nginx -t; then
        echo "ERROR: Nginx configuration validation failed."
        return 1
    fi

    sudo systemctl reload nginx
    echo "Nginx traffic now points to port $port."
}

replace_symlink() {
    local target="$1"
    local link="$2"
    local temporary_link="${link}.new"

    rm -f "$temporary_link"
    ln -s "$target" "$temporary_link"
    mv -Tf "$temporary_link" "$link"
}

# ----------------------------------------------------------
# 5. Configure Nginx
# ----------------------------------------------------------

configure_nginx() {
    echo "Configuring Nginx..."

    sudo mkdir -p /etc/nginx/conf.d

    # Ensure upstream exists before nginx -t on first deploy
    if [[ ! -f "$NGINX_UPSTREAM" ]]; then
        switch_upstream "$BLUE_PORT"
    fi

    sudo tee "$NGINX_SITE" >/dev/null <<'NGINX'
server {
    listen 80;
    server_name _;

    root /var/www/taskflow;
    index index.html;

    # Cache static assets aggressively (Vite hashed files)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # Never cache index.html so new releases load immediately
    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        try_files $uri =404;
    }

    # React SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API proxy
    location /api/ {
        proxy_pass http://taskflow_backend;
        proxy_http_version 1.1;

        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ALB & local health check
    location /health {
        proxy_pass http://taskflow_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
    }
}
NGINX

    sudo ln -sfn "$NGINX_SITE" "$NGINX_ENABLED"
    sudo rm -f /etc/nginx/sites-enabled/default

    sudo nginx -t
    sudo systemctl enable --now nginx
}

# ----------------------------------------------------------
# 6. Download and prepare release
# ----------------------------------------------------------

prepare_release() {
    if [[ ! "$COMMIT_SHA" =~ ^[a-f0-9]{40}$ ]]; then
        echo "ERROR: Invalid commit SHA: '$COMMIT_SHA'"
        exit 1
    fi

    RELEASE_DIR="$RELEASES_DIR/$COMMIT_SHA"
    STAGING_DIR="$RELEASES_DIR/.${COMMIT_SHA}.staging"
    ARTIFACT_PREFIX="releases/$COMMIT_SHA"

    if [[ -d "$RELEASE_DIR" ]]; then
        echo "Release already exists. Validating..."
        if [[ -f "$RELEASE_DIR/frontend/index.html" &&
              -f "$RELEASE_DIR/backend/dist/server.js" &&
              -f "$RELEASE_DIR/backend/package.json" &&
              -f "$RELEASE_DIR/backend/package-lock.json" &&
              -f "$RELEASE_DIR/backend/prisma/schema.prisma" &&
              -d "$RELEASE_DIR/backend/prisma/migrations" ]]; then
            echo "Existing release is complete."
            return 0
        fi
        echo "Incomplete release. Removing it..."
        rm -rf "$RELEASE_DIR"
    fi

    rm -rf "$STAGING_DIR"
    mkdir -p "$STAGING_DIR/frontend" "$STAGING_DIR/backend"

    echo "Downloading frontend artifact..."
    aws s3 cp \
        "s3://$S3_BUCKET/$ARTIFACT_PREFIX/frontend.tar.gz" \
        "$STAGING_DIR/frontend.tar.gz" \
        --region "$AWS_REGION"

    echo "Downloading backend artifact..."
    aws s3 cp \
        "s3://$S3_BUCKET/$ARTIFACT_PREFIX/backend.tar.gz" \
        "$STAGING_DIR/backend.tar.gz" \
        --region "$AWS_REGION"

    echo "Extracting artifacts..."
    tar -xzf "$STAGING_DIR/frontend.tar.gz" -C "$STAGING_DIR/frontend"
    tar -xzf "$STAGING_DIR/backend.tar.gz" -C "$STAGING_DIR/backend"

    rm -f "$STAGING_DIR/frontend.tar.gz" "$STAGING_DIR/backend.tar.gz"

    test -f "$STAGING_DIR/frontend/index.html"
    test -f "$STAGING_DIR/backend/dist/server.js"
    test -f "$STAGING_DIR/backend/package.json"
    test -f "$STAGING_DIR/backend/package-lock.json"
    test -f "$STAGING_DIR/backend/prisma/schema.prisma"
    test -d "$STAGING_DIR/backend/prisma/migrations"

    mv "$STAGING_DIR" "$RELEASE_DIR"
    echo "Release prepared: $RELEASE_DIR"
}

# ----------------------------------------------------------
# 7. Install dependencies and migrate database
# ----------------------------------------------------------

prepare_backend() {
    local backend_dir="$1"

    echo "Installing production dependencies..."
    cd "$backend_dir"

    export NODE_OPTIONS="--max-old-space-size=384"
    npm ci --omit=dev --no-audit --no-fund

    echo "Generating Prisma client & running migrations..."
    npx prisma generate
    npx prisma migrate deploy

    echo "Database migrations completed."
}

# ----------------------------------------------------------
# 8. Start inactive application slot
# ----------------------------------------------------------

start_slot() {
    local slot="$1"
    local release="$2"

    local port
    local process
    port="$(get_port "$slot")"
    process="$(get_process "$slot")"

    local backend_dir="$release/backend"

    echo "Starting $slot slot (Port: $port, Process: $process)..."

    # Delete old PM2 process if exists so --cwd always points to the new release directory
    if pm2 describe "$process" >/dev/null 2>&1; then
        pm2 delete "$process" >/dev/null
    fi

    PORT="$port" \
    NODE_ENV=production \
    pm2 start "$backend_dir/dist/server.js" \
        --name "$process" \
        --cwd "$backend_dir" \
        --update-env

    pm2 save
    check_health "$port" "$slot"
}

# ----------------------------------------------------------
# 9. Configure frontend release
# ----------------------------------------------------------

switch_frontend() {
    local release="$1"
    local frontend_release="$release/frontend"

    test -f "$frontend_release/index.html"

    if [[ -d "$FRONTEND_DIR" && ! -L "$FRONTEND_DIR" ]]; then
        if [[ ! -d "$LEGACY_FRONTEND" ]]; then
            sudo mv "$FRONTEND_DIR" "$LEGACY_FRONTEND"
        else
            sudo rm -rf "$FRONTEND_DIR"
        fi
    fi

    sudo mkdir -p "$(dirname "$FRONTEND_DIR")"

    local temporary_link="${FRONTEND_DIR}.new"
    sudo rm -f "$temporary_link"
    sudo ln -s "$frontend_release" "$temporary_link"
    sudo mv -Tf "$temporary_link" "$FRONTEND_DIR"

    sudo nginx -t
    sudo systemctl reload nginx
}

# ----------------------------------------------------------
# 10. Cleanup old releases (keep active slots + latest 3)
# ----------------------------------------------------------

cleanup_old_releases() {
    local blue_rel green_rel
    blue_rel="$(get_release "blue" || true)"
    green_rel="$(get_release "green" || true)"

    cd "$RELEASES_DIR"
    for dir in $(ls -1dt */ 2>/dev/null | sed 's:/*$::' | tail -n +5); do
        local full_path="$RELEASES_DIR/$dir"
        if [[ "$full_path" != "$blue_rel" && "$full_path" != "$green_rel" ]]; then
            echo "Cleaning up old release: $full_path"
            rm -rf "$full_path"
        fi
    done
}

# ----------------------------------------------------------
# 11. Manual rollback
# ----------------------------------------------------------

manual_rollback() {
    if [[ ! -f "$STATE_DIR/active-slot" ]]; then
        echo "ERROR: No active slot state found."
        exit 1
    fi

    local active_slot rollback_slot rollback_release rollback_port rollback_process

    active_slot="$(cat "$STATE_DIR/active-slot")"
    rollback_slot="$(get_other_slot "$active_slot")"

    rollback_release="$(get_release "$rollback_slot")" || {
        echo "ERROR: No previous release available for $rollback_slot."
        exit 1
    }

    if [[ ! -d "$rollback_release" ]]; then
        echo "ERROR: Rollback release directory missing: $rollback_release"
        exit 1
    fi

    rollback_port="$(get_port "$rollback_slot")"
    rollback_process="$(get_process "$rollback_slot")"

    echo "Rolling back from $active_slot to $rollback_slot ($rollback_release)..."

    if ! pm2 describe "$rollback_process" >/dev/null 2>&1; then
        echo "ERROR: Previous PM2 process ($rollback_process) is unavailable."
        exit 1
    fi

    check_health "$rollback_port" "$rollback_slot"

    switch_frontend "$rollback_release"
    switch_upstream "$rollback_port"
    replace_symlink "$rollback_release" "$CURRENT_LINK"

    echo "$rollback_slot" > "$STATE_DIR/active-slot"

    echo "Manual rollback successful."
    echo "Active slot: $rollback_slot (Port: $rollback_port)"
}

# ----------------------------------------------------------
# 12. Deployment rollback handler
# ----------------------------------------------------------

OLD_SLOT=""
OLD_PORT=""
OLD_RELEASE=""
TARGET_SLOT=""
TARGET_PORT=""
TARGET_RELEASE=""

SWITCH_ATTEMPTED=0
DEPLOYMENT_SUCCEEDED=0

rollback_on_failure() {
    local exit_code=$?

    if [[ "$DEPLOYMENT_SUCCEEDED" -eq 1 ]]; then
        return
    fi

    echo ""
    echo "======================================"
    echo "DEPLOYMENT FAILED"
    echo "======================================"

    if [[ "$SWITCH_ATTEMPTED" -eq 1 && -n "$OLD_PORT" ]]; then
        echo "Restoring previous frontend & Nginx upstream..."

        if [[ -n "$OLD_RELEASE" && -d "$OLD_RELEASE" ]]; then
            switch_frontend "$OLD_RELEASE" || true
            switch_upstream "$OLD_PORT" || true
            replace_symlink "$OLD_RELEASE" "$CURRENT_LINK" || true

            if [[ -n "$OLD_SLOT" ]]; then
                echo "$OLD_SLOT" > "$STATE_DIR/active-slot"
            fi
        fi
    fi

    if [[ -n "$TARGET_SLOT" ]]; then
        echo "Keeping the previous active process available."
        echo "Failed target process: $(get_process "$TARGET_SLOT")"
    fi

    exit "$exit_code"
}

trap rollback_on_failure ERR

# ----------------------------------------------------------
# 13. Main deployment
# ----------------------------------------------------------

main() {
    echo "======================================"
    echo "TaskFlow Blue-Green Deployment"
    echo "======================================"

    if [[ "$MODE" == "rollback" ]]; then
        manual_rollback
        return
    fi

    prepare_release
    TARGET_RELEASE="$RELEASE_DIR"

    if [[ -f "$STATE_DIR/active-slot" ]]; then
        OLD_SLOT="$(cat "$STATE_DIR/active-slot")"
    elif pm2 describe "taskflow-api" >/dev/null 2>&1 &&
         curl -fsS "http://127.0.0.1:$BLUE_PORT/health" >/dev/null; then
        OLD_SLOT="blue"
        echo "Legacy taskflow-api detected on port 5000."
    else
        OLD_SLOT=""
    fi

    if [[ -n "$OLD_SLOT" ]]; then
        OLD_PORT="$(get_port "$OLD_SLOT")"
        OLD_RELEASE="$(get_release "$OLD_SLOT" || true)"
        TARGET_SLOT="$(get_other_slot "$OLD_SLOT")"
    else
        TARGET_SLOT="blue"
    fi

    TARGET_PORT="$(get_port "$TARGET_SLOT")"

    echo "Previous slot: ${OLD_SLOT:-none}"
    echo "Target slot: $TARGET_SLOT"
    echo "Target port: $TARGET_PORT"

    if [[ -n "$OLD_SLOT" ]]; then
        check_health "$OLD_PORT" "$OLD_SLOT"
    fi

    configure_nginx
    prepare_backend "$TARGET_RELEASE/backend"
    start_slot "$TARGET_SLOT" "$TARGET_RELEASE"

    SWITCH_ATTEMPTED=1

    switch_frontend "$TARGET_RELEASE"
    switch_upstream "$TARGET_PORT"

    replace_symlink "$TARGET_RELEASE" "$CURRENT_LINK"
    echo "$TARGET_RELEASE" > "$STATE_DIR/slot-release-$TARGET_SLOT"
    echo "$TARGET_SLOT" > "$STATE_DIR/active-slot"

    if ! curl -fsS --retry 5 --retry-delay 2 --retry-connrefused --max-time 5 http://127.0.0.1/health >/dev/null; then
        echo "ERROR: Nginx backend health check failed."
        return 1
    fi

    if ! curl -fsS --retry 5 --retry-delay 2 --retry-connrefused --max-time 5 http://127.0.0.1/ >/dev/null; then
        echo "ERROR: Frontend health check failed."
        return 1
    fi

    DEPLOYMENT_SUCCEEDED=1
    SWITCH_ATTEMPTED=0

    pm2 save
    cleanup_old_releases

    echo ""
    echo "======================================"
    echo "DEPLOYMENT SUCCESSFUL"
    echo "======================================"
    echo "Commit: $COMMIT_SHA"
    echo "Active slot: $TARGET_SLOT"
    echo "Active port: $TARGET_PORT"
    echo "Release: $TARGET_RELEASE"
    echo ""
    pm2 status
}

main "$@"