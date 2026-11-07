import {
    mentionsPackaging,
    normalizeMeasurementUnit,
    unitsAreCompatible,
} from "../utils/measurement";
import { todayInBrazilIso } from "../utils/expiration";

export type StorageLocation = "DESPENSA" | "GELADEIRA" | "FREEZER";

export function normalizeText(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function isConfirmationMessage(message: string): boolean {
    const text = normalizeText(message);

    return [
        "confirmar",
        "confirmo",
        "sim",
        "pode confirmar",
        "pode fazer",
        "pode salvar",
        "salvar",
    ].includes(text);
}

export function isCancellationMessage(message: string): boolean {
    const text = normalizeText(message);

    if (
        [
            "cancelar",
            "cancela",
            "nao",
            "deixa pra la",
            "deixa para la",
            "desisto",
            "esquece",
        ].includes(text)
    ) {
        return true;
    }

    return (
        text.startsWith("nao quero") ||
        text.includes("nao quero incluir") ||
        text.includes("nao quero cadastrar") ||
        text.includes("cancela isso") ||
        text.includes("pode cancelar")
    );
}

export function extractStorageLocation(
    message: string,
): StorageLocation | null {
    const text = normalizeText(message);

    if (/\bgeladeira\b/.test(text)) {
        return "GELADEIRA";
    }

    if (/\bdespensa\b/.test(text) || /\barmario\b/.test(text)) {
        return "DESPENSA";
    }

    if (/\bfreezer\b/.test(text) || /\bcongelador\b/.test(text)) {
        return "FREEZER";
    }

    return null;
}

export function extractDirectStorageQueryLocation(
    message: string,
): StorageLocation | null {
    const location = extractStorageLocation(message);

    if (!location) {
        return null;
    }

    const text = normalizeText(message);
    const standaloneLocations = new Set([
        "geladeira",
        "despensa",
        "armario",
        "freezer",
        "congelador",
    ]);

    if (standaloneLocations.has(text)) {
        return location;
    }

    const stockQueryPatterns = [
        /\bo que (?:eu )?tenho\b/,
        /\bo que tem\b/,
        /\bquanto (?:eu )?tenho\b/,
        /\bmostrar?\b/,
        /\bmostre\b/,
        /\blistar?\b/,
        /\bliste\b/,
        /\bconsultar?\b/,
        /\bestoque\b/,
    ];

    return stockQueryPatterns.some((pattern) => pattern.test(text))
        ? location
        : null;
}

const unitPatterns: Array<[RegExp, string]> = [
    [/(?:^|\s)(un|unidade|unidades|und)(?=\s|$)/, "un"],
    [/(?:^|\s)(kg|quilo|quilos|quilograma|quilogramas)(?=\s|$)/, "kg"],
    [/(?:^|\s)(g|grama|gramas)(?=\s|$)/, "g"],
    [/(?:^|\s)(ml|mililitro|mililitros)(?=\s|$)/, "ml"],
    [/(?:^|\s)(l|litro|litros)(?=\s|$)/, "L"],
];

// Caixa, pacote, lata e garrafa não são unidades de estoque.
export function messageMentionsPackaging(message: string): boolean {
    return mentionsPackaging(message);
}

export function packagingUnitReply(
    options: string,
    example: string,
): string {
    return (
        "Não controlo o estoque por caixa, pacote, lata, garrafa ou dúzia. " +
        `Informe a quantidade total em ${options}. Ex.: ${example}.`
    );
}

export function normalizeUnit(value: string): string {
    return normalizeMeasurementUnit(value) ?? value.trim();
}

export function extractUnitFromMessage(message: string): string | null {
    const compactMatch = message.match(
        /(?:^|\s)(?:-?\s*)?\d+(?:[.,]\d+)?\s*(kg|g|ml|l)(?=\s|$)/i,
    );

    if (compactMatch) {
        return normalizeMeasurementUnit(compactMatch[1]);
    }

    const text = normalizeText(message);

    for (const [pattern, canonical] of unitPatterns) {
        if (pattern.test(text)) {
            return canonical;
        }
    }

    return null;
}

export function unitsEquivalent(a: string, b: string): boolean {
    const left = normalizeMeasurementUnit(a);
    const right = normalizeMeasurementUnit(b);

    return Boolean(left && right && left === right);
}

export function unitsCompatible(a: string, b: string): boolean {
    return unitsAreCompatible(a, b);
}

const numberWords: Record<string, number> = {
    um: 1,
    uma: 1,
    dois: 2,
    duas: 2,
    tres: 3,
    quatro: 4,
    cinco: 5,
    seis: 6,
    sete: 7,
    oito: 8,
    nove: 9,
    dez: 10,
    onze: 11,
    doze: 12,
    treze: 13,
    quatorze: 14,
    catorze: 14,
    quinze: 15,
    dezesseis: 16,
    dezessete: 17,
    dezoito: 18,
    dezenove: 19,
    vinte: 20,
};

export function hasNegativeQuantity(message: string): boolean {
    if (/(?:^|\s)-\s*\d+(?:[.,]\d+)?/.test(message)) {
        return true;
    }

    const text = normalizeText(message);
    return /\bmenos\s+(?:\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\b/.test(
        text,
    );
}

export function extractPositiveNumber(message: string): number | null {
    if (hasNegativeQuantity(message)) {
        return null;
    }

    const numericMatch = message.match(
        /(?:^|\s)(\d+(?:[.,]\d+)?)(?=\s*(?:kg|g|ml|l|un|und|unidade|unidades)?(?:\s|$))/i,
    );

    if (numericMatch) {
        const value = Number(numericMatch[1].replace(",", "."));
        return Number.isFinite(value) && value > 0 ? value : null;
    }

    const words = normalizeText(message).split(" ");

    for (const word of words) {
        if (numberWords[word]) {
            return numberWords[word];
        }
    }

    return null;
}

const QUANTITY_UNIT_LOOKAHEAD =
    "(?=\\s*(?:kg|g|ml|l|un|und|unidade|unidades)?(?:\\s|$))";

function withoutDates(message: string): string {
    return message
        .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
        .replace(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/g, " ")
        .replace(/(?:^|\D)\d{8}(?:\D|$)/g, " ");
}

/**
 * A quantidade informada é zero ("0", "0 kg", "zero kg")? Só vale quando a
 * mensagem não traz nenhuma quantidade positiva, para não confundir produtos
 * como "refrigerante zero" ou "leite zero lactose".
 */
export function hasZeroQuantity(message: string): boolean {
    if (extractPositiveNumber(message) !== null) {
        return false;
    }

    const numeric = new RegExp(
        `(?:^|\\s)(\\d+(?:[.,]\\d+)?)${QUANTITY_UNIT_LOOKAHEAD}`,
        "gi",
    );
    for (const match of withoutDates(message).matchAll(numeric)) {
        if (Number(match[1].replace(",", ".")) === 0) {
            return true;
        }
    }

    const text = normalizeText(message);
    return (
        text === "zero" ||
        /\bzero\s+(?:kg|g|ml|l|un|und|unidades?|litros?|quilos?|gramas?)\b/.test(
            text,
        )
    );
}

/** O valor aparece, como número ou por extenso, na mensagem do usuário? */
export function quantityMentionedInMessage(
    value: number,
    message: string,
): boolean {
    if (!Number.isFinite(value) || value <= 0) {
        return false;
    }

    const same = (candidate: number) => Math.abs(candidate - value) < 1e-9;
    const cleaned = withoutDates(message);

    for (const match of cleaned.matchAll(/\d+(?:[.,]\d+)?/g)) {
        if (same(Number(match[0].replace(",", ".")))) {
            return true;
        }
    }

    const words = normalizeText(cleaned).split(" ");
    return words.some(
        (word) =>
            (word in numberWords && same(numberWords[word])) ||
            ((word === "meio" || word === "meia") && same(0.5)),
    );
}

/**
 * Define a quantidade da mensagem. Só o que o usuário escreveu vale: o valor
 * sugerido pelo modelo é aceito apenas se aparecer na mensagem, então um
 * número inventado nunca chega ao estoque.
 */
export function resolveQuantity(
    message: string,
    modelValue?: unknown,
): { quantity: number | null; zero: boolean } {
    const parsed = extractPositiveNumber(message);
    if (parsed !== null) {
        return { quantity: parsed, zero: false };
    }

    if (hasZeroQuantity(message)) {
        return { quantity: null, zero: true };
    }

    const candidate = modelValue == null ? NaN : Number(modelValue);
    if (quantityMentionedInMessage(candidate, message)) {
        return { quantity: candidate, zero: false };
    }

    return { quantity: null, zero: false };
}

export const ZERO_QUANTITY_REPLY =
    "A quantidade deve ser maior que zero. Informe uma quantidade válida.";

function toIsoDate(day: number, month: number, year: number): string | null {
    if (year < 100) {
        year += 2000;
    }

    if (
        year < 2000 ||
        year > 2200 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31
    ) {
        return null;
    }

    const date = new Date(Date.UTC(year, month - 1, day));

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayInBrazilDate(): Date {
    return new Date(`${todayInBrazilIso()}T12:00:00Z`);
}

export function parseDateInput(message: string): string | null {
    const text = message.trim();
    const normalized = normalizeText(text);

    if (/\bhoje\b/.test(normalized)) {
        return todayInBrazilIso();
    }

    if (/\bamanha\b/.test(normalized)) {
        const tomorrow = todayInBrazilDate();
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        return tomorrow.toISOString().slice(0, 10);
    }

    const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (isoMatch) {
        return toIsoDate(
            Number(isoMatch[3]),
            Number(isoMatch[2]),
            Number(isoMatch[1]),
        );
    }

    const brazilianMatch = text.match(
        /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/,
    );
    if (brazilianMatch) {
        return toIsoDate(
            Number(brazilianMatch[1]),
            Number(brazilianMatch[2]),
            Number(brazilianMatch[3]),
        );
    }

    const compactMatch = text.match(/(?:^|\D)(\d{8})(?:\D|$)/);
    if (compactMatch) {
        const compact = compactMatch[1];
        return toIsoDate(
            Number(compact.slice(0, 2)),
            Number(compact.slice(2, 4)),
            Number(compact.slice(4, 8)),
        );
    }

    return null;
}

export function formatDateBR(isoDate: string): string {
    const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
        return isoDate;
    }

    return `${match[3]}/${match[2]}/${match[1]}`;
}

export function nameAppearsInMessage(name: string, message: string): boolean {
    const normalizedName = normalizeText(name);
    const normalizedMessage = normalizeText(message);

    if (!normalizedName) {
        return false;
    }

    if (normalizedMessage.includes(normalizedName)) {
        return true;
    }

    const singular = normalizedName.endsWith("s")
        ? normalizedName.slice(0, -1)
        : normalizedName;

    return singular.length > 2 && normalizedMessage.includes(singular);
}
