import { Router } from "express";
import { gateway } from "../ai/gateway.ts";
import { prisma } from "../db.ts";
import { env } from "../env.ts";

export const healthRouter = Router();

healthRouter.get("/", async (_request, response) => {
	const [db, ai] = await Promise.all([checkDatabase(), checkAi()]);

	response.json({ status: db && ai.up && ai.available ? "ok" : "degraded", db, ai });
});

async function checkDatabase(): Promise<boolean> {
	try {
		await prisma.$queryRaw`SELECT 1`;
		return true;
	} catch {
		return false;
	}
}

type AiStatus = {
	up: boolean;
	/** true quando os modelos configurados existem no catálogo do Gateway */
	available: boolean;
	models: { sql: string; chart: string };
};

async function checkAi(): Promise<AiStatus> {
	const models = { sql: env.AI_SQL_MODEL, chart: env.AI_CHART_MODEL };

	try {
		const catalog = await Promise.race([
			gateway.getAvailableModels(),
			new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2_000)),
		]);
		const ids = new Set(catalog.models.map((model) => model.id));

		return { up: true, available: ids.has(models.sql) && ids.has(models.chart), models };
	} catch {
		return { up: false, available: false, models };
	}
}
