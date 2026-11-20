import type { RequestHandler } from "express";
import { z } from "zod";

import type { TaskServiceContract } from "./task.types.js";

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(["pending", "completed"]).optional(),
});

const updateTaskSchema = createTaskSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0);

function parseTaskId(value: string | string[]): number | null {
  if (typeof value !== "string") return null;

  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Inject the service instead of importing Prisma directly.
// This makes the controller independently testable.
export function createTaskController(service: TaskServiceContract) {
  const getTasks: RequestHandler = async (_req, res) => {
    const tasks = await service.getAllTasks();

    res.status(200).json({
      success: true,
      data: tasks,
    });
  };

  const createTask: RequestHandler = async (req, res) => {
    const validation = createTaskSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        message: "Invalid task data",
        errors: validation.error.issues,
      });
      return;
    }

    const task = await service.createTask(validation.data);

    res.status(201).json({
      success: true,
      message: "Task created successfully",
      data: task,
    });
  };

  const updateTask: RequestHandler = async (req, res) => {
    const id = parseTaskId(req.params.id);

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

    const task = await service.updateTask(id, validation.data);

    res.status(200).json({
      success: true,
      message: "Task updated successfully",
      data: task,
    });
  };

  const deleteTask: RequestHandler = async (req, res) => {
    const id = parseTaskId(req.params.id);

    if (id === null) {
      res.status(400).json({
        success: false,
        message: "Invalid task ID",
      });
      return;
    }

    await service.deleteTask(id);

    res.status(200).json({
      success: true,
      message: "Task deleted successfully",
    });
  };

  return {
    getTasks,
    createTask,
    updateTask,
    deleteTask,
  };
}