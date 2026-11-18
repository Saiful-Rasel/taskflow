import { Router } from "express";

import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
} from "./task.controller.js";

const router = Router();

// GET all tasks.
router.get("/", getTasks);

// Create a task.
router.post("/", createTask);

// Update a task.
router.patch("/:id", updateTask);

// Delete a task.
router.delete("/:id", deleteTask);

export default router;
