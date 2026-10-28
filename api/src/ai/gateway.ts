import {
	APICallError,
	createGateway,
	generateText,
	NoObjectGeneratedError,
	NoOutputGeneratedError,
	Output,
} from "ai";
import type { z } from "zod";
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
			output: Output.object<z.infer<SCHEMA>>({ schema }),
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
