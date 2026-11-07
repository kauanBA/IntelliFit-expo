import assert from "node:assert/strict";
import test from "node:test";
import { createChatService } from "../src/chat/chat.service";
import type { ChatRepository } from "../src/chat/chat.repository";
import type { PendingAction } from "../src/chat/chat.types";
import type { Food } from "../src/interfaces/food.interface";
import { todayInBrazilIso } from "../src/utils/expiration";

function future(days: number): string {
    const date = new Date(`${todayInBrazilIso()}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
function br(date: string): string {
    return date.split("-").reverse().join("/");
}

function fixture(
    textReply?: string,
    tool?: { name: string; args: Record<string, unknown> },
    expired = false,
    duplicate = false,
    existingOverrides: Partial<Food> = {},
    duplicateLocation?: Food["storageLocation"],
    extraFoods: Food[] = [],
) {
    const states = new Map<number, PendingAction | null>();
    const messages: Array<{ userId: number; role: string; content: string }> =
        [];
    let writes = 0;
    let modelCalls = 0;
    const existing: Food = {
        id: 7,
        userId: 1,
        name: "ovos",
        category: "Outros",
        quantity: 6,
        unit: "un",
        storageLocation: "GELADEIRA",
        expirationDate: new Date(`${future(expired ? -1 : 10)}T12:00:00Z`),
        createdAt: new Date(),
        ...existingOverrides,
    };
    const repository: ChatRepository = {
        getPendingAction: async (id) => states.get(id) ?? null,
        setPendingAction: async (id, state) => {
            states.set(id, state);
        },
        getRecipeContext: async () => [],
        setRecipeContext: async () => {},
        saveMessage: async (id, role, content) => {
            messages.push({ userId: id, role, content });
        },
        recentHistory: async (id) =>
            messages
                .filter((m) => m.userId === id)
                .map(({ role, content }) => ({ role, content })),
        getChatHistory: async () => [],
        clearChat: async (id) => {
            states.delete(id);
        },
        lastAssistantMessage: async () => "",
    };
    const service = createChatService({
        repository,
        foodService: {
            getAllFoods: async (id) =>
                id !== 1
                    ? []
                    : duplicate
                      ? [
                            existing,
                            {
                                ...existing,
                                id: 8,
                                name: "ovo",
                                storageLocation:
                                    duplicateLocation ??
                                    existing.storageLocation,
                                expirationDate: new Date(future(12)),
                            },
                        ]
                      : [existing, ...extraFoods],
            createFood: async (userId, data) => {
                writes++;
                return {
                    ...existing,
                    ...data,
                    userId,
                    expirationDate: new Date(data.expirationDate),
                };
            },
            updateFood: async (_id, userId, data) => {
                writes++;
                return {
                    ...existing,
                    ...data,
                    userId,
                    expirationDate: new Date(data.expirationDate),
                };
            },
            deleteFood: async () => {
                writes++;
            },
            applyBatchConsumption: async () => {
                writes++;
            },
        },
        recipeService: {
            getRecommendations: async () => [],
            getLocalizedById: async () => null,
        },
        languageModel: async () => {
            modelCalls++;
            if (textReply)
                return {
                    output: [
                        {
                            type: "message",
                            content: [{ type: "output_text", text: textReply }],
                        },
                    ],
                };
            return {
                output: [
                    {
                        type: "function_call",
                        name: tool?.name ?? "create_food",
                        call_id: "test",
                        arguments: JSON.stringify(
                            tool?.args ?? {
                                name: "ovo",
                                quantity: 4,
                                unit: "un",
                                storageLocation: "GELADEIRA",
                                expirationDate: future(15),
                            },
                        ),
                    },
                ],
            };
        },
    });
    function draft(id = 1) {
        states.set(id, {
            type: "create_food_draft",
            data: {
                name: "ovo",
                quantity: 4,
                unit: "un",
                storageLocation: "GELADEIRA",
            },
        });
    }
    return {
        service,
        draft,
        states,
        writes: () => writes,
        modelCalls: () => modelCalls,
    };
}

test("Cadastro por etapas oferece juntar ou separar, sem gravar antes da confirmação", async () => {
    const f = fixture();
    f.draft();
    const result = await f.service.sendChatMessage(1, br(future(15)));
    assert.deepEqual(result.actions, [
        "Somar ao existente",
        "Cadastrar separado",
        "Cancelar",
    ]);
    assert.match(result.reply, new RegExp(br(future(10))));
    assert.equal(f.writes(), 0);
    await f.service.sendChatMessage(1, "Somar ao existente");
    const state = f.states.get(1);
    assert.equal(state?.type, "update_food");
    if (state?.type !== "update_food")
        throw new Error("Proposta de soma ausente");
    assert.equal(state.data.quantity, 10);
    assert.equal(state.data.expirationDate, future(10));
    assert.equal(f.writes(), 0);
    const saved = await f.service.resolvePendingAction(1, "confirm");
    assert.equal(saved.changed, true);
    assert.equal(f.writes(), 1);
    assert.equal(f.states.get(1), null);
    assert.equal(f.modelCalls(), 0);
    await f.service.resolvePendingAction(1, "confirm");
    assert.equal(f.writes(), 1);
});

test("Nova validade anterior é preservada na união", async () => {
    const f = fixture();
    f.draft();
    await f.service.sendChatMessage(1, br(future(5)));
    await f.service.sendChatMessage(1, "Somar ao existente");
    const state = f.states.get(1);
    assert.equal(state?.type, "update_food");
    if (state?.type === "update_food")
        assert.equal(state.data.expirationDate, future(5));
});

test("Separar mantém quantidade e validade da nova entrada", async () => {
    const f = fixture();
    f.draft();
    await f.service.sendChatMessage(1, br(future(15)));
    await f.service.sendChatMessage(1, "Cadastrar separado");
    const state = f.states.get(1);
    assert.equal(state?.type, "create_food");
    if (state?.type === "create_food") {
        assert.equal(state.data.quantity, 4);
        assert.equal(state.data.expirationDate, future(15));
    }
    assert.equal(f.writes(), 0);
});

test("Cancelar e confirmar escolha incompleta não alteram estoque", async () => {
    const f = fixture();
    f.draft();
    await f.service.sendChatMessage(1, br(future(15)));
    const incomplete = await f.service.resolvePendingAction(1, "confirm");
    assert.equal(incomplete.changed, false);
    await f.service.sendChatMessage(1, "Cancelar");
    assert.equal(f.states.get(1), null);
    assert.equal(f.writes(), 0);
});

test("Cadastro completo por function calling também oferece a escolha", async () => {
    const f = fixture();
    const result = await f.service.sendChatMessage(
        1,
        `comprei 4 ovos para geladeira validade ${br(future(15))}`,
    );
    assert.equal(f.states.get(1)?.type, "create_food_duplicate_choice");
    assert.equal(result.actions[0], "Somar ao existente");
    assert.equal(f.modelCalls(), 1);
    assert.equal(f.writes(), 0);
});

test("Rascunhos e candidatos são isolados por usuário", async () => {
    const f = fixture();
    f.draft(2);
    await f.service.sendChatMessage(2, br(future(15)));
    assert.equal(f.states.get(2)?.type, "create_food");
    assert.equal(f.states.has(1), false);
});

test("Conversa sem ferramenta apresenta a resposta do modelo", async () => {
    const f = fixture("Posso consultar seu estoque e sugerir receitas.");
    const result = await f.service.sendChatMessage(
        1,
        "Como você pode me ajudar?",
    );
    assert.equal(
        result.reply,
        "Posso consultar seu estoque e sugerir receitas.",
    );
    assert.equal(f.writes(), 0);
});

test("Consumo de vencidos explica o bloqueio e oferece descarte, sem alterar estoque", async () => {
    const f = fixture(
        undefined,
        {
            name: "consume_food",
            args: {
                name: "ovos",
                quantity: 4,
                unit: "un",
                includeExpired: false,
            },
        },
        true,
    );
    const result = await f.service.sendChatMessage(1, "comi 4 ovos");
    assert.match(result.reply, /todos os lotes.*vencidos/i);
    assert.match(result.reply, /descarte/);
    assert.equal(result.pending, false);
    assert.equal(f.writes(), 0);
});

test("Descarte explícito é apresentado como descarte e continua exigindo confirmação", async () => {
    const f = fixture(
        undefined,
        {
            name: "consume_food",
            args: {
                name: "ovos",
                quantity: 4,
                unit: "un",
                includeExpired: true,
            },
        },
        true,
    );
    const result = await f.service.sendChatMessage(
        1,
        "descartei 4 ovos vencidos",
    );
    assert.match(result.reply, /Descarte de/);
    assert.equal(result.pending, true);
    assert.equal(f.writes(), 0);
    const confirmed = await f.service.resolvePendingAction(1, "confirm");
    assert.match(confirmed.reply, /Descarte de/);
    assert.equal(f.writes(), 1);
});

test("Validade sem data pede a informação antes de montar a proposta", async () => {
    const f = fixture(undefined, {
        name: "update_food",
        args: { name: "ovos" },
    });
    const asked = await f.service.sendChatMessage(
        1,
        "mude a validade dos ovos",
    );
    assert.match(asked.reply, /nova validade/);
    assert.equal(asked.pending, false);
    await f.service.resolvePendingAction(1, "confirm");
    assert.equal(f.writes(), 0);
    const unchanged = await f.service.sendChatMessage(1, br(future(10)));
    assert.match(unchanged.reply, /já é a validade/);
    const proposed = await f.service.sendChatMessage(1, br(future(12)));
    assert.ok(proposed.reply.includes(br(future(12))));
    assert.equal(proposed.pending, true);
    assert.equal(f.writes(), 0);
    await f.service.resolvePendingAction(1, "confirm");
    assert.equal(f.writes(), 1);
});

test("Escolha de lote vencido continua a exclusão e exige confirmação", async () => {
    const f = fixture(
        undefined,
        { name: "delete_food", args: { name: "ovos" } },
        true,
        true,
    );
    const asked = await f.service.sendChatMessage(1, "apague ovos");
    assert.match(asked.reply, /Qual lote/);
    assert.equal(asked.pending, false);
    const proposed = await f.service.sendChatMessage(1, "ovos vencidos");
    assert.equal(proposed.pending, true);
    const pending = f.states.get(1);
    assert.equal(pending?.type, "delete_food");
    assert.equal(pending?.foodId, 7);
    assert.equal(f.writes(), 0);
    assert.equal(f.modelCalls(), 1);
    await f.service.resolvePendingAction(1, "confirm");
    assert.equal(f.writes(), 1);
});

test("Consultas de vencimento por data e prazo filtram o estoque sem chamar o modelo", async () => {
    const f = fixture(undefined, undefined, false, true);
    const shortDate = br(future(12)).slice(0, 5);
    // A forma abreviada usa o ano corrente. Use o ano explícito na virada.
    const queryDate =
        future(12).slice(0, 4) === todayInBrazilIso().slice(0, 4)
            ? shortDate
            : br(future(12));
    const exact = await f.service.sendChatMessage(
        1,
        `o que vence no dia ${queryDate}`,
    );
    assert.ok(exact.reply.includes(br(future(12))));
    assert.ok(!exact.reply.includes(br(future(10))));
    const nearest = await f.service.sendChatMessage(
        1,
        "o que está mais perto de vencer?",
    );
    assert.ok(nearest.reply.includes(br(future(10))));
    assert.ok(!nearest.reply.includes(br(future(12))));
    const short = await f.service.sendChatMessage(
        1,
        "o que vence nos próximos 4 dias",
    );
    assert.match(short.reply, /Nenhum alimento/);
    assert.equal(f.modelCalls(), 0);
});

test("Vencimento mais próximo ignora itens já vencidos", async () => {
    const f = fixture(undefined, undefined, true, true);
    const result = await f.service.sendChatMessage(
        1,
        "o que está mais perto de vencer?",
    );
    assert.ok(result.reply.includes(br(future(12))));
    assert.doesNotMatch(result.reply, /Vencido em/);
    assert.equal(f.modelCalls(), 0);
});

test("OK sem proposta pendente é um reconhecimento, sem chamar o modelo", async () => {
    const f = fixture();
    const reply = await f.service.sendChatMessage(1, "ok");
    assert.equal(reply.reply, "Tudo certo!");
    assert.equal(f.modelCalls(), 0);
    assert.equal(f.writes(), 0);
});

test("O cadastro preserva congelado quando o modelo devolve apenas frango", async () => {
    const f = fixture(
        undefined,
        {
            name: "create_food",
            args: { name: "frango", quantity: 6, unit: "kg" },
        },
        false,
        false,
        {
            name: "frango congelado",
            quantity: 210,
            unit: "g",
            storageLocation: "FREEZER",
        },
    );
    await f.service.sendChatMessage(1, "fiz 6 kg de frango congelado freezer");
    const proposal = await f.service.sendChatMessage(1, br(future(12)));
    assert.match(proposal.reply, /Juntar lotes de frango congelado/);
    assert.match(proposal.reply, /6\.210 g/);
    assert.equal(f.writes(), 0);
});

test("Descarte pelo nome usa o saldo do lote e aguarda confirmação mesmo se o modelo consultaria estoque", async () => {
    const f = fixture(
        undefined,
        { name: "list_foods", args: { query: "caramelo" } },
        false,
        false,
        { name: "caramelo", quantity: 6 },
    );
    const proposed = await f.service.sendChatMessage(
        1,
        "descarte todo o caramelo",
    );
    assert.match(proposed.reply, /Descarte de caramelo/);
    assert.match(proposed.reply, /6 un/);
    assert.equal(proposed.pending, true);
    assert.equal(f.modelCalls(), 0);
    assert.equal(f.writes(), 0);
    await f.service.resolvePendingAction(1, "confirm");
    assert.equal(f.writes(), 1);
});

test("Consumo com local usa apenas os lotes daquele local", async () => {
    const f = fixture(
        undefined,
        {
            name: "consume_food",
            args: { name: "ovos", quantity: 2, unit: "un" },
        },
        false,
        true,
        {},
        "DESPENSA",
    );
    const unspecified = await f.service.sendChatMessage(1, "comi 2 ovos");
    assert.match(unspecified.reply, /de qual local/);
    assert.equal(unspecified.pending, false);
    const result = await f.service.sendChatMessage(
        1,
        "comi 2 ovos da geladeira",
    );
    assert.match(result.reply, /Saldo disponível atual: 6 un/);
    const pending = f.states.get(1);
    assert.equal(pending?.type, "batch_consume");
    assert.deepEqual(
        pending.operations.map((operation) => operation.foodId),
        [7],
    );
});

test("Consumo em ml exibe saldo na unidade cadastrada em L", async () => {
    const f = fixture(
        undefined,
        {
            name: "consume_food",
            args: { name: "suco", quantity: 200, unit: "ml" },
        },
        false,
        false,
        {
            name: "suco",
            quantity: 11.04,
            unit: "L",
            storageLocation: "FREEZER",
        },
    );
    const result = await f.service.sendChatMessage(1, "tomei 200 ml de suco");
    assert.match(result.reply, /Quantidade: 200 ml/);
    assert.match(result.reply, /11,04 L/);
    assert.match(result.reply, /10,84 L/);
});

test("Cadastro em caixas não grava: pede quantidade e unidade padronizadas", async () => {
    const f = fixture(undefined, {
        name: "create_food",
        args: {
            name: "ovos",
            quantity: 8,
            unit: null,
            storageLocation: null,
            expirationDate: null,
        },
    });
    const first = await f.service.sendChatMessage(1, "comprei 8 caixas de ovos");
    assert.match(first.reply, /caixa, pacote, lata, garrafa ou dúzia/);
    assert.match(first.reply, /un, g ou kg/);
    const afterFirst = f.states.get(1);
    assert.equal(afterFirst?.type, "create_food_draft");
    if (afterFirst?.type === "create_food_draft") {
        assert.equal(afterFirst.data.quantity, undefined);
        assert.equal(afterFirst.data.unit, undefined);
        assert.equal(afterFirst.data.packaging, true);
    }

    const second = await f.service.sendChatMessage(1, "96 un");
    assert.match(second.reply, /armazenado/);
    const afterSecond = f.states.get(1);
    assert.equal(afterSecond?.type, "create_food_draft");
    if (afterSecond?.type === "create_food_draft") {
        assert.equal(afterSecond.data.quantity, 96);
        assert.equal(afterSecond.data.unit, "un");
        assert.equal(afterSecond.data.packaging, undefined);
    }
    assert.equal(f.writes(), 0);
});

test("Embalagem repetida durante o rascunho continua pedindo uma unidade padronizada", async () => {
    const f = fixture();
    f.states.set(1, {
        type: "create_food_draft",
        data: { name: "leite", quantity: 2 },
    });
    const result = await f.service.sendChatMessage(1, "caixa");
    assert.match(result.reply, /caixa, pacote, lata, garrafa ou dúzia/);
    assert.match(result.reply, /un, g, kg, ml ou L/);
    const state = f.states.get(1);
    if (state?.type === "create_food_draft") {
        assert.equal(state.data.quantity, undefined);
        assert.equal(state.data.packaging, true);
    }
});

test("Baixa em caixa pede a quantidade na unidade cadastrada, sem alterar estoque", async () => {
    const f = fixture(
        undefined,
        {
            name: "consume_food",
            args: { name: "leite", quantity: 1, unit: null, includeExpired: false },
        },
        false,
        false,
        { name: "leite", quantity: 8, unit: "L", storageLocation: "GELADEIRA" },
    );
    const result = await f.service.sendChatMessage(1, "tomei 1 caixa de leite");
    assert.match(result.reply, /unidade cadastrada/);
    assert.match(result.reply, /\*\*L\*\*/);
    assert.equal(result.changed, false);
    assert.equal(f.writes(), 0);
});

// ---------- Quantidade nunca é inventada ----------

test("Quantidade do modelo que não está na mensagem é descartada", async () => {
    const f = fixture(undefined, {
        name: "create_food",
        args: {
            name: "tomate",
            quantity: 0.0239,
            unit: "un",
            storageLocation: null,
            expirationDate: null,
        },
    });
    const result = await f.service.sendChatMessage(1, "comprei tomate");
    assert.match(result.reply, /Qual é a quantidade/);
    const state = f.states.get(1);
    assert.equal(state?.type, "create_food_draft");
    if (state?.type === "create_food_draft") {
        assert.equal(state.data.quantity, undefined);
    }
    assert.equal(f.writes(), 0);
});

test("Quantidade zero é rejeitada na hora, mesmo que o modelo sugira outro valor", async () => {
    const f = fixture(undefined, {
        name: "create_food",
        args: {
            name: "tomate",
            quantity: 0.0239,
            unit: "un",
            storageLocation: null,
            expirationDate: null,
        },
    });
    const result = await f.service.sendChatMessage(1, "comprei 0 tomates");
    assert.match(result.reply, /maior que zero/);
    const state = f.states.get(1);
    if (state?.type === "create_food_draft") {
        assert.equal(state.data.quantity, undefined);
    }
});

test("Zero digitado durante o rascunho também é rejeitado", async () => {
    const f = fixture();
    f.states.set(1, {
        type: "create_food_draft",
        data: { name: "tomate" },
    });
    const result = await f.service.sendChatMessage(1, "0");
    assert.match(result.reply, /maior que zero/);
    const state = f.states.get(1);
    if (state?.type === "create_food_draft") {
        assert.equal(state.data.quantity, undefined);
    }
});

test("Baixa com zero não altera o estoque", async () => {
    const f = fixture(
        undefined,
        {
            name: "consume_food",
            args: { name: "leite", quantity: 0.5, unit: "L" },
        },
        false,
        false,
        { name: "leite", quantity: 8, unit: "L" },
    );
    const result = await f.service.sendChatMessage(1, "tomei 0 litros de leite");
    assert.match(result.reply, /maior que zero/);
    assert.equal(f.writes(), 0);
    assert.equal(f.states.get(1) ?? null, null);
});

// ---------- Mudança de assunto durante um cadastro ----------

test("Consulta durante o cadastro não preenche campos e retoma o cadastro", async () => {
    const f = fixture();
    f.states.set(1, {
        type: "create_food_draft",
        data: { name: "tomate", quantity: 3, unit: "un" },
    });
    const result = await f.service.sendChatMessage(
        1,
        "O que tenho na geladeira?",
    );
    assert.match(result.reply, /ovos/i);
    assert.match(result.reply, /Seguimos com o cadastro de \*\*tomate\*\*/);
    const state = f.states.get(1);
    assert.equal(state?.type, "create_food_draft");
    if (state?.type === "create_food_draft") {
        assert.equal(state.data.storageLocation, undefined);
        assert.equal(state.data.quantity, 3);
    }

    // A resposta curta seguinte continua o cadastro normalmente.
    await f.service.sendChatMessage(1, "geladeira");
    const after = f.states.get(1);
    if (after?.type === "create_food_draft") {
        assert.equal(after.data.storageLocation, "GELADEIRA");
    }
});

// ---------- Saldo insuficiente e tipos parecidos ----------

function twoEggTypes() {
    const caipira: Food = {
        id: 9,
        userId: 1,
        name: "ovos caipiras",
        category: "Outros",
        quantity: 3,
        unit: "un",
        storageLocation: "GELADEIRA",
        expirationDate: new Date(`${future(10)}T12:00:00Z`),
        createdAt: new Date(),
    };
    return { comum: { name: "ovos comuns", quantity: 5 }, caipira };
}

test("Saldo insuficiente diz o alimento e não soma tipos diferentes", async () => {
    const { comum, caipira } = twoEggTypes();
    const f = fixture(
        undefined,
        {
            name: "consume_food",
            args: { name: "ovos comuns", quantity: 8, unit: "un" },
        },
        false,
        false,
        comum,
        undefined,
        [caipira],
    );
    const result = await f.service.sendChatMessage(1, "usei 8 ovos comuns");
    assert.match(result.reply, /possui apenas \*\*5 ovos comuns\*\*/);
    assert.match(result.reply, /você também tem \*\*ovos caipiras\*\* \(3 un\)/i);
    assert.equal(f.writes(), 0);
    assert.equal(f.states.get(1) ?? null, null);
});

test("Pedido genérico com dois tipos lista cada um com o saldo", async () => {
    const { comum, caipira } = twoEggTypes();
    const f = fixture(
        undefined,
        {
            name: "consume_food",
            args: { name: "ovos", quantity: 2, unit: "un" },
        },
        false,
        false,
        comum,
        undefined,
        [caipira],
    );
    const result = await f.service.sendChatMessage(1, "usei 2 ovos");
    assert.match(result.reply, /\*\*ovos caipiras\*\* \(3 un\)/);
    assert.match(result.reply, /\*\*ovos comuns\*\* \(5 un\)/);
    assert.match(result.reply, /Informe qual/);
    assert.equal(f.writes(), 0);
});
