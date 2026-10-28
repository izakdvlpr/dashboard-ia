import { Router } from "express";
import { getCatalog, getEnums } from "../services/schema-catalog.service.ts";

export const schemaRouter = Router();

/** Catálogo allowlisted — alimenta o builder manual e o autocompletar de SQL. */
schemaRouter.get("/", async (_request, response) => {
	const [tables, enums] = await Promise.all([getCatalog(), getEnums()]);

	response.json({ tables, enums });
});
