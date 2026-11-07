import { parseExpirationQuery } from "./chat.expiration";
import { FoodService } from "../services/food.service";
import { RecipeService } from "../services/recipe.service";
import { createChatRepository, type ChatRepository } from "./chat.repository";
import {
    createDraftFlow,
    createDraftQuestion,
    buildCreatePending,
    proposalReply,
} from "./chat.draft";
import { createToolHandler } from "./chat.tools";
import {
    callOpenAI,
    buildTools,
    outputText,
    type ChatLanguageModel,
} from "./chat.openai";
import type { PendingAction, ChatResponse } from "./chat.types";
import type { CreateFood } from "../interfaces/create-food.interface";
import {
    normalizeText as normalize,
    isCancellationMessage,
    isConfirmationMessage,
    extractDirectStorageQueryLocation,
    formatDateBR,
} from "./chat.validation";
import { convertQuantity, roundQuantity } from "../utils/measurement";
import { formatMeasurement } from "./chat.presentation";
import {
    hasStockMutationIntent,
    isConsultationMessage,
    mentionsAppTopic,
    resolveRecipeOrdinal,
} from "./chat.intent";
import { canonicalFoodName } from "./chat.stock";

export type ChatDependencies = {
    repository?: ChatRepository;
    foodService?: Pick<
        FoodService,
        | "getAllFoods"
        | "createFood"
        | "updateFood"
        | "deleteFood"
        | "applyBatchConsumption"
    >;
    recipeService?: Pick<
        RecipeService,
        "getRecommendations" | "getLocalizedById"
    >;
    languageModel?: ChatLanguageModel;
};

