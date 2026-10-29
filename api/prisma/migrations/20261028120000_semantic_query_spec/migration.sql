-- SQL livre sai de cena: gráficos e mensagens guardam QuerySpec.
-- Gráficos com SQL antigo viram dataset estático (querySpec nulo).
ALTER TABLE "Chart" DROP COLUMN "sqlQuery",
ADD COLUMN "querySpec" JSONB;

ALTER TABLE "ChatMessage" DROP COLUMN "sql",
ADD COLUMN "querySpec" JSONB;

-- Preserva o histórico do QueryLog: o SQL antigo vai para dentro de rawOutput.
ALTER TABLE "QueryLog" ADD COLUMN "rawOutput" JSONB;
UPDATE "QueryLog" SET "rawOutput" = jsonb_build_object('sql', "rawSql");
ALTER TABLE "QueryLog" ALTER COLUMN "rawOutput" SET NOT NULL;
ALTER TABLE "QueryLog" DROP COLUMN "rawSql";
ALTER TABLE "QueryLog" RENAME COLUMN "sanitizedSql" TO "compiledSql";
