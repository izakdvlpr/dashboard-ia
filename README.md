# dashboard-ia

BI: dashboards ECharts sobre dados fictícios de e-commerce, chatbot que traduz pergunta em pt-BR para SQL
(via Vercel AI Gateway) e construtor manual de gráficos com presets de estilo.

Postgres em container, API Express e SPA Vite rodam na máquina; o LLM é chamado pelo Vercel AI Gateway.

## Stack

| Camada | Escolha |
|---|---|
| `web` | React 19, TanStack Router (file-based, SPA), TanStack Query, Tailwind v4, shadcn/ui, ECharts 6 |
| `api` | Express 5, zod 4, Prisma 7 (`@prisma/adapter-pg`), `node-sql-parser` |
| `shared` | ChartSpec, Preset e `mergeOption` — fonte da verdade dos dois lados |
| dados | Postgres 13 (docker-compose, porta 42069) |
| LLM | Vercel AI Gateway via AI SDK (`ai`), `mistral/mistral-nemo` por padrão, structured output com zod |

## Setup

```bash
bun install
cp .env.example .env # preencha AI_GATEWAY_API_KEY
bun run setup        # sobe o Postgres, migra, popula e cria a role read-only
bun run dev          # api :3333 + web :5173
```

`bun run setup` executa `db:up`, `db:migrate`, `db:seed` e `db:readonly`. O seed gera ~24 meses de e-commerce
(8 regiões, 12 categorias, ~400 produtos, ~3.000 clientes, ~25.000 pedidos) com sazonalidade.

Os modelos ficam em `AI_SQL_MODEL` (geração de SQL) e `AI_CHART_MODEL` (ChartSpec e resposta em texto), ambos
com default `mistral/mistral-nemo`. Qualquer id do catálogo do Gateway com suporte a structured output serve.

## Como o chatbot chega no banco

1. Pergunta + catálogo do schema → modelo devolve `{ sql, explanation, chartHint }`.
2. O SQL passa pelos guardrails; rejeição volta ao modelo com o motivo exato (máx. 3 tentativas).
3. Executa na pool da role `dashboard_ro`, dentro de transação read-only com `statement_timeout` de 5s.
4. Colunas + 20 linhas de amostra → modelo devolve o `ChartSpec`; se falhar, uma heurística local assume.
5. Toda tentativa (aceita ou recusada) vira linha em `QueryLog`.

### Guardrails

- Apenas um `SELECT`; múltiplos statements, comentários e DDL/DML são recusados antes do parse.
- Allowlist de tabelas (só as 7 do e-commerce) e de colunas; `information_schema`/`pg_catalog` bloqueados.
- `LIMIT` forçado, teto de 500 linhas.
- Role `dashboard_ro` sem `GRANT` nas tabelas de estado (`Chart`, `ChartPreset`, `Conversation`,
  `ChatMessage`, `QueryLog`) — defesa em profundidade se o allowlist falhar.

## Gráficos, estilo e presets

O modelo nunca emite cor literal: escolhe entre os tokens `chart-1`…`chart-5`, resolvidos no render a partir
das CSS custom properties do design system. Trocar light/dark recolore tudo sem regravar nada.

- **`/`** — visão geral: 4 KPIs + 6 gráficos fixos + seção **"Meus gráficos"** com os salvos que o usuário
  publicou. "Editar layout" liga o drag & drop (@dnd-kit): arrastar grava `pinnedOrder`, e cada card alterna
  entre meia linha e linha inteira (`layoutSpan`). "Atualizar dados" reexecuta o SELECT de cada um.
- **`/chat`** — pergunta, SQL colapsável, tabela e gráfico; botão salva como `Chart` (`source: AI`).
- **`/charts`** — galeria dos gráficos salvos, com editar, mostrar na visão geral e excluir.
- **`/charts/:id`** — gráfico em tela cheia, editor de spec, SQL editável ("Executar" passa pelos mesmos
  guardrails), descrição, painel de estilo, barra de presets e controles de visão geral.
- **`/builder`** — escreve o `SELECT`, executa pelos guardrails, mapeia colunas e salva (`source: MANUAL`).

O que persiste é a consulta + a spec, não o dado: `POST /api/charts/:id/run` reexecuta o SELECT salvo.

Preset = patch parcial de `EChartsOption` deep-merged sobre a option base (`shared/src/preset.ts`). O zod
recusa qualquer patch que carregue `data`/`dataset` — preset estiliza, nunca injeta dado. `chartType: null`
faz o preset valer para qualquer gráfico.

## Endpoints

| Método | Rota |
|---|---|
| GET | `/api/health` — ping do banco + status do AI Gateway e dos modelos configurados |
| GET | `/api/dashboard/overview`, `/api/dashboard/series/:key` |
| GET | `/api/schema` — catálogo allowlisted |
| POST | `/api/query/run` — SQL validado pelos guardrails |
| POST | `/api/chat` · GET `/api/chat/conversations[/:id]` |
| CRUD | `/api/charts` (`?pinned=true` = visão geral) · POST `/api/charts/:id/run` · POST `/api/charts/reorder` |
| CRUD | `/api/presets` (`?chartType=` filtra incluindo os globais) |

## Scripts

```bash
bun run dev           # api + web
bun run types         # tsc --noEmit nos dois workspaces
bun run check         # biome
bun run db:studio     # Prisma Studio
```
