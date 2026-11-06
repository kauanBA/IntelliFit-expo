import { UserRepository } from "../repositories/user.repository";

export class AdminService {

    private userRepository = new UserRepository();

    // Retorna a lista de usuários cadastrados na plataforma.
    public async getUsers() {
        return await this.userRepository.findAll();
    }
}