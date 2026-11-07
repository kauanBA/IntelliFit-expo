import fs from "fs";
import path from "path";
import { pool } from "../config/database";

async function main() {
    const migrations = [
        "migration-ai-chat.sql",
        "migration-standard-units.sql",
        "migration-quantity-precision.sql",
    ];

    try {
        for (const file of migrations) {
            const sql = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
            await pool.query(sql);
        }
        console.log("Migração do chatbot aplicada/verificada com sucesso.");
    } finally {
        await pool.end();
    }
}

main().catch((error) => {
    console.error("Erro ao aplicar a migração do chatbot:", error);
    process.exit(1);
});
