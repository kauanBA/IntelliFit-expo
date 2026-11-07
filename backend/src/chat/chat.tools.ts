import { resolveRecipeOrdinal } from "./chat.intent";
import { parseExpirationQuery } from "./chat.expiration";
import type { FoodService } from "../services/food.service";
import type { RecipeService } from "../services/recipe.service";
import type { ChatRepository } from "./chat.repository";
import type { DraftFlow } from "./chat.draft";
import type {
    CreateFoodDraftData,
    PendingAction,
    ToolResult,
} from "./chat.types";
import type { CreateFood } from "../interfaces/create-food.interface";
import {
    normalizeText as normalize,
    extractStorageLocation,
    extractUnitFromMessage,
    messageMentionsPackaging,
    resolveQuantity,
    ZERO_QUANTITY_REPLY,
    hasNegativeQuantity,
    nameAppearsInMessage,
    parseDateInput,
    formatDateBR,
} from "./chat.validation";
import {
    convertQuantity,
    normalizeMeasurementUnit,
} from "../utils/measurement";
import { daysUntilExpiration } from "../utils/expiration";
import {
    canonicalFoodName,
    describeGroupChoices,
    findFoodByName,
    foodGroupsMentioned,
    planConsumptionAcrossBatches,
    relatedStockNote,
} from "./chat.stock";
import {
    asDateOnly,
    formatFood,
    formatFoodListReply,
    formatExpiringReply,
    formatRecipeRecommendations,
    formatRecipeDetailsReply,
    formatMeasurement,
    formatQuantity,
    locationLabel,
} from "./chat.presentation";
import {
    toCreateFood,
    buildCreatePending,
    proposalReply,
    missingCreateField,
    createDraftQuestion,
    expirationValidationReply,
    suggestedUnitOptions,
} from "./chat.draft";

