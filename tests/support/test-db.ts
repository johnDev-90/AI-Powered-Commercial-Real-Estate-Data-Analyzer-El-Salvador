import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

/**
 * Starts an isolated in-memory PostgreSQL (PGlite) for one test file, applies the real
 * migrations and points DATABASE_URL at it. Call before the first getDb().
 */
export async function startTestDatabase() {
  const db = await PGlite.create("memory://", { extensions: { pg_trgm } });
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  for (const dir of readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    await db.exec(readFileSync(join(migrationsDir, dir, "migration.sql"), "utf8"));
  }
  const server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1", maxConnections: 4 });
  await server.start();
  // getServerConn() returns "host:port" with the OS-assigned port.
  process.env.DATABASE_URL = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
  process.env.DATABASE_POOL_MAX = "1";

  return {
    async stop() {
      const { getDb } = await import("@/lib/db");
      await getDb().$disconnect();
      await server.stop();
      await db.close();
    },
  };
}
