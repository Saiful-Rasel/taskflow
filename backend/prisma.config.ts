import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  // Prisma schema file location
  schema: "prisma/schema.prisma",

  // Where Prisma will store migration files
  migrations: {
    path: "prisma/migrations",
  },

  // Database connection URL comes from .env
  datasource: {
    url: env("DATABASE_URL"),
  },
});
