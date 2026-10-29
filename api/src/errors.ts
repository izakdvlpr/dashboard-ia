export type ErrorCode =
	| "VALIDATION_ERROR"
	| "NOT_FOUND"
	| "QUERY_REJECTED"
	| "QUERY_EXECUTION_ERROR"
	| "AI_UNAVAILABLE"
	| "AI_INVALID_OUTPUT"
	| "PROMPT_BLOCKED"
	| "INTERNAL_ERROR";

export class AppError extends Error {
	readonly code: ErrorCode;
	readonly status: number;
	readonly details?: unknown;

	constructor(code: ErrorCode, message: string, status: number, details?: unknown) {
		super(message);
		this.name = "AppError";
		this.code = code;
		this.status = status;
		this.details = details;
	}
}

export const errors = {
	validation: (message: string, details?: unknown) => new AppError("VALIDATION_ERROR", message, 400, details),
	notFound: (what: string) => new AppError("NOT_FOUND", `${what} não encontrado.`, 404),
	queryRejected: (message: string, details?: unknown) =>
		new AppError("QUERY_REJECTED", message, 400, details),
	queryExecution: (message: string) => new AppError("QUERY_EXECUTION_ERROR", message, 500),
	aiUnavailable: (message: string) => new AppError("AI_UNAVAILABLE", message, 503),
	aiInvalidOutput: (message: string, details?: unknown) =>
		new AppError("AI_INVALID_OUTPUT", message, 502, details),
	promptBlocked: (risk: string) =>
		new AppError("PROMPT_BLOCKED", "Não posso responder essa pergunta.", 422, { risk }),
	internal: (message = "Erro interno.") => new AppError("INTERNAL_ERROR", message, 500),
};
