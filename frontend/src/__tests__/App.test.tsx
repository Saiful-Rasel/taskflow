
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "../App";
import {
  createTask,
  getTasks,
  type Task,
} from "../services/task.service";

// Mock the API layer so UI tests do not need a running backend.
vi.mock("../services/task.service", () => ({
  getTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));

const sampleTask: Task = {
  id: 1,
  title: "Learn GitHub Actions",
  description: "Practice CI/CD pipeline",
  status: "pending",
  createdAt: "2026-11-20T10:00:00.000Z",
  updatedAt: "2026-11-20T10:00:00.000Z",
};

describe("TaskFlow application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the TaskFlow application", async () => {
    vi.mocked(getTasks).mockResolvedValue([]);

    render(<App />);

    expect(
      screen.getByRole("heading", { name: /taskflow/i }),
    ).toBeInTheDocument();

    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
  });

  it("should display tasks returned by the API", async () => {
    vi.mocked(getTasks).mockResolvedValue([sampleTask]);

    render(<App />);

    expect(
      await screen.findByText("Learn GitHub Actions"),
    ).toBeInTheDocument();

    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("should create a task when the user submits the form", async () => {
    const user = userEvent.setup();

    vi.mocked(getTasks).mockResolvedValue([]);
    vi.mocked(createTask).mockResolvedValue(sampleTask);

    render(<App />);

    // Wait until the initial API request finishes.
    await screen.findByText("Nothing here yet");

    await user.type(
      screen.getByPlaceholderText("What needs to be done?"),
      "Learn GitHub Actions",
    );

    await user.type(
      screen.getByPlaceholderText("Add a description (optional)"),
      "Practice automated CI",
    );

    await user.click(
      screen.getByRole("button", { name: /add task/i }),
    );

    expect(createTask).toHaveBeenCalledWith({
      title: "Learn GitHub Actions",
      description: "Practice automated CI",
    });

    expect(
      await screen.findByText("Learn GitHub Actions"),
    ).toBeInTheDocument();
  });

  it("should display an error when the API request fails", async () => {
    vi.mocked(getTasks).mockRejectedValue(
      new Error("Unable to connect to API"),
    );

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to connect to API",
    );
  });
});
