
import { useEffect, useState } from "react";

import {
    getCurrentUser,
    changePassword,
    type CurrentUser
} from "../services/authService";

function Profile() {

    const [user, setUser] =
        useState<CurrentUser | null>(null);

    const [error, setError] =
        useState("");

    const [success, setSuccess] =
        useState("");

    const [isChangingPassword, setIsChangingPassword] =
        useState(false);

    const [showPasswordForm, setShowPasswordForm] =
        useState(false);

    const [currentPassword, setCurrentPassword] =
        useState("");

    const [newPassword, setNewPassword] =
        useState("");

    const [confirmPassword, setConfirmPassword] =
        useState("");

    useEffect(() => {

        async function loadUser() {

            try {

                const currentUser =
                    await getCurrentUser();

                setUser(currentUser);

            } catch (error) {

                if (error instanceof Error) {
                    setError(error.message);
                } else {
                    setError(
                        "Erro ao carregar dados do usuário."
                    );
                }
            }
        }

        loadUser();

    }, []);

    // Abre ou fecha o formulário de alteração de senha.
    function togglePasswordForm() {

        if (isChangingPassword) {
            return;
        }

        setShowPasswordForm(!showPasswordForm);

        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");

        setError("");
        setSuccess("");
    }

    // Envia a solicitação de alteração de senha ao backend.
    async function handlePasswordSubmit(
        event: React.FormEvent<HTMLFormElement>
    ) {

        event.preventDefault();

        setError("");
        setSuccess("");

        if (newPassword !== confirmPassword) {
            setError(
                "A confirmação da nova senha não corresponde."
            );
            return;
        }

        if (newPassword.length < 8) {
            setError(
                "A nova senha deve ter pelo menos 8 caracteres."
            );
            return;
        }

        if (currentPassword === newPassword) {
            setError(
                "A nova senha deve ser diferente da senha atual."
            );
            return;
        }

        try {

            setIsChangingPassword(true);

            const result = await changePassword({
                currentPassword,
                newPassword
            });

            setSuccess(
                result.message || "Senha alterada com sucesso."
            );

            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");

            setShowPasswordForm(false);

        } catch (error) {

            if (error instanceof Error) {
                setError(error.message);
            } else {
                setError("Erro ao alterar senha.");
            }

        } finally {

            setIsChangingPassword(false);

        }
    }

    return (
        <div className="page-container">

            <div className="page-header">
                <div>
                    <h1>Meu perfil</h1>

                    <p className="page-description">
                        Visualize e gerencie as informações
                        da sua conta.
                    </p>
                </div>
            </div>

            {error && (
                <p className="form-error">
                    {error}
                </p>
            )}

            {success && (
                <p className="form-success">
                    {success}
                </p>
            )}

            <div className="profile-card">

                <div className="profile-section">

                    <div className="section-header">
                        <h2>
                            Informações pessoais
                        </h2>

                        <p>
                            Dados associados à sua conta.
                        </p>
                    </div>

                    <div className="profile-info">

                        <div className="profile-field">
                            <span className="profile-label">
                                Nome
                            </span>

                            <span className="profile-value">
                                {user?.name || "Carregando..."}
                            </span>
                        </div>

                        <div className="profile-field">
                            <span className="profile-label">
                                E-mail
                            </span>

                            <span className="profile-value">
                                {user?.email || "Carregando..."}
                            </span>
                        </div>

                    </div>

                </div>

                <div className="profile-section">

                    <div className="section-header">
                        <h2>
                            Conta
                        </h2>

                        <p>
                            Configurações relacionadas à sua conta.
                        </p>
                    </div>

                    <div className="profile-actions">

                        <button
                            type="button"
                            className="button-secondary"
                            onClick={togglePasswordForm}
                            disabled={isChangingPassword}
                        >
                            {showPasswordForm
                                ? "Cancelar"
                                : "Alterar senha"}
                        </button>

                    </div>

                    {showPasswordForm && (

                        <form
                            className="form-card"
                            onSubmit={handlePasswordSubmit}
                        >

                            <h3>Alterar senha</h3>

                            <div className="form-group">

                                <label htmlFor="currentPassword">
                                    Senha atual
                                </label>

                                <input
                                    id="currentPassword"
                                    type="password"
                                    value={currentPassword}
                                    onChange={(event) =>
                                        setCurrentPassword(event.target.value)
                                    }
                                    autoComplete="current-password"
                                    required
                                    disabled={isChangingPassword}
                                />

                            </div>

                            <div className="form-group">

                                <label htmlFor="newPassword">
                                    Nova senha
                                </label>

                                <input
                                    id="newPassword"
                                    type="password"
                                    value={newPassword}
                                    onChange={(event) =>
                                        setNewPassword(event.target.value)
                                    }
                                    autoComplete="new-password"
                                    minLength={8}
                                    required
                                    disabled={isChangingPassword}
                                />

                            </div>

                            <div className="form-group">

                                <label htmlFor="confirmPassword">
                                    Confirmar nova senha
                                </label>

                                <input
                                    id="confirmPassword"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(event) =>
                                        setConfirmPassword(event.target.value)
                                    }
                                    autoComplete="new-password"
                                    minLength={8}
                                    required
                                    disabled={isChangingPassword}
                                />

                            </div>

                            <div className="form-actions">

                                <button
                                    type="submit"
                                    disabled={isChangingPassword}
                                >
                                    {isChangingPassword
                                        ? "Alterando senha..."
                                        : "Salvar nova senha"}
                                </button>

                            </div>

                        </form>

                    )}

                </div>

            </div>

        </div>
    );
}

export default Profile;
