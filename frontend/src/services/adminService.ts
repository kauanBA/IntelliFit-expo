/*
   SERVIÇO ADMINISTRATIVO

   Centraliza as requisições destinadas à área administrativa
   do IntelliFit.

   - getAdminUsers: consulta a lista de usuários cadastrados.

   As requisições utilizam o token JWT armazenado no navegador
   para garantir que somente administradores autorizados
   possam acessar os dados.
*/

import API_URL from "./api";

export interface AdminUser {
    id: number;
    name: string;
    email: string;
    role: string;
}

// Busca todos os usuários cadastrados na plataforma.
export async function getAdminUsers(): Promise<AdminUser[]> {

    const token = localStorage.getItem("token");

    const response = await fetch(
        `${API_URL}/api/admin/users`,
        {
            method: "GET",

            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result.error ||
            "Erro ao carregar usuários."
        );
    }

    return result;
}