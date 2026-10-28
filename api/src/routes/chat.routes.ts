import { Router } from "express";
import { z } from "zod";
import { errors } from "../errors.ts";
import { validateBody } from "../middleware/validate.ts";
import { ask, deleteConversation, getConversation, listConversations } from "../services/chat.service.ts";

const askSchema = z.object({
	question: z.string().min(3).max(500),
	conversationId: z.string().optional(),
});

export const chatRouter = Router();

chatRouter.post("/", validateBody(askSchema), async (request, response) => {
	const { question, conversationId } = request.body as z.infer<typeof askSchema>;

	response.json(await ask(question, conversationId));
});

chatRouter.get("/conversations", async (_request, response) => {
	response.json({ conversations: await listConversations() });
});

chatRouter.get("/conversations/:id", async (request, response) => {
	const conversation = await getConversation(request.params.id);

	if (!conversation) throw errors.notFound("Conversa");

	response.json(conversation);
});

chatRouter.delete("/conversations/:id", async (request, response) => {
	const conversation = await getConversation(request.params.id);

	if (!conversation) throw errors.notFound("Conversa");

	await deleteConversation(conversation.id);
	response.status(204).end();
});