export function createChatService(dependencies: ChatDependencies = {}) {
    const repository = dependencies.repository ?? createChatRepository();
    const foodService = dependencies.foodService ?? new FoodService();
    const recipeService = dependencies.recipeService ?? new RecipeService();
    const model = dependencies.languageModel ?? callOpenAI;
    const {
        getPendingAction,
        setPendingAction,
        getRecipeContext,
        setRecipeContext,
        saveMessage,
        recentHistory,
    } = repository;
    const draft = createDraftFlow(foodService, repository);
    const { continueCreateDraft } = draft;
    const handleTool = createToolHandler(
        foodService,
        recipeService,
        repository,
        draft,
    );
    async function executePendingAction(
        userId: number,
        pending: PendingAction,
    ): Promise<string> {
        if (
            pending.type === "update_expiration_draft" ||
            pending.type === "delete_food_choice"
        ) {
            throw new Error("Complete a escolha antes de confirmar.");
        }

        if (pending.type === "create_food_draft") {
            throw new Error("O cadastro ainda possui dados pendentes.");
        }

        if (pending.type === "create_food_duplicate_choice") {
            throw new Error(
                "Escolha se deseja somar ao registro existente ou cadastrar separado.",
            );
        }

        if (pending.type === "batch_consume") {
            await foodService.applyBatchConsumption(userId, pending.operations);
            return `${pending.movement === "discard" ? "Descarte" : "Consumo"} de ${pending.foodName} registrado com sucesso.`;
        }

        if (pending.type === "create_food") {
            const created = await foodService.createFood(userId, pending.data);

            return `${created.name} foi cadastrado com sucesso.`;
        }

        if (pending.type === "update_food") {
            const updated = await foodService.updateFood(
                pending.foodId,
                userId,
                pending.data,
            );

            return `${updated.name} foi atualizado com sucesso.`;
        }

        await foodService.deleteFood(pending.foodId, userId);

        return "Alimento excluído com sucesso.";
    }

    async function resolvePendingAction(
        userId: number,
        decision: "confirm" | "cancel",
    ): Promise<ChatResponse> {
        const pending = await getPendingAction(userId);
        const userLabel = decision === "confirm" ? "Confirmar" : "Cancelar";

        await saveMessage(userId, "user", userLabel);

        if (!pending) {
            const reply = "Não há nenhuma alteração aguardando confirmação.";
            await saveMessage(userId, "assistant", reply);

            return {
                reply,
                changed: false,
                pending: false,
                actions: [],
                provider: "backend IntelliFit",
            };
        }

        if (decision === "cancel") {
            const reply =
                pending.type === "create_food_draft"
                    ? "Certo, o cadastro foi cancelado e o estoque não foi modificado."
                    : "Certo, a alteração foi cancelada e o estoque não foi modificado.";

            await setPendingAction(userId, null);
            await saveMessage(userId, "assistant", reply);

            return {
                reply,
                changed: false,
                pending: false,
                actions: [],
                provider: "backend IntelliFit",
            };
        }

        if (pending.type === "create_food_draft") {
            const reply = createDraftQuestion(pending.data);
            await saveMessage(userId, "assistant", reply);

            return {
                reply,
                changed: false,
                pending: false,
                actions: [],
                provider: "backend IntelliFit",
            };
        }

        if (pending.type === "create_food_duplicate_choice") {
            const reply =
                "Escolha Somar ao existente ou Cadastrar separado antes de confirmar.";
            await saveMessage(userId, "assistant", reply);
            return {
                reply,
                changed: false,
                pending: true,
                actions: [
                    "Somar ao existente",
                    "Cadastrar separado",
                    "Cancelar",
                ],
                provider: "backend IntelliFit",
            };
        }

        if (
            pending.type === "update_expiration_draft" ||
            pending.type === "delete_food_choice"
        ) {
            const reply =
                pending.type === "update_expiration_draft"
                    ? `Informe a nova validade de **${pending.foodName}** em DD/MM/AAAA.`
                    : "Escolha o lote pelo número ou pela data de validade.";
            await saveMessage(userId, "assistant", reply);
            return {
                reply,
                changed: false,
                pending: false,
                actions: ["Cancelar"],
                provider: "backend IntelliFit",
            };
        }

        const reply = await executePendingAction(userId, pending);
        await setPendingAction(userId, null);
        await saveMessage(userId, "assistant", reply);

        return {
            reply,
            changed: true,
            pending: false,
            actions: [],
            provider: "backend IntelliFit",
        };
    }

    function unsupportedRequestReply(): string {
        return (
            "Não entendi o que você quer fazer no IntelliFit. " +
            "Você pode consultar o estoque, registrar uma compra ou consumo, " +
            "verificar validades ou pedir sugestões de receitas."
        );
    }

    /**
     * Perguntas como "o leite vence hoje?" falam de UM alimento. O atalho de
     * validade listaria todos os vencimentos do dia; nesses casos o modelo deve
     * consultar o alimento citado.
     */
    async function mentionsStockedFood(
        userId: number,
        message: string,
    ): Promise<boolean> {
        const words = new Set(canonicalFoodName(message).split(" "));
        const foods = await foodService.getAllFoods(userId);
        return foods.some((food) =>
            canonicalFoodName(food.name)
                .split(" ")
                .some((token) => token.length >= 4 && words.has(token)),
        );
    }

    function isExpiredOnlyRequest(message: string): boolean {
        const normalized = normalize(message);

        if (
            hasStockMutationIntent(message) ||
            /\b(proximos?|ate|em \d+|nos|na semana|semana)\b/.test(normalized)
        ) {
            return false;
        }

        return (
            normalized === "vencidos" ||
            normalized === "vencido" ||
            normalized.includes("alimentos vencidos") ||
            normalized.includes("o que esta vencido") ||
            normalized.includes("o que esta vencida") ||
            normalized.includes("quais estao vencidos")
        );
    }

    function isRecipeDetailsRequest(message: string): boolean {
        const normalized = normalize(message);

        if (mentionsAppTopic(message) || hasStockMutationIntent(message)) {
            return false;
        }

        return [
            "modo de preparo",
            "como preparo",
            "como preparar",
            "como fazer",
            "ingredientes da receita",
            "ingredientes do",
        ].some((term) => normalized.includes(term));
    }

    function recipeQueryFromMessage(message: string): string {
        return message
            .replace(
                /\b(modo de preparo|como preparo|como preparar|como fazer|ingredientes da receita|ingredientes do|ingredientes de)\b\s*[:\-]?\s*/i,
                "",
            )
            .trim();
    }

    async function recipeNameFromContext(
        userId: number,
        message: string,
    ): Promise<string> {
        const context = await getRecipeContext(userId);
        const rawQuery = recipeQueryFromMessage(message);
        const requested = normalize(rawQuery || message);

        if (!requested) {
            return "";
        }

        const ordinal = resolveRecipeOrdinal(rawQuery || message, context.length);
        if (ordinal >= 0) {
            return context[ordinal].name;
        }

        const scored = context
            .map((item) => {
                const localized = normalize(item.name);
                const original = normalize(item.originalName);

                let score = 0;

                if (localized === requested || original === requested) {
                    score = 100;
                } else if (
                    localized.startsWith(requested) ||
                    original.startsWith(requested)
                ) {
                    score = 80;
                } else if (
                    localized.includes(requested) ||
                    original.includes(requested)
                ) {
                    score = 60;
                } else {
                    const queryTokens = requested.split(" ").filter(Boolean);
                    const targetTokens = new Set(
                        `${localized} ${original}`.split(" ").filter(Boolean),
                    );
                    const matchedTokens = queryTokens.filter((token) =>
                        targetTokens.has(token),
                    );

                    if (queryTokens.length && matchedTokens.length) {
                        score = Math.round(
                            (matchedTokens.length / queryTokens.length) * 40,
                        );
                    }
                }

                return { item, score };
            })
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score);

        if (!scored.length) {
            return "";
        }

        if (scored.length > 1 && scored[0].score === scored[1].score) {
            return "";
        }

        return scored[0].item.name;
    }

    async function lastAssistantAskedRecipeChoice(
        userId: number,
    ): Promise<boolean> {
        const content = normalize(
            await repository.lastAssistantMessage(userId),
        );
        return (
            content.includes("qual receita voce quer preparar") ||
            content.includes("escolha uma das recomendacoes")
        );
    }

    async function sendChatMessage(
        userId: number,
        message: string,
    ): Promise<ChatResponse> {
        const text = message.trim();

        if (!text) {
            throw new Error("Digite uma mensagem.");
        }

        if (text.length > 2000) {
            throw new Error("A mensagem deve ter no máximo 2000 caracteres.");
        }

        const pending = await getPendingAction(userId);

        if (
            !pending &&
            /^(ok|okay|entendi|beleza|obrigad[oa]|valeu)$/.test(normalize(text))
        ) {
            const reply = "Tudo certo!";
            await saveMessage(userId, "user", text);
            await saveMessage(userId, "assistant", reply);
            return {
                reply,
                changed: false,
                pending: false,
                actions: [],
                provider: "backend IntelliFit",
            };
        }

        if (pending && isCancellationMessage(text)) {
            return resolvePendingAction(userId, "cancel");
        }

        if (
            pending?.type === "update_expiration_draft" ||
            pending?.type === "delete_food_choice"
        ) {
            await saveMessage(userId, "user", text);
            const editing = pending.type === "update_expiration_draft";
            const result = await handleTool(
                userId,
                editing ? "continue_expiration_update" : "choose_delete_food",
                editing
                    ? { ...pending.args, foodId: pending.foodId }
                    : { foodIds: pending.foodIds },
                text,
            );
            const reply =
                result.directReply ?? "Informe os dados para continuar.";
            await saveMessage(userId, "assistant", reply);
            return {
                reply,
                changed: false,
                pending:
                    result.pending?.type === "update_food" ||
                    result.pending?.type === "delete_food",
                actions: result.directActions ?? ["Cancelar"],
                provider: "backend IntelliFit",
            };
        }

        if (pending?.type === "create_food_duplicate_choice") {
            await saveMessage(userId, "user", text);
            const normalizedChoice = normalize(text);

            if (
                normalizedChoice.includes("somar") ||
                normalizedChoice.includes("juntar") ||
                normalizedChoice.includes("existente")
            ) {
                const convertedIncoming = convertQuantity(
                    pending.incoming.quantity,
                    pending.incoming.unit,
                    pending.existing.unit,
                );

                if (convertedIncoming === null) {
                    const reply =
                        "Não foi possível somar as quantidades porque as unidades não são compatíveis.";
                    await setPendingAction(userId, null);
                    await saveMessage(userId, "assistant", reply);
                    return {
                        reply,
                        changed: false,
                        pending: false,
                        actions: [],
                        provider: "backend IntelliFit",
                    };
                }

                const updatedData: CreateFood = {
                    name: pending.existing.name,
                    category: pending.existing.category,
                    quantity: roundQuantity(
                        pending.existing.quantity + convertedIncoming,
                    ),
                    unit: pending.existing.unit,
                    storageLocation: pending.existing.storageLocation,
                    expirationDate: [
                        pending.existing.expirationDate,
                        pending.incoming.expirationDate,
                    ].sort()[0],
                };

                const nextPending: PendingAction = {
                    type: "update_food",
                    description: `Somar ${formatMeasurement(pending.incoming.quantity, pending.incoming.unit)} ao registro existente de ${pending.existing.name}`,
                    foodId: pending.existing.id,
                    data: updatedData,
                };
                await setPendingAction(userId, nextPending);

                const reply = [
                    `**Atualizar ${pending.existing.name}**`,
                    "",
                    `- Estoque atual: ${formatMeasurement(pending.existing.quantity, pending.existing.unit)}`,
                    `- Novo saldo: ${formatMeasurement(updatedData.quantity, updatedData.unit)}`,
                    `- Validade do lote unificado: ${formatDateBR(updatedData.expirationDate)} (a mais próxima).`,
                    "",
                    "Confirme para salvar ou cancele para desistir.",
                ].join("\n");
                await saveMessage(userId, "assistant", reply);
                return {
                    reply,
                    changed: false,
                    pending: true,
                    actions: ["Confirmar", "Cancelar"],
                    provider: "backend IntelliFit",
                };
            }

            if (
                normalizedChoice.includes("separado") ||
                normalizedChoice.includes("novo registro")
            ) {
                const nextPending = buildCreatePending(pending.incoming);
                await setPendingAction(userId, nextPending);
                const reply = proposalReply(pending.incoming);
                await saveMessage(userId, "assistant", reply);
                return {
                    reply,
                    changed: false,
                    pending: true,
                    actions: ["Confirmar", "Cancelar"],
                    provider: "backend IntelliFit",
                };
            }

            const reply =
                "Escolha **Somar ao existente**, **Cadastrar separado** ou **Cancelar**.";
            await saveMessage(userId, "assistant", reply);
            return {
                reply,
                changed: false,
                pending: true,
                actions: [
                    "Somar ao existente",
                    "Cadastrar separado",
                    "Cancelar",
                ],
                provider: "backend IntelliFit",
            };
        }

        if (
            pending &&
            pending.type !== "create_food_draft" &&
            isConfirmationMessage(text)
        ) {
            return resolvePendingAction(userId, "confirm");
        }

        await saveMessage(userId, "user", text);

        if (pending) {
            if (pending.type === "create_food_draft") {
                // Pergunta no meio do cadastro ("o que tenho na geladeira?"):
                // responde sem preencher campos e retoma o cadastro em seguida.
                if (isConsultationMessage(text)) {
                    const answer = await answerFreeText(userId, text);
                    const stillPending = await getPendingAction(userId);

                    if (stillPending?.type === "create_food_draft") {
                        const reply = [
                            answer.reply,
                            "",
                            `Seguimos com o cadastro${stillPending.data.name ? ` de **${stillPending.data.name}**` : ""}: ${createDraftQuestion(stillPending.data)}`,
                        ].join("\n");
                        await saveMessage(userId, "assistant", reply);
                        return { ...answer, reply, pending: false };
                    }

                    await saveMessage(userId, "assistant", answer.reply);
                    return answer;
                }

                const continued = await continueCreateDraft(
                    userId,
                    pending,
                    text,
                );

                await saveMessage(userId, "assistant", continued.reply);

                return {
                    reply: continued.reply,
                    changed: false,
                    pending: continued.ready,
                    actions:
                        continued.actions ??
                        (continued.ready ? ["Confirmar", "Cancelar"] : []),
                    provider: "backend IntelliFit",
                };
            }

            const reply = [
                "**Alteração aguardando confirmação**",
                "",
                pending.description,
                "",
                "Escolha **Confirmar** ou **Cancelar** antes de continuar.",
            ].join("\n");

            await saveMessage(userId, "assistant", reply);

            return {
                reply,
                changed: false,
                pending: true,
                actions: ["Confirmar", "Cancelar"],
                provider: "backend IntelliFit",
            };
        }

        const response = await answerFreeText(userId, text);
        await saveMessage(userId, "assistant", response.reply);
        return response;
    }

    /**
     * Interpreta uma mensagem livre (consultas, receitas, ações via modelo).
     * Não grava a resposta do assistente: quem chama grava uma única vez.
     */
    async function answerFreeText(
        userId: number,
        text: string,
    ): Promise<ChatResponse> {
        if (isCancellationMessage(text)) {
            await setRecipeContext(userId, []);
            const reply = "Tudo bem. Nenhuma alteração foi feita.";
            return {
                reply,
                changed: false,
                pending: false,
                actions: [],
                provider: "backend IntelliFit",
            };
        }

        const discard = normalize(text).match(
            /^descarte (?:(tod[oa]s?) )?(?:(?:o|a|os|as) )?([a-z ]+)$/,
        );
        if (
            discard &&
            !/\b(vencid[oa]s?|todo[s]?|toda[s]?|geladeira|despensa|freezer|e)\b/.test(
                discard[2],
            )
        ) {
            const result = await handleTool(
                userId,
                "consume_food",
                {
                    name: discard[2],
                    includeExpired: true,
                    wholeDiscard: true,
                    allLots: Boolean(discard[1]),
                },
                text,
            );
            const reply = result.directReply ?? unsupportedRequestReply();
            return {
                reply,
                changed: false,
                pending: Boolean(result.pending),
                actions: result.directActions ?? [],
                provider: "backend IntelliFit",
            };
        }

        if (
            parseExpirationQuery(text) &&
            !(await mentionsStockedFood(userId, text))
        ) {
            const result = await handleTool(
                userId,
                "list_expiring",
                { days: 7, includeExpired: false, onlyExpired: false },
                text,
            );

            if (result.directReply) {

                return {
                    reply: result.directReply,
                    changed: false,
                    pending: false,
                    actions: result.directActions ?? [],
                    provider: "backend IntelliFit",
                };
            }
        }

        const directLocation = hasStockMutationIntent(text)
            ? null
            : extractDirectStorageQueryLocation(text);
        if (directLocation) {
            const result = await handleTool(
                userId,
                "list_foods",
                { query: "", storageLocation: directLocation },
                text,
            );
            if (result.directReply) {
                return {
                    reply: result.directReply,
                    changed: false,
                    pending: false,
                    actions: result.directActions ?? [],
                    provider: "backend IntelliFit",
                };
            }
        }

        if (isExpiredOnlyRequest(text)) {
            const result = await handleTool(
                userId,
                "list_expiring",
                { days: 0, includeExpired: false, onlyExpired: true },
                text,
            );

            if (result.directReply) {

                return {
                    reply: result.directReply,
                    changed: false,
                    pending: false,
                    actions: result.directActions ?? [],
                    provider: "backend IntelliFit",
                };
            }
        }

        const explicitRecipeDetails = isRecipeDetailsRequest(text);
        const awaitingRecipeChoice = explicitRecipeDetails
            ? false
            : await lastAssistantAskedRecipeChoice(userId);
        const contextualRecipe =
            explicitRecipeDetails || awaitingRecipeChoice
                ? await recipeNameFromContext(userId, text)
                : "";

        if (
            explicitRecipeDetails ||
            (awaitingRecipeChoice && contextualRecipe)
        ) {
            // Se não houve correspondência no contexto, repassa o texto digitado para
            // a ferramenta informar "não encontrei essa receita" em vez de reiniciar a lista.
            const requestedRecipe =
                contextualRecipe ||
                (explicitRecipeDetails ? recipeQueryFromMessage(text) : "");

            const result = await handleTool(
                userId,
                "get_recipe_details",
                { recipe: requestedRecipe },
                text,
            );

            if (result.directReply) {

                return {
                    reply: result.directReply,
                    changed: false,
                    pending: false,
                    actions: result.directActions ?? [],
                    provider: "backend IntelliFit",
                };
            }
        }

        const history = await recentHistory(userId);

        const contextHistory = history.slice(0, -1);
        const input: unknown[] = [
            ...contextHistory,
            { role: "user", content: text },
        ];

        const tools = buildTools();
        let response = await model(input, tools);
        let hasPendingAction = false;

        for (let round = 0; round < 3; round += 1) {
            const functionCalls = (response.output ?? []).filter(
                (item) =>
                    item.type === "function_call" &&
                    typeof item.name === "string",
            );

            if (!functionCalls.length) {
                break;
            }

            input.push(...(response.output ?? []));

            for (const call of functionCalls) {
                let args: Record<string, unknown> = {};

                try {
                    const parsed: unknown = JSON.parse(call.arguments || "{}");
                    if (
                        parsed &&
                        typeof parsed === "object" &&
                        !Array.isArray(parsed)
                    )
                        args = parsed as Record<string, unknown>;
                } catch {
                    args = {};
                }

                if (
                    call.name === "continue_expiration_update" ||
                    call.name === "choose_delete_food"
                )
                    continue;
                const result = await handleTool(userId, call.name!, args, text);

                if (result.directReply) {

                    const readyForConfirmation =
                        result.pending?.type !== "create_food_draft" &&
                        result.pending?.type !== "update_expiration_draft" &&
                        result.pending?.type !== "delete_food_choice";

                    return {
                        reply: result.directReply,
                        changed: false,
                        pending:
                            Boolean(result.pending) && readyForConfirmation,
                        actions: result.directActions ?? [],
                        provider: "OpenAI API + backend IntelliFit",
                    };
                }

                if (result.pending) {
                    hasPendingAction = true;
                }

                input.push({
                    type: "function_call_output",
                    call_id: call.call_id,
                    output: JSON.stringify(result.output),
                });
            }

            response = await model(input, tools);
        }

        const reply = outputText(response) || unsupportedRequestReply();


        return {
            reply,
            changed: false,
            pending: hasPendingAction,
            actions: hasPendingAction ? ["Confirmar", "Cancelar"] : [],
            provider: "OpenAI API + backend IntelliFit",
        };
    }
    return {
        sendChatMessage,
        resolvePendingAction,
        getChatHistory: repository.getChatHistory,
        clearChat: repository.clearChat,
    };
}

const chatService = createChatService();
export const {
    sendChatMessage,
    resolvePendingAction,
    getChatHistory,
    clearChat,
} = chatService;

export default chatService;
