# Seeds the default 'Employee Baseline' role (M4). Assigned automatically
# whenever an admin sets login credentials for an approved employee.

from django.db import migrations


def seed_baseline_role(apps, schema_editor):
    Role = apps.get_model("permissions", "Role")
    Role.objects.get_or_create(
        name="Employee Baseline",
        service="auth",
        defaults={
            "is_default": True,
            "description": (
                "Default role automatically attached to every employee when "
                "their HRMS credentials are created."
            ),
        },
    )


def remove_baseline_role(apps, schema_editor):
    Role = apps.get_model("permissions", "Role")
    # Only remove if nothing is attached to it anymore.
    EmployeeRole = apps.get_model("permissions", "EmployeeRole")
    try:
        role = Role.objects.get(name="Employee Baseline", service="auth")
    except Role.DoesNotExist:
        return
    if not EmployeeRole.objects.filter(role=role).exists():
        role.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("permissions", "0009_rbac_employee_role_and_override"),
    ]

    operations = [
        migrations.RunPython(seed_baseline_role, remove_baseline_role),
    ]
