import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/lib/generated/prisma/client";

export type Db = PrismaClient | Prisma.TransactionClient;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set. Configure a PostgreSQL connection string (see .env.example).");
  }
}

export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL;
}

function createClient(): PrismaClient {
  const connectionString = databaseUrl();
  if (!connectionString) throw new DatabaseNotConfiguredError();
  const max = Number(process.env.DATABASE_POOL_MAX ?? 5);
  const adapter = new PrismaPg({
    connectionString,
    max: Number.isFinite(max) && max > 0 ? max : 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Lazily created singleton (reused across hot reloads and warm serverless invocations). */
export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

/** Interactive transaction with timeouts suited to imports/analysis on serverless Postgres. */
export function withTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, timeoutMs = 60_000): Promise<T> {
  return getDb().$transaction(fn, { maxWait: 10_000, timeout: timeoutMs });
}
