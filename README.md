# IntelliFit

Aplicação web para organização e gerenciamento doméstico de alimentos. Permite controlar o estoque e a validade, receber recomendações de receitas com base no que está disponível e usar um assistente conversacional para consultar e atualizar o estoque.

## Funcionalidades

- Cadastro, edição e remoção de alimentos, com quantidade, unidade, local de armazenamento e validade.
- Identificação de alimentos vencidos e próximos do vencimento.
- Recomendação de receitas a partir do estoque.
- Assistente integrado à OpenAI que entende linguagem natural para consultar e atualizar o estoque.
- Autenticação com JWT e perfis `USER` e `ADMIN`.
- Área administrativa com listagem de usuários.
- API documentada com Swagger.

## Tecnologias

- **Frontend:** React, TypeScript, Vite, React Router
- **Backend:** Node.js, TypeScript, Express, PostgreSQL, JWT, Swagger
- **Integrações:** OpenAI API e TheMealDB

## Recomendação de receitas

Recomendador próprio em TypeScript. As receitas são buscadas na TheMealDB e comparadas ao estoque com **TF-IDF** e **similaridade do cosseno**, selecionando os **k vizinhos mais próximos**. Os nomes e detalhes das receitas são traduzidos para pt-BR.

## Estrutura

```text
IntelliFit/
├── backend/
│   ├── src/
│   │   ├── chat/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── interfaces/
│   │   ├── middlewares/
│   │   ├── ml/
│   │   ├── repositories/
│   │   ├── routes/
│   │   ├── scripts/
│   │   ├── services/
│   │   └── utils/
│   ├── tests/
│   ├── database.sql
│   └── migration-*.sql
└── frontend/
    ├── public/
    └── src/
        ├── assets/
        ├── components/
        ├── pages/
        ├── services/
        ├── styles/
        └── utils/
```

## Requisitos

- Node.js 22.12 ou superior
- npm
- PostgreSQL
- Chave da API da OpenAI (apenas para o assistente)

## Instalação

### 1. Banco de dados

```bash
psql -U postgres -c "CREATE DATABASE intellifit;"
psql -U postgres -d intellifit -f backend/database.sql
```

As tabelas do chat e os ajustes de unidade e precisão são aplicados automaticamente ao executar `npm run dev` no backend.

### 2. Backend

```bash
cd backend
npm ci
cp .env.example .env
```

Preencha o `.env`:

| Variável | Descrição |
| --- | --- |
| `DB_HOST` / `DB_PORT` | Endereço do PostgreSQL |
| `DB_USER` / `DB_PASSWORD` | Credenciais do PostgreSQL |
| `DB_NAME` | Nome do banco (`intellifit`) |
| `JWT_SECRET` | Chave para assinar os tokens |
| `OPENAI_API_KEY` | Chave da OpenAI (necessária para o chat) |
| `OPENAI_MODEL` | Modelo usado pelo assistente |

Inicie o servidor:

```bash
npm run dev
```

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/api-docs`

### 3. Frontend

Em outro terminal:

```bash
cd frontend
npm ci
npm run dev
```

Acesse o endereço exibido no terminal, normalmente `http://localhost:5173`. O backend deve estar ativo em `http://localhost:3000`.

## Perfil administrador

Todo usuário é criado como `USER`. Para torná-lo administrador:

```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'seu@email.com';
```

Faça login novamente para aplicar o novo perfil.

## Testes

```bash
cd backend
npm run validate:all
```

Executa a checagem de tipos e as suítes de chat, ML e receitas. Para o frontend:

```bash
cd frontend
npm run build
```