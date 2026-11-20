const API_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: "pending" | "completed";
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

// Shared request helper.
async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Something went wrong");
  }

  return result as T;
}

// Fetch all tasks.
export async function getTasks(): Promise<Task[]> {
  const response = await request<ApiResponse<Task[]>>("/tasks");

  return response.data;
}

// Create a new task.
export async function createTask(
  data: CreateTaskInput,
): Promise<Task> {
  const response = await request<ApiResponse<Task>>("/tasks", {
    method: "POST",
    body: JSON.stringify(data),
  });

  return response.data;
}

// Update an existing task.
export async function updateTask(
  id: number,
  data: Partial<CreateTaskInput> & {
    status?: "pending" | "completed";
  },
): Promise<Task> {
  const response = await request<ApiResponse<Task>>(`/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  return response.data;
}

// Delete a task.
export async function deleteTask(id: number): Promise<void> {
  await request<ApiResponse<null>>(`/tasks/${id}`, {
    method: "DELETE",
  });
}
