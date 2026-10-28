import sqlParser from "node-sql-parser";
import { ALLOWED_FUNCTIONS, FORBIDDEN_IDENTIFIERS, isAllowedTable, MAX_ROWS } from "./allowlist.ts";

const { Parser } = sqlParser;

const parser = new Parser();
const PARSER_OPTIONS = { database: "postgresql" } as const;

export class SqlRejectedError extends Error {
	readonly step: string;

	constructor(step: string, message: string) {
		super(message);
		this.name = "SqlRejectedError";
		this.step = step;
	}
}

function reject(step: string, message: string): never {
	throw new SqlRejectedError(step, message);
}

/** Remove literais entre aspas simples para checar palavras-chave sem falso positivo. */
function stripStringLiterals(sql: string): string {
	return sql.replace(/'(?:[^']|'')*'/g, "''");
}

const FORBIDDEN_KEYWORDS =
	/\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy|call|do|vacuum|analyze|reindex|merge|lock|listen|notify|prepare|execute|declare|fetch|refresh|comment|security\s+label|set|reset)\b/i;

type AnyNode = Record<string, unknown>;

function walk(node: unknown, visit: (node: AnyNode) => void, depth = 0): void {
	if (!node || typeof node !== "object" || depth > 60) return;

	if (Array.isArray(node)) {
		for (const item of node) walk(item, visit, depth + 1);
		return;
	}

	visit(node as AnyNode);

	for (const value of Object.values(node as AnyNode)) walk(value, visit, depth + 1);
}

function functionName(node: AnyNode): string | null {
	if (node.type === "aggr_func" && typeof node.name === "string") return node.name.toLowerCase();

	if (node.type === "function") {
		const name = node.name as { name?: Array<{ value?: string }> } | undefined;
		const value = name?.name?.map((part) => part.value).join(".");

		return value ? value.toLowerCase() : null;
	}

	return null;
}

/** Apelidos declarados com AS — podem ser referenciados em GROUP BY / ORDER BY. */
function selectAliases(ast: AnyNode): Set<string> {
	const aliases = new Set<string>();

	walk(ast, (node) => {
		if (typeof node.as === "string" && node.as.length > 0) aliases.add(node.as);
	});

	return aliases;
}

/** Nomes das CTEs — precisam ser aceitos como "tabela" pelo allowlist. */
function cteNames(ast: AnyNode): Set<string> {
	const names = new Set<string>();

	walk(ast.with, (node) => {
		const name = node.name as { value?: string } | string | undefined;

		if (typeof name === "string") names.add(name);
		else if (name?.value) names.add(name.value);
	});

	return names;
}

export type ValidatedSql = {
	/** SQL reescrito a partir do AST verificado — é isto que vai ao banco. */
	sql: string;
	limit: number;
};

/**
 * Pipeline de validação do SQL gerado (pela IA ou colado no builder).
 *
 * Camada de aplicação real: qualquer coisa que passe daqui ainda roda numa role
 * Postgres sem privilégio de escrita e sem SELECT nas tabelas de estado.
 */
