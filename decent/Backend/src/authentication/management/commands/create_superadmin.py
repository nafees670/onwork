"""
Create a superadmin that can log into both Django admin and the app frontend.

Django's built-in `createsuperuser` only creates an auth user for the admin panel.
The app JWT login (`/api/auth/login`) uses the separate `SuperAdmin` model plus
`UserCredentials`. This command creates all three records in one step.

Usage:
    python manage.py create_superadmin --username areeba --email a@b.com --password MyP@ssw0rd
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from authentication.superadmin_models import SuperAdmin
from authentication.models import UserCredentials


class Command(BaseCommand):
    help = "Create a superadmin that can log into Django admin and the app frontend"

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True, help="Login username (also used as superadmin code)")
        parser.add_argument("--email", required=True, help="Email address")
        parser.add_argument("--password", required=True, help="Password for both Django admin and app login")
        parser.add_argument("--full-name", default="", help="Full name (defaults to username)")

    def handle(self, *args, **options):
        User = get_user_model()
        username = options["username"].strip()
        email = options["email"].strip().lower()
        password = options["password"]
        full_name = options["full_name"].strip() or username

        if len(password) < 8:
            raise CommandError("Password must be at least 8 characters long.")

        with transaction.atomic():
            if User.objects.filter(username__iexact=username).exists():
                raise CommandError(f"A user with username '{username}' already exists.")
            if User.objects.filter(email__iexact=email).exists():
                raise CommandError(f"A user with email '{email}' already exists.")
            if SuperAdmin.objects.filter(email__iexact=email).exists():
                raise CommandError(f"A SuperAdmin with email '{email}' already exists.")

            django_user = User.objects.create_superuser(
                username=username,
                email=email,
                password=password,
            )

            superadmin, _ = SuperAdmin.objects.get_or_create(
                email=email,
                defaults={
                    "superadmin_code": username.upper(),
                    "full_name": full_name,
                    "is_active": True,
                }
            )
            if full_name and superadmin.full_name != full_name:
                superadmin.full_name = full_name
                superadmin.save()

            credentials = UserCredentials.objects.filter(superadmin=superadmin, is_deleted=False).first()
            if not credentials:
                credentials = UserCredentials.objects.create(superadmin=superadmin)
            credentials.set_password(password)
            credentials.save()

        self.stdout.write(
            self.style.SUCCESS(
                f"SuperAdmin '{username}' created successfully. "
                f"Log in with code '{username.upper()}' and the provided password."
            )
        )
