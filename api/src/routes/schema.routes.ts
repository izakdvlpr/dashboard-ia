import { Router } from "express";
import { getSemanticCatalog } from "../services/schema-catalog.service.ts";

export const schemaRouter = Router();

/** Catálogo semântico — alimenta o formulário do builder e o MCP. */
schemaRouter.get("/", async (_request, response) => {
	response.json(await getSemanticCatalog());
});
