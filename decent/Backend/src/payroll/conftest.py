"""
Pytest configuration for the payroll app.

Routes the test database DIRECTLY to the raw PostgreSQL (not PgBouncer) so that
Django can create/drop the test database. PgBouncer (transaction mode) cannot
create databases, which breaks `pytest`.

This rewrites the AUTH_DATABASE_URL env var at module import time (before Django
reads it during the pytest session) to point at the direct postgres host/port,
keeping the same credentials and database name. Override the target host/port
with AUTH_DATABASE_URL_TEST_HOST / AUTH_DATABASE_URL_TEST_PORT if needed.
"""
import os
import re
from urllib.parse import urlsplit, urlunsplit

_DB_URL = os.environ.get(
    'AUTH_DATABASE_URL',
    os.environ.get('DATABASE_URL', ''),
)

_TEST_HOST = os.environ.get('AUTH_DATABASE_URL_TEST_HOST', 'erp_postgres')
_TEST_PORT = os.environ.get('AUTH_DATABASE_URL_TEST_PORT', '5432')


def _rewrite_db_url(url: str) -> str:
    parts = urlsplit(url)
    netloc = parts.netloc
    if '@' in netloc:
        userinfo, host_port = netloc.rsplit('@', 1)
        host, _, _port = host_port.rpartition(':')
        if not host:
            host, _port = host_port, ''
        new_host_port = f"{host}:{_TEST_PORT}" if host else _TEST_PORT
        netloc = f"{userinfo}@{new_host_port}"
    else:
        host, _, _port = netloc.rpartition(':')
        netloc = f"{host or _TEST_HOST}:{_TEST_PORT}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


if _DB_URL:
    os.environ['AUTH_DATABASE_URL'] = _rewrite_db_url(_DB_URL)


def pytest_configure(config):
    import django
    from django.conf import settings

    settings.DATABASES['default']['HOST'] = _TEST_HOST
    settings.DATABASES['default']['PORT'] = _TEST_PORT
