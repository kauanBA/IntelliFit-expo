import { parseExpirationQuery } from "../src/chat/chat.expiration";
import {
    extractDirectStorageQueryLocation,
    extractPositiveNumber,
    extractStorageLocation,
    extractUnitFromMessage,
    hasNegativeQuantity,
    hasZeroQuantity,
    isCancellationMessage,
    isConfirmationMessage,
    normalizeUnit,
    parseDateInput,
    quantityMentionedInMessage,
    resolveQuantity,
    unitsEquivalent,
} from "../src/chat/chat.validation";
import { isConsultationMessage } from "../src/chat/chat.intent";
import {
    convertQuantity,
    mentionsPackaging,
    normalizeMeasurementUnit,
    preferredDisplayMeasurement,
    roundQuantity,
    unitsAreCompatible,
} from "../src/utils/measurement";
import {
    formatExpirationDateForUser,
    getExpirationAttentionStatus,
    getExpirationStatus,
    maxExpirationDateIso,
    todayInBrazilIso,
    validateExpirationDate,
} from "../src/utils/expiration";
import {
    findMergeableFoods,
    canonicalFoodName,
    foodGroupsMentioned,
    planConsumptionAcrossBatches,
} from "../src/chat/chat.stock";
import { Food } from "../src/interfaces/food.interface";

function assertEqual(scenario: string, received: unknown, expected: unknown) {
    if (received !== expected) {
        throw new Error(
            `${scenario}: esperado ${String(expected)}, recebido ${String(received)}.`,
        );
    }

    console.log(`✓ ${scenario}`);
}

assertEqual(
    '"não quero incluir" cancela um cadastro em andamento',
    isCancellationMessage("não quero incluir"),
    true,
);

assertEqual(
    '"Confirmar" é tratado como comando determinístico',
    isConfirmationMessage("Confirmar"),
    true,
);

assertEqual(
    "Data compacta 12112026 vira 12/11/2026",
    parseDateInput("12112026"),
    "2026-11-12",
);

assertEqual(
    "Local é extraído da frase do usuário",
    extractStorageLocation("tenho dois ovos na geladeira"),
    "GELADEIRA",
);

assertEqual(
    "Consulta direta reconhece geladeira isolada",
    extractDirectStorageQueryLocation("geladeira"),
    "GELADEIRA",
);

assertEqual(
    "Consulta direta reconhece pergunta sobre a geladeira",
    extractDirectStorageQueryLocation("o que tenho na geladeira?"),
    "GELADEIRA",
);

assertEqual(
    "Menção de local em cadastro não vira consulta de estoque",
    extractDirectStorageQueryLocation(
        "minha mãe trouxe leite para a geladeira",
    ),
    null,
);

assertEqual(
    "Quantidade por extenso é reconhecida",
    extractPositiveNumber("tenho dois ovos na geladeira"),
    2,
);

assertEqual(
    "2kg sem espaço é reconhecido como quantidade",
    extractPositiveNumber("2kg"),
    2,
);

assertEqual(
    "2kg sem espaço é reconhecido como unidade",
    extractUnitFromMessage("2kg"),
    "kg",
);

assertEqual(
    "Quantidade negativa é identificada",
    hasNegativeQuantity("- 5"),
    true,
);

assertEqual(
    "Quantidade negativa não vira positiva",
    extractPositiveNumber("- 5"),
    null,
);

assertEqual("Unidades são normalizadas", normalizeUnit("unidades"), "un");

assertEqual(
    "un e unidades são equivalentes no consumo",
    unitsEquivalent("un", "unidades"),
    true,
);

assertEqual(
    "kg e g são unidades compatíveis",
    unitsAreCompatible("kg", "g"),
    true,
);

assertEqual("2 kg equivalem a 2000 g", convertQuantity(2, "kg", "g"), 2000);

assertEqual("200 g equivalem a 0,2 kg", convertQuantity(200, "g", "kg"), 0.2);

assertEqual(
    "2 kg menos 200 g resulta em 1,8 kg",
    roundQuantity(2 - (convertQuantity(200, "g", "kg") ?? 0)),
    1.8,
);

assertEqual("2 L equivalem a 2000 ml", convertQuantity(2, "L", "ml"), 2000);

