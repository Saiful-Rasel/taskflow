import "dotenv/config";

import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { taskService } from "./modules/tasks/task.service.js";

const PORT = Number(process.env.PORT) || 5000;

// Inject real Prisma dependencies into the production application.
const app = createApp({
  taskService: {
    ...taskService,
    deleteTask: async (id: number): Promise<void> => {
      await taskService.deleteTask(id);
    },
  },
  checkDatabase: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
});

const server = app.listen(PORT, () => {
  console.log(`TaskFlow API running at http://localhost:${PORT}`);
});

// Graceful shutdown for production deployments.
async function shutdown() {
  console.log("Shutting down TaskFlow API...");

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);