import { TfidfVectorizer, cosineSimilarity } from "./tfidf";
import { translateIngredient } from "../utils/ingredientMapper";
import { daysUntilExpiration } from "../utils/expiration";

export type RankedRecipe = {
    idMeal: string;
    strMeal: string;
    strMealThumb: string;
    strInstructions: string;
    strCategory: string;
    strArea: string;
    matchingIngredients: number;
    matchedIngredients: string[];
    missingIngredients: number;
    mlScore: number;
    mlDistance: number;
    neighborRank: number;
    algorithm: string;
    [key: string]: unknown;
};

function normalize(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function tokens(value: string): string[] {
    return normalize(value)
        .split(" ")
        .filter((token) => token.length > 1);
}

function recipeIngredients(recipe: Record<string, unknown>): string[] {
    const result: string[] = [];

    for (let index = 1; index <= 20; index += 1) {
        const value = recipe[`strIngredient${index}`];

        if (typeof value === "string" && value.trim()) {
            result.push(value.trim());
        }
    }

    return result;
}

function expirationDays(value: unknown): number {
    if (value instanceof Date) {
        return daysUntilExpiration(value);
    }

    return daysUntilExpiration(String(value ?? ""));
}

/**
 * Palavras que descrevem estado, corte ou variação do ingrediente sem mudar
 * o que ele é: "whole milk" ainda é leite, "chicken breast" ainda é frango.
 * Qualquer outra palavra extra muda o ingrediente: "coconut milk" não é leite,
 * "condensed milk" não é leite, "peanut butter" não é manteiga.
 */
const NEUTRAL_DESCRIPTORS = new Set([
    "fresh", "frozen", "raw", "ripe", "large", "small", "medium", "big",
    "whole", "skimmed", "semi", "low", "fat", "free", "light", "lean",
    "plain", "unsalted", "salted", "organic", "extra", "virgin",
    "chopped", "sliced", "diced", "grated", "shredded", "minced", "ground",
    "peeled", "boneless", "skinless",
    "breast", "breasts", "thigh", "thighs", "wing", "wings", "leg", "legs",
    "fillet", "fillets", "yolk", "yolks", "whites",
]);

function containedAt(longer: string[], shorter: string[]): number {
    for (let start = 0; start + shorter.length <= longer.length; start += 1) {
        if (shorter.every((token, i) => longer[start + i] === token)) {
            return start;
        }
    }
    return -1;
}

/**
 * Compara por expressão inteira. Os nomes são iguais, ou um contém o outro e
 * as palavras que sobram são apenas descritores neutros. Assim "egg" não casa
 * com "eggplant", e "milk" não casa com "coconut milk" nem "condensed milk".
 */
function ingredientNamesMatch(pantryName: string, ingredient: string): boolean {
    const a = normalize(pantryName).split(" ").filter(Boolean);
    const b = normalize(ingredient).split(" ").filter(Boolean);

    if (!a.length || !b.length) return false;
    if (a.length === b.length && a.every((token, i) => token === b[i])) {
        return true;
    }

    const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
    const at = containedAt(longer, shorter);
    if (at < 0) return false;

    return longer
        .filter((_, index) => index < at || index >= at + shorter.length)
        .every((token) => NEUTRAL_DESCRIPTORS.has(token));
}

function ingredientMatches(pantryNames: string[], ingredient: string): boolean {
    return pantryNames.some((pantryName) =>
        ingredientNamesMatch(pantryName, ingredient),
    );
}

/**
 * Recomendador por conteúdo usando TF-IDF + k-Nearest Neighbors.
 * O estoque vira o vetor de consulta e cada receita é um possível vizinho.
 * A distância usada pelo k-NN é 1 - similaridade do cosseno.
 */
export type RankOptions = {
    /**
     * Exige ao menos um ingrediente do estoque casado por expressão inteira.
     * Evita recomendar uma receita só porque compartilha uma palavra genérica
     * ("oil" em "Sesame Oil" vs. "Olive Oil"). Padrão: true. Existe como opção
     * para permitir a ablação (comparação com/sem a regra) na avaliação.
     */
    requireMatchedIngredient?: boolean;
};

export function rankRecipesWithML(
    foods: Array<Record<string, unknown>>,
    recipes: Array<Record<string, unknown>>,
    k = recipes.length,
    options: RankOptions = {},
): RankedRecipe[] {
    const requireMatch = options.requireMatchedIngredient ?? true;
    const availableFoods = foods.filter(
        (food) =>
            Number(food.quantity ?? 0) > 0 &&
            expirationDays(food.expirationDate) >= 0,
    );

    // Dividir um alimento em vários lotes não deve aumentar artificialmente seu peso.
    // A urgência de um ingrediente é a do lote válido que vence primeiro.
    const pantry = new Map<
        string,
        { name: string; translated: string; urgency: number }
    >();
    for (const food of availableFoods) {
        const name = String(food.name ?? "").trim();
        if (!name) continue;
        const translated = translateIngredient(name) ?? name;
        const key = normalize(translated);
        const days = expirationDays(food.expirationDate);
        const urgency = days <= 7 ? 2 : 1;
        const previous = pantry.get(key);
        if (!previous || urgency > previous.urgency)
            pantry.set(key, { name, translated, urgency });
    }
    const pantryItems = Array.from(pantry.values());
    const translatedPantry = pantryItems.map((item) => item.translated);
    const pantryTokens = pantryItems.flatMap((item) =>
        Array.from({ length: item.urgency }, () =>
            tokens(item.translated),
        ).flat(),
    );

    const recipeTokenDocuments = recipes.map((recipe) =>
        recipeIngredients(recipe).flatMap(tokens),
    );

    if (
        !recipes.length ||
        !pantryTokens.length ||
        !Number.isFinite(k) ||
        k <= 0
    )
        return [];
    const vectorizer = new TfidfVectorizer().fit(recipeTokenDocuments);
    const recipeVectors = recipeTokenDocuments.map((document) =>
        vectorizer.transform(document),
    );
    const pantryVector = vectorizer.transform(pantryTokens);
    if (!pantryVector.size) return [];

    const neighbors = recipes
        .map((recipe, index) => {
            const ingredients = recipeIngredients(recipe);

            const matchedIngredients = pantryItems
                .filter((item) =>
                    ingredients.some((ingredient) =>
                        ingredientMatches([item.translated], ingredient),
                    ),
                )
                .map((item) => item.name);

            const matchedRecipeIngredients = ingredients.filter((ingredient) =>
                ingredientMatches(translatedPantry, ingredient),
            );

            const similarity = cosineSimilarity(
                pantryVector,
                recipeVectors[index],
            );

            return {
                recipe,
                matchedIngredients,
                matchedRecipeIngredients,
                similarity,
                distance: 1 - similarity,
            };
        })
        .filter(
            (neighbor) =>
                neighbor.similarity > 0 &&
                (!requireMatch || neighbor.matchedIngredients.length > 0),
        )
        .sort((a, b) => {
            if (a.distance !== b.distance) {
                return a.distance - b.distance;
            }

            return (
                b.matchedIngredients.length - a.matchedIngredients.length ||
                String(a.recipe.idMeal).localeCompare(String(b.recipe.idMeal))
            );
        })
        .slice(0, Math.max(0, Math.min(Math.floor(k), recipes.length)));

    return neighbors.map((neighbor, index) => {
        const ingredients = recipeIngredients(neighbor.recipe);

        return {
            ...neighbor.recipe,
            matchingIngredients: neighbor.matchedIngredients.length,
            matchedIngredients: neighbor.matchedIngredients,
            missingIngredients: Math.max(
                0,
                ingredients.length - neighbor.matchedRecipeIngredients.length,
            ),
            mlScore: Math.round(neighbor.similarity * 100),
            mlDistance: Number(neighbor.distance.toFixed(4)),
            neighborRank: index + 1,
            algorithm: "TF-IDF + k-NN (distância do cosseno)",
        } as RankedRecipe;
    });
}
