import { rankRecipesWithML } from "../src/ml/recipe-recommender";
import {
    resolveIngredient,
    translateIngredient,
} from "../src/utils/ingredientMapper";
import { todayInBrazilIso } from "../src/utils/expiration";

const future = new Date();
future.setUTCFullYear(future.getUTCFullYear() + 1);
const farDate = future.toISOString().slice(0, 10);

function food(name: string) {
    return {
        name,
        quantity: 1,
        expirationDate: farDate,
    };
}

function recipe(idMeal: string, strMeal: string, ingredients: string[]) {
    const result: Record<string, unknown> = {
        idMeal,
        strMeal,
        strMealThumb: "",
        strInstructions: "",
        strCategory: "Teste",
        strArea: "Teste",
    };

    ingredients.forEach((ingredient, index) => {
        result[`strIngredient${index + 1}`] = ingredient;
    });

    return result;
}

function assertEqual(scenario: string, received: unknown, expected: unknown) {
    if (received !== expected) {
        throw new Error(
            `${scenario}: esperado ${String(expected)}, recebido ${String(received)}.`,
        );
    }

    console.log(`✓ ${scenario}`);
}
function assertTopRecipe(
    scenario: string,
    pantry: string[],
    recipes: Array<Record<string, unknown>>,
    expectedId: string,
) {
    const ranked = rankRecipesWithML(pantry.map(food), recipes, recipes.length);

    if (ranked[0]?.idMeal !== expectedId) {
        throw new Error(
            `${scenario}: esperado ${expectedId}, recebido ${ranked[0]?.idMeal ?? "nenhum"}.`,
        );
    }

    console.log(`✓ ${scenario}`);
    console.log(
        `  1º ${ranked[0].strMeal} | score=${ranked[0].mlScore}% | distância=${ranked[0].mlDistance}`,
    );
}

const recipes = [
    recipe("1", "Frango com arroz e tomate", ["Chicken", "Rice", "Tomato"]),
    recipe("2", "Omelete com queijo", ["Egg", "Cheese"]),
    recipe("3", "Torta de maçã", ["Apple", "Flour", "Sugar"]),
];

assertTopRecipe(
    "Estoque com frango, arroz e tomate",
    ["frango", "arroz", "tomate"],
    recipes,
    "1",
);

assertTopRecipe("Estoque com ovos e queijo", ["ovos", "queijo"], recipes, "2");

assertTopRecipe(
    "Estoque com maçã e farinha",
    ["maçã", "farinha"],
    recipes,
    "3",
);

const duplicateEggMatch = rankRecipesWithML(
    [food("ovos")],
    [
        recipe("egg-test", "Receita com ovo e clara", [
            "Egg",
            "Egg White",
            "Salt",
        ]),
    ],
    1,
)[0];

if (duplicateEggMatch.matchingIngredients !== 1) {
    throw new Error(
        `Contagem única do estoque: esperado 1 alimento, recebido ${duplicateEggMatch.matchingIngredients}.`,
    );
}

if (
    duplicateEggMatch.matchedIngredients.length !== 1 ||
    duplicateEggMatch.matchedIngredients[0] !== "ovos"
) {
    throw new Error(
        "A correspondência deveria exibir apenas o alimento único do estoque: ovos.",
    );
}

console.log(
    "✓ Um alimento do estoque não é contado duas vezes na mesma receita",
);

const expiredDate = new Date(`${todayInBrazilIso()}T12:00:00Z`);
expiredDate.setUTCDate(expiredDate.getUTCDate() - 1);

const expiredFoodResult = rankRecipesWithML(
    [
        {
            name: "frango",
            quantity: 1,
            expirationDate: expiredDate.toISOString().slice(0, 10),
        },
        food("ovos"),
    ],
    [
        recipe("expired-chicken", "Frango simples", ["Chicken"]),
        recipe("valid-egg", "Ovo simples", ["Egg"]),
    ],
    2,
);

assertEqual(
    "Alimento vencido não participa do vetor de recomendação",
    expiredFoodResult[0]?.idMeal,
    "valid-egg",
);

assertEqual(
    '"frango congelado" é resolvido pelo ingrediente principal',
    translateIngredient("frango congelado"),
    "chicken",
);

assertEqual(
    '"peito de frango congelado" preserva a expressão mais específica',
    translateIngredient("peito de frango congelado"),
    "chicken breast",
);

assertEqual(
    '"banana prata madura" preserva a variedade conhecida',
    translateIngredient("banana prata madura"),
    "banana",
);

assertEqual(
    "Resolução com qualificador usa estratégia conhecida e explicável",
    resolveIngredient("frango congelado")?.strategy,
    "known-phrase",
);

assertEqual(
    "Nome composto ambíguo não escolhe ingrediente arbitrariamente",
    translateIngredient("café com leite"),
    null,
);

assertTopRecipe(
    "Frango congelado participa do ranking de receitas de frango",
    ["frango congelado"],
    [
        recipe("chicken-only", "Frango assado", ["Chicken", "Salt"]),
        recipe("egg-only", "Ovo cozido", ["Egg", "Salt"]),
    ],
    "chicken-only",
);

