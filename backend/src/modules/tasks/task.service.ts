import { prisma } from "../../lib/prisma.js";

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: "pending" | "completed";
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: "pending" | "completed";
}

export const taskService = {
  // Return all tasks, newest first.
  async getAllTasks() {
    return prisma.task.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
  },

  // Create a new task.
  async createTask(data: CreateTaskInput) {
    return prisma.task.create({
      data,
    });
  },

  // Update an existing task.
  async updateTask(id: number, data: UpdateTaskInput) {
    return prisma.task.update({
      where: { id },
      data,
    });
  },

  // Delete a task.
  async deleteTask(id: number) {
    return prisma.task.delete({
      where: { id },
    });
  },
};
