# ShopNest — Automated CI/CD & Blue-Green Deployment

ShopNest is a three-tier e-commerce web application deployed on AWS EC2 with an automated GitHub Actions pipeline and a Blue-Green deployment strategy to ensure zero-downtime releases and fast recovery.

- **Live Application URL:** `http://taskflow-alb-2057187704.ap-south-1.elb.amazonaws.com/` *(keep running until grading finishes)*
- **Architecture:** Three-tier application (Frontend Web Tier, Backend REST API Tier, Relational Database Tier) behind Nginx with Blue (`127.0.0.1:5000`) and Green (`127.0.0.1:5001`) slots managed via `deploy.sh`, `ecosystem.config.cjs`, and `blue-green/` state tracking.

---

## Table of Contents
1. [CI/CD Concepts (Part A)](#cicd-concepts)
2. [Architecture & Workflow Design (Parts B, C & E)](#architecture--workflow-design)
3. [Secrets & Configuration Management (Part D)](#secrets--configuration-management)
4. [Zero-Downtime Blue-Green Deployment (Part F)](#zero-downtime-blue-green-deployment)
5. [Repository Structure, Setup & Verification (Part I)](#repository-structure-setup--verification)

---

## CI/CD Concepts

### CI vs. Continuous Delivery vs. Continuous Deployment
- **Continuous Integration (CI):** Developers frequently push changes or open pull requests to `main`, automatically triggering dependency installation, linting, automated tests, and builds for both frontend and backend so broken code is caught early.
- **Continuous Delivery:** Every change that passes CI is automatically packaged and kept in a releasable state, with deployment to production triggered intentionally or after approval.
- **Continuous Deployment:** Every change that passes automated checks and gates is automatically pushed to production without manual intervention.

### How This Pipeline Addresses Past Incidents
1. **Broken builds reaching production:** Automated CI checks (install, lint, tests, build) run on pushes and pull requests targeting `main`, blocking merges when checks fail.
2. **~10 minutes of downtime per deployment:** Blue-Green slot switching (`blue` on `5000`, `green` on `5001`) updates the Nginx upstream only after the target slot is started and ready, keeping traffic flowing without interruption.
3. **2 hours to recover after a bad release:** Each deployment tracks `active-slot`, per-slot release mappings, and commit SHA traceability, allowing quick rollback (`./deploy.sh rollback`) to the previous slot/version.

### Chosen Approach for ShopNest
ShopNest uses a **CI + Continuous Delivery** workflow on `main` (with environment separation and controlled release promotion): automated CI validates every change, artifacts are built with commit traceability, and EC2 deployments switch Blue/Green slots cleanly while protecting the database from public internet access.

---

## Architecture & Workflow Design

### Three-Tier & Deployment Overview
```text
                        [ GitHub Actions ]
                     ┌──────────┴──────────┐
                     ▼                     ▼
               [ CI Workflow ]       [ CD Workflow ]
             (lint, test, build)     (SSH / Artifact)
                     │                     │
                     └──────────┬──────────┘
                                ▼
                   [ AWS EC2 Instance ]
     ┌────────────────────────────────────────────────┐
     │  Nginx Reverse Proxy                           │
     │    └── /etc/nginx/conf.d/taskflow-upstream.conf│
     │          ├── Blue  -> 127.0.0.1:5000           │
     │          └── Green -> 127.0.0.1:5001           │
     │                                                │
     │  PM2 Process Manager (ecosystem.config.cjs)    │
     │  Slot State (/opt/taskflow/shared/blue-green/) │
     │    ├── Frontend Tier      └── Backend API Tier │
     └────────────────────────┬───────────────────────┘
                              │ Private / Local Only
                              ▼
                  [ Relational Database Tier ]
               (Not reachable from public internet)
