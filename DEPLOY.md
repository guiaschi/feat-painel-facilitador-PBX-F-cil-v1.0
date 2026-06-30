# 📤 Como Subir o Projeto no GitHub

## Passo 1 — Criar um repositório no GitHub

1. Acesse [github.com](https://github.com) e faça login
2. Clique em **"New repository"** (botão verde no canto superior direito)
3. Defina:
   - **Repository name:** `pabx-facilitador` (ou o nome que preferir)
   - **Visibility:** Private (recomendado, pois contém credenciais)
   - ✅ Não marque "Add a README file" (já temos um)
4. Clique em **"Create repository"**

---

## Passo 2 — Fazer upload dos arquivos

Abra o **PowerShell** ou **Terminal** na pasta do projeto:

```powershell
# Navegue até a pasta do projeto
cd "C:\Users\GuiAschi\Desktop\Pabx2.0"

# Inicialize o repositório git
git init

# Adicione todos os arquivos (o .gitignore vai excluir node_modules, .env, etc.)
git add .

# Faça o primeiro commit
git commit -m "feat: painel facilitador PBX Fácil v1.0"

# Adicione o repositório remoto (substitua SEU_USUARIO e SEU_REPO)
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git

# Envie o código
git push -u origin main
```

---

## Passo 3 — Instalar e rodar em outro computador

```bash
# Clone o repositório
git clone https://github.com/SEU_USUARIO/SEU_REPO.git
cd SEU_REPO

# Backend
cd backend
cp .env.example .env
# Edite o .env com seu JWT_SECRET
npm install
npm start

# Frontend (em outro terminal)
cd frontend
cp .env.example .env
# O VITE_API_URL já está configurado para localhost:5000
npm install
npm run dev
```

---

## ⚠️ IMPORTANTE — Arquivos que NÃO vão para o GitHub

O `.gitignore` já está configurado para excluir:
- `node_modules/` — instalado via `npm install`
- `.env` — contém segredos, não compartilhe!
- Screenshots de debug (`*.png`, `error_*.html`)
- `cookies.json` — dados de sessão temporários

---

## 🔐 Segurança

- O arquivo `.env` real **nunca** deve ir para o GitHub
- Use o `.env.example` como template
- Em produção, configure `JWT_SECRET` com uma chave aleatória longa:
  ```bash
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```