export function createToolHandler(
    foodService: Pick<FoodService, "getAllFoods">,
    recipeService: Pick<
        RecipeService,
        "getRecommendations" | "getLocalizedById"
    >,
    repository: ChatRepository,
    draft: DraftFlow,
) {
    const { setPendingAction, setRecipeContext, getRecipeContext } = repository;
    const { proposeExistingLot } = draft;
    const daysUntil = daysUntilExpiration;
    async function handleTool(
        userId: number,
        name: string,
        args: Record<string, unknown>,
        userMessage: string,
    ): Promise<ToolResult> {
        const foods = await foodService.getAllFoods(userId);

        if (name === "list_foods") {
            const query = canonicalFoodName(String(args.query ?? ""));
            const location = String(args.storageLocation ?? "");

            const selected = foods.filter((food) => {
                const matchesName =
                    !query || canonicalFoodName(food.name).includes(query);
                const matchesLocation =
                    !location || food.storageLocation === location;

                return matchesName && matchesLocation;
            });

            const formatted = selected.map(formatFood);

            return {
                output: {
                    count: selected.length,
                    foods: formatted,
                },
                directReply: formatFoodListReply(
                    formatted,
                    location,
                    String(args.query ?? "").trim(),
                ),
            };
        }

        if (name === "list_expiring") {
            const period = parseExpirationQuery(userMessage);
            if (period?.kind === "invalid") {
                return {
                    output: {},
                    directReply:
                        "Informe uma data válida ou um período de 1 a 3650 dias.",
                };
            }
            const days = Number(args.days ?? 7);
            const includeExpired = Boolean(args.includeExpired);
            const onlyExpired = Boolean(args.onlyExpired);

            const location = period
                ? extractStorageLocation(userMessage)
                : null;
            let selected = foods
                .filter(
                    (food) => !location || food.storageLocation === location,
                )
                .map((food) => ({
                    ...formatFood(food),
                    expirationDate: asDateOnly(food.expirationDate),
                    daysUntilExpiration: daysUntil(food.expirationDate),
                }))
                .filter((food) => {
                    const remaining = Number(food.daysUntilExpiration);

                    if (period?.kind === "range") {
                        const date = String(food.expirationDate);
                        return date >= period.start && date <= period.end;
                    }
                    if (period?.kind === "nearest") return remaining >= 0;

                    if (onlyExpired) {
                        return remaining < 0;
                    }

                    return includeExpired
                        ? remaining <= days
                        : remaining >= 0 && remaining <= days;
                })
                .sort(
                    (a, b) =>
                        Number(a.daysUntilExpiration) -
                        Number(b.daysUntilExpiration),
                );

            if (period?.kind === "nearest" && selected.length) {
                const nearest = selected[0].daysUntilExpiration;
                selected = selected.filter(
                    (food) => food.daysUntilExpiration === nearest,
                );
            }

            return {
                output: {
                    count: selected.length,
                    foods: selected,
                },
                directReply: formatExpiringReply(
                    selected,
                    !period && onlyExpired ? "expired" : "upcoming",
                    period?.kind === "range"
                        ? period.title
                        : period?.kind === "nearest"
                          ? "Vencimento mais próximo"
                          : undefined,
                ),
            };
        }

        if (name === "stock_summary") {
            const expiringIn7Days = foods.filter((food) => {
                const remaining = daysUntil(food.expirationDate);
                return remaining >= 0 && remaining <= 7;
            }).length;

            const expired = foods.filter(
                (food) => daysUntil(food.expirationDate) < 0,
            ).length;

            const byLocation = {
                DESPENSA: foods.filter(
                    (food) => food.storageLocation === "DESPENSA",
                ).length,
                GELADEIRA: foods.filter(
                    (food) => food.storageLocation === "GELADEIRA",
                ).length,
                FREEZER: foods.filter(
                    (food) => food.storageLocation === "FREEZER",
                ).length,
            };

            return {
                output: {
                    total: foods.length,
                    expired,
                    expiringIn7Days,
                    byLocation,
                },
                directReply: [
                    "**Resumo do estoque**",
                    "",
                    `- Total: ${foods.length} alimento(s)`,
                    `- Vencidos: ${expired}`,
                    `- Vencem nos próximos 7 dias: ${expiringIn7Days}`,
                    `- Despensa: ${byLocation.DESPENSA}`,
                    `- Geladeira: ${byLocation.GELADEIRA}`,
                    `- Freezer: ${byLocation.FREEZER}`,
                ].join("\n"),
            };
        }

        if (name === "recommend_recipes") {
            const recommendations =
                await recipeService.getRecommendations(foods);

            await setRecipeContext(
                userId,
                recommendations.map((recipe) => ({
                    idMeal: recipe.idMeal,
                    name: recipe.strMeal,
                    originalName: String(recipe.originalName ?? recipe.strMeal),
                })),
            );

            const recipeOutput = recommendations.map((recipe) => ({
                idMeal: recipe.idMeal,
                name: recipe.strMeal,
                originalName: recipe.originalName ?? recipe.strMeal,
                mlScore: recipe.mlScore,
                matchingIngredients: recipe.matchingIngredients,
                matchedIngredients: recipe.matchedIngredients,
            }));

            return {
                output: {
                    algorithm: "TF-IDF + k-NN (distância do cosseno)",
                    recipes: recipeOutput,
                },
                directReply: formatRecipeRecommendations(recommendations),
                directActions: recommendations.map(
                    (recipe) => `Modo de preparo: ${recipe.strMeal}`,
                ),
            };
        }

        if (name === "get_recipe_details") {
            const context = await getRecipeContext(userId);
            const requested = normalize(String(args.recipe ?? ""));

            if (!context.length) {
                return {
                    output: {
                        error: "Nenhuma receita recomendada recentemente.",
                    },
                    directReply:
                        "Peça primeiro uma recomendação de receitas com base no seu estoque.",
                };
            }

            if (!requested && context.length > 1) {
                return {
                    output: { needsChoice: true, recipes: context },
                    directReply: [
                        "**Qual receita você quer preparar?**",
                        "",
                        ...context.map((item) => `- ${item.name}`),
                    ].join("\n"),
                    directActions: context.map(
                        (item) => `Modo de preparo: ${item.name}`,
                    ),
                };
            }

            const ordinal = resolveRecipeOrdinal(requested, context.length);
            const matches = context.filter((item, position) => {
                if (ordinal >= 0) return position === ordinal;
                if (!requested) return true;
                const localized = normalize(item.name);
                const original = normalize(item.originalName);
                return (
                    localized === requested ||
                    original === requested ||
                    localized.includes(requested) ||
                    requested.includes(localized) ||
                    original.includes(requested) ||
                    requested.includes(original)
                );
            });

            if (matches.length !== 1) {
                return {
                    output: { needsChoice: true, recipes: context },
                    directReply: [
                        "Não consegui identificar uma única receita. Escolha uma das recomendações:",
                        "",
                        ...context.map((item) => `- ${item.name}`),
                    ].join("\n"),
                    directActions: context.map(
                        (item) => `Modo de preparo: ${item.name}`,
                    ),
                };
            }

            const recipe = await recipeService.getLocalizedById(
                matches[0].idMeal,
            );

            if (!recipe) {
                return {
                    output: { error: "Receita não encontrada." },
                    directReply:
                        "Não consegui carregar os detalhes dessa receita.",
                };
            }

            return {
                output: {
                    idMeal: recipe.idMeal,
                    name: recipe.strMeal,
                    ingredients: recipe.localizedIngredients,
                    preparationSteps: recipe.preparationSteps,
                },
                directReply: formatRecipeDetailsReply(recipe),
                directActions: ["O que posso cozinhar com o que tenho?"],
            };
        }

        if (name === "create_food") {
            const modelName = String(args.name ?? "").trim();
            const normalizedName = canonicalFoodName(modelName);
            const spokenName = ` ${canonicalFoodName(userMessage)} `;
            const frozenQualifier = ["congelado", "congelada"].find(
                (qualifier) =>
                    spokenName.includes(` ${normalizedName} ${qualifier} `),
            );
            const foodName = frozenQualifier
                ? `${modelName} ${frozenQualifier}`
                : modelName;
            // Só vale a quantidade que o usuário escreveu: o valor do modelo é
            // ignorado se não aparecer na mensagem.
            const { quantity, zero: zeroQuantity } = resolveQuantity(
                userMessage,
                args.quantity,
            );
            const explicitUnit = extractUnitFromMessage(userMessage);
            const modelUnit =
                args.unit == null
                    ? null
                    : normalizeMeasurementUnit(String(args.unit));
            const parsedDate = parseDateInput(userMessage);
            const validParsedDate =
                parsedDate && !expirationValidationReply(parsedDate)
                    ? parsedDate
                    : undefined;

            // "comprei 8 caixas": embalagem não é unidade de estoque. Descarta
            // quantidade/unidade e pede de novo em un, g, kg, ml ou L.
            const packaging = messageMentionsPackaging(userMessage);

            const draft: CreateFoodDraftData = {
                name:
                    modelName && nameAppearsInMessage(modelName, userMessage)
                        ? foodName
                        : undefined,
                quantity: packaging ? undefined : (quantity ?? undefined),
                unit: packaging
                    ? undefined
                    : (explicitUnit ??
                      (quantity !== null ? (modelUnit ?? undefined) : undefined)),
                packaging: packaging || undefined,
                storageLocation:
                    extractStorageLocation(userMessage) ?? undefined,
                expirationDate: validParsedDate,
            };

            const complete = toCreateFood(draft);

            if (complete) {
                const duplicate = await proposeExistingLot(
                    userId,
                    complete,
                    foods,
                );
                if (duplicate) return duplicate;

                const pending = buildCreatePending(complete);
                await setPendingAction(userId, pending);

                return {
                    output: {
                        requiresConfirmation: true,
                        proposal: pending.description,
                    },
                    pending,
                    directReply: proposalReply(complete),
                    directActions: ["Confirmar", "Cancelar"],
                };
            }

            const draftPending: PendingAction = {
                type: "create_food_draft",
                data: draft,
            };

            await setPendingAction(userId, draftPending);

            if (hasNegativeQuantity(userMessage) || zeroQuantity) {
                return {
                    output: {
                        needsInformation: true,
                        missingField: "quantity",
                    },
                    pending: draftPending,
                    directReply: ZERO_QUANTITY_REPLY,
                    directActions: [],
                };
            }

            if (parsedDate) {
                const validationMessage = expirationValidationReply(parsedDate);

                if (
                    validationMessage &&
                    missingCreateField(draft) === "expirationDate"
                ) {
                    return {
                        output: {
                            needsInformation: true,
                            missingField: "expirationDate",
                        },
                        pending: draftPending,
                        directReply: validationMessage,
                        directActions: [],
                    };
                }
            }

            return {
                output: {
                    needsInformation: true,
                    missingField: missingCreateField(draft),
                },
                pending: draftPending,
                directReply: createDraftQuestion(draft),
                directActions: [],
            };
        }

        const targetName = String(args.name ?? "").trim();

        if (name === "consume_food") {
            const resolved = resolveQuantity(userMessage, args.quantity);

            if (
                hasNegativeQuantity(userMessage) ||
                (resolved.zero && args.wholeDiscard !== true)
            ) {
                return {
                    output: { error: "A quantidade deve ser maior que zero." },
                    directReply: "A quantidade deve ser maior que zero.",
                };
            }

            let quantity: number = resolved.quantity ?? NaN;
            const parsedUnit = extractUnitFromMessage(userMessage);
            const modelUnit =
                args.unit == null
                    ? null
                    : normalizeMeasurementUnit(String(args.unit));
            let requestedUnit = parsedUnit ?? modelUnit;

            if (!targetName) {
                return {
                    output: { error: "Alimento não informado." },
                    directReply:
                        "Informe qual alimento deve ser retirado do estoque.",
                };
            }

            const wholeDiscard = args.wholeDiscard === true;
            const matchingGroups = wholeDiscard
                ? [
                      foods.filter(
                          (food) =>
                              canonicalFoodName(food.name) ===
                              canonicalFoodName(targetName),
                      ),
                  ].filter((group) => group.length)
                : foodGroupsMentioned(foods, targetName);

            if (!matchingGroups.length) {
                return {
                    output: { error: "Alimento não encontrado no estoque." },
                    directReply: `Não encontrei ${targetName} no seu estoque.`,
                };
            }

            if (matchingGroups.length > 1) {
                return {
                    output: {
                        error: "Mais de um alimento corresponde ao nome informado.",
                        options: matchingGroups
                            .map((group) => group[0]?.name)
                            .filter(Boolean),
                    },
                    directReply: describeGroupChoices(matchingGroups),
                };
            }

            const location = extractStorageLocation(userMessage);
            const group = matchingGroups[0].filter(
                (food) => !location || food.storageLocation === location,
            );
            if (!group.length) {
                return {
                    output: {},
                    directReply: `Não encontrei **${targetName}** em **${locationLabel(location!)}**.`,
                };
            }
            const locations = [
                ...new Set(group.map((food) => food.storageLocation)),
            ];
            if (!location && locations.length > 1 && args.allLots !== true) {
                return {
                    output: {},
                    directReply: `**${group[0].name}** está em ${locations.map(locationLabel).join(", ")}. Repita o pedido indicando de qual local deseja retirar.`,
                };
            }
            if (!wholeDiscard && messageMentionsPackaging(userMessage)) {
                const stockUnit = normalizeMeasurementUnit(group[0].unit);
                const ask = stockUnit
                    ? `a unidade cadastrada de ${group[0].name} é **${stockUnit}**. Ex.: 1 ${stockUnit}`
                    : `use ${suggestedUnitOptions(group[0].name)}`;

                return {
                    output: { needsInformation: true, missingField: "unit" },
                    directReply:
                        `Não registro baixa por caixa, pacote, lata ou garrafa: ${ask}.`,
                };
            }
            if (wholeDiscard) {
                if (group.length > 1 && args.allLots !== true) {
                    return {
                        output: {},
                        directReply: `Há mais de um lote de **${group[0].name}**. Informe a quantidade que deseja descartar.`,
                    };
                }
                requestedUnit = normalizeMeasurementUnit(group[0].unit);
                const quantities = group.map((food) =>
                    requestedUnit
                        ? convertQuantity(
                              food.quantity,
                              food.unit,
                              requestedUnit,
                          )
                        : null,
                );
                if (quantities.some((value) => value === null)) {
                    return {
                        output: {},
                        directReply:
                            "Esse alimento tem lotes com unidades incompatíveis. Informe a quantidade e a unidade a descartar.",
                    };
                }
                quantity = quantities.reduce<number>(
                    (total, value) => total + (value ?? 0),
                    0,
                );
            }

            if (!Number.isFinite(quantity) || quantity <= 0) {
                return {
                    output: { error: "Quantidade inválida." },
                    directReply:
                        "Informe uma quantidade maior que zero para dar baixa no estoque.",
                };
            }

            const includeExpired = Boolean(args.includeExpired);
            const plan = planConsumptionAcrossBatches(
                group,
                quantity,
                requestedUnit,
                { includeExpired },
            );

            if ("error" in plan) {
                const reply = plan.insufficient
                    ? plan.error + relatedStockNote(foods, group)
                    : plan.error;
                return {
                    output: { error: plan.error },
                    directReply: reply,
                };
            }

            const affected = group.find(
                (food) => food.id === plan.operations[0]?.foodId,
            );
            const balanceUnit =
                normalizeMeasurementUnit(affected?.unit ?? plan.unit) ??
                plan.unit;
            const formatBalance = (amount: number) => {
                const converted = convertQuantity(
                    amount,
                    plan.unit,
                    balanceUnit,
                );
                return converted === null
                    ? formatMeasurement(amount, plan.unit)
                    : `${formatQuantity(converted, 3)} ${balanceUnit}`;
            };
            const foodName = group[0].name;
            const pendingAction: PendingAction = {
                type: "batch_consume",
                movement: includeExpired ? "discard" : "consume",
                foodName,
                operations: plan.operations,
                description: `Registrar ${includeExpired ? "descarte" : "consumo"} de ${formatMeasurement(quantity, plan.unit)} de ${foodName}`,
            };

            await setPendingAction(userId, pendingAction);

            const notes: string[] = [];
            if (group.length > 1) {
                notes.push(
                    includeExpired
                        ? "Os lotes serão retirados pela validade mais próxima primeiro, incluindo os vencidos."
                        : "Os lotes válidos serão usados pela validade mais próxima primeiro.",
                );
            }
            if (plan.expiredIgnored > 0 && !includeExpired) {
                notes.push(
                    `${plan.expiredIgnored} registro(s) vencido(s) não serão usados no consumo.`,
                );
            }

            return {
                output: {
                    requiresConfirmation: true,
                    batches: plan.operations.length,
                    before: plan.beforeTotal,
                    after: plan.afterTotal,
                    unit: plan.unit,
                },
                pending: pendingAction,
                directReply: [
                    `**${includeExpired ? "Descarte" : "Consumo"} de ${foodName}**`,
                    "",
                    `- Quantidade: ${formatMeasurement(quantity, plan.unit)}`,
                    ...(locations.length === 1
                        ? [`- Local: ${locationLabel(locations[0])}`]
                        : []),
                    `- ${includeExpired || plan.expiredIgnored === 0 ? "Saldo disponível" : "Estoque válido"} atual: ${formatBalance(plan.beforeTotal)}`,
                    `- Novo saldo${includeExpired || plan.expiredIgnored === 0 ? "" : " válido"}: ${formatBalance(plan.afterTotal)}`,
                    ...notes.map((note) => `- ${note}`),
                    "",
                    "Confirme para salvar ou cancele para desistir.",
                ].join("\n"),
                directActions: ["Confirmar", "Cancelar"],
            };
        }

        const found = targetName ? findFoodByName(foods, targetName) : {};
        let food = found.food;

        if (name === "delete_food" || name === "choose_delete_food") {
            const savedIds = Array.isArray(args.foodIds) ? args.foodIds : [];
            const candidates =
                name === "choose_delete_food"
                    ? savedIds.flatMap((id) =>
                          foods.filter((item) => item.id === id),
                      )
                    : (found.ambiguous ?? (food ? [food] : []));
            if (!candidates.length) {
                await setPendingAction(userId, null);
                return {
                    output: {},
                    directReply: "Não encontrei esse alimento no estoque.",
                };
            }

            const selection = normalize(userMessage);
            const ordinal =
                name === "choose_delete_food"
                    ? selection.match(/^(?:opcao |lote )?(\d+)$/)
                    : null;
            const date = parseDateInput(userMessage);
            const invalidDate =
                !date &&
                /\b\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}\b/.test(userMessage);
            const expired = /\bvencid[oa]s?\b/.test(selection);
            const location = extractStorageLocation(userMessage);
            const matches = candidates.filter(
                (item) =>
                    !invalidDate &&
                    (!ordinal ||
                        item.id === savedIds[Number(ordinal[1]) - 1]) &&
                    (!date || asDateOnly(item.expirationDate) === date) &&
                    (!expired || daysUntil(item.expirationDate) < 0) &&
                    (!location || item.storageLocation === location),
            );
            const identified =
                name === "delete_food" ||
                ordinal ||
                date ||
                expired ||
                location;
            if (matches.length !== 1 || !identified) {
                const options = matches.length ? matches : candidates;
                const pending: PendingAction = {
                    type: "delete_food_choice",
                    foodIds: options.map((item) => item.id),
                };
                await setPendingAction(userId, pending);
                return {
                    output: {},
                    pending,
                    directReply: [
                        matches.length
                            ? "**Qual lote você quer excluir?**"
                            : "**Nenhum lote corresponde a essa escolha.**",
                        ...options.map(
                            (item, index) =>
                                `${index + 1}. ${item.name} — ${formatMeasurement(item.quantity, item.unit)} — ${locationLabel(item.storageLocation)} — ${daysUntil(item.expirationDate) < 0 ? "Vencido em" : "Validade"} ${formatDateBR(asDateOnly(item.expirationDate))}`,
                        ),
                        "Informe o número do lote ou a data de validade.",
                    ].join("\n"),
                    directActions: ["Cancelar"],
                };
            }
            food = matches[0];
            name = "delete_food";
        }

        if (name === "continue_expiration_update") {
            food = foods.find((item) => item.id === args.foodId);
            if (!food) await setPendingAction(userId, null);
            name = "update_food";
        }

        if (!food) {
            return {
                output: found.ambiguous
                    ? {
                          error: "Mais de um alimento corresponde ao nome informado.",
                          options: found.ambiguous.map(formatFood),
                      }
                    : { error: "Alimento não encontrado no estoque." },
                ...(args.foodId != null
                    ? { directReply: "Esse lote não está mais no estoque." }
                    : {}),
            };
        }

        if (name === "update_food") {
            const currentUnit = normalizeMeasurementUnit(food.unit);
            const requestedUnit =
                args.unit == null
                    ? currentUnit
                    : normalizeMeasurementUnit(String(args.unit));

            if (!currentUnit || !requestedUnit) {
                return {
                    output: {
                        error: "Unidade inválida.",
                    },
                    directReply: `Use uma unidade padronizada: ${suggestedUnitOptions(food.name)}.`,
                };
            }

            if (hasNegativeQuantity(userMessage)) {
                return {
                    output: {
                        error: "A quantidade deve ser maior que zero.",
                    },
                    directReply: "A quantidade deve ser maior que zero.",
                };
            }

            const resolvedUpdate = resolveQuantity(userMessage, args.quantity);
            if (resolvedUpdate.zero && args.quantity != null) {
                return {
                    output: {
                        error: "A quantidade deve ser maior que zero.",
                    },
                    directReply: "A quantidade deve ser maior que zero.",
                };
            }

            // Se o modelo enviou uma quantidade que o usuário não escreveu,
            // ela é descartada e o estoque atual é mantido.
            const requestedQuantity =
                args.quantity == null ? null : resolvedUpdate.quantity;
            let quantity = requestedQuantity ?? food.quantity;

            if (!Number.isFinite(quantity) || quantity <= 0) {
                return {
                    output: {
                        error: "A quantidade deve ser maior que zero.",
                    },
                    directReply: "A quantidade deve ser maior que zero.",
                };
            }

            if (
                args.unit != null &&
                requestedQuantity === null &&
                requestedUnit !== currentUnit
            ) {
                const converted = convertQuantity(
                    food.quantity,
                    currentUnit,
                    requestedUnit,
                );

                if (converted === null) {
                    return {
                        output: {
                            error: `Não é possível converter ${currentUnit} para ${requestedUnit}.`,
                        },
                        directReply: `Não é possível trocar ${currentUnit} por ${requestedUnit} sem informar uma nova quantidade compatível.`,
                    };
                }

                quantity = converted;
            }

            const currentDate = asDateOnly(food.expirationDate);
            const editingDate =
                args.foodId != null ||
                args.expirationDate != null ||
                /\b(validade|vencimento)\b/.test(normalize(userMessage));
            const requestedDate = editingDate
                ? parseDateInput(userMessage)
                : null;
            const invalidExpiration =
                requestedDate && requestedDate !== currentDate
                    ? expirationValidationReply(requestedDate)
                    : null;
            if (
                editingDate &&
                (!requestedDate ||
                    requestedDate === currentDate ||
                    invalidExpiration)
            ) {
                const pending: PendingAction = {
                    type: "update_expiration_draft",
                    foodId: food.id,
                    foodName: food.name,
                    args,
                };
                await setPendingAction(userId, pending);
                return {
                    output: {},
                    pending,
                    directReply:
                        invalidExpiration ??
                        (requestedDate === currentDate
                            ? `Essa já é a validade de **${food.name}**. Informe uma nova data.`
                            : `Qual é a nova validade de **${food.name}**? Use DD/MM/AAAA.`),
                    directActions: ["Cancelar"],
                };
            }

            const expirationDate = requestedDate ?? currentDate;

            const data: CreateFood = {
                name:
                    args.newName == null
                        ? food.name
                        : String(args.newName).trim(),
                category:
                    args.category == null
                        ? food.category
                        : String(args.category).trim(),
                quantity,
                unit: requestedUnit,
                storageLocation:
                    args.storageLocation == null
                        ? food.storageLocation
                        : String(args.storageLocation),
                expirationDate,
            };

            if (
                data.name === food.name &&
                data.category === food.category &&
                data.quantity === food.quantity &&
                data.unit === currentUnit &&
                data.storageLocation === food.storageLocation &&
                expirationDate === currentDate
            ) {
                return {
                    output: {},
                    directReply:
                        "Qual informação você quer alterar? Informe também o novo valor.",
                };
            }

            const pending: PendingAction = {
                type: "update_food",
                foodId: food.id,
                data,
                description:
                    `Atualizar ${food.name} para: ` +
                    `${data.name}, ${data.quantity} ${data.unit}, ` +
                    `${data.storageLocation}, validade ${formatDateBR(data.expirationDate)}`,
            };

            await setPendingAction(userId, pending);

            return {
                output: {
                    requiresConfirmation: true,
                    proposal: pending.description,
                },
                pending,
                directReply: [
                    `**Edição de ${food.name}**`,
                    "",
                    `- Nome: ${data.name}`,
                    `- Quantidade: ${formatMeasurement(data.quantity, data.unit)}`,
                    `- Local: ${locationLabel(data.storageLocation)}`,
                    expirationDate === currentDate
                        ? `- Validade: ${formatDateBR(currentDate)}`
                        : `- Validade: ${formatDateBR(currentDate)} → **${formatDateBR(expirationDate)}**`,
                    "",
                    "Confirme para salvar ou cancele para desistir.",
                ].join("\n"),
                directActions: ["Confirmar", "Cancelar"],
            };
        }

        if (name === "delete_food") {
            const pending: PendingAction = {
                type: "delete_food",
                foodId: food.id,
                description: `Excluir ${food.name} do estoque`,
            };

            await setPendingAction(userId, pending);

            return {
                output: {
                    requiresConfirmation: true,
                    proposal: pending.description,
                },
                pending,
                directReply: [
                    `**Excluir ${food.name}?**`,
                    "",
                    `- ${formatMeasurement(food.quantity, food.unit)} — ${locationLabel(food.storageLocation)} — Validade: ${formatDateBR(asDateOnly(food.expirationDate))}`,
                    "",
                    "Confirme para excluir ou cancele para desistir.",
                ].join("\n"),
                directActions: ["Confirmar", "Cancelar"],
            };
        }

        return {
            output: {
                error: "Função não reconhecida.",
            },
        };
    }

    return handleTool;
}
