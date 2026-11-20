
import { describe, it, expect, vi } from "vitest";
import request from "supertest";

import { createApp } from "../app.js";
import type { TaskServiceContract } from "../modules/tasks/task.types.js";

// Fake service: no real database is required for these API tests.
function createMockService() {
  return {
    getAllTasks: vi.fn().mockResolvedValue([]),

    createTask: vi.fn().mockResolvedValue({
      id: 1,
      title: "Learn GitHub Actions",
      description: null,
      status: "pending",
    }),

    updateTask: vi.fn().mockResolvedValue({
      id: 1,
      title: "Learn GitHub Actions",
      status: "completed",
    }),

    deleteTask: vi.fn().mockResolvedValue(undefined),
  } satisfies TaskServiceContract;
}

describe("TaskFlow API", () => {
  it("should return healthy status", async () => {
    const app = createApp({
      taskService: createMockService(),
      checkDatabase: vi.fn().mockResolvedValue(undefined),
    });

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.service).toBe("taskflow-backend");
  });

  it("should return all tasks", async () => {
    const service = createMockService();

    const app = createApp({
      taskService: service,
      checkDatabase: vi.fn().mockResolvedValue(undefined),
    });

    const response = await request(app).get("/api/tasks");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual([]);

    expect(service.getAllTasks).toHaveBeenCalledOnce();
  });

  it("should create a task with valid input", async () => {
    const service = createMockService();

    const app = createApp({
      taskService: service,
      checkDatabase: vi.fn().mockResolvedValue(undefined),
    });

    const response = await request(app)
      .post("/api/tasks")
      .send({
        title: "Learn CI/CD",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.title).toBe("Learn GitHub Actions");
  });

  it("should reject an empty task title", async () => {
    const service = createMockService();

    const app = createApp({
      taskService: service,
      checkDatabase: vi.fn().mockResolvedValue(undefined),
    });

    const response = await request(app)
      .post("/api/tasks")
      .send({
        title: "   ",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid task data");

    // Invalid input must never reach the business logic.
    expect(service.createTask).not.toHaveBeenCalled();
  });

  it("should reject an invalid task ID", async () => {
    const service = createMockService();

    const app = createApp({
      taskService: service,
      checkDatabase: vi.fn().mockResolvedValue(undefined),
    });

    const response = await request(app)
      .patch("/api/tasks/invalid")
      .send({
        status: "completed",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid task ID");
  });
});