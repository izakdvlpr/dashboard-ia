import cors from "cors";
import express from "express";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.ts";
import { chartsRouter } from "./routes/charts.routes.ts";
import { chatRouter } from "./routes/chat.routes.ts";
import { dashboardRouter } from "./routes/dashboard.routes.ts";
import { healthRouter } from "./routes/health.routes.ts";
import { presetsRouter } from "./routes/presets.routes.ts";
import { queryRouter } from "./routes/query.routes.ts";
import { schemaRouter } from "./routes/schema.routes.ts";

export function createApp() {
	const app = express();

	app.use(cors());
	app.use(express.json({ limit: "1mb" }));

	app.use("/api/health", healthRouter);
	app.use("/api/dashboard", dashboardRouter);
	app.use("/api/schema", schemaRouter);
	app.use("/api/query", queryRouter);
	app.use("/api/chat", chatRouter);
	app.use("/api/charts", chartsRouter);
	app.use("/api/presets", presetsRouter);

	app.use(notFoundHandler);
	app.use(errorHandler);

	return app;
}
