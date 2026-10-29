-- Role read-only usada exclusivamente para executar as consultas do compilador semântico.
-- Defesa em profundidade: mesmo que o registry tenha um erro, o banco recusa
-- qualquer escrita e qualquer leitura das tabelas de estado do app.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'dashboard_ro') THEN
    CREATE ROLE dashboard_ro WITH LOGIN PASSWORD 'dashboard_ro'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE "dashboard-ia" TO dashboard_ro;
GRANT USAGE ON SCHEMA public TO dashboard_ro;

-- Somente o domínio e-commerce.
GRANT SELECT ON
  "Region", "Category", "Product", "Customer", "Order", "OrderItem", "OrderEvent"
  TO dashboard_ro;

-- Deliberadamente SEM grant: "Chart", "ChartPreset", "Conversation",
-- "ChatMessage", "QueryLog" — o chatbot não lê o próprio estado.
REVOKE ALL ON "Chart", "ChartPreset", "Conversation", "ChatMessage", "QueryLog"
  FROM dashboard_ro;

-- Novas tabelas criadas por migrations futuras não ganham SELECT automático.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM dashboard_ro;

ALTER ROLE dashboard_ro SET statement_timeout = '5s';
ALTER ROLE dashboard_ro SET default_transaction_read_only = on;
ALTER ROLE dashboard_ro SET search_path = public;
