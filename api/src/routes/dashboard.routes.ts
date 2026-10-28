import { Router } from "express";
import { z } from "zod";
import { errors } from "../errors.ts";
import { getQuery, validateQuery } from "../middleware/validate.ts";
import {
	type DateRange,
	defaultRange,
	getOverview,
	getSeries,
	SERIES_KEYS,
	type SeriesKey,
} from "../services/dashboard.service.ts";

const rangeSchema = z.object({
	from: z.iso.datetime({ offset: true }).optional().or(z.iso.date().optional()),
	to: z.iso.datetime({ offset: true }).optional().or(z.iso.date().optional()),
	months: z.coerce.number().int().min(1).max(60).optional(),
});

type RangeQuery = z.infer<typeof rangeSchema>;

function resolveRange(query: RangeQuery): DateRange {
	const fallback = defaultRange(query.months ?? 12);

	return {
		from: query.from ? new Date(query.from) : fallback.from,
		to: query.to ? new Date(query.to) : fallback.to,
	};
}

export const dashboardRouter = Router();

dashboardRouter.get("/overview", validateQuery(rangeSchema), async (request, response) => {
	const range = resolveRange(getQuery<RangeQuery>(request));

	response.json(await getOverview(range));
});

dashboardRouter.get("/series/:key", validateQuery(rangeSchema), async (request, response) => {
	const key = request.params.key as SeriesKey;

	if (!SERIES_KEYS.includes(key)) {
		throw errors.validation(`Série desconhecida: "${key}". Válidas: ${SERIES_KEYS.join(", ")}.`);
	}

	const range = resolveRange(getQuery<RangeQuery>(request));

	response.json(await getSeries(key, range));
});
