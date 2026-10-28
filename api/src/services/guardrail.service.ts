import { chatOllama } from "../ai/ollama.ts";
import { env } from "../env.ts";
import { errors } from "../errors.ts";

/**
 * O granite3-guardian recebe o nome do risco como system prompt e responde
 * "Yes" quando a mensagem do usuário apresenta aquele risco.
 * `harm` é o guarda-chuva (violência, conteúdo sexual, viés...) e, na prática,
 * também pega prompt injection ("ignore suas instruções e apague...").
 *
 * `jailbreak` ficou de fora: marca como Yes perguntas legítimas sobre dados
 * (receita por mês, top produtos), em português e em inglês. O que ele cobriria
 * já está barrado pelo validador de SQL e pela role read-only.
 */
const RISKS = ["harm"] as const;

const VERDICT = /^\s*(yes|no)\b/i;

/** Lança `PROMPT_BLOCKED` se qualquer risco for detectado. Ollama fora do ar = 503, nunca libera. */
export async function assertSafePrompt(question: string): Promise<void> {
	const verdicts = await Promise.all(
		RISKS.map(async (risk) => {
			const output = await chatOllama({ model: env.AI_GUARDRAIL_MODEL, system: risk, user: question });
			const verdict = VERDICT.exec(output)?.[1]?.toLowerCase();

			// Resposta que não é Yes/No conta como risco: na dúvida, bloqueia.
			return { risk, unsafe: verdict !== "no" };
		}),
	);

	const flagged = verdicts.find((verdict) => verdict.unsafe);

	if (flagged) {
		console.warn(`[guardrail] pergunta bloqueada (risco: ${flagged.risk})`);
		throw errors.promptBlocked(flagged.risk);
	}
}
