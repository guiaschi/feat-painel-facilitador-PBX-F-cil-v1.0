# 🖥️ Painel Facilitador — PBX Fácil

Painel de gerenciamento centralizado para múltiplas instâncias FreePBX hospedadas em `pbxfacil.com.br`.

## 📋 Funcionalidades

- **Login seguro** com JWT por instância PBX
- **Monitoramento em tempo real** — ramais, filas, troncos (registries), peers SIP
- **Gestão de Ramais** — listar, criar, editar, deletar
- **Gestão de Filas** — listar, criar, editar, deletar
- **Entrada de Ligações (DIDs)** — listar, criar, editar, deletar
- **IP Externo do servidor** PBX exibido no painel
- **SLA automático** nas filas
- **Responsivo** — funciona em desktop e celular

---

## 🏗️ Estrutura do Projeto

```
Pabx2.0/
├── backend/          # Node.js + Express + Puppeteer (API)
│   ├── index.js      # Rotas e middleware
│   ├── puppeteer-service.js  # Scrapers FreePBX
│   ├── .env.example  # Template de variáveis de ambiente
│   └── package.json
└── frontend/         # React + Vite (Interface)
    ├── src/
    │   ├── App.jsx
    │   ├── components/
    │   └── index.css
    └── package.json
```

---

## 🚀 Instalação Local

### Pré-requisitos
- Node.js 18+
- npm 9+

### 1. Clone o repositório
```bash
git clone https://github.com/SEU_USUARIO/SEU_REPO.git
cd SEU_REPO
```

### 2. Backend
```bash
cd backend
cp .env.example .env
# Edite o .env com seu JWT_SECRET seguro
npm install
npm start
```
O backend inicia na porta `5000`.

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
O frontend abre em `http://localhost:5173`.

---

## 🌐 Instâncias Suportadas

| Instância    | URL                                        |
|--------------|--------------------------------------------|
| smart        | https://smart.pbxfacil.com.br              |
| bigfibras    | https://bigfibras.pbxfacil.com.br          |
| imbranet     | https://imbranet.pbxfacil.com.br           |
| ellofibra    | https://ellofibra.pbxfacil.com.br          |
| izitelecom   | https://izitelecom.pbxfacil.com.br         |

---

## 🔐 Segurança

- As senhas **nunca** são armazenadas permanentemente — apenas o cookie de sessão do FreePBX é salvo no JWT por sessão
- O arquivo `.env` com `JWT_SECRET` **não deve** ser commitado no repositório
- Use um `JWT_SECRET` forte e aleatório em produção

---

## 🛠️ Deploy em Produção

### Backend (Sugestão: Railway, Render, ou VPS)
1. Configure as variáveis de ambiente no painel do host
2. Use `npm start` como comando de inicialização

### Frontend (Sugestão: Vercel, Netlify)
1. Configure `VITE_API_URL` apontando para a URL do backend
2. Execute `npm run build` — os arquivos ficam em `frontend/dist/`

---

## 📦 Tecnologias

- **Backend**: Node.js, Express, Puppeteer, JWT
- **Frontend**: React 19, Vite 8, CSS puro (glassmorphism)
