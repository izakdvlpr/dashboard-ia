import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors.ts";

export function notFoundHandler(_request: Request, response: Response) {
	response.status(404).json({ error: { code: "NOT_FOUND", message: "Rota não encontrada." } });
}

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
	if (error instanceof AppError) {
		response.status(error.status).json({
			error: { code: error.code, message: error.message, details: error.details },
		});
		return;
	}

	console.error("[unhandled]", error);

	response.status(500).json({
		error: {
			code: "INTERNAL_ERROR",
			message: error instanceof Error ? error.message : "Erro interno.",
		},
	});
}