assertEqual(
    "0,3 kg é exibido como 300 g",
    preferredDisplayMeasurement(0.3, "kg").quantity,
    300,
);

assertEqual(
    "0,3 kg usa g na apresentação",
    preferredDisplayMeasurement(0.3, "kg").unit,
    "g",
);

assertEqual(
    "0,25 L é exibido como 250 ml",
    preferredDisplayMeasurement(0.25, "L").quantity,
    250,
);

assertEqual("kg e ml são incompatíveis", unitsAreCompatible("kg", "ml"), false);

assertEqual(
    "Caixa não é unidade de estoque",
    normalizeMeasurementUnit("caixa"),
    null,
);

assertEqual(
    "Garrafa não é unidade de estoque",
    normalizeMeasurementUnit("garrafas"),
    null,
);

assertEqual(
    "Caixa não é convertida para un",
    unitsAreCompatible("caixa", "un"),
    false,
);

assertEqual(
    "Embalagem na frase não vira unidade",
    extractUnitFromMessage("comprei 8 caixas de ovos"),
    null,
);

assertEqual(
    "Embalagem na frase é detectada",
    mentionsPackaging("tomei 1 caixa de leite"),
    true,
);

assertEqual(
    "Unidade padronizada não é embalagem",
    mentionsPackaging("tomei 1 litro de leite"),
    false,
);

assertEqual(
    "Unidade desconhecida não é aceita",
    normalizeMeasurementUnit("quiloz"),
    null,
);

assertEqual(
    "Validade no dia aparece como hoje",
    formatExpirationDateForUser("2026-11-03", "2026-11-03"),
    "hoje",
);

assertEqual(
    "Validade no dia seguinte aparece como amanhã",
    formatExpirationDateForUser("2026-11-04", "2026-11-03"),
    "amanhã",
);

assertEqual(
    "Validade após amanhã mantém a data",
    formatExpirationDateForUser("2026-11-05", "2026-11-03"),
    "05/11/2026",
);

assertEqual(
    "Vencimento hoje entra em próximos do vencimento",
    getExpirationAttentionStatus("2026-11-03", "2026-11-03"),
    "TODAY",
);

assertEqual(
    "Vencimento em 1 dia entra em atenção",
    getExpirationAttentionStatus("2026-11-04", "2026-11-03"),
    "ATTENTION",
);

assertEqual(
    "Vencimento em 7 dias ainda entra em atenção",
    getExpirationAttentionStatus("2026-11-10", "2026-11-03"),
    "ATTENTION",
);

assertEqual(
    "Vencimento em 8 dias fica fora da janela de atenção",
    getExpirationAttentionStatus("2026-11-11", "2026-11-03"),
    "VALID",
);

const today = todayInBrazilIso();
const yesterdayDate = new Date(`${today}T12:00:00Z`);
yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
const yesterday = yesterdayDate.toISOString().slice(0, 10);

assertEqual(
    "Data passada é rejeitada para novo cadastro",
    validateExpirationDate(yesterday).valid,
    false,
);

assertEqual(
    "Alimento com data passada recebe status EXPIRED",
    getExpirationStatus(yesterday),
    "EXPIRED",
);

const tooFarDate = new Date(`${maxExpirationDateIso()}T12:00:00Z`);
tooFarDate.setUTCDate(tooFarDate.getUTCDate() + 1);

assertEqual(
    "Data acima do limite de 10 anos é rejeitada",
    validateExpirationDate(tooFarDate.toISOString().slice(0, 10)).valid,
    false,
);

const futureDate = new Date(`${today}T12:00:00Z`);
futureDate.setUTCDate(futureDate.getUTCDate() + 5);
const laterDate = new Date(`${today}T12:00:00Z`);
laterDate.setUTCDate(laterDate.getUTCDate() + 8);
const laterIso = laterDate.toISOString().slice(0, 10);

