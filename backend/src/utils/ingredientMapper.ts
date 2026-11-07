const ingredientMap: Record<string, string> = {
    ovo: "egg",
    ovos: "egg",

    queijo: "cheese",
    muçarela: "mozzarella",
    mussarela: "mozzarella",
    parmesão: "parmesan",
    cheddar: "cheddar",
    provolone: "provolone",
    gorgonzola: "gorgonzola",
    ricota: "ricotta",
    cream_cheese: "cream cheese",

    leite: "milk",
    leite_integral: "whole milk",
    leite_desnatado: "skimmed milk",
    leite_condensado: "condensed milk",
    leite_de_coco: "coconut milk",
    creme_de_leite: "cream",
    creme: "cream",
    iogurte: "yogurt",
    manteiga: "butter",
    margarina: "margarine",

    frango: "chicken",
    peito_de_frango: "chicken breast",
    coxa_de_frango: "chicken thigh",
    sobrecoxa: "chicken thigh",
    asa_de_frango: "chicken wings",
    fígado_de_frango: "chicken liver",
    peru: "turkey",

    carne: "beef",
    carne_bovina: "beef",
    carne_moída: "minced beef",
    bife: "beef",
    filé_mignon: "beef tenderloin",
    contrafilé: "sirloin",
    patinho: "beef",
    acém: "beef",
    costela: "beef ribs",
    fígado: "beef liver",

    porco: "pork",
    carne_suina: "pork",
    lombo: "pork loin",
    costelinha: "pork ribs",
    pernil: "pork",
    bacon: "bacon",
    presunto: "ham",
    linguiça: "sausage",
    linguiça_calabresa: "chorizo",
    salsicha: "sausage",
    salame: "salami",

    peixe: "fish",
    salmão: "salmon",
    atum: "tuna",
    sardinha: "sardines",
    tilápia: "tilapia",
    bacalhau: "cod",
    merluza: "hake",
    truta: "trout",
    anchova: "anchovy",
    cavala: "mackerel",

    camarão: "shrimp",
    lula: "squid",
    polvo: "octopus",
    caranguejo: "crab",
    lagosta: "lobster",
    mexilhão: "mussels",

    arroz: "rice",
    arroz_branco: "rice",
    arroz_integral: "brown rice",
    arroz_parboilizado: "rice",
    risoto: "risotto",

    macarrão: "pasta",
    massa: "pasta",
    espaguete: "spaghetti",
    penne: "penne",
    talharim: "tagliatelle",
    fettuccine: "fettuccine",
    nhoque: "gnocchi",
    lasanha: "lasagna",
    ravioli: "ravioli",
    miojo: "noodles",
    noodles: "noodles",

    pão: "bread",
    pão_de_forma: "bread",
    pão_integral: "whole wheat bread",
    pão_francês: "bread",
    pão_de_alho: "garlic bread",
    torrada: "toast",
    farinha: "flour",
    farinha_de_trigo: "flour",
    farinha_de_milho: "corn flour",
    farinha_de_mandioca: "cassava flour",
    fubá: "cornmeal",
    amido_de_milho: "cornstarch",
    polvilho: "tapioca flour",
    tapioca: "tapioca",

    aveia: "oats",
    farelo_de_aveia: "oat bran",
    granola: "granola",
    cereal: "cereal",
    muesli: "muesli",

    feijão: "beans",
    feijão_preto: "black beans",
    feijão_carioca: "pinto beans",
    feijão_branco: "white beans",
    feijão_vermelho: "red beans",
    lentilha: "lentils",
    grão_de_bico: "chickpeas",
    ervilha: "peas",
    ervilha_verde: "green peas",
    soja: "soybeans",
    edamame: "edamame",

    milho: "corn",
    milho_verde: "sweetcorn",

    batata: "potato",
    batata_doce: "sweet potato",
    batata_inglesa: "potato",
    batata_barôa: "parsnip",
    mandioca: "cassava",
    aipim: "cassava",
    macaxeira: "cassava",
    inhame: "yam",
    cará: "yam",

    cenoura: "carrot",
    beterraba: "beetroot",
    abóbora: "pumpkin",
    abobrinha: "zucchini",
    chuchu: "chayote",
    berinjela: "eggplant",

    tomate: "tomato",
    tomates: "tomato",
    tomate_cereja: "cherry tomatoes",
    tomate_seco: "sun-dried tomatoes",
    cebola: "onion",
    cebola_roxa: "red onion",
    cebola_branca: "onion",
    alho: "garlic",
    alho_poró: "leek",
    cebolinha: "spring onion",
    pimentão: "bell pepper",
    pimentão_vermelho: "red pepper",
    pimentão_verde: "green pepper",
    pimentão_amarelo: "yellow pepper",
    pimenta: "chili",
    pimenta_vermelha: "red chili",
    pimenta_dedo_de_moça: "red chili",

    pepino: "cucumber",
    alface: "lettuce",
    rúcula: "arugula",
    agrião: "watercress",
    espinafre: "spinach",
    couve: "collard greens",
    couve_manteiga: "collard greens",
    repolho: "cabbage",
    repolho_roxo: "red cabbage",
    brócolis: "broccoli",
    couve_flor: "cauliflower",
    acelga: "chard",
    aspargo: "asparagus",
    alcachofra: "artichoke",
    vagem: "green beans",
    quiabo: "okra",
    palmito: "heart of palm",
    azeitona: "olives",
    azeitona_verde: "green olives",
    azeitona_preta: "black olives",

    abacate: "avocado",
    abacaxi: "pineapple",
    banana: "banana",
    banana_prata: "banana",
    maçã: "apple",
    maçã_verde: "green apple",
    laranja: "orange",
    limão: "lemon",
    lima: "lime",
    limão_siciliano: "lemon",
    morango: "strawberry",
    uva: "grapes",
    uva_passa: "raisins",
    manga: "mango",
    mamão: "papaya",
    melancia: "watermelon",
    melão: "melon",
    pêssego: "peach",
    pera: "pear",
    kiwi: "kiwi",
    maracujá: "passion fruit",
    goiaba: "guava",
    acerola: "acerola",
    caju: "cashew",
    coco: "coconut",
    coco_ralado: "desiccated coconut",
    figo: "fig",
    ameixa: "plum",
    cereja: "cherries",
    framboesa: "raspberries",
    amora: "blackberries",
    mirtilo: "blueberries",
    tangerina: "tangerine",
    mexerica: "tangerine",
    caqui: "persimmon",
    romã: "pomegranate",

    açúcar: "sugar",
    açúcar_mascavo: "brown sugar",
    açúcar_de_confeiteiro: "powdered sugar",
    sal: "salt",
    sal_grosso: "salt",
    pimenta_do_reino: "black pepper",
    pimenta_branca: "white pepper",
    canela: "cinnamon",
    noz_moscada: "nutmeg",
    cravo: "cloves",
    cominho: "cumin",
    cúrcuma: "turmeric",
    açafrão: "saffron",
    páprica: "paprika",
    páprica_defumada: "smoked paprika",

    orégano: "oregano",
    manjericão: "basil",
    salsa: "parsley",
    salsinha: "parsley",
    coentro: "coriander",
    alecrim: "rosemary",
    tomilho: "thyme",
    hortelã: "mint",
    louro: "bay leaves",
    gengibre: "ginger",

    cogumelo: "mushrooms",
    cogumelos: "mushrooms",
    champignon: "mushrooms",
    champignons: "mushrooms",
    aipo: "celery",
    salsão: "celery",
    rabanete: "radish",
    rabanetes: "radish",
    caldo_de_galinha: "chicken stock",
    caldo_de_carne: "beef stock",
    caldo_de_legumes: "vegetable stock",
    óleo_de_gergelim: "sesame oil",
    shoyu: "soy sauce",
    bicarbonato: "baking soda",
    nozes: "walnuts",

    azeite: "olive oil",
    azeite_de_oliva: "olive oil",
    óleo: "oil",
    óleo_de_coco: "coconut oil",
    óleo_de_girassol: "sunflower oil",
    vinagre: "vinegar",
    vinagre_de_maçã: "apple cider vinegar",

    molho_de_tomate: "tomato sauce",
    molho_de_soja: "soy sauce",
    molho_shoyu: "soy sauce",
    ketchup: "ketchup",
    mostarda: "mustard",
    maionese: "mayonnaise",
    molho_de_pimenta: "hot sauce",
    molho_barbecue: "barbecue sauce",

    chocolate: "chocolate",
    chocolate_amargo: "dark chocolate",
    chocolate_ao_leite: "milk chocolate",
    cacau: "cocoa",
    cacau_em_pó: "cocoa powder",
    mel: "honey",
    geleia: "jam",
    doce_de_leite: "dulce de leche",

    castanha: "cashew",
    castanha_de_caju: "cashew",
    castanha_do_pará: "brazil nuts",
    amendoim: "peanuts",
    pasta_de_amendoim: "peanut butter",
    amêndoas: "almonds",
    pistache: "pistachio",
    avelã: "hazelnuts",

    água: "water",
    café: "coffee",
    chá: "tea",
    chá_verde: "green tea",
    suco_de_laranja: "orange juice",
    leite_de_amêndoas: "almond milk",
    leite_de_soja: "soy milk"
};

