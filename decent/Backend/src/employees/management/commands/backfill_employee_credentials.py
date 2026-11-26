"""
Backfill missing login credentials, employee codes, and primary assignments
for existing employees.

Run it:

    # Inside the docker-compose stack:
    docker compose exec hrms-service python manage.py backfill_employee_credentials

    # Local (non-docker), from HRMS/Backend/src:
    python manage.py backfill_employee_credentials

This command is safe to run repeatedly: it only creates records that are
missing, and reports anything it cannot fix automatically.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from employees.models import Employee, EmployeeAssignment, EmployeeStatus


class Command(BaseCommand):
    help = "Backfill missing credentials, employee codes, and primary assignments for employees."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would change without writing to the database.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be saved.\n"))

        created_credentials = 0
        regenerated_codes = 0
        missing_assignments = 0

        employees = Employee.objects.filter(
            is_active=True,
            is_deleted=False,
        ).exclude(
            # Superadmins are not employees and never need employee credentials.
            employee_id__isnull=True,
        ).order_by("employee_id")

        for emp in employees:
            # 1. Ensure login credentials exist.
            cred_result = self._ensure_credentials(emp, dry_run=dry_run)
            if cred_result:
                created_credentials += 1

            # 2. Ensure a primary assignment exists (required for employee_code and leave accrual).
            primary = emp.assignments.filter(is_primary=True, is_deleted=False).first()
            if not primary:
                primary = emp.assignments.filter(is_deleted=False).first()
                if primary and not dry_run:
                    primary.is_primary = True
                    primary.save(update_fields=["is_primary", "updated_at"])
                    self.stdout.write(
                        f"  [{emp.employee_id}] Marked existing assignment as primary for {emp.full_name}"
                    )
                elif not primary:
                    missing_assignments += 1
                    self.stdout.write(
                        self.style.WARNING(
                            f"  [{emp.employee_id}] {emp.full_name}: no assignment found — cannot generate code"
                        )
                    )
                    continue

            # 3. Re-generate employee_code if missing.
            if not emp.employee_code:
                if dry_run:
                    self.stdout.write(
                        f"  [{emp.employee_id}] {emp.full_name}: would regenerate employee_code"
                    )
                else:
                    primary.save()
                    regenerated_codes += 1
                    self.stdout.write(
                        f"  [{emp.employee_id}] Regenerated employee_code: {emp.employee_code} for {emp.full_name}"
                    )

        self.stdout.write("\n" + "=" * 50)
        self.stdout.write(f"Employees checked: {employees.count()}")
        self.stdout.write(f"Credentials created: {created_credentials}")
        self.stdout.write(f"Employee codes regenerated: {regenerated_codes}")
        self.stdout.write(f"Employees still missing assignments: {missing_assignments}")
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN complete — no changes saved."))
        else:
            self.stdout.write(self.style.SUCCESS("Backfill complete."))

    def _ensure_credentials(self, employee, dry_run=False):
        from authentication.models import UserCredentials

        if UserCredentials.objects.filter(employee=employee, is_deleted=False).exists():
            return False

        if dry_run:
            self.stdout.write(
                f"  [{employee.employee_id}] {employee.full_name}: would create login credentials"
            )
            return True

        from employees.api import _provision_default_credentials

        result = _provision_default_credentials(employee)
        if result["created"]:
            self.stdout.write(
                f"  [{employee.employee_id}] Created login credentials for {employee.full_name}"
            )
        return result["created"]
