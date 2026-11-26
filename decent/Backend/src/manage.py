#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv


def main():
    """Run administrative tasks."""
    # Inside Docker, /app *is* Backend/src (bind-mounted) and env vars already
    # come from docker-compose's env_file — the host-relative .env lookup and
    # the erp_postgres->localhost rewrite (for running manage.py bare on the
    # host) don't apply and parents[2] would walk past the filesystem root.
    if not Path('/.dockerenv').exists():
        project_root = Path(__file__).resolve().parents[2]
        load_dotenv(project_root / '.env')
        for variable in ('AUTH_DATABASE_URL', 'DATABASE_URL'):
            value = os.environ.get(variable)
            if value:
                os.environ[variable] = value.replace('@erp_postgres:', '@localhost:')
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
