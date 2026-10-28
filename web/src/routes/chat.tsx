import type { ChartColumn, ChartSpec, QueryRow } from "@dashboard-ia/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookmarkIcon, LoaderIcon, SendIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ChartCard } from "@/components/charts/chart-card.tsx";
import { ConversationList } from "@/components/chat/conversation-list.tsx";
import { ResultTable } from "@/components/chat/result-table.tsx";
import { SqlBlock } from "@/components/chat/sql-block.tsx";
import { PageHeader } from "@/components/layout/app-shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { type ApiError, type ChatResponse, type ConversationView, chartsApi, chatApi } from "@/lib/api.ts";

export const Route = createFileRoute("/chat")({ component: ChatPage });

const SUGGESTIONS = [
	"Qual foi a receita por mês no último ano?",
	"Quais os 5 produtos com maior receita?",
	"Como a receita se divide entre as regiões?",
	"Quantos pedidos por canal de venda?",
];

/**
 * A resposta ao vivo traz métricas que o histórico não guarda (tempo, tentativas),
 * então a view é o subconjunto comum aos dois.
 */
type AnswerView = {
	answer: string;
	sql: string;
	columns: ChartColumn[];
	rows: QueryRow[];
	chartSpec: ChartSpec | null;
	rowCount?: number;
	durationMs?: number;
	attempts?: number;
	chartFallback?: boolean;
};

type Turn = { question: string; answer?: AnswerView; error?: string };

function toAnswerView(data: ChatResponse): AnswerView {
	return {
		answer: data.answer,
		sql: data.sql,
		columns: data.columns,
		rows: data.rows,
		chartSpec: data.chartSpec,
		rowCount: data.rowCount,
		durationMs: data.durationMs,
		attempts: data.attempts,
		chartFallback: data.chartFallback,
	};
}

/** Mensagens salvas voltam em pares USER → ASSISTANT. */
function toTurns(conversation: ConversationView): Turn[] {
	const turns: Turn[] = [];

	for (const message of conversation.messages) {
		if (message.role === "USER") {
			turns.push({ question: message.content });
			continue;
		}

		const current = turns.at(-1);
		if (!current) continue;

		current.answer = {
			answer: message.content,
			sql: message.sql ?? "",
			columns: message.columns,
			rows: message.rows,
			chartSpec: message.chartSpec,
			rowCount: message.rows.length,
		};
	}

	return turns;
}

