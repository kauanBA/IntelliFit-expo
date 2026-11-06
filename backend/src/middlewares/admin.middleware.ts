import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";

export const adminMiddleware = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void => {

    if (req.role !== "ADMIN") {
        res.status(403).json({
            error: "Acesso permitido apenas para administradores."
        });
        return;
    }

    next();
};