import { Router } from "express";

import { createTaskController } from "./task.controller.js";
import type { TaskServiceContract } from "./task.types.js";

export function createTaskRoutes(service: TaskServiceContract) {
  const router = Router();

  const controller = createTaskController(service);

  router.get("/", controller.getTasks);
  router.post("/", controller.createTask);
  router.patch("/:id", controller.updateTask);
  router.delete("/:id", controller.deleteTask);

  return router;
}