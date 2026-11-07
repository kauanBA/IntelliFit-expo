import { normalizeText } from "./chat.validation";

/**
 * Atalhos determinísticos (regex) só podem responder a consultas "puras".
 * Se a mensagem contém um verbo que altera o estoque, a decisão precisa ir
 * para o modelo de linguagem (function calling), que interpreta a intenção.
 *
 * Exemplo do erro que isto evita:
 *   "Comprei 2 leites e coloquei na geladeira, registre no estoque"
 * contém "geladeira" e "estoque", mas é um cadastro, não uma listagem.
 */
const MUTATION_VERBS =
    /\b(compr\w*|registr\w*|cadastr\w*|adicion\w*|inclu\w*|coloc\w*|coloq\w*|guard\w*|botei|pus|pegu?ei|acabou|acabaram|terminou|terminaram|tirei|tir[ea]r?|retir\w*|usei|usar|us[ea]|consum\w*|comi|gastei|gast[ea]\w*|jogu?ei|jogar|descart\w*|exclu\w*|apag\w*|delet\w*|remov\w*|atualiz\w*|mud\w*|alter\w*|troc\w*|edit\w*|baix\w*|abat\w*)\b/;

export function hasStockMutationIntent(message: string): boolean {
    return MUTATION_VERBS.test(normalizeText(message));
}

/**
 * Palavras que indicam que "como fazer" / "ingredientes do" se refere ao uso
 * da aplicação ou ao estoque, e não ao preparo de uma receita.
 */
const APP_TOPIC =
    /\b(cadastr\w*|registr\w*|estoque|alimentos?|vencer|vencem|vence|validade|lotes?|usuario|conta|login|senha|perfil|aplicativo|app|sistema|chat)\b/;

export function mentionsAppTopic(message: string): boolean {
    return APP_TOPIC.test(normalizeText(message));
}

const ORDINALS: Array<[RegExp, number]> = [
    [/\bprimeir[oa]\b/, 0],
    [/\bsegund[oa]\b/, 1],
    [/\bterceir[oa]\b/, 2],
    [/\bquart[oa]\b/, 3],
    [/\bquint[oa]\b/, 4],
    [/\bsext[oa]\b/, 5],
];

/**
 * Converte "a primeira", "a segunda receita", "opção 3", "número 2" ou "a última"
 * em um índice (base 0) da lista de sugestões. Retorna -1 se não houver
 * referência ordinal válida para uma lista com `size` itens.
 */
export function resolveRecipeOrdinal(message: string, size: number): number {
    if (size <= 0) return -1;
    const text = normalizeText(message);

    if (/\bultim[oa]\b/.test(text)) return size - 1;

    for (const [pattern, index] of ORDINALS) {
        if (pattern.test(text)) return index < size ? index : -1;
    }

    const numbered =
        text.match(/\b(?:numero|opcao|receita|n)\s*(\d{1,2})\b/) ??
        text.match(/^(?:a |o )?(\d{1,2})$/);
    if (numbered) {
        const index = Number(numbered[1]) - 1;
        return index >= 0 && index < size ? index : -1;
    }
    return -1;
}


/**
 * Pergunta ou consulta feita no meio de outra conversa (por exemplo, durante
 * um cadastro): "O que tenho na geladeira?", "Quais receitas posso fazer?".
 * Não inclui verbos que alteram o estoque nem respostas curtas como "geladeira".
 */
const QUESTION_START =
    /^(o que|oque|que|quais|qual|quanto|quantos|quantas|quando|como|onde|me (?:mostr\w+|diga|fale|fala|list\w+)|mostr\w+|list\w+|resumo|ver)\b/;

export function isConsultationMessage(message: string): boolean {
    if (hasStockMutationIntent(message)) return false;

    const text = normalizeText(message);
    if (!text) return false;
    if (QUESTION_START.test(text)) return true;

    return message.includes("?") && text.split(" ").length >= 3;
}
