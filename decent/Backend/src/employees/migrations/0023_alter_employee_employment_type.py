from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("employees", "0022_alter_employee_cnic")]

    operations = [
        migrations.AlterField(
            model_name="employee",
            name="employment_type",
            field=models.CharField(
                choices=[
                    ("full_time", "Full-time"),
                    ("part_time", "Part-time"),
                    ("contract", "Contract"),
                    ("intern", "Intern"),
                    ("probation", "Probation"),
                ],
                default="full_time",
                max_length=20,
            ),
        ),
    ]