const stockForBatchTests: Food[] = [
    {
        id: 1,
        userId: 1,
        name: "ovos",
        category: "Outros",
        quantity: 1,
        unit: "un",
        storageLocation: "GELADEIRA",
        expirationDate: new Date(`${yesterday}T12:00:00Z`),
        createdAt: new Date(),
    },
    {
        id: 2,
        userId: 1,
        name: "ovos",
        category: "Outros",
        quantity: 7,
        unit: "un",
        storageLocation: "GELADEIRA",
        expirationDate: futureDate,
        createdAt: new Date(),
    },
    {
        id: 3,
        userId: 1,
        name: "ovos",
        category: "Outros",
        quantity: 9,
        unit: "un",
        storageLocation: "GELADEIRA",
        expirationDate: laterDate,
        createdAt: new Date(),
    },
    {
        id: 4,
        userId: 1,
        name: "suco",
        category: "Outros",
        quantity: 6,
        unit: "L",
        storageLocation: "FREEZER",
        expirationDate: laterDate,
        createdAt: new Date(),
    },
];

assertEqual(
    "Mensagem de consumo identifica suco sem confundir com contexto de receita",
    foodGroupsMentioned(stockForBatchTests, "tomei 800ml de suco").length,
    1,
);

const eggPlan = planConsumptionAcrossBatches(
    stockForBatchTests.filter((food) => food.name === "ovos"),
    8,
    "un",
);

if ("error" in eggPlan) {
    throw new Error(`Consumo em lotes de ovos falhou: ${eggPlan.error}`);
}

assertEqual("Consumo de 8 ovos ignora lote vencido", eggPlan.expiredIgnored, 1);
assertEqual("Consumo de 8 ovos soma os lotes válidos", eggPlan.beforeTotal, 16);
assertEqual(
    "Consumo de 8 ovos deixa 8 unidades válidas",
    eggPlan.afterTotal,
    8,
);
assertEqual(
    "FEFO remove primeiro o lote válido que vence antes",
    eggPlan.operations[0]?.newQuantity,
    null,
);
assertEqual(
    "FEFO retira o restante do lote seguinte",
    eggPlan.operations[1]?.newQuantity,
    8,
);

const juicePlan = planConsumptionAcrossBatches(
    stockForBatchTests.filter((food) => food.name === "suco"),
    800,
    "ml",
);

if ("error" in juicePlan) {
    throw new Error(`Consumo de suco falhou: ${juicePlan.error}`);
}

assertEqual(
    "800 ml podem ser retirados de 6 L de suco",
    juicePlan.operations[0]?.newQuantity,
    5.2,
);

assertEqual(
    "Ovo e ovos têm a mesma identidade",
    canonicalFoodName("Ovos"),
    canonicalFoodName("ovo"),
);
assertEqual(
    "Variações de alimento continuam distintas",
    canonicalFoodName("ovo caipira") === canonicalFoodName("ovo branco"),
    false,
);
const mergeCandidates = findMergeableFoods(stockForBatchTests, {
    name: "ovo",
    unit: "un",
    storageLocation: "GELADEIRA",
    expirationDate: laterIso,
});
assertEqual(
    "Oferece lotes com datas diferentes e ignora vencidos",
    mergeCandidates.length,
    2,
);
assertEqual(
    "Oferece primeiro o lote com validade mais próxima",
    mergeCandidates[0].id,
    2,
);
assertEqual(
    "Não mistura locais de armazenamento",
    findMergeableFoods(stockForBatchTests, {
        name: "ovo",
        unit: "un",
        storageLocation: "FREEZER",
        expirationDate: laterIso,
    }).length,
    0,
);
assertEqual(
    "Não mistura unidades incompatíveis",
    findMergeableFoods(stockForBatchTests, {
        name: "ovo",
        unit: "kg",
        storageLocation: "GELADEIRA",
        expirationDate: laterIso,
    }).length,
    0,
);
const mixedNames = stockForBatchTests.map((food) =>
    food.id === 2 ? { ...food, name: "ovo" } : food,
);
assertEqual(
    "Consumo agrupa nomes no singular e plural",
    foodGroupsMentioned(mixedNames, "comi 8 ovos")[0].length,
    3,
);

console.log(
    "\nValidação das regras determinísticas do chatbot concluída com sucesso.",
);
console.log(
    "Unidades de estoque: un, g, kg, ml e L. Conversões: g↔kg e ml↔L. Caixa, pacote, lata e garrafa não são unidades: o chatbot pede a quantidade em uma unidade padronizada.",
);

