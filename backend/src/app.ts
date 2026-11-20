import express, {
  type ErrorRequestHandler,
} from "express";

import cors from "cors";

import { createTaskRoutes } from "./modules/tasks/task.routes.js";
import type { TaskServiceContract } from "./modules/tasks/task.types.js";

interface AppDependencies {
  taskService: TaskServiceContract;
  checkDatabase: () => Promise<void>;
}

export function createApp({
  taskService,
  checkDatabase,
}: AppDependencies) {
  const app = express();

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    }),
  );

  app.use(express.json({ limit: "1mb" }));

  // Liveness check: confirms the application process is running.
  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "taskflow-backend",
    });
  });

  // Readiness check: confirms the database is reachable.
  app.get("/health/ready", async (_req, res) => {
    await checkDatabase();

    res.status(200).json({
      status: "ready",
      database: "connected",
    });
  });

  app.use("/api/tasks", createTaskRoutes(taskService));

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      message: "Route not found",
    });
  });

  const errorHandler: ErrorRequestHandler = (
    error,
    _req,
    res,
    _next,
  ) => {
    console.error("Application error:", error);

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

  return app;
}