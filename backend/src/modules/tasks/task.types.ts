import type {
  CreateTaskInput,
  UpdateTaskInput,
} from "./task.service.js";

// Defines the operations required by the HTTP layer.
// Production uses Prisma; tests can inject a mock implementation.
export interface TaskServiceContract {
  getAllTasks(): Promise<unknown[]>;

  createTask(data: CreateTaskInput): Promise<unknown>;

  updateTask(
    id: number,
    data: UpdateTaskInput,
  ): Promise<unknown>;

  deleteTask(id: number): Promise<void>;
}
