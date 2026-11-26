# ERP — HRMS

Monorepo for Idara al-Khair NGO's HRMS. One self-contained stack: Django Ninja backend + Next.js 16 frontend + PostgreSQL + Redis, behind a single Nginx entry point.

## Architecture

| Service | Internal Port | Local Access |
|---|---|---|
| **Nginx** (edge, all routes) | 80 | `http://localhost` |
| **hrms-service** — Django 5 + django-ninja API | 8000 | `/api/*`, `/auth-admin/*` via nginx |
| **hrms-frontend** — Next.js 16 App Router | 3000 | `/` via nginx |
| **PostgreSQL 16** | 5432 | network-internal only |
| **Redis** (django-redis cache) | 6379 | network-internal only |

## Quick Start

```bash
# Requires Docker + Compose v2
cp .env.example .env   # then set secrets in .env

docker compose up -d --build
```

- Frontend: `http://localhost`
- API docs: `http://localhost/api/docs`
- Django admin: `http://localhost/auth-admin/`
- Health check: `http://localhost/health/`

## Layout

```
├── Backend/src/          # Django project (core, authentication, employees, permissions, audit, payroll)
├── frontend/src/         # Next.js App Router (login, employees, institutions, branches, departments, designations, organizations, profile, audit-logs, settings)
├── nginx/conf.d/         # Edge nginx → single proxy
├── config/               # JWT keys (jwt_private.pem / jwt_public.pem)
├── docker-compose.yml    # Entire stack
└── .env                  # Secrets (not committed)
```

## Dev Commands

### Backend
```bash
cd Backend/src
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
pytest            # tests (pytest-django, pytest.ini → core.settings)
```

### Frontend
```bash
cd frontend
npm run dev       # dev server on 3000
npm run build
npm run lint
```

### Docker (whole stack)
```bash
docker compose up -d --build
docker compose logs -f hrms-service
docker compose exec hrms-service python manage.py migrate
docker compose exec hrms-service python manage.py seed_permissions
```

## Key Conventions

- **API surface:** single NinjaAPI under `/api/` → `auth`, `permissions`, `employees`, `audit`. Note the employees router mounts at `/api/employees` and its internals start with `/employees`, so list path is `/api/employees/employees`.
- **Auth:** `employee_code + password` (or SuperAdmin + `UserCredentials`) → JWT access (1h) + refresh (7d). `jwt_utils.py` is the only JWT mint/verify point. Superadmins are a separate model.
- **Frontend:** all calls via `fetchWithAuth` (`frontend/src/utils/api.ts`); same-origin `/api` through nginx.
- **Soft deletes:** all models inherit `SoftDeleteModel`.
- **Docs:** `PROJECT_LOG.md` (change log), `FRONTEND_API_INTEGRATION_GUIDE.md` (per-page API contract), `authservice_architecture_report.md` (hierarchy/denormalization audit).

> Dev-only defaults: `CORS_ALLOW_ALL_ORIGINS=True`, `ALLOWED_HOSTS=['*']`. Tighten for production.