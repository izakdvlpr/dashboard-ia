import { querySpecSchema } from "@dashboard-ia/shared";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AppError } from "../errors.ts";
import { getSemanticCatalog } from "../services/schema-catalog.service.ts";
import { runQuerySpec } from "../services/semantic-query.service.ts";

/**
 * Expõe a camada semântica para clientes MCP (Claude Desktop, Cursor...).
 * Mesmo contrato do app: o cliente só escolhe chaves do catálogo, nunca envia SQL.
 * Transporte stdio — stdout é do protocolo, então log vai para stderr.
 */
const server = new McpServer({ name: "dashboard-ia", version: "0.0.0" });

server.registerTool(
	"list_metrics",
	{
		title: "Catálogo de métricas",
		description:
			"Lista métricas, dimensões, períodos e valores de filtro aceitos por query_metric. Chame antes de consultar.",
		annotations: { readOnlyHint: true },
	},
	async () => {
		const catalog = await getSemanticCatalog();

		return { content: [{ type: "text", text: JSON.stringify(catalog) }] };
	},
);

server.registerTool(
	"query_metric",
	{
		title: "Consultar métricas de vendas",
		description:
			"Executa uma consulta somente leitura sobre o e-commerce a partir de um QuerySpec (métricas, agrupamentos, filtros e período do catálogo de list_metrics).",
		inputSchema: querySpecSchema,
		annotations: { readOnlyHint: true, idempotentHint: true },
	},
	async (spec) => {
		try {
			const { result } = await runQuerySpec(spec);

			return { content: [{ type: "text", text: JSON.stringify(result) }] };
		} catch (error) {
			const message = error instanceof AppError ? error.message : "Falha ao executar a consulta.";

			return { isError: true, content: [{ type: "text", text: message }] };
		}
	},
);

await server.connect(new StdioServerTransport());
console.error("[mcp] dashboard-ia pronto (stdio)");
