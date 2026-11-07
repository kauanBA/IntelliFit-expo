import type { CreateFood } from "../interfaces/create-food.interface";
import type { Food } from "../interfaces/food.interface";
import type { FoodService } from "../services/food.service";
import type { ChatRepository } from "./chat.repository";
import type {
    CreateFoodDraftData,
    PendingAction,
    ToolResult,
} from "./chat.types";
import {
    normalizeText as normalize,
    extractPositiveNumber,
    extractStorageLocation,
    extractUnitFromMessage,
    hasNegativeQuantity,
    parseDateInput,
    formatDateBR,
    messageMentionsPackaging,
    packagingUnitReply,
    hasZeroQuantity,
    ZERO_QUANTITY_REPLY,
} from "./chat.validation";
import {
    normalizeMeasurementUnit,
    convertQuantity,
    roundQuantity,
} from "../utils/measurement";
import { validateExpirationDate } from "../utils/expiration";
import { findMergeableFoods } from "./chat.stock";
import { asDateOnly, formatMeasurement } from "./chat.presentation";

export function missingCreateField(
    data: CreateFoodDraftData,
): "name" | "quantity" | "unit" | "storageLocation" | "expirationDate" | null {
    if (!data.name?.trim()) {
        return "name";
    }

    if (!Number.isFinite(data.quantity) || Number(data.quantity) <= 0) {
        return "quantity";
    }

    if (!data.unit?.trim()) {
        return "unit";
    }

    if (!data.storageLocation?.trim()) {
        return "storageLocation";
    }

    if (!data.expirationDate?.trim()) {
        return "expirationDate";
    }

    return null;
}

export function suggestedUnitOptions(foodName?: string): string {
    return /\bovos?\b/.test(normalize(foodName || ""))
        ? "un, g ou kg"
        : "un, g, kg, ml ou L";
}

export function packagingExample(foodName?: string): string {
    return /\bovos?\b/.test(normalize(foodName || ""))
        ? "96 un"
        : "2 L, 500 g ou 12 un";
}

export function packagingReply(foodName?: string): string {
    return packagingUnitReply(
        suggestedUnitOptions(foodName),
        packagingExample(foodName),
    );
}

export function createDraftQuestion(data: CreateFoodDraftData): string {
    const missing = missingCreateField(data);
    const foodName = data.name?.trim() || "o alimento";

    if (missing === "name") {
        return "Qual alimento você quer cadastrar?";
    }

    if (missing === "quantity" && data.packaging) {
        return packagingReply(data.name);
    }

    if (missing === "quantity") {
        return `Qual é a quantidade de ${foodName}?`;
    }

    if (missing === "unit") {
        return `Qual é a unidade de ${foodName}? Escolha entre ${suggestedUnitOptions(data.name)}.`;
    }

    if (missing === "storageLocation") {
        return `Onde ${foodName} será armazenado: despensa, geladeira ou freezer?`;
    }

    if (missing === "expirationDate") {
        return `Qual é a data de validade de ${foodName}? Ex.: 12/11/2026.`;
    }

    return "Os dados do alimento estão completos.";
}

export function expirationValidationReply(isoDate: string): string | null {
    const validation = validateExpirationDate(isoDate);

    if (validation.valid) {
        return null;
    }

    if (validation.reason === "PAST") {
        return "Essa data de validade já passou. Informe uma data de hoje em diante.";
    }

    if (validation.reason === "TOO_FAR") {
        return `Essa data está muito distante. Informe uma validade até ${formatDateBR(validation.maxDate)}.`;
    }

    return "Não consegui interpretar essa data. Informe a validade como DD/MM/AAAA, por exemplo 12/11/2026.";
}

export function toCreateFood(data: CreateFoodDraftData): CreateFood | null {
    if (missingCreateField(data)) {
        return null;
    }

    const unit = normalizeMeasurementUnit(data.unit!);

    if (!unit || expirationValidationReply(data.expirationDate!)) {
        return null;
    }

    return {
        name: data.name!.trim(),
        category: "Outros",
        quantity: Number(data.quantity),
        unit,
        storageLocation: data.storageLocation!.toUpperCase(),
        expirationDate: data.expirationDate!,
    };
}

export function buildCreatePending(
    data: CreateFood,
): Extract<PendingAction, { type: "create_food" }> {
    return {
        type: "create_food",
        data,
        description:
            `Cadastrar ${data.quantity} ${data.unit} de ${data.name} em ` +
            `${data.storageLocation}, validade ${formatDateBR(data.expirationDate)}`,
    };
}

export function storageLocationWithArticle(location: string): string {
    return location === "FREEZER"
        ? "no freezer"
        : `na ${location.toLowerCase()}`;
}

export function proposalReply(data: CreateFood): string {
    return (
        `Preparei o cadastro de ${data.quantity} ${data.unit} de ${data.name} ` +
        `${storageLocationWithArticle(data.storageLocation)}, com validade em ` +
        `${formatDateBR(data.expirationDate)}. Confirme para salvar ou cancele para desistir.`
    );
}

