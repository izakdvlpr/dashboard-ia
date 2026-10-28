import { generate } from "../ai/gateway.ts";
import { chitchatSystemPrompt, classifierSystemPrompt } from "../ai/prompts.ts";
import { answerOutputSchema, type QuestionRoute, questionRouteSchema } from "../ai/schemas.ts";
import { env } from "../env.ts";

const CHITCHAT_FALLBACK =
	"Olá! Posso responder perguntas sobre receita, pedidos, clientes, produtos e regiões — é só perguntar.";

/**
 * Se o classificador falhar, consulta o banco sem gráfico: a pergunta já passou
 * pelo guardrail, e o usuário ainda pode pedir o gráfico depois.
 */
export async function classifyQuestion(question: string): Promise<QuestionRoute> {
	try {
		const output = await generate({
			model: env.AI_CLASSIFIER_MODEL,
			instructions: classifierSystemPrompt(),
			messages: [{ role: "user", content: question }],
			schema: questionRouteSchema,
			timeoutMs: 15_000,
		});

		return output.route;
	} catch (error) {
		console.error("[classifyQuestion]", error);
		return "table";
	}
}

/** Resposta só em texto, sem tocar no banco. */
export async function answerChitchat(question: string): Promise<string> {
	try {
		const output = await generate({
			model: env.AI_SIMPLE_MODEL,
			instructions: chitchatSystemPrompt(),
			messages: [{ role: "user", content: question }],
			schema: answerOutputSchema,
			temperature: 0.4,
			timeoutMs: 30_000,
		});

		return output.answer.trim() || CHITCHAT_FALLBACK;
	} catch (error) {
		console.error("[answerChitchat]", error);
		return CHITCHAT_FALLBACK;
	}
}
