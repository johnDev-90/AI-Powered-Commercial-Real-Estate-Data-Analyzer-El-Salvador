/**
 * Zero-install local PostgreSQL for development and tests, using PGlite (Postgres
 * compiled to WASM) exposed over the Postgres wire protocol.
 *
 *   npm run db:local                 # persistent database in ./.pglite on port 5433
 *   npm run db:local -- --memory     # throwaway in-memory database
 *
 * Then set DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/postgres" and
 * DATABASE_POOL_MAX="1". For production-like testing prefer Docker (docker compose up -d).
 */
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

async function main() {
  const memory = process.argv.includes("--memory");
  const portArg = process.argv.find((a) => a.startsWith("--port="));
  const port = portArg ? Number(portArg.split("=")[1]) : 5433;

  const db = await PGlite.create(memory ? "memory://" : "./.pglite", { extensions: { pg_trgm } });
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 10 });
  await server.start();
  console.log(`PGlite listening on postgresql://postgres:postgres@127.0.0.1:${port}/postgres (${memory ? "in-memory" : "./.pglite"})`);

  const shutdown = async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
