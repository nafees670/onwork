# Stage 1: Build
FROM python:3.11-slim AS builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install --timeout 1000 --retries 10 --upgrade pip
RUN --mount=type=cache,target=/root/.cache/pip pip install --timeout 1000 --retries 10 --prefix=/install -r requirements.txt

# Stage 2: Production
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONPATH="/app"

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    postgresql-client \
    curl \
    libreoffice \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local
COPY src/ .

# Create a non-root user with a real, writable home directory (avoids
# HOME=/nonexistent, which breaks anything that writes config/cache there —
# e.g. LibreOffice's headless conversion in hr_policy/services.py)
RUN adduser --system --group --home /home/django django
RUN mkdir -p /home/django && chown -R django:django /home/django /app
USER django

EXPOSE 8000

# Collect static, run migrations, and start Gunicorn.
# --timeout 60 (default is 30s): employee-creation synchronously sends a
# welcome email over SMTP after the DB transaction commits — a slow/second
# SMTP handshake (e.g. two recipients) can otherwise trip Gunicorn's default
# worker timeout and kill the request mid-response.
CMD ["sh", "-c", "python manage.py collectstatic --noinput && python manage.py migrate --fake-initial && python manage.py seed_permissions && gunicorn --bind 0.0.0.0:8000 --workers 3 --timeout 60 --access-logfile - --error-logfile - core.wsgi:application"]
