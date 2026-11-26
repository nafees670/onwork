"""
Leave Management models.

LeaveType: AL / CL / SL configuration.
LeaveBalance: per-employee leave balances.
LeaveRequest: leave application with approval workflow.
LeaveAdjustment: manual HR adjustments (especially for SL).
LeaveAccrual: record of each monthly accrual event.
"""
from decimal import Decimal
from django.db import models
from django.core.exceptions import ValidationError
from employees.models import Employee, Organization
from employees.utils import SoftDeleteModel


class LeaveType(SoftDeleteModel):

    TYPE_CHOICES = (
        ('annual', 'Annual Leave'),
        ('casual', 'Casual Leave'),
        ('sick', 'Sick Leave'),
    )

    ACCRUAL_FREQUENCY_CHOICES = (
        ('yearly', 'Yearly'),
        ('monthly', 'Monthly'),
    )

    ACCRUAL_TIMING_CHOICES = (
        ('beginning', 'Beginning of period'),
        ('end', 'After completion of period'),
    )

    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, unique=True)
    annual_entitlement = models.PositiveSmallIntegerField(default=0)
    is_paid = models.BooleanField(default=True, help_text='True if Paid leave, False if Unpaid')
    accrual_frequency = models.CharField(
        max_length=20, choices=ACCRUAL_FREQUENCY_CHOICES, default='monthly'
    )
    accrual_days_per_period = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal('1.00'),
        help_text='Days accrued per period (e.g. 1 CL/month, 1 SL/month)'
    )
    accrual_timing = models.CharField(
        max_length=20, choices=ACCRUAL_TIMING_CHOICES, default='end',
        help_text='When accrual is granted: beginning or end of the period'
    )
    requires_confirmation = models.BooleanField(
        default=False,
        help_text='Requires 1 year service before becoming available (Annual Leave)'
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Leave Type"
        verbose_name_plural = "Leave Types"

    def __str__(self):
        return self.name


class LeaveBalance(SoftDeleteModel):

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name='leave_balances'
    )
    leave_type = models.ForeignKey(
        LeaveType, on_delete=models.PROTECT, related_name='balances'
    )
    accrued_days = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('0.00'))
    consumed_days = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('0.00'))
    adjusted_days = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('0.00'))
    year = models.PositiveIntegerField()

    class Meta:
        ordering = ['employee', 'leave_type', 'year']
        constraints = [
            models.UniqueConstraint(
                fields=['employee', 'leave_type', 'year'],
                name='unique_leave_balance_per_employee_type_year',
            )
        ]
        verbose_name = "Leave Balance"
        verbose_name_plural = "Leave Balances"

    def __str__(self):
        return f"{self.employee.employee_id} - {self.leave_type.code} {self.year}"

    @property
    def available_days(self):
        return self.accrued_days - self.consumed_days + self.adjusted_days


class LeaveRequest(SoftDeleteModel):

    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('cancelled', 'Cancelled'),
    )

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name='leave_requests'
    )
    leave_type = models.ForeignKey(
        LeaveType, on_delete=models.PROTECT, related_name='requests'
    )
    start_date = models.DateField()
    end_date = models.DateField()
    total_days = models.PositiveSmallIntegerField()
    reason = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    approved_by = models.ForeignKey(
        Employee, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='approved_leaves'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(null=True, blank=True)
    is_override = models.BooleanField(
        default=False,
        help_text='HR override allowing leave beyond normal rules'
    )

    class Meta:
        ordering = ['-start_date']
        verbose_name = "Leave Request"
        verbose_name_plural = "Leave Requests"

    def __str__(self):
        return f"{self.employee.employee_id} - {self.leave_type.code} {self.start_date} ({self.status})"

    def clean(self):
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValidationError({'end_date': 'End date must be after start date.'})


class LeaveAdjustment(SoftDeleteModel):

    ADJUSTMENT_TYPE_CHOICES = (
        ('add', 'Add'),
        ('deduct', 'Deduct'),
        ('correction', 'Correction'),
    )

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name='leave_adjustments'
    )
    leave_type = models.ForeignKey(
        LeaveType, on_delete=models.PROTECT, related_name='adjustments'
    )
    adjustment_type = models.CharField(max_length=20, choices=ADJUSTMENT_TYPE_CHOICES)
    days = models.DecimalField(max_digits=6, decimal_places=2)
    previous_balance = models.DecimalField(max_digits=6, decimal_places=2)
    new_balance = models.DecimalField(max_digits=6, decimal_places=2)
    reason = models.TextField()
    adjusted_by = models.ForeignKey(
        Employee, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='performed_adjustments'
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Leave Adjustment"
        verbose_name_plural = "Leave Adjustments"

    def __str__(self):
        return f"{self.employee.employee_id} - {self.adjustment_type} {self.days} {self.leave_type.code}"


class LeaveAccrual(SoftDeleteModel):

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name='leave_accruals'
    )
    leave_type = models.ForeignKey(
        LeaveType, on_delete=models.PROTECT, related_name='accruals'
    )
    accrual_date = models.DateField()
    days_accrued = models.DecimalField(max_digits=6, decimal_places=2)
    period_month = models.PositiveSmallIntegerField()
    period_year = models.PositiveIntegerField()

    class Meta:
        ordering = ['-accrual_date']
        constraints = [
            models.UniqueConstraint(
                fields=['employee', 'leave_type', 'period_month', 'period_year'],
                name='unique_accrual_per_employee_type_period',
            )
        ]
        verbose_name = "Leave Accrual"
        verbose_name_plural = "Leave Accruals"

    def __str__(self):
        return f"{self.employee.employee_id} - {self.leave_type.code} {self.period_year}/{self.period_month}"


# ---------------------------------------------------------------------------
# Leave Policy Settings
# ---------------------------------------------------------------------------

class LeaveSettings(SoftDeleteModel):
    """Org-level Leave policy configuration. One active row per organization."""

    organization = models.OneToOneField(
        Organization, on_delete=models.CASCADE, related_name='leave_settings'
    )
    implementation_date = models.DateField(
        help_text="Leave policy is active from this date. Accruals & calculations start from this date."
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        verbose_name = "Leave Settings"
        verbose_name_plural = "Leave Settings"

    def __str__(self):
        return f"Leave Settings - {self.organization.name} (from {self.implementation_date})"


class LeaveSettingBracket(SoftDeleteModel):
    """Leave policy bracket / leave type row. Belongs to LeaveSettings."""

    settings = models.ForeignKey(
        LeaveSettings, on_delete=models.CASCADE, related_name='brackets'
    )
    leave_name = models.CharField(max_length=100)
    code = models.CharField(max_length=50)
    days_per_year = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    is_paid = models.BooleanField(default=True, help_text="True = Paid, False = Unpaid")
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']
        verbose_name = "Leave Setting Bracket"
        verbose_name_plural = "Leave Setting Brackets"

    def __str__(self):
        paid_label = "Paid" if self.is_paid else "Unpaid"
        return f"{self.leave_name} ({self.days_per_year} days/yr, {paid_label})"

