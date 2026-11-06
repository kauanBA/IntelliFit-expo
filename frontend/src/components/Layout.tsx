/*
   LAYOUT PRINCIPAL

   Define a estrutura visual e a navegação das áreas
   autenticadas do IntelliFit.

   - ADMIN: acessa as funcionalidades administrativas.
   - USER: acessa as funcionalidades de gerenciamento
     da despensa e recursos da plataforma.

   O perfil é identificado através dos dados retornados
   pelo serviço de autenticação.
*/

import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { getCurrentUser, type CurrentUser } from "../services/authService";

function Layout() {

    const [user, setUser] = useState<CurrentUser | null>(null);

    const navigate = useNavigate();

    // Recupera os dados do usuário autenticado.
    useEffect(() => {

        async function loadUser() {

            try {

                const currentUser = await getCurrentUser();

                setUser(currentUser);

            } catch (error) {

                console.error(
                    "Erro ao carregar usuário:",
                    error
                );

                localStorage.removeItem("token");

                navigate("/login", { replace: true });
            }
        }

        loadUser();

    }, [navigate]);

    // Encerra a sessão do usuário.
    function handleLogout() {

        localStorage.removeItem("token");

        navigate("/login", { replace: true });
    }

    // Aguarda a identificação do perfil antes de renderizar o menu.
    if (!user) {
        return <p>Carregando IntelliFit...</p>;
    }

    const isAdmin = user.role === "ADMIN";

    return (

        <div className="app-layout">

            <aside className="sidebar">

                <h1 className="logo">
                    IntelliFit
                </h1>

                <nav>

                    {isAdmin ? (

                        <>
                            {/* NAVEGAÇÃO ADMINISTRATIVA */}

                            <NavLink
                                to="/admin"
                                end
                                className={({ isActive }) =>
                                    isActive
                                        ? "nav-link active"
                                        : "nav-link"
                                }
                            >
                                Painel Administrativo
                            </NavLink>

                        </>

                    ) : (

                        <>
                            {/* NAVEGAÇÃO DO USUÁRIO */}

                            <NavLink
                                to="/dashboard"
                                className={({ isActive }) =>
                                    isActive
                                        ? "nav-link active"
                                        : "nav-link"
                                }
                            >
                                Dashboard
                            </NavLink>

                            <NavLink
                                to="/foods"
                                className={({ isActive }) =>
                                    isActive
                                        ? "nav-link active"
                                        : "nav-link"
                                }
                            >
                                Alimentos
                            </NavLink>

                            <NavLink
                                to="/recipes"
                                className={({ isActive }) =>
                                    isActive
                                        ? "nav-link active"
                                        : "nav-link"
                                }
                            >
                                Receitas
                            </NavLink>

                            <NavLink
                                to="/chat"
                                className={({ isActive }) =>
                                    isActive
                                        ? "nav-link active"
                                        : "nav-link"
                                }
                            >
                                Chat
                            </NavLink>

                            <NavLink
                                to="/profile"
                                className={({ isActive }) =>
                                    isActive
                                        ? "nav-link active"
                                        : "nav-link"
                                }
                            >
                                Perfil
                            </NavLink>

                        </>

                    )}

                </nav>

                <button
                    className="logout-button"
                    onClick={handleLogout}
                >
                    Sair
                </button>

            </aside>

            <main className="main-content">

                <Outlet />

            </main>

        </div>
    );
}

export default Layout;