import { z } from "zod";

const envSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

	DATABASE_URL: z.string().min(1),
	READONLY_DATABASE_URL: z.string().min(1),

	VERCEL_GATEWAY_API_KEY: z.string().min(1),
	OLLAMA_BASE_URL: z.url().default("http://localhost:11434"),

	AI_GUARDRAIL_MODEL: z.string().min(1).default("granite3-guardian:8b"),
	AI_CLASSIFIER_MODEL: z.string().min(1).default("amazon/nova-micro"),
	AI_SIMPLE_MODEL: z.string().min(1).default("openai/gpt-4.1-nano"),
	AI_QUERY_MODEL: z.string().min(1).default("alibaba/qwen3-coder-30b-a3b"),
	AI_CHART_MODEL: z.string().min(1).default("openai/gpt-4.1-nano"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
	console.error("Variáveis de ambiente inválidas:", z.treeifyError(parsed.error));
	process.exit(1);
}

export const env = parsed.data;
