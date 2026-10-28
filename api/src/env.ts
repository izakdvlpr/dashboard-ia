import { z } from "zod";

const envSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

	DATABASE_URL: z.string().min(1),
	READONLY_DATABASE_URL: z.string().min(1),

	AI_GATEWAY_API_KEY: z.string().min(1),
	AI_SQL_MODEL: z.string().min(1).default("mistral/mistral-nemo"),
	AI_CHART_MODEL: z.string().min(1).default("mistral/mistral-nemo"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
	console.error("Variáveis de ambiente inválidas:", z.treeifyError(parsed.error));
	process.exit(1);
}

export const env = parsed.data;