function ChatPage() {
	const [turns, setTurns] = useState<Turn[]>([]);
	const [question, setQuestion] = useState("");
	const [conversationId, setConversationId] = useState<string | null>(null);
	const queryClient = useQueryClient();

	const askMutation = useMutation({
		mutationFn: (text: string) => chatApi.ask(text, conversationId ?? undefined),
		onSuccess: (data) => {
			setConversationId(data.conversationId);
			setTurns((current) => replaceLast(current, { question: data.question, answer: toAnswerView(data) }));
			void queryClient.invalidateQueries({ queryKey: ["conversations"] });
		},
		onError: (error: ApiError, text) => {
			setTurns((current) => replaceLast(current, { question: text, error: error.message }));
		},
	});

	const openMutation = useMutation({
		mutationFn: (id: string) =>
			queryClient.fetchQuery({
				queryKey: ["conversations", id],
				queryFn: () => chatApi.conversation(id),
			}),
		onSuccess: (conversation) => {
			setConversationId(conversation.id);
			setTurns(toTurns(conversation));
		},
		onError: (error: ApiError) => toast.error("Falha ao abrir conversa", { description: error.message }),
	});

	const saveMutation = useMutation({
		mutationFn: (view: AnswerView) => {
			if (!view.chartSpec) throw new Error("Esta resposta não tem gráfico.");

			return chartsApi.create({
				title: view.chartSpec.title,
				source: "AI",
				sqlQuery: view.sql,
				chartSpec: view.chartSpec,
				columns: view.columns,
				rows: view.rows,
			});
		},
		onSuccess: (chart) => {
			void queryClient.invalidateQueries({ queryKey: ["charts"] });
			toast.success("Gráfico salvo", { description: chart.title });
		},
		onError: (error: ApiError) => toast.error("Falha ao salvar", { description: error.message }),
	});

	function startNew() {
		setConversationId(null);
		setTurns([]);
		setQuestion("");
	}

	function submit(text: string) {
		const trimmed = text.trim();

		if (!trimmed || askMutation.isPending) return;

		setTurns((current) => [...current, { question: trimmed }]);
		setQuestion("");
		askMutation.mutate(trimmed);
	}

	return (
		<div className="flex h-svh">
			<ConversationList
				activeId={conversationId}
				onSelect={(id) => openMutation.mutate(id)}
				onNew={startNew}
				onRemoved={startNew}
			/>

			<div className="flex min-w-0 flex-1 flex-col">
				<PageHeader
					title="Chatbot"
					description="Pergunte em português — a IA gera o SQL, os guardrails validam e o Postgres responde."
				/>

				<div className="flex-1 space-y-6 overflow-y-auto px-4 py-6 md:px-8">
					{turns.length === 0 && !openMutation.isPending ? (
						<div className="text-muted-foreground mx-auto max-w-2xl space-y-4 pt-12 text-center">
							<SparklesIcon className="mx-auto size-8" />
							<p className="text-sm">Comece por uma dessas perguntas:</p>
							<div className="flex flex-wrap justify-center gap-2">
								{SUGGESTIONS.map((suggestion) => (
									<Button
										key={suggestion}
										variant="outline"
										size="sm"
										title={suggestion}
										className="max-w-full"
										onClick={() => submit(suggestion)}
									>
										<span className="truncate">{suggestion}</span>
									</Button>
								))}
							</div>
						</div>
					) : null}

					{turns.map((turn, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a ordem dos turnos é estável
						<TurnBlock key={index} turn={turn} onSave={saveMutation.mutate} saving={saveMutation.isPending} />
					))}

					{askMutation.isPending ? (
						<div className="text-muted-foreground mx-auto flex max-w-3xl items-center gap-2 text-sm">
							<LoaderIcon className="size-4 animate-spin" />
							Gerando SQL, validando e consultando o banco…
						</div>
					) : null}
				</div>

				<form
					className="flex gap-2 border-t p-4"
					onSubmit={(event) => {
						event.preventDefault();
						submit(question);
					}}
				>
					<input
						value={question}
						onChange={(event) => setQuestion(event.target.value)}
						placeholder="Ex.: receita por categoria nos últimos 6 meses"
						className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-10 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
					/>
					<Button type="submit" disabled={askMutation.isPending || question.trim().length < 3}>
						<SendIcon />
						Perguntar
					</Button>
				</form>
			</div>
		</div>
	);
}

function TurnBlock({
	turn,
	onSave,
	saving,
}: {
	turn: Turn;
	onSave: (answer: AnswerView) => void;
	saving: boolean;
}) {
	const answer = turn.answer;

	return (
		<div className="mx-auto max-w-3xl space-y-3">
			<div className="flex justify-end">
				<div className="bg-primary text-primary-foreground max-w-[80%] rounded-lg px-3 py-2 text-sm">
					{turn.question}
				</div>
			</div>

			{turn.error ? (
				<div className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm">{turn.error}</div>
			) : null}

			{answer ? (
				<div className="space-y-3">
					<p className="text-sm leading-relaxed">{answer.answer}</p>

					{answer.sql ? <SqlBlock sql={answer.sql} attempts={answer.attempts} /> : null}

					{answer.chartSpec ? (
						<ChartCard
							spec={answer.chartSpec}
							rows={answer.rows}
							height={280}
							action={
								<Button variant="outline" size="sm" disabled={saving} onClick={() => onSave(answer)}>
									<BookmarkIcon />
									Salvar gráfico
								</Button>
							}
						/>
					) : null}

					{answer.columns.length > 0 ? <ResultTable columns={answer.columns} rows={answer.rows} /> : null}

					<p className="text-muted-foreground font-mono text-xs tabular-nums">
						{answer.rowCount ?? answer.rows.length} linhas
						{answer.durationMs === undefined ? "" : ` · ${answer.durationMs} ms`}
						{answer.chartFallback ? " · gráfico escolhido por heurística" : ""}
					</p>
				</div>
			) : null}
		</div>
	);
}

/** O turno otimista entra sem resposta; a resolução substitui o último item. */
function replaceLast(turns: Turn[], value: Turn): Turn[] {
	return [...turns.slice(0, -1), value];
}
