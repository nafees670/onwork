from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Makes `cnic` and `personal_email` required (NOT NULL) and makes
    `personal_email` unique, matching the model change in employees/models.py.

    DEPLOY-SAFETY NOTE: this will fail against a real database if any
    existing employee row has a NULL/blank `cnic`, a NULL `personal_email`,
    or a duplicate `personal_email`. Before running `migrate` in a real
    environment, audit for and resolve those rows first, e.g.:

        SELECT id, employee_id, full_name FROM employees_employee
        WHERE cnic IS NULL OR cnic = '' OR personal_email IS NULL;

        SELECT personal_email, COUNT(*) FROM employees_employee
        WHERE personal_email IS NOT NULL
        GROUP BY personal_email HAVING COUNT(*) > 1;
    """

    dependencies = [
        ('employees', '0024_employeeassignment_confirmation_date'),
    ]

    operations = [
        migrations.AlterField(
            model_name='employee',
            name='cnic',
            field=models.CharField(max_length=15, unique=True),
        ),
        migrations.AlterField(
            model_name='employee',
            name='personal_email',
            field=models.EmailField(max_length=254, unique=True),
        ),
    ]
