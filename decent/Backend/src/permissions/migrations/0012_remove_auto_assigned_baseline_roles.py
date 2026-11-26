from django.db import migrations

def remove_auto_assigned_baseline(apps, schema_editor):
    Role = apps.get_model('permissions', 'Role')
    EmployeeRole = apps.get_model('permissions', 'EmployeeRole')
    default_role = Role.objects.filter(is_default=True).first()
    if default_role:
        EmployeeRole.objects.filter(role=default_role).delete()

class Migration(migrations.Migration):
    dependencies = [
        ('permissions', '0011_fix_baseline_and_custom_roles'),
    ]
    operations = [
        migrations.RunPython(remove_auto_assigned_baseline, migrations.RunPython.noop),
    ]
