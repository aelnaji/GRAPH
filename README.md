# GRAPH — AI Knowledge Graph Platform

> An autonomous, self-modifying knowledge graph platform powered by LLMs. Ingest data, chat with your knowledge base, visualize relationships, and let AI agents continuously refine and expand the graph.

---

## ✨ Features

- **Knowledge Graph** — Nodes and edges with semantic types, confidence scores, and decay
- **AI Chat** — Chat interface that reads from and writes to the knowledge graph
- **Ingest Pipeline** — Upload documents, URLs, or raw text; agents process and embed them
- **Self-Modifying Policies** — System parameters auto-tune via a policy engine
- **Graph Visualization** — Interactive D3/force-directed graph of knowledge nodes
- **System Logs** — Full audit trail of all agent and system events
- **Multi-Provider AI** — Connect any OpenAI-compatible API (OpenRouter, NVIDIA NIM, Ollama, etc.)

---

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [PostgreSQL](https://postgresql.org) >= 14 (or Docker)
- An OpenAI-compatible API key

### 1. Clone & Install

```bash
git clone https://github.com/aelnaji/GRAPH.git
cd GRAPH
bun install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL, OPENAI_API_KEY, JWT_SECRET
```

### 3. Set Up Database

```bash
# Run migrations
bunx prisma migrate dev --name init

# (Optional) Seed with default policy configs
bunx prisma db seed
```

### 4. Run the App

```bash
bun dev
# App available at http://localhost:3000
```

### 5. Production (via Caddy)

```bash
bash start-server.sh
```

---

## 🐳 Docker (Coming Soon)

Docker Compose support is planned. For now, run PostgreSQL via Docker:

```bash
docker run -d \
  --name graph-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=graph_db \
  -p 5432:5432 \
  postgres:16-alpine
```

---

## 🔌 AI Provider Configuration

GRAPH supports any OpenAI-compatible API. Set in `.env`:

| Provider | `OPENAI_BASE_URL` | Notes |
|---|---|---|
| OpenAI | *(leave blank)* | Default |
| OpenRouter | `https://openrouter.ai/api/v1` | Access 100+ models |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | Enterprise GPU models |
| Ollama (local) | `http://localhost:11434/v1` | Self-hosted LLMs |
| LM Studio | `http://localhost:1234/v1` | Local models |

---

## 🗂️ Project Structure

```
/
├── src/               # Next.js app source
│   ├── app/           # App Router pages and API routes
│   ├── components/    # React UI components
│   └── lib/           # Shared utilities and agent logic
├── prisma/            # Database schema and migrations
├── db/                # Database helpers
├── scripts/           # Utility and maintenance scripts
├── examples/          # Example data and prompts
├── download/          # Export/download assets
├── Caddyfile          # Caddy web server config
└── start-server.sh    # Production start script
```

---

## 🛡️ Security Notes

- All API routes should be protected with `API_SECRET_KEY` in production
- Never commit `.env` — use `.env.example` as the template
- JWT tokens are required for authenticated endpoints
- See `SECURITY_REPORT.md` (coming soon) for full threat model

---

## 📋 Known Limitations

- Docker Compose not yet added
- No test suite yet (Jest/Playwright planned)
- Node deletion API not yet exposed in UI
- Pagination on `/api/logs` and `/api/query` planned

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit changes: `git commit -m 'feat: add your feature'`
4. Push and open a PR

---

## 📄 License

MIT © [Abdullah El Naji](https://github.com/aelnaji)
