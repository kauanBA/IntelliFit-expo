import { FoodRepository } from "../repositories/food.repository";
import { Food } from "../interfaces/food.interface";
import { CreateFood } from "../interfaces/create-food.interface";
import { normalizeMeasurementUnit } from "../utils/measurement";
import {
    daysUntilExpiration,
    getExpirationAttentionStatus,
    validateExpirationDate,
} from "../utils/expiration";

const STORAGE_LOCATIONS = ["DESPENSA", "GELADEIRA", "FREEZER"];

function formatDateBR(isoDate: string): string {
    const [year, month, day] = isoDate.split("-");
    return year && month && day ? `${day}/${month}/${year}` : isoDate;
}

export class FoodService {
    private foodRepository: FoodRepository;

    constructor() {
        this.foodRepository = new FoodRepository();
    }

    private normalizeFood(food: Food): Food {
        const normalizedUnit = normalizeMeasurementUnit(food.unit);

        return {
            ...food,
            unit: normalizedUnit ?? food.unit,
        };
    }

    private normalizeAndValidateFood(
        food: CreateFood,
        options?: {
            allowSamePastDate?: string;
        },
    ): CreateFood {
        if (
            !food.name?.trim() ||
            !food.category?.trim() ||
            !food.unit?.trim() ||
            !food.storageLocation?.trim()
        ) {
            throw new Error(
                "Todos os campos obrigatórios devem ser preenchidos.",
            );
        }

        if (
            !Number.isFinite(Number(food.quantity)) ||
            Number(food.quantity) <= 0
        ) {
            throw new Error("A quantidade deve ser maior que zero.");
        }

        // O banco guarda 4 casas decimais: recusa em vez de arredondar em silêncio.
        const scaled = Number(food.quantity) * 10_000;
        if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
            throw new Error("A quantidade aceita no máximo 4 casas decimais.");
        }

        const unit = normalizeMeasurementUnit(food.unit);

        if (!unit) {
            throw new Error(
                "Unidade inválida. Use uma das unidades padronizadas do sistema.",
            );
        }

        const storageLocation = food.storageLocation.toUpperCase();

        if (!STORAGE_LOCATIONS.includes(storageLocation)) {
            throw new Error(
                "Local de armazenamento inválido. Use despensa, geladeira ou freezer.",
            );
        }

        if (!food.expirationDate) {
            throw new Error("A data de validade é obrigatória.");
        }

        const allowSamePastDate =
            options?.allowSamePastDate === food.expirationDate;

        const expirationValidation = validateExpirationDate(
            food.expirationDate,
            { allowPast: allowSamePastDate },
        );

        if (!expirationValidation.valid) {
            if (expirationValidation.reason === "PAST") {
                throw new Error(
                    "A data de validade não pode ser anterior à data atual.",
                );
            }

            if (expirationValidation.reason === "TOO_FAR") {
                throw new Error(
                    `A data de validade está muito distante. Informe uma data até ${formatDateBR(expirationValidation.maxDate)}.`,
                );
            }

            throw new Error("Data de validade inválida.");
        }

        return {
            name: food.name.trim(),
            category: food.category.trim(),
            quantity: Number(food.quantity),
            unit,
            storageLocation,
            expirationDate: food.expirationDate,
        };
    }

    public async getAllFoods(userId: number): Promise<Food[]> {
        const foods = await this.foodRepository.findAllByUserId(userId);
        return foods.map((food) => this.normalizeFood(food));
    }

    public async createFood(userId: number, food: CreateFood): Promise<Food> {
        const normalizedFood = this.normalizeAndValidateFood(food);

        const created = await this.foodRepository.create({
            userId,
            ...normalizedFood,
        });

        return this.normalizeFood(created);
    }

    public async getFoodById(id: number, userId: number): Promise<Food> {
        const food = await this.foodRepository.findById(id, userId);

        if (!food) {
            throw new Error("Alimento não encontrado.");
        }

        return this.normalizeFood(food);
    }

    public async updateFood(
        id: number,
        userId: number,
        food: CreateFood,
    ): Promise<Food> {
        const currentFood = await this.foodRepository.findById(id, userId);

        if (!currentFood) {
            throw new Error("Alimento não encontrado.");
        }

        const currentExpiration =
            currentFood.expirationDate instanceof Date
                ? currentFood.expirationDate.toISOString().slice(0, 10)
                : String(currentFood.expirationDate).slice(0, 10);
        const normalizedFood = this.normalizeAndValidateFood(food, {
            allowSamePastDate: currentExpiration,
        });

        const updatedFood = await this.foodRepository.update(
            id,
            userId,
            normalizedFood,
        );

        if (!updatedFood) {
            throw new Error("Alimento não encontrado.");
        }

        return this.normalizeFood(updatedFood);
    }

    public async deleteFood(id: number, userId: number): Promise<void> {
        const deleted = await this.foodRepository.delete(id, userId);

        if (!deleted) {
            throw new Error("Alimento não encontrado.");
        }
    }

    public async getExpiringFoods(userId: number): Promise<any[]> {
        const foods = await this.foodRepository.findExpiringByUserId(userId);

        return foods.map((food) => {
            const normalizedFood = this.normalizeFood(food);
            const daysUntil = daysUntilExpiration(food.expirationDate);

            return {
                ...normalizedFood,
                daysUntilExpiration: daysUntil,
                status: getExpirationAttentionStatus(food.expirationDate),
            };
        });
    }
    public async applyBatchConsumption(
        userId: number,
        operations: Array<{ foodId: number; newQuantity: number | null }>,
    ): Promise<void> {
        if (
            !operations.length ||
            operations.some(
                (operation) =>
                    !Number.isInteger(operation.foodId) ||
                    operation.foodId <= 0 ||
                    (operation.newQuantity !== null &&
                        (!Number.isFinite(operation.newQuantity) ||
                            operation.newQuantity < 0)),
            )
        ) {
            throw new Error("Plano de consumo inválido.");
        }
        await this.foodRepository.applyBatchConsumption(userId, operations);
    }
}
