
import type { RequestHandler } from "express";
import { z } from "zod";

import { taskService } from "./task.service.js";

// Validate new task data.
const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(["pending", "completed"]).optional(),
});

// Validate update data.
// At least one field must be provided.
const updateTaskSchema = createTaskSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0);

// Parse and validate task ID from route params.
function parseTaskId(value: string): number | null {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Extract a safe string ID from Express route params.
function getTaskId(rawId: string | string[]): number | null {
  // Reject unexpected array values.
  if (typeof rawId !== "string") {
    return null;
  }

  return parseTaskId(rawId);
}

// GET /api/tasks
export const getTasks: RequestHandler = async (_req, res) => {
  const tasks = await taskService.getAllTasks();

  res.status(200).json({
    success: true,
    data: tasks,
  });
};

// POST /api/tasks
export const createTask: RequestHandler = async (req, res) => {
  const validation = createTaskSchema.safeParse(req.body);

  if (!validation.success) {
    res.status(400).json({
      success: false,
      message: "Invalid task data",
      errors: validation.error.issues,
    });
    return;
  }

  const task = await taskService.createTask(validation.data);

  res.status(201).json({
    success: true,
    message: "Task created successfully",
    data: task,
  });
};

// PATCH /api/tasks/:id
export const updateTask: RequestHandler = async (req, res) => {
  const id = getTaskId(req.params.id);

  if (id === null) {
    res.status(400).json({
      success: false,
      message: "Invalid task ID",
    });
    return;
  }

  const validation = updateTaskSchema.safeParse(req.body);

  if (!validation.success) {
    res.status(400).json({
      success: false,
      message: "Invalid task data",
      errors: validation.error.issues,
    });
    return;
  }

  const task = await taskService.updateTask(id, validation.data);

  res.status(200).json({
    success: true,
    message: "Task updated successfully",
    data: task,
  });
};

// DELETE /api/tasks/:id
export const deleteTask: RequestHandler = async (req, res) => {
  const id = getTaskId(req.params.id);

  if (id === null) {
    res.status(400).json({
      success: false,
      message: "Invalid task ID",
    });
    return;
  }

  await taskService.deleteTask(id);

  res.status(200).json({
    success: true,
    message: "Task deleted successfully",
  });
};
