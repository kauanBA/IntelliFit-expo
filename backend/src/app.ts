import express from "express";
import foodRoutes from "./routes/food.routes";
import { errorMiddleware } from "./middlewares/error.middleware";
import authRoutes from "./routes/auth.routes";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import recipeRoutes from "./routes/recipe.routes";
import adminRoutes from "./routes/admin.routes";
import cors from "cors";
import chatRoutes from "./routes/chat.routes";

const app = express();

// Configurações gerais da aplicação.
app.use(cors());
app.use(express.json());

app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec)
);

app.get("/", (_req, res) => {
    res.json({
        message: "API IntelliFit funcionando!",
        version: "1.0.0"
    });
});

app.use("/api/foods", foodRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);

// Middleware global para tratamento de erros.
app.use(errorMiddleware);

export default app;