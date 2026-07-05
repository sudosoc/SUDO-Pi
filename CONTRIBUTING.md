# Contributing to SUDO-Pi

## Development Setup

### Requirements
- Python 3.12+
- Node.js 20+
- A Raspberry Pi (or any Linux machine) for full feature testing

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env
# Edit .env — set SECRET_KEY, adjust interface names for your dev machine

# Run the development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev    # Vite dev server on :5173, proxies /api to :8000
```

### Running tests

```bash
# Backend unit tests
cd backend
pytest tests/ -v

# Backend with coverage
pytest tests/ --cov=app --cov-report=html

# Frontend type check
cd frontend
npx tsc --noEmit

# Frontend lint
npx eslint src/
```

## Project Structure

```
backend/
├── app/
│   ├── api/v1/          # FastAPI routers
│   ├── core/            # config, database, security, dependencies
│   ├── models/          # SQLAlchemy ORM models
│   ├── repositories/    # Data access layer
│   ├── services/        # Business logic
│   └── websockets/      # WebSocket handlers
├── tests/
└── requirements.txt

frontend/
├── src/
│   ├── api/             # Axios client
│   ├── components/      # Reusable UI components
│   ├── hooks/           # Custom React hooks
│   ├── pages/           # Route-level page components
│   ├── stores/          # Zustand stores
│   └── types/           # TypeScript type definitions
└── package.json

configs/                 # Service configuration templates
scripts/                 # internet-sharing helper
```

## Code Style

**Backend:**
- Follow PEP 8. Format with `black`, lint with `ruff`.
- Every service function must have a `loguru` log statement at DEBUG level on the happy path and WARNING/ERROR on failure.
- All subprocess calls: list arguments only, never `shell=True` with user input.
- New service endpoints must add an entry to the audit log via `audit_log()`.

**Frontend:**
- TypeScript strict mode — no `any` unless unavoidable, document why if used.
- Prefer `const` functions for components.
- All API calls go through `@/api/client.ts` — never raw `fetch`.
- New pages must be lazy-loaded in `App.tsx`.
- New routes that require specific roles must use `AdminRoute` or a role-check wrapper.

## Adding a Feature

1. **Backend:** Add a Pydantic schema → repository method → service function → API router endpoint. Wire the router into `app/main.py`.
2. **Frontend:** Add the page component → lazy import in `App.tsx` → route in router → link in `Sidebar.tsx`.
3. **Tests:** Add at least one happy-path and one error-path test for new service functions.
4. **Docs:** Update `API.md` with new endpoints and `CHANGELOG.md` with the feature.

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes following the code style above
4. Run tests and ensure they pass
5. Commit with a descriptive message
6. Open a pull request against `main`

## Security Issues

Do not open public issues for security vulnerabilities. See [SECURITY.md](SECURITY.md) for the disclosure process.
