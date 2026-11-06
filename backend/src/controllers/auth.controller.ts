
import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AuthService } from "../services/auth.service";

export class AuthController {
    private authService: AuthService;

    constructor() {
        this.authService = new AuthService();
    }

    public register = async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const { name, email, password } = req.body;

            const user = await this.authService.register(
                name,
                email,
                password
            );

            res.status(201).json(user);
        } catch (error) {
            next(error);
        }
    };

    public getCurrentUser = async (
        req: AuthRequest,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            if (!req.userId) {
                throw new Error("Usuário não autenticado.");
            }

            const user =
                await this.authService.getCurrentUser(req.userId);

            res.json(user);
        } catch (error) {
            next(error);
        }
    };

    public login = async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const { email, password } = req.body;

            const result = await this.authService.login(
                email,
                password
            );

            res.json(result);
        } catch (error) {
            next(error);
        }
    };

    // Altera a senha do usuário autenticado.
    public changePassword = async (
        req: AuthRequest,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            if (!req.userId) {
                throw new Error("Usuário não autenticado.");
            }

            const { currentPassword, newPassword } = req.body;

            await this.authService.changePassword(
                req.userId,
                currentPassword,
                newPassword
            );

            res.status(200).json({
                message: "Senha alterada com sucesso."
            });
        } catch (error) {
            next(error);
        }
    };
}
