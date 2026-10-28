import type { NextFunction, Request, Response } from "express";
import { type ZodType, z } from "zod";
import { errors } from "../errors.ts";

function parse<T>(schema: ZodType<T>, value: unknown, where: string): T {
	const result = schema.safeParse(value);

	if (!result.success) {
		throw errors.validation(`Dados inválidos em ${where}.`, z.treeifyError(result.error));
	}

	return result.data;
}

export function validateBody<T>(schema: ZodType<T>) {
	return (request: Request, _response: Response, next: NextFunction) => {
		request.body = parse(schema, request.body, "body");
		next();
	};
}

export function validateQuery<T>(schema: ZodType<T>) {
	return (request: Request, _response: Response, next: NextFunction) => {
		// Express 5 torna `req.query` somente-leitura — guardamos o resultado à parte.
		(request as Request & { validatedQuery?: T }).validatedQuery = parse(schema, request.query, "query");
		next();
	};
}

export function getQuery<T>(request: Request): T {
	return (request as Request & { validatedQuery: T }).validatedQuery;
}
