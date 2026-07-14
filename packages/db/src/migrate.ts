import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const migrationsFolder = resolve(fileURLToPath(import.meta.url), "../../migrations");

const db = drizzle(process.env.DATABASE_URL);

await migrate(db, { migrationsFolder });

console.log("Migrations applied.");
process.exit(0);
