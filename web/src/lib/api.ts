import type { ChartColumn, ChartSpec, ChartType, Preset, QueryRow } from "@dashboard-ia/shared";

const BASE_URL = "http://localhost:3333";

export class ApiError extends Error {
	readonly code: string;
	readonly status: number;
	readonly details?: unknown;

	constructor(status: number, code: string, message: string, details?: unknown) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
		this.details = details;
	}
}

type RequestOptions = {
	method?: string;
	body?: unknown;
	signal?: AbortSignal;
};

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const response = await fetch(`${BASE_URL}${path}`, {
		method: options.method ?? "GET",
		headers: options.body ? { "content-type": "application/json" } : undefined,
		body: options.body ? JSON.stringify(options.body) : undefined,
		signal: options.signal,
	});

	const payload = await response.json().catch(() => null);

	if (!response.ok) {
		const error = (payload as { error?: { code: string; message: string; details?: unknown } })?.error;

		throw new ApiError(
			response.status,
			error?.code ?? "UNKNOWN",
			error?.message ?? `Falha na requisição (${response.status}).`,
			error?.details,
		);
	}

	return payload as T;
}

export type ValueFormatKey = "currency" | "number" | "percent";

export type Kpi = {
	key: string;
	label: string;
	value: number;
	format: ValueFormatKey;
	delta: number | null;
};

export type Overview = {
	range: { from: string; to: string };
	kpis: Kpi[];
};

export type SeriesResponse = {
	key: string;
	rows: Array<Record<string, unknown>>;
};

export type QueryResult = {
	sql: string;
	columns: ChartColumn[];
	rows: QueryRow[];
	rowCount: number;
	durationMs: number;
};

export type SchemaCatalog = {
	tables: Array<{
		name: string;
		columns: Array<{ name: string; type: string; nullable: boolean }>;
	}>;
	enums: Array<{ name: string; values: string[] }>;
};

export const dashboardApi = {
	overview: (months: number) => api<Overview>(`/api/dashboard/overview?months=${months}`),
	series: (key: string, months: number) =>
		api<SeriesResponse>(`/api/dashboard/series/${key}?months=${months}`),
};

export const queryApi = {
	run: (sql: string) => api<QueryResult>("/api/query/run", { method: "POST", body: { sql } }),
};

export const schemaApi = {
	catalog: () => api<SchemaCatalog>("/api/schema"),
};

export type ChatResponse = {
	conversationId: string;
	messageId: string;
	question: string;
	sql: string;
	rawSql: string;
	explanation: string;
	answer: string;
	columns: ChartColumn[];
	rows: QueryRow[];
	rowCount: number;
	durationMs: number;
	attempts: number;
	chartSpec: ChartSpec;
	chartFallback: boolean;
};

export type ChartDto = {
	id: string;
	title: string;
	description: string | null;
	chartType: string;
	source: "AI" | "MANUAL";
	sqlQuery: string | null;
	presetId: string | null;
	isPinned: boolean;
	pinnedOrder: number | null;
	/** 1 = metade da linha na visão geral, 2 = linha inteira */
	layoutSpan: number;
	chartSpec: ChartSpec;
	columns: ChartColumn[];
	rows: QueryRow[];
	datasetCacheAt: string | null;
	createdAt: string;
	updatedAt: string;
};

export type CreateChartInput = {
	title: string;
	description?: string | null;
	source: "AI" | "MANUAL";
	sqlQuery?: string | null;
	chartSpec: ChartSpec;
	columns: ChartColumn[];
	rows: QueryRow[];
	presetId?: string | null;
	isPinned?: boolean;
	pinnedOrder?: number | null;
	layoutSpan?: number;
};

export type ConversationSummary = {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
};

export type ChatMessageView = {
	id: string;
	role: "USER" | "ASSISTANT";
	content: string;
	sql: string | null;
	columns: ChartColumn[];
	rows: QueryRow[];
	chartSpec: ChartSpec | null;
	createdAt: string;
};

export type ConversationView = ConversationSummary & { messages: ChatMessageView[] };

export const chatApi = {
	ask: (question: string, conversationId?: string) =>
		api<ChatResponse>("/api/chat", { method: "POST", body: { question, conversationId } }),
	conversations: () => api<{ conversations: ConversationSummary[] }>("/api/chat/conversations"),
	conversation: (id: string) => api<ConversationView>(`/api/chat/conversations/${id}`),
	removeConversation: (id: string) => api<void>(`/api/chat/conversations/${id}`, { method: "DELETE" }),
};

export type CreatePresetInput = {
	name: string;
	description?: string | null;
	chartType: ChartType | null;
	optionPatch: Record<string, unknown>;
	isGlobalDefault?: boolean;
};

export const presetsApi = {
	list: (chartType?: string) =>
		api<{ presets: Preset[] }>(`/api/presets${chartType ? `?chartType=${chartType}` : ""}`),
	create: (input: CreatePresetInput) => api<Preset>("/api/presets", { method: "POST", body: input }),
	update: (id: string, input: Partial<CreatePresetInput>) =>
		api<Preset>(`/api/presets/${id}`, { method: "PATCH", body: input }),
	remove: (id: string) => api<void>(`/api/presets/${id}`, { method: "DELETE" }),
};

export const chartsApi = {
	list: (pinned?: boolean) => api<{ charts: ChartDto[] }>(`/api/charts${pinned ? "?pinned=true" : ""}`),
	get: (id: string) => api<ChartDto>(`/api/charts/${id}`),
	/** A posição de cada gráfico é o índice no array. */
	reorder: (ids: string[]) =>
		api<{ charts: ChartDto[] }>("/api/charts/reorder", { method: "POST", body: { ids } }),
	create: (input: CreateChartInput) => api<ChartDto>("/api/charts", { method: "POST", body: input }),
	update: (id: string, input: Partial<CreateChartInput>) =>
		api<ChartDto>(`/api/charts/${id}`, { method: "PATCH", body: input }),
	remove: (id: string) => api<void>(`/api/charts/${id}`, { method: "DELETE" }),
	run: (id: string) => api<ChartDto>(`/api/charts/${id}/run`, { method: "POST" }),
};
