# Generated for loan management, leave management, and payslip deduction fields

import django.db.models.deletion
from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('employees', '0024_employeeassignment_confirmation_date'),
        ('payroll', '0006_payslip_unique_constraint_active_only'),
    ]

    operations = [
        # -- Payslip: add loan and unpaid-leave deduction fields --
        migrations.AddField(
            model_name='payslip',
            name='loan_deduction',
            field=models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=12),
        ),
        migrations.AddField(
            model_name='payslip',
            name='unpaid_leave_deduction',
            field=models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=12),
        ),

        # -- Loan Management --
        migrations.CreateModel(
            name='EmployeeLoan',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_deleted', models.BooleanField(db_index=True, default=False, help_text='Indicates if this record is soft-deleted')),
                ('deleted_at', models.DateTimeField(blank=True, help_text='Timestamp when record was deleted', null=True)),
                ('deleted_by', models.UUIDField(blank=True, help_text='UUID of employee who deleted this record', null=True)),
                ('deletion_reason', models.TextField(blank=True, help_text='Optional reason for deletion', null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, help_text='Timestamp when record was created')),
                ('updated_at', models.DateTimeField(auto_now=True, help_text='Timestamp when record was last updated')),
                ('loan_amount', models.DecimalField(decimal_places=2, max_digits=12)),
                ('start_date', models.DateField()),
                ('num_installments', models.PositiveSmallIntegerField()),
                ('installment_frequency', models.CharField(choices=[('monthly', 'Monthly')], default='monthly', max_length=20)),
                ('monthly_installment', models.DecimalField(decimal_places=2, max_digits=12)),
                ('first_deduction_month', models.PositiveSmallIntegerField()),
                ('first_deduction_year', models.PositiveIntegerField()),
                ('status', models.CharField(choices=[('active', 'Active'), ('completed', 'Completed'), ('cancelled', 'Cancelled')], default='active', max_length=20)),
                ('reason', models.TextField(blank=True, null=True)),
                ('notes', models.TextField(blank=True, null=True)),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='loans', to='employees.employee')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_loans', to='employees.employee')),
            ],
            options={
                'verbose_name': 'Employee Loan',
                'verbose_name_plural': 'Employee Loans',
                'ordering': ['-start_date'],
            },
        ),
        migrations.CreateModel(
            name='LoanInstallment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_deleted', models.BooleanField(db_index=True, default=False, help_text='Indicates if this record is soft-deleted')),
                ('deleted_at', models.DateTimeField(blank=True, help_text='Timestamp when record was deleted', null=True)),
                ('deleted_by', models.UUIDField(blank=True, help_text='UUID of employee who deleted this record', null=True)),
                ('deletion_reason', models.TextField(blank=True, help_text='Optional reason for deletion', null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, help_text='Timestamp when record was created')),
                ('updated_at', models.DateTimeField(auto_now=True, help_text='Timestamp when record was last updated')),
                ('installment_number', models.PositiveSmallIntegerField()),
                ('due_month', models.PositiveSmallIntegerField()),
                ('due_year', models.PositiveIntegerField()),
                ('due_date', models.DateField()),
                ('installment_amount', models.DecimalField(decimal_places=2, max_digits=12)),
                ('paid_amount', models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=12)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('paid', 'Paid'), ('partially_paid', 'Partially Paid'), ('overdue', 'Overdue'), ('waived', 'Waived')], default='pending', max_length=20)),
                ('loan', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='installments', to='payroll.employeeloan')),
            ],
            options={
                'ordering': ['loan', 'installment_number'],
            },
        ),
        migrations.AddConstraint(
            model_name='loaninstallment',
            constraint=models.UniqueConstraint(
                fields=['loan', 'installment_number'],
                name='unique_installment_per_loan',
            ),
        ),
        migrations.CreateModel(
            name='LoanPayment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_deleted', models.BooleanField(db_index=True, default=False, help_text='Indicates if this record is soft-deleted')),
                ('deleted_at', models.DateTimeField(blank=True, help_text='Timestamp when record was deleted', null=True)),
                ('deleted_by', models.UUIDField(blank=True, help_text='UUID of employee who deleted this record', null=True)),
                ('deletion_reason', models.TextField(blank=True, help_text='Optional reason for deletion', null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, help_text='Timestamp when record was created')),
                ('updated_at', models.DateTimeField(auto_now=True, help_text='Timestamp when record was last updated')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12)),
                ('payment_date', models.DateField()),
                ('payroll_period_month', models.PositiveSmallIntegerField(blank=True, null=True)),
                ('payroll_period_year', models.PositiveIntegerField(blank=True, null=True)),
                ('remaining_balance', models.DecimalField(decimal_places=2, max_digits=12)),
                ('notes', models.TextField(blank=True, null=True)),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='loan_payments', to='employees.employee')),
                ('loan', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='payments', to='payroll.employeeloan')),
                ('installment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='payments', to='payroll.loaninstallment')),
                ('payslip', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='loan_payments', to='payroll.payslip')),
            ],
            options={
                'verbose_name': 'Loan Payment',
                'verbose_name_plural': 'Loan Payments',
                'ordering': ['-payment_date'],
            },
        ),

        # -- Leave Management --
        migrations.CreateModel(
            name='LeaveType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_deleted', models.BooleanField(db_index=True, default=False, help_text='Indicates if this record is soft-deleted')),
                ('deleted_at', models.DateTimeField(blank=True, help_text='Timestamp when record was deleted', null=True)),
                ('deleted_by', models.UUIDField(blank=True, help_text='UUID of employee who deleted this record', null=True)),
                ('deletion_reason', models.TextField(blank=True, help_text='Optional reason for deletion', null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, help_text='Timestamp when record was created')),
                ('updated_at', models.DateTimeField(auto_now=True, help_text='Timestamp when record was last updated')),
                ('name', models.CharField(max_length=50)),
                ('code', models.CharField(choices=[('annual', 'Annual Leave'), ('casual', 'Casual Leave'), ('sick', 'Sick Leave')], max_length=10, unique=True)),
                ('annual_entitlement', models.PositiveSmallIntegerField(default=0)),
                ('accrual_frequency', models.CharField(choices=[('yearly', 'Yearly'), ('monthly', 'Monthly')], default='monthly', max_length=20)),
                ('accrual_days_per_period', models.DecimalField(decimal_places=2, default=Decimal('1.00'), help_text='Days accrued per period (e.g. 1 CL/month, 1 SL/month)', max_digits=4)),
                ('accrual_timing', models.CharField(choices=[('beginning', 'Beginning of period'), ('end', 'After completion of period')], default='end', help_text='When accrual is granted: beginning or end of the period', max_length=20)),
                ('requires_confirmation', models.BooleanField(default=False, help_text='Requires 1 year service before becoming available (Annual Leave)')),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={
                'verbose_name': 'Leave Type',
                'verbose_name_plural': 'Leave Types',
            },
        ),
        migrations.CreateModel(
            name='LeaveBalance',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_deleted', models.BooleanField(db_index=True, default=False, help_text='Indicates if this record is soft-deleted')),
                ('deleted_at', models.DateTimeField(blank=True, help_text='Timestamp when record was deleted', null=True)),
                ('deleted_by', models.UUIDField(blank=True, help_text='UUID of employee who deleted this record', null=True)),
                ('deletion_reason', models.TextField(blank=True, help_text='Optional reason for deletion', null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, help_text='Timestamp when record was created')),
                ('updated_at', models.DateTimeField(auto_now=True, help_text='Timestamp when record was last updated')),
                ('accrued_days', models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=6)),
                ('consumed_days', models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=6)),
                ('adjusted_days', models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=6)),
                ('year', models.PositiveIntegerField()),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='leave_balances', to='employees.employee')),
                ('leave_type', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='balances', to='payroll.leavetype')),
            ],
            options={
                'verbose_name': 'Leave Balance',
                'verbose_name_plural': 'Leave Balances',
                'ordering': ['employee', 'leave_type', 'year'],
            },
        ),
        migrations.AddConstraint(
            model_name='leavebalance',
            constraint=models.UniqueConstraint(
                fields=['employee', 'leave_type', 'year'],
                name='unique_leave_balance_per_employee_type_year',
            ),
        ),
        migrations.CreateModel(
            name='LeaveRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_deleted', models.BooleanField(db_index=True, default=False, help_text='Indicates if this record is soft-deleted')),
                ('deleted_at', models.DateTimeField(blank=True, help_text='Timestamp when record was deleted', null=True)),
                ('deleted_by', models.UUIDField(blank=True, help_text='UUID of employee who deleted this record', null=True)),
                ('deletion_reason', models.TextField(blank=True, help_text='Optional reason for deletion', null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, help_text='Timestamp when record was created')),
                ('updated_at', models.DateTimeField(auto_now=True, help_text='Timestamp when record was last updated')),
                ('start_date', models.DateField()),
                ('end_date', models.DateField()),
                ('total_days', models.PositiveSmallIntegerField()),
                ('reason', models.TextField(blank=True, null=True)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('cancelled', 'Cancelled')], default='pending', max_length=20)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('rejection_reason', models.TextField(blank=True, null=True)),
                ('is_override', models.BooleanField(default=False, help_text='HR override allowing leave beyond normal rules')),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='leave_requests', to='employees.employee')),
                ('leave_type', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='requests', to='payroll.leavetype')),
                ('approved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='approved_leaves', to='employees.employee')),
            ],
            options={
                'verbose_name': 'Leave Request',
                'verbose_name_plural': 'Leave Requests',
                'ordering': ['-start_date'],
            },
        ),
        migrations.CreateModel(
            name='LeaveAdjustment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_deleted', models.BooleanField(db_index=True, default=False, help_text='Indicates if this record is soft-deleted')),
                ('deleted_at', models.DateTimeField(blank=True, help_text='Timestamp when record was deleted', null=True)),
                ('deleted_by', models.UUIDField(blank=True, help_text='UUID of employee who deleted this record', null=True)),
                ('deletion_reason', models.TextField(blank=True, help_text='Optional reason for deletion', null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, help_text='Timestamp when record was created')),
                ('updated_at', models.DateTimeField(auto_now=True, help_text='Timestamp when record was last updated')),
                ('adjustment_type', models.CharField(choices=[('add', 'Add'), ('deduct', 'Deduct'), ('correction', 'Correction')], max_length=20)),
                ('days', models.DecimalField(decimal_places=2, max_digits=6)),
                ('previous_balance', models.DecimalField(decimal_places=2, max_digits=6)),
                ('new_balance', models.DecimalField(decimal_places=2, max_digits=6)),
                ('reason', models.TextField()),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='leave_adjustments', to='employees.employee')),
                ('leave_type', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='adjustments', to='payroll.leavetype')),
                ('adjusted_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='performed_adjustments', to='employees.employee')),
            ],
            options={
                'verbose_name': 'Leave Adjustment',
                'verbose_name_plural': 'Leave Adjustments',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='LeaveAccrual',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_deleted', models.BooleanField(db_index=True, default=False, help_text='Indicates if this record is soft-deleted')),
                ('deleted_at', models.DateTimeField(blank=True, help_text='Timestamp when record was deleted', null=True)),
                ('deleted_by', models.UUIDField(blank=True, help_text='UUID of employee who deleted this record', null=True)),
                ('deletion_reason', models.TextField(blank=True, help_text='Optional reason for deletion', null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, help_text='Timestamp when record was created')),
                ('updated_at', models.DateTimeField(auto_now=True, help_text='Timestamp when record was last updated')),
                ('accrual_date', models.DateField()),
                ('days_accrued', models.DecimalField(decimal_places=2, max_digits=6)),
                ('period_month', models.PositiveSmallIntegerField()),
                ('period_year', models.PositiveIntegerField()),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='leave_accruals', to='employees.employee')),
                ('leave_type', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='accruals', to='payroll.leavetype')),
            ],
            options={
                'verbose_name': 'Leave Accrual',
                'verbose_name_plural': 'Leave Accruals',
                'ordering': ['-accrual_date'],
            },
        ),
        migrations.AddConstraint(
            model_name='leaveaccrual',
            constraint=models.UniqueConstraint(
                fields=['employee', 'leave_type', 'period_month', 'period_year'],
                name='unique_accrual_per_employee_type_period',
            ),
        ),
    ]
