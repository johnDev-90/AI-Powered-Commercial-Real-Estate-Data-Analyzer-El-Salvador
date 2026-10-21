import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations should use a direct (non-pooled) connection when the provider offers one.
// Neon / Vercel Postgres integrations expose these variable names.
const migrationUrl =
  process.env.MIGRATE_DATABASE_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl,
  },
});
