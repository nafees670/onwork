"""
Loan Management models.

EmployeeLoan: interest-free employee loan with installment-based repayment.
LoanInstallment: per-month installment schedule.
LoanPayment: tracks each deduction/payment against an installment.
"""
from decimal import Decimal, ROUND_HALF_UP
from django.db import models
from django.core.exceptions import ValidationError
from employees.models import Employee
from employees.utils import SoftDeleteModel


class EmployeeLoan(SoftDeleteModel):

    STATUS_CHOICES = (
        ('pending', 'Pending Admin Review'),
        ('offered', 'Terms Offered by Admin'),
        ('agreed', 'Terms Agreed by Employee'),
        ('documents_submitted', 'Documents Submitted'),
        ('approved', 'Approved by Admin'),
        ('active', 'Active / Disbursed'),
        ('completed', 'Completed'),
        ('rejected', 'Rejected'),
        ('cancelled', 'Cancelled'),
    )

    FREQUENCY_CHOICES = (
        ('monthly', 'Monthly'),
    )

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name='loans'
    )
    loan_amount = models.DecimalField(max_digits=12, decimal_places=2)
    required_date = models.DateField(null=True, blank=True, help_text="Employee requested loan date")
    start_date = models.DateField(null=True, blank=True)
    num_installments = models.PositiveSmallIntegerField(null=True, blank=True, default=1)
    installment_frequency = models.CharField(
        max_length=20, choices=FREQUENCY_CHOICES, default='monthly'
    )
    monthly_installment = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    first_deduction_month = models.PositiveSmallIntegerField(null=True, blank=True)
    first_deduction_year = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='active')
    reason = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)

    # Multi-Step Workflow Fields
    offered_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    admin_notes = models.TextField(null=True, blank=True)
    terms_accepted = models.BooleanField(default=False)
    terms_accepted_at = models.DateTimeField(null=True, blank=True)

    # Documents & Guarantor Info
    cnic_front_url = models.TextField(null=True, blank=True)
    cnic_back_url = models.TextField(null=True, blank=True)
    guarantor_name = models.CharField(max_length=255, null=True, blank=True)
    guarantor_phone = models.CharField(max_length=50, null=True, blank=True)
    guarantor_cnic = models.CharField(max_length=30, null=True, blank=True)
    guarantor_cnic_front_url = models.TextField(null=True, blank=True)
    guarantor_cnic_back_url = models.TextField(null=True, blank=True)
    documents_submitted_at = models.DateTimeField(null=True, blank=True)

    # Disbursement Verification
    disbursement_receipt_url = models.TextField(null=True, blank=True)
    satisfied_rating = models.BooleanField(default=True)
    disbursed_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        Employee, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_loans'
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Employee Loan"
        verbose_name_plural = "Employee Loans"

    def __str__(self):
        return f"{self.employee.employee_id} - {self.loan_amount} ({self.status})"

    def clean(self):
        if self.loan_amount and self.loan_amount <= 0:
            raise ValidationError({'loan_amount': 'Loan amount must be positive.'})
        if self.num_installments is not None and self.num_installments < 1:
            raise ValidationError({'num_installments': 'Must have at least 1 installment.'})
        if self.first_deduction_month is not None and not (1 <= self.first_deduction_month <= 12):
            raise ValidationError({'first_deduction_month': 'Month must be 1-12.'})

    def save(self, *args, **kwargs):
        if not self.monthly_installment and self.loan_amount and self.num_installments:
            self.monthly_installment = (
                self.loan_amount / Decimal(self.num_installments)
            ).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def total_paid(self):
        return self.installments.filter(status='paid').aggregate(
            t=models.Sum('paid_amount')
        )['t'] or Decimal('0')

    @property
    def total_remaining(self):
        amount = self.offered_amount if (self.offered_amount and self.offered_amount > 0) else self.loan_amount
        return max(Decimal('0'), amount - self.total_paid)

    @property
    def paid_installments_count(self):
        return self.installments.filter(status='paid').count()

    @property
    def remaining_installments_count(self):
        return self.installments.exclude(status__in=['paid', 'waived', 'deferred']).count()


class LoanInstallment(SoftDeleteModel):

    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('paid', 'Paid'),
        ('partially_paid', 'Partially Paid'),
        ('overdue', 'Overdue'),
        ('waived', 'Waived'),
        ('deferred', 'Deferred'),
    )

    loan = models.ForeignKey(
        EmployeeLoan, on_delete=models.CASCADE, related_name='installments'
    )
    installment_number = models.PositiveSmallIntegerField()
    due_month = models.PositiveSmallIntegerField()
    due_year = models.PositiveIntegerField()
    due_date = models.DateField()
    installment_amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    deferral_reason = models.TextField(null=True, blank=True)
    deferred_by = models.ForeignKey(
        Employee, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='deferred_installments'
    )

    class Meta:
        ordering = ['loan', 'installment_number']
        constraints = [
            models.UniqueConstraint(
                fields=['loan', 'installment_number'],
                name='unique_installment_per_loan',
            )
        ]

    def __str__(self):
        return f"Loan {self.loan_id} #{self.installment_number} - {self.due_year}/{self.due_month}"

    @property
    def remaining_amount(self):
        return self.installment_amount - self.paid_amount


class LoanPayment(SoftDeleteModel):

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name='loan_payments'
    )
    loan = models.ForeignKey(
        EmployeeLoan, on_delete=models.CASCADE, related_name='payments'
    )
    installment = models.ForeignKey(
        LoanInstallment, on_delete=models.CASCADE, related_name='payments'
    )
    payslip = models.ForeignKey(
        'payroll.Payslip', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='loan_payments'
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_date = models.DateField()
    payroll_period_month = models.PositiveSmallIntegerField(null=True, blank=True)
    payroll_period_year = models.PositiveIntegerField(null=True, blank=True)
    remaining_balance = models.DecimalField(max_digits=12, decimal_places=2)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ['-payment_date']
        verbose_name = "Loan Payment"
        verbose_name_plural = "Loan Payments"

    def __str__(self):
        return f"{self.employee.employee_id} - {self.amount} on {self.payment_date}"
