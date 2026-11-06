
/*
   SERVIÇO DE AUTENTICAÇÃO

   Centraliza as requisições relacionadas à autenticação e
   ao gerenciamento dos dados do usuário.

   - login: autentica um usuário e recebe seu token JWT.
   - register: cadastra um novo usuário.
   - getCurrentUser: consulta os dados do usuário autenticado.
   - changePassword: altera a senha do usuário autenticado.

   Este serviço é responsável pela comunicação entre o
   frontend e os endpoints de autenticação da API.
*/

import API_URL from "./api";

interface LoginData {
    email: string;
    password: string;
}

interface LoginResponse {
    user: {
        id: number;
        name: string;
        email: string;
        role: string;
    };
    token: string;
}

/*
   Realiza a autenticação do usuário através da API.
*/

export async function login(
    data: LoginData
): Promise<LoginResponse> {

    const response = await fetch(
        `${API_URL}/api/auth/login`,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(data)
        }
    );

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result.error || "Erro ao realizar login."
        );
    }

    return result;
}

export interface RegisterData {
    name: string;
    email: string;
    password: string;
}

/*
   Realiza o cadastro de um novo usuário através da API.
*/

export async function register(
    data: RegisterData
) {

    const response = await fetch(
        `${API_URL}/api/auth/register`,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(data)
        }
    );

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result.error ||
            "Erro ao realizar cadastro."
        );
    }

    return result;
}

export interface CurrentUser {
    id: number;
    name: string;
    email: string;
    role: string;
}

/*
   Busca os dados do usuário atualmente autenticado.
*/

export async function getCurrentUser(): Promise<CurrentUser> {

    const token = localStorage.getItem("token");

    const response = await fetch(
        `${API_URL}/api/auth/me`,
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
            "Erro ao buscar dados do usuário."
        );
    }

    return result;
}

interface ChangePasswordData {
    currentPassword: string;
    newPassword: string;
}

/*
   Altera a senha do usuário autenticado.

   Envia a senha atual e a nova senha para a API,
   utilizando o token JWT armazenado no navegador.

   Em caso de erro, lança a mensagem retornada pelo backend.
*/

export async function changePassword(
    data: ChangePasswordData
): Promise<{ message: string }> {

    const token = localStorage.getItem("token");

    if (!token) {
        throw new Error(
            "Sua sessão expirou. Faça login novamente."
        );
    }

    const response = await fetch(
        `${API_URL}/api/auth/change-password`,
        {
            method: "PUT",

            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },

            body: JSON.stringify(data)
        }
    );

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result.error ||
            "Erro ao alterar senha."
        );
    }

    return result;
}
