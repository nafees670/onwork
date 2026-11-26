"""
Payroll models for the Auth Service.

Contains:
- Salary: employee compensation record (history-aware).
- Attendance: monthly attendance summary per employee.
- Payslip: generated output snapshot for an employee + month.

All inherit from SoftDeleteModel (UUID PK, is_deleted, created_at, updated_at).
"""
from decimal import Decimal
from django.db import models
from django.db.models import Q
from django.core.exceptions import ValidationError
from employees.models import Employee, Organization
from employees.utils import SoftDeleteModel


class Salary(SoftDeleteModel):
    """Links an Employee to their compensation details.
    
    Only gross_salary is stored as input. All components are derived
    at calculation time using fixed percentages per HR policy.
    """

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name='salaries'
    )
    gross_salary = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default='PKR')
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ['-effective_from', '-created_at']

    def __str__(self):
        return f"{self.employee.employee_id} - {self.gross_salary}"

    def save(self, *args, **kwargs):
        if self.is_active and self.effective_from:
            existing = Salary.objects.filter(
                employee_id=self.employee_id,
                is_active=True,
                is_deleted=False,
            ).exclude(pk=self.pk).first()
            if existing:
                existing.is_active = False
                existing.effective_to = self.effective_from
                existing.save(update_fields=['is_active', 'effective_to', 'updated_at'])

        super().save(*args, **kwargs)


class Attendance(SoftDeleteModel):
    """Monthly attendance summary per Employee."""

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name='attendances'
    )
    month = models.PositiveSmallIntegerField()  # 1-12
    year = models.PositiveIntegerField()
    total_work_days = models.PositiveIntegerField()
    presents = models.PositiveIntegerField(default=0)
    absents = models.PositiveIntegerField(default=0)
    lates = models.PositiveIntegerField(default=0)
    leaves = models.PositiveIntegerField(default=0)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ['-year', '-month']
        constraints = [
            models.UniqueConstraint(
                fields=['employee', 'month', 'year'],
                name='unique_attendance_per_employee_month_year',
            )
        ]

    def __str__(self):
        return f"{self.employee.employee_id} - {self.year}/{self.month}"

    def clean(self):
        if not (1 <= self.month <= 12):
            raise ValidationError({'month': 'Month must be between 1 and 12.'})
        if self.presents + self.absents + self.leaves > self.total_work_days:
            raise ValidationError(
                'presents + absents + leaves cannot exceed total_work_days.'
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class Payslip(SoftDeleteModel):
    """Generated output for a given employee + month (snapshot)."""

    STATUS_CHOICES = (
        ('draft', 'Draft'),
        ('final', 'Final'),
        ('paid', 'Paid'),
    )

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name='payslips'
    )
    salary = models.ForeignKey(
        Salary, on_delete=models.PROTECT, related_name='payslips'
    )
    attendance = models.ForeignKey(
        Attendance, on_delete=models.PROTECT, related_name='payslips'
    )
    month = models.PositiveSmallIntegerField()
    year = models.PositiveIntegerField()

    # Earning breakdown (derived from gross_salary at generation time)
    basic_salary = models.DecimalField(max_digits=12, decimal_places=2)
    hra = models.DecimalField(max_digits=12, decimal_places=2)           # House Rent Allowance
    conveyance = models.DecimalField(max_digits=12, decimal_places=2)     # Conveyance Allowance
    utility = models.DecimalField(max_digits=12, decimal_places=2)        # Utility Allowance
    medical = models.DecimalField(max_digits=12, decimal_places=2)        # Medical Allowance
    gross_salary = models.DecimalField(max_digits=12, decimal_places=2)   # Sum of all earnings

    # Attendance-based calculations
    total_work_days = models.PositiveSmallIntegerField(default=0)
    per_day_salary = models.DecimalField(max_digits=12, decimal_places=2)
    late_absent_equivalent = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0.00')
    )
    effective_absents = models.IntegerField(default=0)
    absent_days_deducted = models.DecimalField(
        max_digits=6, decimal_places=2, default=Decimal('0.00')
    )
    absent_deduction = models.DecimalField(max_digits=12, decimal_places=2)

    # Deductions
    esp = models.DecimalField(max_digits=12, decimal_places=2)            # Employee Saving Plan
    esp_employee_contribution = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    esp_employer_contribution = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    esp_employee_pct_snapshot = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    esp_employer_pct_snapshot = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    esp_enrollment_id_snapshot = models.UUIDField(null=True, blank=True)
    esp_basic_salary_used = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    esp_tenure_years = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    loan_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    unpaid_leave_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    income_tax = models.DecimalField(max_digits=12, decimal_places=2)
    taxable_income = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    total_deductions = models.DecimalField(max_digits=12, decimal_places=2)

    # Final
    net_pay = models.DecimalField(max_digits=12, decimal_places=2)

    generated_by = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='generated_payslips',
    )
    generated_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')
    notes = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ['-year', '-month']
        constraints = [
            models.UniqueConstraint(
                fields=['employee', 'month', 'year'],
                name='unique_payslip_per_employee_month_year',
                # Soft-deleted payslips must not block regenerating the month.
                condition=Q(is_deleted=False),
            )
        ]

    def __str__(self):
        return f"{self.employee.employee_id} - {self.year}/{self.month}"


# ---------------------------------------------------------------------------
# ESP (Employee Savings Plan)
# ---------------------------------------------------------------------------

class ESPSettings(SoftDeleteModel):
    """Org-level ESP policy configuration. One active row per organization."""

    organization = models.OneToOneField(
        Organization, on_delete=models.CASCADE, related_name='esp_settings'
    )
    implementation_date = models.DateField()
    employee_contribution_pct = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('8.33')
    )
    basic_salary_pct = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('50.00')
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        verbose_name = "ESP Settings"
        verbose_name_plural = "ESP Settings"

    def __str__(self):
        return f"ESP Settings - {self.organization.name} (from {self.implementation_date})"


