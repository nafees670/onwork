from django.db import migrations


def fix_roles_state(apps, schema_editor):
    Role = apps.get_model("permissions", "Role")
    EmployeeRole = apps.get_model("permissions", "EmployeeRole")
    Permission = apps.get_model("permissions", "Permission")

    # 1. Restore is_default role to "Employee Baseline" with no elevated permissions
    default_role = Role.objects.filter(is_default=True).first()
    if default_role:
        default_role.name = "Employee Baseline"
        default_role.description = "Default baseline role for employee self-service portal."
        default_role.save()
        default_role.permissions.clear()
    else:
        default_role, _ = Role.objects.get_or_create(
            name="Employee Baseline",
            service="auth",
            defaults={
                "is_default": True,
                "description": "Default baseline role for employee self-service portal."
            }
        )

    # 2. Create or ensure clean Hr_Assistant custom role (is_default=False)
    hr_role = Role.objects.filter(name__in=["Hr Assistant", "Hr_Assistant"], is_default=False).first()
    if not hr_role:
        hr_role = Role.objects.create(
            name="Hr_Assistant",
            service="auth",
            is_default=False,
            description="HR Assistant with employee management permissions."
        )
    perms = Permission.objects.filter(codename__in=[
        'assignment.create', 'assignment.delete', 'assignment.edit',
        'employee.create', 'employee.delete', 'employee.edit', 'employee.view'
    ])
    hr_role.permissions.set(perms)

    # 3. Clean any existing EmployeeRole assignments for Hr_Assistant so no employee has it automatically
    EmployeeRole.objects.filter(role=hr_role).delete()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("permissions", "0010_seed_employee_baseline_role"),
    ]

    operations = [
        migrations.RunPython(fix_roles_state, noop),
    ]
