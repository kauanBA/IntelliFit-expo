/*
   PROTEÇÃO DAS ROTAS ADMINISTRATIVAS

   Verifica se o usuário está autenticado e se possui
   o perfil ADMIN antes de permitir o acesso à área
   administrativa.

   - getCurrentUser: consulta os dados do usuário na API.
   - ADMIN: permite o acesso ao painel administrativo.
   - USER: redireciona para o dashboard do usuário.
*/

import { useEffect, useState } from "react";
import { Navigate, Outlet, Link } from "react-router-dom";

import { getCurrentUser } from "../services/authService";

function AdminRoute() {

    const [status, setStatus] = useState<
        "loading" | "authorized" | "forbidden" | "error"
    >("loading");

    useEffect(() => {

        let active = true;

        async function verifyAdmin() {

            try {

                const user = await getCurrentUser();

                if (!active) return;

                if (user.role === "ADMIN") {
                    setStatus("authorized");
                } else {
                    setStatus("forbidden");
                }

            } catch (error) {

                console.error(
                    "Erro ao verificar permissão administrativa:",
                    error
                );

                if (active) {
                    setStatus("error");
                }
            }
        }

        verifyAdmin();

        return () => {
            active = false;
        };

    }, []);

    if (!localStorage.getItem("token")) {
        return <Navigate to="/login" replace />;
    }

    if (status === "loading") {
        return <p>Verificando permissões...</p>;
    }

    if (status === "forbidden") {
        return <Navigate to="/dashboard" replace />;
    }

    if (status === "error") {
        return (
            <div>
                <h2>Não foi possível verificar seu acesso.</h2>
                <p>
                    Verifique sua conexão com o servidor
                    e tente novamente.
                </p>
                <Link to="/dashboard">
                    Voltar ao dashboard
                </Link>
            </div>
        );
    }

    return <Outlet />;
}

export default AdminRoute;