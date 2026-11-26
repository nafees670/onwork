"""
Loan Management business logic.

- generate_installment_schedule: compute installment dates and amounts
- calculate_loan_deduction_for_month: total loan deduction for a payroll period
- apply_loan_deductions: mark installments as paid after payslip generation
"""
from decimal import Decimal, ROUND_HALF_UP
from datetime import date
import calendar


def generate_installment_schedule(loan_amount, num_installments, first_deduction_month,
                                  first_deduction_year, monthly_installment=None):
    """Generate installment schedule for a loan.

    Returns a list of dicts with installment_number, due_month, due_year, due_date,
    installment_amount.

    The last installment absorbs any rounding difference so total = loan_amount.
    """
    if monthly_installment is None:
        monthly_installment = (
            Decimal(loan_amount) / Decimal(num_installments)
        ).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    schedule = []
    month = first_deduction_month
    year = first_deduction_year
    remaining = Decimal(loan_amount)

    for i in range(1, num_installments + 1):
        if i == num_installments:
            amount = remaining
        else:
            amount = monthly_installment

        last_day = calendar.monthrange(year, month)[1]
        due_date = date(year, month, last_day)

        schedule.append({
            'installment_number': i,
            'due_month': month,
            'due_year': year,
            'due_date': due_date,
            'installment_amount': amount,
        })

        remaining -= amount
        month += 1
        if month > 12:
            month = 1
            year += 1

    return schedule


def calculate_loan_deduction_for_month(employee, month, year):
    """Calculate total loan deduction for an employee in a given payroll month.

    Returns (total_deduction: Decimal, installments: list of (installment, amount) tuples).
    """
    from payroll.loan_models import EmployeeLoan, LoanInstallment

    active_loans = EmployeeLoan.objects.filter(
        employee=employee, status='active', is_deleted=False
    )

    total_deduction = Decimal('0.00')
    installment_deductions = []

    for loan in active_loans:
        pending = LoanInstallment.objects.filter(
            loan=loan,
            due_month=month,
            due_year=year,
            status__in=['pending', 'partially_paid', 'overdue'],
            is_deleted=False,
        ).first()

        if pending:
            deduct_amount = pending.remaining_amount
            total_deduction += deduct_amount
            installment_deductions.append((pending, deduct_amount))

    return total_deduction, installment_deductions


def apply_loan_deductions(payslip, installment_deductions):
    """After payslip creation, mark installments as paid and create LoanPayment records."""
    from payroll.loan_models import LoanPayment
    from django.utils import timezone

    for installment, amount in installment_deductions:
        installment.paid_amount += amount
        if installment.paid_amount >= installment.installment_amount:
            installment.status = 'paid'
        else:
            installment.status = 'partially_paid'
        installment.save()

        loan = installment.loan
        total_paid = sum(
            inst.paid_amount
            for inst in loan.installments.filter(is_deleted=False)
        )
        remaining_balance = loan.loan_amount - Decimal(total_paid)

        LoanPayment.objects.create(
            employee=loan.employee,
            loan=loan,
            installment=installment,
            payslip=payslip,
            amount=amount,
            payment_date=date(payslip.year, payslip.month,
                              calendar.monthrange(payslip.year, payslip.month)[1]),
            payroll_period_month=payslip.month,
            payroll_period_year=payslip.year,
            remaining_balance=remaining_balance,
        )

        all_paid = loan.installments.filter(is_deleted=False).exclude(status='paid').count() == 0
        if all_paid:
            loan.status = 'completed'
            loan.save(update_fields=['status', 'updated_at'])


def mark_overdue_installments(month, year):
    """Mark any pending installments due before the given month/year as overdue."""
    from payroll.loan_models import LoanInstallment

    cutoff_date = date(year, month, 1)
    overdue = LoanInstallment.objects.filter(
        status='pending',
        is_deleted=False,
    ).exclude(
        due_year__gt=year
    ).exclude(
        due_year=year, due_month__gte=month
    )

    for inst in overdue:
        inst.status = 'overdue'
        inst.save(update_fields=['status', 'updated_at'])