export function createDraftFlow(
    foodService: Pick<FoodService, "getAllFoods">,
    repository: ChatRepository,
) {
    const { setPendingAction } = repository;
    async function proposeExistingLot(
        userId: number,
        complete: CreateFood,
        foods: Food[],
    ): Promise<ToolResult | null> {
        const sameBatch = findMergeableFoods(foods, complete);

        if (sameBatch.length) {
            const existingFood = sameBatch[0];
            const existingUnit =
                normalizeMeasurementUnit(existingFood.unit) ??
                existingFood.unit;
            const convertedIncoming = convertQuantity(
                complete.quantity,
                complete.unit,
                existingUnit,
            );

            if (convertedIncoming !== null) {
                const duplicatePending: PendingAction = {
                    type: "create_food_duplicate_choice",
                    incoming: complete,
                    existing: {
                        id: existingFood.id,
                        name: existingFood.name,
                        category: existingFood.category,
                        quantity: existingFood.quantity,
                        unit: existingUnit,
                        storageLocation: existingFood.storageLocation,
                        expirationDate: asDateOnly(existingFood.expirationDate),
                    },
                };

                const currentDate = duplicatePending.existing.expirationDate;
                const mergedDate = [
                    currentDate,
                    complete.expirationDate,
                ].sort()[0];
                const mergedQuantity = roundQuantity(
                    existingFood.quantity + convertedIncoming,
                );

                await setPendingAction(userId, duplicatePending);

                return {
                    output: { duplicateBatch: true },
                    pending: duplicatePending,
                    directReply: [
                        `**Juntar lotes de ${existingFood.name}?**`,
                        "",
                        `- **Lote atual** — ${formatMeasurement(existingFood.quantity, existingUnit)} · vence em ${formatDateBR(currentDate)}`,
                        `- **Nova compra** — ${formatMeasurement(complete.quantity, complete.unit)} · vence em ${formatDateBR(complete.expirationDate)}`,
                        "",
                        `Se juntar, serão **${formatMeasurement(mergedQuantity, existingUnit)}** com validade em **${formatDateBR(mergedDate)}**.`,
                    ].join("\n"),
                    directActions: [
                        "Somar ao existente",
                        "Cadastrar separado",
                        "Cancelar",
                    ],
                };
            }
        }

        return null;
    }

    async function continueCreateDraft(
        userId: number,
        pending: Extract<PendingAction, { type: "create_food_draft" }>,
        message: string,
    ): Promise<{ reply: string; ready: boolean; actions?: string[] }> {
        const data: CreateFoodDraftData = { ...pending.data };
        const currentMissing = missingCreateField(data);

        if (!data.name && currentMissing === "name") {
            data.name = message.trim();
        }

        // "8 caixas" não vira estoque: pede quantidade e unidade padronizadas.
        if (
            currentMissing !== "name" &&
            (!data.quantity || !data.unit) &&
            messageMentionsPackaging(message)
        ) {
            data.quantity = undefined;
            data.unit = undefined;
            data.packaging = true;

            await setPendingAction(userId, {
                type: "create_food_draft",
                data,
            });

            return { reply: packagingReply(data.name), ready: false };
        }

        if (!data.quantity) {
            if (hasNegativeQuantity(message) || hasZeroQuantity(message)) {
                await setPendingAction(userId, {
                    type: "create_food_draft",
                    data,
                });

                return { reply: ZERO_QUANTITY_REPLY, ready: false };
            }

            const quantity = extractPositiveNumber(message);
            if (quantity !== null) {
                data.quantity = quantity;
                data.packaging = undefined;
            }
        }

        if (!data.unit) {
            const unit = extractUnitFromMessage(message);
            if (unit) {
                data.unit = unit;
            }
        }

        if (!data.storageLocation) {
            const location = extractStorageLocation(message);
            if (location) {
                data.storageLocation = location;
            }
        }

        if (!data.expirationDate) {
            const parsedDate = parseDateInput(message);

            if (parsedDate) {
                const validationMessage = expirationValidationReply(parsedDate);

                if (validationMessage) {
                    await setPendingAction(userId, {
                        type: "create_food_draft",
                        data,
                    });

                    return {
                        reply: validationMessage,
                        ready: false,
                    };
                }

                data.expirationDate = parsedDate;
            }
        }

        const complete = toCreateFood(data);

        if (complete) {
            const foods = await foodService.getAllFoods(userId);
            const duplicate = await proposeExistingLot(userId, complete, foods);
            if (duplicate)
                return {
                    reply: duplicate.directReply!,
                    ready: true,
                    actions: duplicate.directActions,
                };
            const readyPending = buildCreatePending(complete);
            await setPendingAction(userId, readyPending);

            return {
                reply: proposalReply(complete),
                ready: true,
            };
        }

        await setPendingAction(userId, {
            type: "create_food_draft",
            data,
        });

        if (currentMissing === "expirationDate" && !parseDateInput(message)) {
            return {
                reply: "Não consegui interpretar essa data. Informe a validade como DD/MM/AAAA, por exemplo 12/11/2026.",
                ready: false,
            };
        }

        if (
            currentMissing === "storageLocation" &&
            !extractStorageLocation(message)
        ) {
            return {
                reply: "Informe onde o alimento será armazenado: despensa, geladeira ou freezer.",
                ready: false,
            };
        }

        if (currentMissing === "unit" && !extractUnitFromMessage(message)) {
            return {
                reply: `Unidade não reconhecida. Use ${suggestedUnitOptions(data.name)}.`,
                ready: false,
            };
        }

        return {
            reply: createDraftQuestion(data),
            ready: false,
        };
    }

    return { proposeExistingLot, continueCreateDraft };
}

export type DraftFlow = ReturnType<typeof createDraftFlow>;
