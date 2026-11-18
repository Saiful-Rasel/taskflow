import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing");
}

// PostgreSQL driver adapter.
const adapter = new PrismaPg({ connectionString });

// Use one shared Prisma Client instance.
export const prisma = new PrismaClient({ adapter });
