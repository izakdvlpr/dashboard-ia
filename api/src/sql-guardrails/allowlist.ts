/**
 * Superfície que o SQL gerado pela IA (e o builder manual) pode tocar.
 * Tabelas de estado do app — Chart, ChartPreset, Conversation, ChatMessage,
 * QueryLog — ficam de fora de propósito, e também não têm GRANT para a role
 * `dashboard_ro` (ver prisma/sql/readonly-role.sql).
 */
export const ALLOWED_TABLES = [
	"Region",
	"Category",
	"Product",
	"Customer",
	"Order",
	"OrderItem",
	"OrderEvent",
] as const;

export type AllowedTable = (typeof ALLOWED_TABLES)[number];

const allowedTableSet = new Set<string>(ALLOWED_TABLES);

export function isAllowedTable(name: string): boolean {
	return allowedTableSet.has(name);
}

/**
 * Funções liberadas dentro do SELECT. Qualquer outra chamada é rejeitada —
 * fecha a porta para pg_sleep, dblink, lo_import, current_setting etc.
 */
export const ALLOWED_FUNCTIONS = new Set([
	"abs",
	"avg",
	"cast",
	"ceil",
	"coalesce",
	"concat",
	"count",
	"current_date",
	"date_part",
	"date_trunc",
	"extract",
	"floor",
	"greatest",
	"initcap",
	"least",
	"length",
	"lower",
	"max",
	"min",
	"nullif",
	"now",
	"rank",
	"round",
	"row_number",
	"stddev",
	"sum",
	"to_char",
	"trim",
	"upper",
	"variance",
]);

/** Identificadores proibidos em qualquer posição do SQL. */
export const FORBIDDEN_IDENTIFIERS = [
	"pg_catalog",
	"information_schema",
	"pg_sleep",
	"pg_read_file",
	"pg_read_binary_file",
	"pg_ls_dir",
	"pg_stat_file",
	"current_setting",
	"set_config",
	"dblink",
	"lo_import",
	"lo_export",
	"copy",
];

/** Teto de linhas devolvidas por qualquer consulta dinâmica. */
export const MAX_ROWS = 500;
