import { Router } from "express";
import { AdminController } from "../controllers/admin.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";

const router = Router();

const adminController = new AdminController();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Rotas administrativas do IntelliFit
 */

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Lista todos os usuários cadastrados
 *     description: Retorna os usuários cadastrados na plataforma. Acesso exclusivo para administradores.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuários retornada com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   role:
 *                     type: string
 *                     enum: [USER, ADMIN]
 *       401:
 *         description: Token não informado ou inválido.
 *       403:
 *         description: Acesso permitido apenas para administradores.
 */
router.get(
    "/users",
    authMiddleware,
    adminMiddleware,
    adminController.getUsers
);

export default router;