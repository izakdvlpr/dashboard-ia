import {
	APICallError,
	createGateway,
	generateText,
	jsonSchema,
	NoObjectGeneratedError,
	NoOutputGeneratedError,
	Output,
	zodSchema,
} from "ai";
import { z } from "zod";
import { env } from "../env.ts";
import { errors } from "../errors.ts";

export const gateway = createGateway({ apiKey: env.VERCEL_GATEWAY_API_KEY });

/** O prompt de sistema vai em `instructions`: o SDK recusa `role: "system"` dentro de `messages`. */
export type ChatMessage = { role: "user" | "assistant"; content: string };

type GenerateInput<SCHEMA extends z.ZodType> = {
	model: string;
	instructions: string;
	messages: ChatMessage[];
	schema: SCHEMA;
	temperature?: number;
	timeoutMs?: number;
};

/**
 * Modelo menor costuma omitir a chave em vez de mandar `null` (ex.: `filters: {}`).
 * Completa com `null` só onde o schema aceita `null`; o resto segue para o zod.
 */
function fillMissingNulls(schema: z.ZodType, value: unknown): unknown {
	if (schema instanceof z.ZodNullable) {
		return value === null ? null : fillMissingNulls(schema.unwrap() as z.ZodType, value);
	}

	if (schema instanceof z.ZodArray && Array.isArray(value)) {
		return value.map((item) => fillMissingNulls(schema.element as z.ZodType, item));
	}

	if (schema instanceof z.ZodObject && value && typeof value === "object" && !Array.isArray(value)) {
		const record = value as Record<string, unknown>;
		const filled: Record<string, unknown> = { ...record };

		for (const [key, field] of Object.entries(schema.shape as Record<string, z.ZodType>)) {
			filled[key] =
				record[key] === undefined && field instanceof z.ZodNullable
					? null
					: fillMissingNulls(field, record[key]);
		}

		return filled;
	}

	return value;
}

/** JSON Schema estrito para o provider (toda chave em `required`); validação tolerante a chave nullable omitida. */
async function lenientOutput<SCHEMA extends z.ZodType>(schema: SCHEMA) {
	return Output.object<z.infer<SCHEMA>>({
		schema: jsonSchema<z.infer<SCHEMA>>(await zodSchema(schema).jsonSchema, {
			validate: (value) => {
				const parsed = schema.safeParse(fillMissingNulls(schema, value));

				return parsed.success
					? { success: true, value: parsed.data }
					: { success: false, error: parsed.error };
			},
		}),
	});
}

/**
 * Uma chamada sem streaming com saída estruturada. Todas as chamadas do app
 * pedem JSON — resposta parcial não serve para nada, então streaming só
 * adicionaria complexidade no cliente.
 */
export async function generate<SCHEMA extends z.ZodType>({
	model,
	instructions,
	messages,
	schema,
	temperature = 0,
	timeoutMs = 120_000,
}: GenerateInput<SCHEMA>): Promise<z.infer<SCHEMA>> {
	try {
		const result = await generateText({
			model: gateway(model),
			instructions,
			messages,
			output: await lenientOutput(schema),
			temperature,
			abortSignal: AbortSignal.timeout(timeoutMs),
		});

		return result.output;
	} catch (error) {
		if (NoObjectGeneratedError.isInstance(error)) {
			throw errors.aiInvalidOutput(`${model} devolveu JSON fora do schema.`, {
				raw: error.text?.slice(0, 500),
			});
		}

		if (NoOutputGeneratedError.isInstance(error)) {
			throw errors.aiInvalidOutput(`${model} não devolveu nenhuma saída.`);
		}

		const detail = APICallError.isInstance(error)
			? `status ${error.statusCode ?? "?"}: ${error.message}`
			: error instanceof Error
				? error.message
				: String(error);

		throw errors.aiUnavailable(`Falha ao chamar ${model} no AI Gateway (${detail.slice(0, 300)}).`);
	}
}