class ESPMatchingBracket(SoftDeleteModel):
    """Tenure-based employer matching rate. Belongs to ESPSettings."""

    settings = models.ForeignKey(
        ESPSettings, on_delete=models.CASCADE, related_name='matching_brackets'
    )
    min_tenure_years = models.PositiveSmallIntegerField()
    max_tenure_years = models.PositiveSmallIntegerField(null=True, blank=True)
    matching_pct = models.DecimalField(max_digits=5, decimal_places=2)

    class Meta:
        ordering = ['min_tenure_years']
        verbose_name = "ESP Matching Bracket"
        verbose_name_plural = "ESP Matching Brackets"

    def __str__(self):
        upper = f"{self.max_tenure_years}yr" if self.max_tenure_years else "∞"
        return f"{self.min_tenure_years}yr–{upper}: {self.matching_pct}%"


class ESPEmployeeEnrollment(SoftDeleteModel):
    """Per-employee ESP enrollment. Separate from joining/probation."""

    employee = models.OneToOneField(
        Employee, on_delete=models.CASCADE, related_name='esp_enrollment'
    )
    enrollment_date = models.DateField()
    esp_settings = models.ForeignKey(
        ESPSettings, on_delete=models.PROTECT, related_name='enrollments'
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        verbose_name = "ESP Enrollment"
        verbose_name_plural = "ESP Enrollments"

    def __str__(self):
        return f"{self.employee.employee_id} enrolled {self.enrollment_date}"


class ESPContribution(SoftDeleteModel):
    """One month's ESP contribution (employee + employer). Tied to a payslip."""

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name='esp_contributions'
    )
    payslip = models.OneToOneField(
        Payslip, on_delete=models.PROTECT, related_name='esp_contribution'
    )
    enrollment = models.ForeignKey(
        ESPEmployeeEnrollment, on_delete=models.PROTECT, related_name='contributions'
    )
    esp_settings = models.ForeignKey(
        ESPSettings, on_delete=models.PROTECT, related_name='contributions'
    )

    contribution_date = models.DateField()
    payroll_period_month = models.PositiveSmallIntegerField()
    payroll_period_year = models.PositiveIntegerField()
    implementation_date_snapshot = models.DateField()
    enrollment_date_snapshot = models.DateField()
    date_of_joining_snapshot = models.DateField()

    gross_salary_used = models.DecimalField(max_digits=12, decimal_places=2)
    basic_salary_used = models.DecimalField(max_digits=12, decimal_places=2)
    employee_contribution_pct_snapshot = models.DecimalField(max_digits=5, decimal_places=2)
    employee_contribution_amount = models.DecimalField(max_digits=12, decimal_places=2)
    employer_matching_pct_snapshot = models.DecimalField(max_digits=5, decimal_places=2)
    employer_matching_amount = models.DecimalField(max_digits=12, decimal_places=2)
    total_contribution = models.DecimalField(max_digits=12, decimal_places=2)

    tenure_years_at_contribution = models.DecimalField(max_digits=5, decimal_places=2)

    class Meta:
        ordering = ['-payroll_period_year', '-payroll_period_month']
        verbose_name = "ESP Contribution"
        verbose_name_plural = "ESP Contributions"

    def __str__(self):
        return f"{self.employee.employee_id} - {self.payroll_period_year}/{self.payroll_period_month}"


class ESPWithdrawal(SoftDeleteModel):
    """Withdrawal request with approval workflow."""

    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('disbursed', 'Disbursed'),
    )

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name='esp_withdrawals'
    )
    enrollment = models.ForeignKey(
        ESPEmployeeEnrollment, on_delete=models.PROTECT, related_name='withdrawals'
    )
    requested_amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_by = models.ForeignKey(
        Employee, on_delete=models.PROTECT, null=True, blank=True,
        related_name='reviewed_withdrawals'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(null=True, blank=True)
    disbursed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-requested_at']
        verbose_name = "ESP Withdrawal"
        verbose_name_plural = "ESP Withdrawals"

    def __str__(self):
        return f"{self.employee.employee_id} - {self.requested_amount} ({self.status})"


class SystemFeatureToggle(SoftDeleteModel):
    key = models.CharField(max_length=100, unique=True)
    enabled = models.BooleanField(default=True)
    description = models.CharField(max_length=255, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'system_feature_toggles'
        verbose_name = "System Feature Toggle"
        verbose_name_plural = "System Feature Toggles"

    def __str__(self):
        return f"{self.key}: {'Enabled' if self.enabled else 'Disabled'}"


def is_feature_enabled(key: str, default: bool = False) -> bool:
    try:
        toggle = SystemFeatureToggle.objects.filter(key=key, is_deleted=False).first()
        if toggle is not None:
            return toggle.enabled
        return default
    except Exception:
        return default



def set_feature_enabled(key: str, enabled: bool, description: str = None) -> bool:
    toggle, _ = SystemFeatureToggle.objects.get_or_create(
        key=key,
        defaults={'enabled': enabled, 'description': description or ''}
    )
    toggle.enabled = enabled
    if description:
        toggle.description = description
    toggle.save(update_fields=['enabled', 'description', 'updated_at'])
    return toggle.enabled


from payroll.loan_models import EmployeeLoan, LoanInstallment, LoanPayment

from payroll.leave_models import (
    LeaveType, LeaveBalance, LeaveRequest, LeaveAdjustment, LeaveAccrual,
    LeaveSettings, LeaveSettingBracket,
)