export function validateSql(input: string, columnMap?: Map<string, Set<string>>): ValidatedSql {
	const raw = input.trim().replace(/;\s*$/, "");

	if (!raw) reject("empty", "SQL vazio.");

	// 1. comentários e múltiplos statements — antes do parse
	const withoutStrings = stripStringLiterals(raw);

	if (withoutStrings.includes("--") || withoutStrings.includes("/*")) {
		reject("comments", "Comentários não são permitidos no SQL.");
	}

	if (withoutStrings.includes(";")) {
		reject("multi_statement", "Apenas um comando por consulta.");
	}

	// 2. palavras-chave de escrita/DDL
	const keyword = FORBIDDEN_KEYWORDS.exec(withoutStrings);

	if (keyword) {
		reject("keyword", `Comando não permitido: "${keyword[1]?.toUpperCase()}". Apenas SELECT é aceito.`);
	}

	// 3. identificadores proibidos
	const lowered = withoutStrings.toLowerCase();
	const forbidden = FORBIDDEN_IDENTIFIERS.find((identifier) => lowered.includes(identifier));

	if (forbidden) reject("identifier", `Identificador não permitido: "${forbidden}".`);

	// 4. parse
	let ast: AnyNode;

	try {
		const parsed = parser.astify(raw, PARSER_OPTIONS);

		if (Array.isArray(parsed)) {
			if (parsed.length !== 1) reject("multi_statement", "Apenas um comando por consulta.");
			ast = parsed[0] as unknown as AnyNode;
		} else {
			ast = parsed as unknown as AnyNode;
		}
	} catch (error) {
		reject("parse", `SQL inválido: ${error instanceof Error ? error.message : String(error)}`);
	}

	// 5. precisa ser SELECT puro
	if (ast.type !== "select") {
		reject("statement_type", `Apenas SELECT é aceito (recebido: ${String(ast.type).toUpperCase()}).`);
	}

	if (ast.into && (ast.into as AnyNode).position) {
		reject("into", "SELECT ... INTO não é permitido.");
	}

	// 6. UNION/INTERSECT/EXCEPT fora de escopo (semântica de LIMIT fica ambígua)
	if (ast.set_op || ast._next) {
		reject("set_operation", "UNION/INTERSECT/EXCEPT não são suportados.");
	}

	// 7. allowlist de tabelas (CTEs contam como tabela local)
	const ctes = cteNames(ast);

	for (const entry of parser.tableList(raw, PARSER_OPTIONS)) {
		const [operation, , table] = entry.split("::");

		if (operation !== "select") {
			reject("table_operation", `Operação "${operation}" não é permitida.`);
		}

		if (!table) continue;

		if (!isAllowedTable(table) && !ctes.has(table)) {
			reject("table_allowlist", `Tabela "${table}" não está disponível para consulta.`);
		}
	}

	// 8. allowlist de colunas
	if (columnMap) {
		// GROUP BY/ORDER BY/HAVING podem citar apelidos do SELECT — não são colunas de tabela.
		const aliases = selectAliases(ast);

		// Tabelas citadas na consulta — usadas para resolver colunas sem qualificação.
		const referenced = parser
			.tableList(raw, PARSER_OPTIONS)
			.map((entry) => entry.split("::")[2])
			.filter((table): table is string => typeof table === "string" && isAllowedTable(table));

		for (const entry of parser.columnList(raw, PARSER_OPTIONS)) {
			const [, table, column] = entry.split("::");

			if (!column || column === "(.*)") continue;

			if (table && table !== "null") {
				if (ctes.has(table)) continue;

				const columns = columnMap.get(table);

				if (columns && !columns.has(column)) {
					reject("column_allowlist", `Coluna "${column}" não existe em "${table}".`);
				}

				continue;
			}

			// Sem qualificação: aceita se existir em alguma tabela citada.
			// Com CTE no meio, a coluna pode vir de lá — não dá para afirmar que não existe.
			if (aliases.has(column) || ctes.size > 0 || referenced.length === 0) continue;

			const existsSomewhere = referenced.some((name) => columnMap.get(name)?.has(column));

			if (!existsSomewhere) {
				reject(
					"column_allowlist",
					`Coluna "${column}" não existe em nenhuma das tabelas consultadas (${referenced.join(", ")}).`,
				);
			}
		}
	}

	// 9. allowlist de funções
	walk(ast, (node) => {
		const name = functionName(node);

		if (name && !ALLOWED_FUNCTIONS.has(name)) {
			reject("function_allowlist", `Função "${name}" não é permitida.`);
		}
	});

	// 10. LIMIT obrigatório e limitado a MAX_ROWS
	const limitNode = ast.limit as { value?: Array<{ value?: number }> } | null | undefined;
	const declared = limitNode?.value?.at(-1)?.value;
	const limit = typeof declared === "number" ? Math.min(declared, MAX_ROWS) : MAX_ROWS;

	ast.limit = { seperator: "", value: [{ type: "number", value: limit }] };

	// 11. reescreve a partir do AST verificado — nunca executa a string do modelo
	return { sql: parser.sqlify(ast as never, PARSER_OPTIONS), limit };
}
