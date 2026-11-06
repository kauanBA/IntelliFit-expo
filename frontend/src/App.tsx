/*
   CONFIGURAÇÃO DAS ROTAS

   Centraliza a navegação da aplicação IntelliFit,
   organizando as páginas públicas, protegidas e administrativas.

   - ProtectedRoute: exige autenticação.
   - AdminRoute: exige autenticação e perfil ADMIN.
   - Layout: fornece a estrutura visual e a navegação.
*/

import {
    BrowserRouter,
    Routes,
    Route
} from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Foods from "./pages/Foods";
import NewFood from "./pages/NewFood";
import EditFood from "./pages/EditFood";
import Profile from "./pages/Profile";
import Recipes from "./pages/Recipes";
import RecipeDetails from "./pages/RecipeDetails";
import Chat from "./pages/Chat";
import Admin from "./pages/Admin";

import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import Layout from "./components/Layout";

function App() {

    return (
        <BrowserRouter>

            <Routes>

                {/* ROTAS PÚBLICAS */}

                <Route
                    path="/"
                    element={<Login />}
                />

                <Route
                    path="/login"
                    element={<Login />}
                />

                <Route
                    path="/register"
                    element={<Register />}
                />

                {/* ÁREA AUTENTICADA DO USUÁRIO */}

                <Route element={<ProtectedRoute />}>

                    <Route element={<Layout />}>

                        <Route
                            path="/dashboard"
                            element={<Dashboard />}
                        />

                        <Route
                            path="/foods"
                            element={<Foods />}
                        />

                        <Route
                            path="/foods/new"
                            element={<NewFood />}
                        />

                        <Route
                            path="/foods/:id/edit"
                            element={<EditFood />}
                        />

                        <Route
                            path="/profile"
                            element={<Profile />}
                        />

                        <Route
                            path="/recipes"
                            element={<Recipes />}
                        />

                        <Route
                            path="/recipes/:id"
                            element={<RecipeDetails />}
                        />

                        <Route
                            path="/chat"
                            element={<Chat />}
                        />

                    </Route>

                </Route>

                {/* ÁREA ADMINISTRATIVA */}

                <Route element={<ProtectedRoute />}>

                    <Route element={<AdminRoute />}>

                        <Route element={<Layout />}>

                            <Route
                                path="/admin"
                                element={<Admin />}
                            />

                        </Route>

                    </Route>

                </Route>

            </Routes>

        </BrowserRouter>
    );
}

export default App;