import { Request, Response, NextFunction } from "express";
import { AdminService } from "../services/admin.service";

export class AdminController {

    private adminService = new AdminService();

    // Retorna a lista de usuários para a área administrativa.
    public getUsers = async (
        _req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {

        try {
            const users = await this.adminService.getUsers();

            res.status(200).json(users);

        } catch (error) {
            next(error);
        }
    };
}