export type IngredientResolution = {
    translated: string;
    matchedIngredient: string;
    strategy: "exact" | "known-phrase";
};

function normalizeIngredientName(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_");
}

const normalizedIngredientEntries = Object.entries(ingredientMap)
    .map(([key, translated]) => {
        const normalizedKey = normalizeIngredientName(key);

        return {
            key,
            normalizedKey,
            translated,
            tokenCount: normalizedKey.split("_").length
        };
    })
    .sort((a, b) =>
        b.tokenCount - a.tokenCount ||
        b.normalizedKey.length - a.normalizedKey.length
    );

/**
 * Resolve o nome salvo no estoque para um ingrediente conhecido pela TheMealDB.
 *
 * Primeiro tenta uma correspondência exata. Quando o nome possui um qualificador
 * adicional, como "frango congelado" ou "banana prata madura", procura a expressão
 * conhecida mais específica dentro do nome. Se houver ambiguidade entre duas
 * expressões igualmente específicas, não escolhe uma arbitrariamente.
 */
export function resolveIngredient(
    ingredient: string
): IngredientResolution | null {
    const normalizedInput = normalizeIngredientName(ingredient);

    if (!normalizedInput) {
        return null;
    }

    const exact = normalizedIngredientEntries.find(
        (entry) => entry.normalizedKey === normalizedInput
    );

    if (exact) {
        return {
            translated: exact.translated,
            matchedIngredient: exact.key.replace(/_/g, " "),
            strategy: "exact"
        };
    }

    const paddedInput = `_${normalizedInput}_`;
    const contained = normalizedIngredientEntries.filter(
        (entry) => paddedInput.includes(`_${entry.normalizedKey}_`)
    );

    if (!contained.length) {
        return null;
    }

    const maxTokens = contained[0].tokenCount;
    const mostSpecific = contained.filter(
        (entry) => entry.tokenCount === maxTokens
    );

    const translations = new Set(
        mostSpecific.map((entry) => entry.translated)
    );

    if (translations.size > 1) {
        return null;
    }

    const best = mostSpecific[0];

    return {
        translated: best.translated,
        matchedIngredient: best.key.replace(/_/g, " "),
        strategy: "known-phrase"
    };
}

export function translateIngredient(
    ingredient: string
): string | null {
    return resolveIngredient(ingredient)?.translated ?? null;
}
