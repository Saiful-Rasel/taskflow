import "dotenv/config";

import express, {
  type ErrorRequestHandler,
} from "express";

import cors from "cors";

import taskRoutes from "./modules/tasks/task.routes.js";
import { prisma } from "./lib/prisma.js";

const app = express();

const PORT = Number(process.env.PORT) || 5000;

// Allow requests from our frontend.
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  }),
);

// Parse incoming JSON requests.
app.use(express.json({ limit: "1mb" }));

// Basic application health check.
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "taskflow-backend",
  });
});

// Database readiness check.
app.get("/health/ready", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;

  res.status(200).json({
    status: "ready",
    database: "connected",
  });
});

// Task routes.
app.use("/api/tasks", taskRoutes);

// Handle unknown routes.
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Centralized error handler.
const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
) => {
  console.error("Application error:", error);

  // Prisma P2025 means the requested record was not found.
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2025"
  ) {
    res.status(404).json({
      success: false,
      message: "Task not found",
    });
    return;
  }

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

app.use(errorHandler);

// Start the HTTP server.
const server = app.listen(PORT, () => {
  console.log(`TaskFlow API running at http://localhost:${PORT}`);
});

// Gracefully close the server and database connection.
async function shutdown() {
  console.log("Shutting down TaskFlow API...");

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
