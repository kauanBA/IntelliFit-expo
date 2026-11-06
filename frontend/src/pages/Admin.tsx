/*
   PAINEL ADMINISTRATIVO

   Apresenta indicadores gerais e a listagem dos usuários
   cadastrados na plataforma IntelliFit.
*/

import { useEffect, useState } from "react";

import { getAdminUsers, type AdminUser } from "../services/adminService";

function Admin() {

    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Busca os usuários cadastrados ao abrir o painel.
    useEffect(() => {

        async function loadUsers() {

            try {

                setLoading(true);
                setError("");

                const result = await getAdminUsers();

                setUsers(result);

            } catch (error) {

                if (error instanceof Error) {
                    setError(error.message);
                } else {
                    setError("Erro ao carregar usuários.");
                }

            } finally {
                setLoading(false);
            }
        }

        loadUsers();

    }, []);

    // Calcula os indicadores administrativos.
    const totalUsers = users.length;

    const totalAdmins = users.filter(
        user => user.role === "ADMIN"
    ).length;

    const totalCommonUsers = users.filter(
        user => user.role === "USER"
    ).length;

    return (

        <div className="admin-page">

            <header className="admin-header">

                <h1>Área Administrativa</h1>

                <p>
                    Gerencie e acompanhe os usuários
                    cadastrados no IntelliFit.
                </p>

            </header>

            {/* INDICADORES ADMINISTRATIVOS */}

            <section className="admin-stats">

                <div className="admin-stat-card">

                    <span>Total de usuários</span>

                    <strong>
                        {loading ? "..." : totalUsers}
                    </strong>

                </div>

                <div className="admin-stat-card">

                    <span>Administradores</span>

                    <strong>
                        {loading ? "..." : totalAdmins}
                    </strong>

                </div>

                <div className="admin-stat-card">

                    <span>Usuários comuns</span>

                    <strong>
                        {loading ? "..." : totalCommonUsers}
                    </strong>

                </div>

            </section>

            {/* LISTAGEM DE USUÁRIOS */}

            <section className="admin-section">

                <div className="admin-section-header">

                    <h2>Usuários cadastrados</h2>

                    <p>
                        Relação de contas registradas na plataforma.
                    </p>

                </div>

                {loading && (
                    <div className="admin-feedback">
                        Carregando usuários...
                    </div>
                )}

                {!loading && error && (
                    <div className="admin-feedback error">
                        {error}
                    </div>
                )}

                {!loading && !error && users.length === 0 && (
                    <div className="admin-feedback">
                        Nenhum usuário cadastrado.
                    </div>
                )}

                {!loading && !error && users.length > 0 && (

                    <div className="admin-table-container">

                        <table className="admin-table">

                            <thead>

                                <tr>
                                    <th>ID</th>
                                    <th>Nome</th>
                                    <th>E-mail</th>
                                    <th>Perfil</th>
                                </tr>

                            </thead>

                            <tbody>

                                {users.map(user => (

                                    <tr key={user.id}>

                                        <td>{user.id}</td>

                                        <td>{user.name}</td>

                                        <td>{user.email}</td>

                                        <td>

                                            <span
                                                className={
                                                    user.role === "ADMIN"
                                                        ? "admin-role admin"
                                                        : "admin-role user"
                                                }
                                            >
                                                {user.role}
                                            </span>

                                        </td>

                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                )}

            </section>

        </div>
    );
}

export default Admin;