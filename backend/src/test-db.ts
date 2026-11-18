import { prisma } from "./lib/prisma.js";

async function main(): Promise<void> {
  try {
    // Fetch all tasks from PostgreSQL.
    const tasks = await prisma.task.findMany();

    console.log("Database connection successful!");
    console.log("Tasks:", tasks);
  } catch (error) {
    console.error("Database query failed:", error);
    process.exitCode = 1;
  } finally {
    // Close the database connection after the query.
    await prisma.$disconnect();
  }
}

main();
