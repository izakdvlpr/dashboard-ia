import type { ChartColumn, ChartSpec, QueryRow, QuerySpec } from "@dashboard-ia/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookmarkIcon, ChartColumnIcon, LoaderIcon, SendIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ChartCard } from "@/components/charts/chart-card.tsx";
import { ConversationList } from "@/components/chat/conversation-list.tsx";
import { QuerySpecBlock } from "@/components/chat/query-spec-block.tsx";
import { ResultTable } from "@/components/chat/result-table.tsx";
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
	messageId: string;
	answer: string;
	querySpec: QuerySpec | null;
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
		messageId: data.messageId,
		answer: data.answer,
		querySpec: data.querySpec,
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
			messageId: message.id,
			answer: message.content,
			querySpec: message.querySpec,
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
				querySpec: view.querySpec,
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

	const chartMutation = useMutation({
		mutationFn: (messageId: string) => chatApi.generateChart(messageId),
		onSuccess: ({ chartSpec, chartFallback }, messageId) => {
			setTurns((current) =>
				current.map((turn) =>
					turn.answer?.messageId === messageId
						? { ...turn, answer: { ...turn.answer, chartSpec, chartFallback } }
						: turn,
				),
			);
			if (conversationId) void queryClient.invalidateQueries({ queryKey: ["conversations", conversationId] });
		},
		onError: (error: ApiError) => toast.error("Falha ao gerar gráfico", { description: error.message }),
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
					description="Pergunte em português — a IA escolhe métricas e filtros do catálogo, nunca escreve SQL."
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
						<TurnBlock
							// biome-ignore lint/suspicious/noArrayIndexKey: a ordem dos turnos é estável
							key={index}
							turn={turn}
							onSave={saveMutation.mutate}
							saving={saveMutation.isPending}
							onGenerateChart={chartMutation.mutate}
							generatingChart={chartMutation.isPending && chartMutation.variables === turn.answer?.messageId}
						/>
					))}

					{askMutation.isPending ? (
						<div className="text-muted-foreground mx-auto flex max-w-3xl items-center gap-2 text-sm">
							<LoaderIcon className="size-4 animate-spin" />
							Gerando, validando e consultando o banco…
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
	onGenerateChart,
	generatingChart,
}: {
	turn: Turn;
	onSave: (answer: AnswerView) => void;
	saving: boolean;
	onGenerateChart: (messageId: string) => void;
	generatingChart: boolean;
}) {
	const answer = turn.answer;
	// Valor único (1×1) não vira gráfico útil; a rota `chart` já chega com o spec.
	const canGenerateChart =
		answer !== undefined &&
		!answer.chartSpec &&
		answer.querySpec !== null &&
		answer.rows.length >= 2 &&
		answer.columns.length >= 2;

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

					{answer.querySpec ? <QuerySpecBlock spec={answer.querySpec} attempts={answer.attempts} /> : null}

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

					{canGenerateChart ? (
						<div className="flex items-center gap-3">
							<span className="text-muted-foreground text-sm">Quer ver isso em gráfico?</span>
							<Button
								variant="outline"
								size="sm"
								disabled={generatingChart}
								onClick={() => onGenerateChart(answer.messageId)}
							>
								{generatingChart ? <LoaderIcon className="animate-spin" /> : <ChartColumnIcon />}
								Gerar gráfico
							</Button>
						</div>
					) : null}

					{answer.querySpec ? (
						<p className="text-muted-foreground font-mono text-xs tabular-nums">
							{answer.rowCount ?? answer.rows.length} linhas
							{answer.durationMs === undefined ? "" : ` · ${answer.durationMs} ms`}
							{answer.chartFallback ? " · gráfico escolhido por heurística" : ""}
						</p>
					) : null}
				</div>
			) : null}
		</div>
	);
}

/** O turno otimista entra sem resposta; a resolução substitui o último item. */
function replaceLast(turns: Turn[], value: Turn): Turn[] {
	return [...turns.slice(0, -1), value];
}