console.log("\nValidação básica do recomendador concluída com sucesso.");
console.log("Algoritmo: TF-IDF + k-NN (distância do cosseno).");

// Regressões matemáticas e de domínio, independentes de rede.
import assert from "node:assert/strict";
import test from "node:test";
import { TfidfVectorizer, cosineSimilarity } from "../src/ml/tfidf";

test("TF-IDF ajusta o corpus e transforma consultas sem alterar seu vocabulário", () => {
    const vectorizer = new TfidfVectorizer().fit([
        ["egg", "salt"],
        ["rice", "salt"],
    ]);
    const before = vectorizer.transform(["egg", "salt"]);
    assert.ok(before.get("egg")! > before.get("salt")!);
    assert.equal(vectorizer.transform(["termo-novo"]).size, 0);
    assert.deepEqual(vectorizer.transform(["egg", "salt"]), before);
    assert.equal(cosineSimilarity(before, before), 1);
    assert.equal(cosineSimilarity(new Map(), before), 0);
});

test("Ranking não depende da divisão do mesmo alimento em lotes ou de singular/plural", () => {
    const single = rankRecipesWithML([food("ovo"), food("queijo")], recipes);
    const batches = rankRecipesWithML(
        [food("ovos"), food("ovo"), food("queijo")],
        recipes,
    );
    assert.deepEqual(
        single.map((r) => [r.idMeal, r.mlDistance, r.matchingIngredients]),
        batches.map((r) => [r.idMeal, r.mlDistance, r.matchingIngredients]),
    );
});

test("Sem estoque válido ou vocabulário correspondente não recomenda arbitrariamente", () => {
    assert.deepEqual(rankRecipesWithML([], recipes), []);
    assert.deepEqual(
        rankRecipesWithML([food("ingrediente desconhecido xyz")], recipes),
        [],
    );
    assert.deepEqual(rankRecipesWithML([food("ovo")], recipes, 0), []);
    assert.deepEqual(rankRecipesWithML([food("ovo")], recipes, Number.NaN), []);
});

test("Ovo não é contado como berinjela pela substring egg/eggplant", () => {
    const ranking = rankRecipesWithML(
        [food("ovos")],
        [recipe("plant", "Berinjela", ["Eggplant"])],
    );
    assert.equal(ranking.length, 0);
});

test("Validade próxima favorece o ingrediente urgente quando as urgências diferem", () => {
    const smallCatalog = [
        recipe("egg", "Ovo", ["Egg"]),
        recipe("apple", "Maçã", ["Apple"]),
    ];
    const eggUrgent = rankRecipesWithML(
        [{ ...food("ovo"), expirationDate: todayInBrazilIso() }, food("maçã")],
        smallCatalog,
    );
    const appleUrgent = rankRecipesWithML(
        [food("ovo"), { ...food("maçã"), expirationDate: todayInBrazilIso() }],
        smallCatalog,
    );
    assert.equal(eggUrgent[0].idMeal, "egg");
    assert.equal(appleUrgent[0].idMeal, "apple");
    assert.equal(
        rankRecipesWithML([food("ovo"), food("maçã")], smallCatalog, 1).length,
        1,
    );
});

test("Leite não casa com leite de coco nem leite condensado", () => {
    const recipes = [
        recipe("1", "Curry de coco", ["Coconut Milk", "Rice"]),
        recipe("2", "Brigadeiro", ["Condensed Milk", "Butter"]),
        recipe("3", "Panqueca", ["Milk", "Flour", "Egg"]),
    ];
    const ranked = rankRecipesWithML([food("leite")], recipes, recipes.length);

    assertEqual(
        "Só a receita com leite comum é recomendada",
        ranked.map((item) => item.idMeal).join(","),
        "3",
    );
});

test("Leite de coco casa com coconut milk e não com milk", () => {
    const recipes = [
        recipe("1", "Curry de coco", ["Coconut Milk", "Rice"]),
        recipe("3", "Panqueca", ["Milk", "Flour", "Egg"]),
    ];
    const ranked = rankRecipesWithML(
        [food("leite de coco")],
        recipes,
        recipes.length,
    );

    assertEqual(
        "Só a receita com leite de coco é recomendada",
        ranked.map((item) => item.idMeal).join(","),
        "1",
    );
});

test("Variações neutras continuam casando (leite integral, peito de frango)", () => {
    const recipes = [
        recipe("3", "Panqueca", ["Milk", "Flour"]),
        recipe("4", "Frango grelhado", ["Chicken Breast", "Salt"]),
    ];
    const milk = rankRecipesWithML([food("leite integral")], recipes, 5);
    assertEqual("Leite integral serve para 'milk'", milk[0]?.idMeal, "3");

    const chicken = rankRecipesWithML([food("frango")], recipes, 5);
    assertEqual("Frango serve para 'chicken breast'", chicken[0]?.idMeal, "4");
});
