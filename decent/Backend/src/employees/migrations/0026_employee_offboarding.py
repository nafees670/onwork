from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('employees', '0025_cnic_email_required_unique'),
    ]

    operations = [
        migrations.AlterField(
            model_name='employee',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending_approval', 'Pending Approval'),
                    ('active', 'Active'),
                    ('rejected', 'Rejected'),
                    ('suspended', 'Suspended'),
                    ('resigned', 'Resigned'),
                    ('terminated', 'Terminated'),
                ],
                db_index=True,
                default='active',
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name='employee',
            name='exit_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='employee',
            name='exit_reason',
            field=models.TextField(blank=True, null=True),
        ),
    ]
