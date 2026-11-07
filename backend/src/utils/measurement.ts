// Únicas unidades aceitas no estoque. Embalagens (caixa, pacote, lata,
// garrafa) NÃO são unidades: não dá para dar baixa de "1 L" em "8 caixas".
export const CANONICAL_UNITS = [
    "un",
    "g",
    "kg",
    "ml",
    "L"
] as const;

export type CanonicalUnit = typeof CANONICAL_UNITS[number];
export type UnitDimension = "count" | "mass" | "volume";

function normalizeText(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .trim();
}

const UNIT_ALIASES: Record<string, CanonicalUnit> = {
    un: "un",
    und: "un",
    unidade: "un",
    unidades: "un",

    g: "g",
    grama: "g",
    gramas: "g",

    kg: "kg",
    quilo: "kg",
    quilos: "kg",
    quilograma: "kg",
    quilogramas: "kg",

    ml: "ml",
    mililitro: "ml",
    mililitros: "ml",

    l: "L",
    litro: "L",
    litros: "L"
};

// Palavras de embalagem: o chatbot as reconhece apenas para pedir ao
// usuário que informe a quantidade em uma das unidades padronizadas.
const PACKAGING_WORDS = new Set([
    "caixa",
    "caixas",
    "pacote",
    "pacotes",
    "pct",
    "lata",
    "latas",
    "garrafa",
    "garrafas",
    "duzia",
    "duzias"
]);

export function mentionsPackaging(text: string | null | undefined): boolean {
    if (!text) {
        return false;
    }

    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .some((word) => PACKAGING_WORDS.has(word));
}

export function normalizeMeasurementUnit(
    value: string | null | undefined
): CanonicalUnit | null {
    if (!value) {
        return null;
    }

    return UNIT_ALIASES[normalizeText(value)] ?? null;
}

export function getUnitDimension(
    value: string | null | undefined
): UnitDimension | null {
    const unit = normalizeMeasurementUnit(value);

    if (!unit) {
        return null;
    }

    if (unit === "g" || unit === "kg") {
        return "mass";
    }

    if (unit === "ml" || unit === "L") {
        return "volume";
    }

    return "count";
}

export function unitsAreCompatible(
    fromUnit: string,
    toUnit: string
): boolean {
    const from = normalizeMeasurementUnit(fromUnit);
    const to = normalizeMeasurementUnit(toUnit);

    if (!from || !to) {
        return false;
    }

    if (from === to) {
        return true;
    }

    const fromDimension = getUnitDimension(from);
    const toDimension = getUnitDimension(to);

    // Só há conversão entre g↔kg e ml↔L. "un" só é compatível com "un".
    return (
        fromDimension === toDimension &&
        (fromDimension === "mass" || fromDimension === "volume")
    );
}

export function convertQuantity(
    quantity: number,
    fromUnit: string,
    toUnit: string
): number | null {
    if (!Number.isFinite(quantity)) {
        return null;
    }

    const from = normalizeMeasurementUnit(fromUnit);
    const to = normalizeMeasurementUnit(toUnit);

    if (!from || !to || !unitsAreCompatible(from, to)) {
        return null;
    }

    if (from === to) {
        return roundQuantity(quantity);
    }

    const massToGrams: Partial<Record<CanonicalUnit, number>> = {
        g: 1,
        kg: 1000
    };

    const volumeToMilliliters: Partial<Record<CanonicalUnit, number>> = {
        ml: 1,
        L: 1000
    };

    if (getUnitDimension(from) === "mass") {
        const base = quantity * (massToGrams[from] ?? 1);
        return roundQuantity(base / (massToGrams[to] ?? 1));
    }

    if (getUnitDimension(from) === "volume") {
        const base = quantity * (volumeToMilliliters[from] ?? 1);
        return roundQuantity(base / (volumeToMilliliters[to] ?? 1));
    }

    return null;
}

export function preferredDisplayMeasurement(
    quantity: number,
    unit: string
): { quantity: number; unit: CanonicalUnit | string } {
    const normalized = normalizeMeasurementUnit(unit);

    if (!normalized || !Number.isFinite(quantity)) {
        return { quantity, unit };
    }

    if (normalized === "kg" && Math.abs(quantity) < 1 && quantity !== 0) {
        return {
            quantity: roundQuantity(quantity * 1000),
            unit: "g"
        };
    }

    if (normalized === "L" && Math.abs(quantity) < 1 && quantity !== 0) {
        return {
            quantity: roundQuantity(quantity * 1000),
            unit: "ml"
        };
    }

    return {
        quantity: roundQuantity(quantity),
        unit: normalized
    };
}

export function roundQuantity(value: number): number {
    return Number(value.toFixed(6));
}
