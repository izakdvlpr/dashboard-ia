import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/prisma/generated/client.ts";
import { env } from "./env.ts";

declare global {
	var __prisma: PrismaClient | undefined;
}

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = globalThis.__prisma ?? new PrismaClient({ adapter });

if (env.NODE_ENV !== "production") {
	globalThis.__prisma = prisma;
}
