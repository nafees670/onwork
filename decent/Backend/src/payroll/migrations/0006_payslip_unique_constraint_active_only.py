# Generated for soft-deleted payslips blocking regeneration

from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ('payroll', '0005_payslip_esp_employee_contribution_and_more'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='payslip',
            name='unique_payslip_per_employee_month_year',
        ),
        migrations.AddConstraint(
            model_name='payslip',
            constraint=models.UniqueConstraint(
                condition=Q(is_deleted=False),
                fields=['employee', 'month', 'year'],
                name='unique_payslip_per_employee_month_year',
            ),
        ),
    ]
