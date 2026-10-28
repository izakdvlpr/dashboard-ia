import { Router } from "express";
import { gateway } from "../ai/gateway.ts";
import { ollama } from "../ai/ollama.ts";
import { prisma } from "../db.ts";
import { env } from "../env.ts";

export const healthRouter = Router();

healthRouter.get("/", async (_request, response) => {
	const [db, ai, guardrail] = await Promise.all([checkDatabase(), checkAi(), checkGuardrail()]);
	const ok = db && ai.up && ai.available && guardrail.up && guardrail.available;

	response.json({ status: ok ? "ok" : "degraded", db, ai, guardrail });
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
	models: { sql: string; chart: string; classifier: string; simple: string };
};

async function checkAi(): Promise<AiStatus> {
	const models = {
		sql: env.AI_SQL_MODEL,
		chart: env.AI_CHART_MODEL,
		classifier: env.AI_CLASSIFIER_MODEL,
		simple: env.AI_SIMPLE_MODEL,
	};

	try {
		const catalog = await Promise.race([
			gateway.getAvailableModels(),
			new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2_000)),
		]);
		const ids = new Set(catalog.models.map((model) => model.id));

		return { up: true, available: Object.values(models).every((id) => ids.has(id)), models };
	} catch {
		return { up: false, available: false, models };
	}
}

type GuardrailStatus = {
	up: boolean;
	/** true quando o modelo do guardian já foi baixado (`ollama pull`) */
	available: boolean;
	model: string;
};

async function checkGuardrail(): Promise<GuardrailStatus> {
	const model = env.AI_GUARDRAIL_MODEL;

	try {
		const { models } = await Promise.race([
			ollama.list(),
			new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2_000)),
		]);

		// Sem tag explícita o Ollama registra o modelo como `:latest`.
		const names = new Set(models.map((entry) => entry.name));

		return { up: true, available: names.has(model) || names.has(`${model}:latest`), model };
	} catch {
		return { up: false, available: false, model };
	}
}
