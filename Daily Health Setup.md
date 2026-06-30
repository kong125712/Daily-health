## Setup

```bash
git clone https://github.com/kong125712/Daily-health.git
cd ./Daily-health

npm install
```

Create `.env.local` in the project root (same level as `package.json`):

```bash
cat > .env.local << 'EOF'
DATABASE_URL="file:./daily-health.db"
AI_PROVIDER=gemini
OPENAI_API_KEY=
GEMINI_API_KEY=
EPICURE_MCP_URL=https://epicure-mcp.kaikaku.ai/mcp
EOF
```

Check that the file content is clean (no stray backslashes, quotes, or hidden characters from RTF editors):

```bash
cat .env.local
```

Prisma CLI does not read `.env.local` automatically — only `.env`. Symlink them so both Next.js and Prisma CLI share the same config:

```bash
ln -s .env.local .env
```

Install Prisma and generate the client:

```bash
npm uninstall prisma @prisma/client
npm uninstall @prisma/adapter-libsql @libsql/client
npm install prisma@5.22.0
npm install @prisma/client@5.22.0

npx prisma generate --schema database/schema.prisma
npx prisma migrate dev --schema database/schema.prisma
```

Start the dev server:

```bash
npm run dev
```

### Optional: expose locally via ngrok

```bash
brew install ngrok
ngrok config add-authtoken {yourauthtoken}
ngrok http 3000
```

Grab the URL from the `Forwarding` line in ngrok's output.
