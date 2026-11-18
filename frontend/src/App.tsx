
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createTask,
  deleteTask,
  getTasks,
  updateTask,
  type Task,
} from "./services/task.service";

import "./App.css";

type Filter = "all" | "pending" | "completed";

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [filter, setFilter] = useState<Filter>("all");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Fetch tasks when the component first mounts.
  useEffect(() => {
    let isMounted = true;

    async function fetchTasks() {
      try {
        const data = await getTasks();

        if (isMounted) {
          setTasks(data);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : "Unable to load tasks",
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void fetchTasks();

    return () => {
      isMounted = false;
    };
  }, []);

  // Calculate task statistics.
  const completedCount = useMemo(
    () => tasks.filter((task) => task.status === "completed").length,
    [tasks],
  );

  const pendingCount = tasks.length - completedCount;

  // Filter tasks based on selected status.
  const filteredTasks = useMemo(() => {
    if (filter === "all") return tasks;

    return tasks.filter((task) => task.status === filter);
  }, [tasks, filter]);

  // Create a new task.
  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) return;

    try {
      setSubmitting(true);
      setError("");

      const task = await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
      });

      setTasks((current) => [task, ...current]);

      setTitle("");
      setDescription("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create task",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Toggle task completion.
  async function handleToggleTask(task: Task) {
    const nextStatus =
      task.status === "completed" ? "pending" : "completed";

    try {
      setError("");

      const updatedTask = await updateTask(task.id, {
        status: nextStatus,
      });

      setTasks((current) =>
        current.map((item) =>
          item.id === updatedTask.id ? updatedTask : item,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update task",
      );
    }
  }

  // Delete a task.
  async function handleDeleteTask(id: number) {
    try {
      setError("");

      await deleteTask(id);

      setTasks((current) => current.filter((task) => task.id !== id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete task",
      );
    }
  }

  return (
    <main className="app-container">
      <header className="header">
        <div>
          <p className="eyebrow">PERSONAL PRODUCTIVITY</p>
          <h1>TaskFlow<span>.</span></h1>
          <p className="subtitle">
            Organize your work. Focus on what matters.
          </p>
        </div>

        <div className="header-icon">✓</div>
      </header>

      <section className="stats">
        <article className="stat-card">
          <span>Total tasks</span>
          <strong>{tasks.length}</strong>
        </article>

        <article className="stat-card pending">
          <span>Pending</span>
          <strong>{pendingCount}</strong>
        </article>

        <article className="stat-card completed">
          <span>Completed</span>
          <strong>{completedCount}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="section-label">QUICK ACTION</p>
            <h2>Create a task</h2>
          </div>
          <span className="plus-icon">+</span>
        </div>

        <form onSubmit={handleCreateTask} className="task-form">
          <input
            type="text"
            placeholder="What needs to be done?"
            value={title}
            maxLength={150}
            onChange={(event) => setTitle(event.target.value)}
            required
          />

          <textarea
            placeholder="Add a description (optional)"
            value={description}
            maxLength={5000}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
          />

          <button type="submit" disabled={submitting}>
            {submitting ? "Adding..." : "+ Add task"}
          </button>
        </form>
      </section>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      <section className="task-section">
        <div className="task-heading">
          <div>
            <p className="section-label">YOUR WORKSPACE</p>
            <h2>Your tasks</h2>
          </div>

          <div className="filters">
            {(["all", "pending", "completed"] as Filter[]).map(
              (value) => (
                <button
                  key={value}
                  className={filter === value ? "filter active" : "filter"}
                  onClick={() => setFilter(value)}
                  type="button"
                >
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </button>
              ),
            )}
          </div>
        </div>

        {loading ? (
          <p className="empty-state">Loading tasks...</p>
        ) : filteredTasks.length === 0 ? (
          <div className="empty-state">
            <span>Nothing here yet</span>
            <p>Create a task to get started.</p>
          </div>
        ) : (
          <div className="task-list">
            {filteredTasks.map((task) => (
              <article className="task-card" key={task.id}>
                <button
                  type="button"
                  className={
                    task.status === "completed"
                      ? "check-button checked"
                      : "check-button"
                  }
                  aria-label={`Toggle ${task.title} status`}
                  onClick={() => void handleToggleTask(task)}
                >
                  {task.status === "completed" ? "✓" : ""}
                </button>

                <div className="task-content">
                  <h3
                    className={
                      task.status === "completed" ? "task-done" : ""
                    }
                  >
                    {task.title}
                  </h3>

                  {task.description && <p>{task.description}</p>}

                  <span
                    className={
                      task.status === "completed"
                        ? "status status-completed"
                        : "status status-pending"
                    }
                  >
                    {task.status}
                  </span>
                </div>

                <button
                  type="button"
                  className="delete-button"
                  onClick={() => void handleDeleteTask(task.id)}
                  aria-label={`Delete ${task.title}`}
                >
                  Delete
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer>
        <span>TaskFlow</span> · Built with React, Express, Prisma and PostgreSQL
      </footer>
    </main>
  );
}

export default App;
