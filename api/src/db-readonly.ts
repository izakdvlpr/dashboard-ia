import pg from "pg";
import { env } from "./env.ts";

/**
 * Conexão separada, com a role `dashboard_ro`, usada SOMENTE para executar o
 * SQL do compilador semântico (chat, builder e MCP).
 *
 * Deliberadamente um `pg.Pool` puro e não um segundo PrismaClient: a fronteira
 * de privilégio fica visível no import e é impossível chamar `.create()` /
 * `.update()` por engano neste caminho.
 */
export const readonlyPool = new pg.Pool({
	connectionString: env.READONLY_DATABASE_URL,
	max: 5,
	// backstop do lado do cliente, além do ALTER ROLE ... statement_timeout
	statement_timeout: 5_000,
	query_timeout: 5_500,
	connectionTimeoutMillis: 5_000,
});

readonlyPool.on("error", (error) => {
	console.error("[readonly-pool]", error.message);
});