const partialExpiredStock = planConsumptionAcrossBatches(
    stockForBatchTests.filter((food) => food.name === "ovos"),
    17,
    "un",
);
if (
    !("error" in partialExpiredStock) ||
    !partialExpiredStock.error.includes("vencidos ficam fora desse saldo")
) {
    throw new Error(
        "Saldo insuficiente deve explicar que os vencidos não completam o consumo.",
    );
}

const december = parseExpirationQuery("o que vence mês que vem?", "2026-12-15");
if (
    december?.kind !== "range" ||
    december.start !== "2027-01-01" ||
    december.end !== "2027-01-31"
) {
    throw new Error("Próximo mês deve respeitar a virada de ano.");
}
const nextYear = parseExpirationQuery("o que vence ano que vem?", "2026-11-05");
if (
    nextYear?.kind !== "range" ||
    nextYear.start !== "2027-01-01" ||
    nextYear.end !== "2027-12-31"
) {
    throw new Error("Próximo ano deve filtrar apenas o ano civil seguinte.");
}

for (const [question, start, end] of [
    ["o que vence em 2027?", "2027-01-01", "2027-12-31"],
    ["o que vence em dezembro?", "2026-12-01", "2026-12-31"],
    ["o que vence em março de 2027?", "2027-03-01", "2027-03-31"],
]) {
    const result = parseExpirationQuery(question, "2026-11-05");
    if (
        result?.kind !== "range" ||
        result.start !== start ||
        result.end !== end
    ) {
        throw new Error(`Intervalo incorreto para ${question}`);
    }
}

// ---------- Quantidade: só vale o que o usuário escreveu ----------

assertEqual("Zero é detectado", hasZeroQuantity("comprei 0 tomates"), true);
assertEqual("Zero com unidade é detectado", hasZeroQuantity("0 kg"), true);
assertEqual("Zero por extenso com unidade", hasZeroQuantity("zero kg de arroz"), true);
assertEqual("0,5 não é zero", hasZeroQuantity("0,5 kg"), false);
assertEqual("Data com zero não é quantidade", hasZeroQuantity("vence em 05/11/2026"), false);
assertEqual("Produto 'zero' não é quantidade zero", hasZeroQuantity("comprei 2 coca zero"), false);
assertEqual("Leite zero lactose não é quantidade zero", hasZeroQuantity("comprei leite zero lactose"), false);

assertEqual(
    "Número do modelo ausente na mensagem é descartado",
    resolveQuantity("comprei tomate", 0.0239).quantity,
    null,
);
assertEqual(
    "Número que o usuário escreveu é mantido",
    resolveQuantity("comprei 3 tomates", 0.0239).quantity,
    3,
);
assertEqual(
    "Zero vence o valor sugerido pelo modelo",
    resolveQuantity("comprei 0 tomates", 5).zero,
    true,
);
assertEqual(
    "Meio litro é aceito quando o modelo converte para 0,5",
    resolveQuantity("tomei meio litro de leite", 0.5).quantity,
    0.5,
);
assertEqual(
    "Dia de uma data não conta como quantidade",
    quantityMentionedInMessage(10, "vence 10/11/2026"),
    false,
);
assertEqual(
    "Decimal com vírgula é reconhecido",
    quantityMentionedInMessage(1.5, "comprei 1,5 kg de frango"),
    true,
);
assertEqual("Dúzia não é unidade de estoque", mentionsPackaging("uma dúzia de ovos"), true);

// ---------- Consulta no meio de outra conversa ----------

assertEqual("Pergunta sobre a geladeira é consulta", isConsultationMessage("O que tenho na geladeira?"), true);
assertEqual("Pergunta sobre receitas é consulta", isConsultationMessage("quais receitas posso fazer?"), true);
assertEqual("Resposta curta não é consulta", isConsultationMessage("geladeira"), false);
assertEqual("Quantidade não é consulta", isConsultationMessage("2 kg"), false);
assertEqual("Informar quantidade não é consulta", isConsultationMessage("tenho 3 tomates"), false);
assertEqual("Cadastro não é consulta", isConsultationMessage("comprei leite"), false);
