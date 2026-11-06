
import bcrypt from "bcrypt";
import { UserRepository } from "../repositories/user.repository";
import jwt from "jsonwebtoken";

export class AuthService {
    private userRepository: UserRepository;

    constructor() {
        this.userRepository = new UserRepository();
    }

    public async register(
        name: string,
        email: string,
        password: string
    ) {
        if (!name || !email || !password) {
            throw new Error(
                "Nome, e-mail e senha são obrigatórios."
            );
        }

        if (password.length < 6) {
            throw new Error(
                "A senha deve possuir pelo menos 6 caracteres."
            );
        }

        const existingUser = await this.userRepository.findByEmail(email);

        if (existingUser) {
            throw new Error("E-mail já cadastrado.");
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await this.userRepository.create(
            name,
            email,
            hashedPassword
        );

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        };
    }

    public async getCurrentUser(userId: number) {
        const user = await this.userRepository.findById(userId);

        if (!user) {
            throw new Error("Usuário não encontrado.");
        }

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        };
    }

    public async login(email: string, password: string) {
        if (!email || !password) {
            throw new Error("E-mail e senha são obrigatórios.");
        }

        const user = await this.userRepository.findByEmail(email);

        if (!user) {
            throw new Error("E-mail ou senha inválidos.");
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            throw new Error("E-mail ou senha inválidos.");
        }

        const token = jwt.sign(
            {
                userId: user.id,
                role: user.role
            },
            process.env.JWT_SECRET as string,
            {
                expiresIn: "1d"
            }
        );

        return {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            },
            token
        };
    }

    // Altera a senha do usuário autenticado.
    public async changePassword(
        userId: number,
        currentPassword: string,
        newPassword: string
    ): Promise<void> {

        if (!currentPassword || !newPassword) {
            throw new Error(
                "A senha atual e a nova senha são obrigatórias."
            );
        }

        if (newPassword.length < 8) {
            throw new Error(
                "A nova senha deve possuir pelo menos 8 caracteres."
            );
        }

        const user = await this.userRepository.findById(userId);

        if (!user) {
            throw new Error("Usuário não encontrado.");
        }

        const currentPasswordMatch = await bcrypt.compare(
            currentPassword,
            user.password
        );

        if (!currentPasswordMatch) {
            throw new Error("A senha atual está incorreta.");
        }

        const samePassword = await bcrypt.compare(
            newPassword,
            user.password
        );

        if (samePassword) {
            throw new Error(
                "A nova senha deve ser diferente da senha atual."
            );
        }

        const hashedPassword = await bcrypt.hash(
            newPassword,
            10
        );

        await this.userRepository.updatePassword(
            userId,
            hashedPassword
        );
    }
}
