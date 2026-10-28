import { Ollama } from "ollama";
import { env } from "../env.ts";
import { errors } from "../errors.ts";

/** Timeout folgado: o primeiro request carrega o modelo na memória. */
const TIMEOUT_MS = 30_000;

// O SDK não tem opção de timeout; o `fetch` customizado é o ponto de extensão.
export const ollama = new Ollama({
	host: env.OLLAMA_BASE_URL,
	fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS) }),
});

type ChatOllamaInput = {
	model: string;
	system: string;
	user: string;
};

/** Chamada sem saída estruturada: o guardian responde texto livre ("Yes"/"No"), não JSON. */
export async function chatOllama({ model, system, user }: ChatOllamaInput): Promise<string> {
	try {
		const response = await ollama.chat({
			model,
			stream: false,
			keep_alive: "10m",
			options: { temperature: 0 },
			messages: [
				{ role: "system", content: system },
				{ role: "user", content: user },
			],
		});

		return response.message.content;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);

		throw errors.aiUnavailable(`Falha ao chamar ${model} no Ollama (${detail.slice(0, 300)}).`);
	}
}
