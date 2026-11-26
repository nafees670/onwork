"""
Leave Management business logic.

- calculate_accrued_leaves: compute accrued leave for an employee as of a date
- validate_leave_request: check balance, accrual, and eligibility rules
- process_monthly_accrual: run monthly accrual for all employees
- approve_leave_request: deduct from balance on approval
- reject_leave_request: no balance change on rejection
"""
from decimal import Decimal, ROUND_HALF_UP
from datetime import date
from django.db import transaction
from django.utils import timezone


def _get_joining_date(employee):
    """Get employee's primary assignment joining date."""
    assignment = (
        employee.assignments.filter(is_primary=True, is_deleted=False).order_by('created_at').first()
        or employee.assignments.filter(is_deleted=False).order_by('created_at').first()
    )
    return assignment.joining_date if assignment else None


def _completed_months(joining_date, as_of_date):
    """Number of fully completed months of service between two dates."""
    if not joining_date or as_of_date < joining_date:
        return 0
    months = (as_of_date.year - joining_date.year) * 12 + (as_of_date.month - joining_date.month)
    if as_of_date.day < joining_date.day:
        months -= 1
    return max(0, months)


def _completed_years(joining_date, as_of_date):
    """Number of fully completed years of service."""
    if not joining_date or as_of_date < joining_date:
        return 0
    years = as_of_date.year - joining_date.year
    if (as_of_date.month, as_of_date.day) < (joining_date.month, joining_date.day):
        years -= 1
    return max(0, years)


def get_accrued_leave(employee, leave_type, as_of_date=None):
    """Calculate accrued leave days for an employee and leave type.

    Respects LeaveSettings implementation_date:
    - If LeaveSettings is active, leaves only accrue on/after implementation_date.
    - Effective start date = max(joining_date, settings.implementation_date)
    """
    if as_of_date is None:
        as_of_date = date.today()

    try:
        from payroll.leave_models import LeaveSettings
        leave_settings = LeaveSettings.objects.filter(is_active=True, is_deleted=False).first()
    except Exception:
        leave_settings = None

    if leave_settings and leave_settings.implementation_date:
        if as_of_date < leave_settings.implementation_date:
            return Decimal('0')

    joining_date = _get_joining_date(employee)
    if not joining_date:
        return Decimal('0')

    # When LeaveSettings is active, policy defines the full annual entitlement:
    if leave_settings and leave_settings.is_active:
        return Decimal(leave_type.annual_entitlement or 0)

    effective_start = max(joining_date, leave_settings.implementation_date) if (leave_settings and leave_settings.implementation_date) else joining_date

    # For unpaid leave, entitlement is full annual quota (no accrual needed)
    if getattr(leave_type, 'is_paid', True) is False:
        return Decimal(leave_type.annual_entitlement or 0)

    if leave_type.code == 'annual':
        if leave_type.requires_confirmation and _completed_years(joining_date, as_of_date) < 1:
            return Decimal('0')
        years_eligible = _completed_years(effective_start, as_of_date)
        if years_eligible < 1 and leave_type.requires_confirmation:
            return Decimal('0')
        return Decimal(leave_type.annual_entitlement * max(1, years_eligible))

    completed = _completed_months(effective_start, as_of_date)
    if leave_type.accrual_timing == 'end':
        return Decimal(completed) * leave_type.accrual_days_per_period
    else:
        return Decimal(completed + 1) * leave_type.accrual_days_per_period


def get_leave_balance(employee, leave_type, year=None):
    """Get or compute the current leave balance for an employee.

    Returns a dict with accrued, consumed, adjusted, available.
    """
    from payroll.leave_models import LeaveBalance

    if year is None:
        year = date.today().year

    balance = LeaveBalance.objects.filter(
        employee=employee, leave_type=leave_type, year=year, is_deleted=False
    ).first()

    if balance:
        accrued = balance.accrued_days
        consumed = balance.consumed_days
        adjusted = balance.adjusted_days
    else:
        accrued = Decimal('0')
        consumed = Decimal('0')
        adjusted = Decimal('0')

    today = date.today()
    computed_accrued = get_accrued_leave(employee, leave_type, today)

    if balance and computed_accrued != accrued:
        balance.accrued_days = computed_accrued
        balance.save(update_fields=['accrued_days', 'updated_at'])
        accrued = computed_accrued
    elif not balance:
        try:
            balance, _ = LeaveBalance.objects.get_or_create(
                employee=employee,
                leave_type=leave_type,
                year=year,
                defaults={
                    'accrued_days': computed_accrued,
                    'consumed_days': Decimal('0'),
                    'adjusted_days': Decimal('0')
                }
            )
        except Exception:
            pass
        accrued = computed_accrued

    joining_date = _get_joining_date(employee)
    eligible = True
    try:
        from payroll.leave_models import LeaveSettings
        has_active_settings = LeaveSettings.objects.filter(is_active=True, is_deleted=False).exists()
    except Exception:
        has_active_settings = False

    if not has_active_settings and leave_type.code == 'annual' and leave_type.requires_confirmation:
        if joining_date and _completed_years(joining_date, today) < 1:
            eligible = False


    available = accrued - consumed + adjusted
    if not eligible:
        available = Decimal('0')

    return {
        'accrued': accrued,
        'consumed': consumed,
        'adjusted': adjusted,
        'available': max(Decimal('0'), available),
        'eligible': eligible,
    }


def validate_leave_request(employee, leave_type, start_date, end_date, total_days,
                           is_override=False):
    """Validate a leave request against business rules.

    Returns (is_valid: bool, error_message: str or None).
    """
    from payroll.leave_models import LeaveRequest

    today = date.today()

    if start_date < today:
        return False, "Leave start date cannot be in the past"

    joining_date = _get_joining_date(employee)

    if leave_type.code == 'annual' and leave_type.requires_confirmation:
        if not is_override:
            if joining_date and _completed_years(joining_date, start_date) < 1:
                return False, "Annual leave is only available after completing 1 year of service"

    if leave_type.code in ('casual', 'sick') and not is_override:
        as_of_start = start_date
        if leave_type.accrual_timing == 'end':
            completed = _completed_months(joining_date, as_of_start) if joining_date else 0
            accrued_by_start = Decimal(completed) * leave_type.accrual_days_per_period
        else:
            completed = _completed_months(joining_date, as_of_start) if joining_date else 0
            accrued_by_start = Decimal(completed + 1) * leave_type.accrual_days_per_period

        from payroll.leave_models import LeaveBalance
        year = start_date.year
        balance = LeaveBalance.objects.filter(
            employee=employee, leave_type=leave_type, year=year, is_deleted=False
        ).first()
        consumed = balance.consumed_days if balance else Decimal('0')
        adjusted = balance.adjusted_days if balance else Decimal('0')
        available = accrued_by_start - consumed + adjusted

        if total_days > available:
            return False, (
                f"Insufficient {leave_type.name} balance. "
                f"Available: {available}, Requested: {total_days}. "
                f"Future month entitlements cannot be used."
            )

    overlapping = LeaveRequest.objects.filter(
        employee=employee,
        status__in=['pending', 'approved'],
        is_deleted=False,
        start_date__lte=end_date,
        end_date__gte=start_date,
    ).exists()
    if overlapping:
        return False, "Overlapping leave request exists for these dates"

    return True, None


@transaction.atomic
def approve_leave_request(leave_request, approved_by):
    """Approve a leave request and deduct from balance."""
    from payroll.leave_models import LeaveBalance

    year = leave_request.start_date.year
    balance, _ = LeaveBalance.objects.get_or_create(
        employee=leave_request.employee,
        leave_type=leave_request.leave_type,
        year=year,
        defaults={'accrued_days': Decimal('0'), 'consumed_days': Decimal('0'), 'adjusted_days': Decimal('0')},
    )

    balance.consumed_days += Decimal(leave_request.total_days)
    balance.save(update_fields=['consumed_days', 'updated_at'])

    leave_request.status = 'approved'
    leave_request.approved_by = approved_by
    leave_request.approved_at = timezone.now()
    leave_request.save()


@transaction.atomic
def reject_leave_request(leave_request, rejected_by, reason=None):
    """Reject a leave request. No balance change."""
    leave_request.status = 'rejected'
    leave_request.approved_by = rejected_by
    leave_request.approved_at = timezone.now()
    leave_request.rejection_reason = reason
    leave_request.save()


@transaction.atomic
def cancel_leave_request(leave_request):
    """Cancel an approved leave and restore the balance."""
    from payroll.leave_models import LeaveBalance

    if leave_request.status == 'approved':
        year = leave_request.start_date.year
        balance = LeaveBalance.objects.filter(
            employee=leave_request.employee,
            leave_type=leave_request.leave_type,
            year=year,
            is_deleted=False,
        ).first()
        if balance:
            balance.consumed_days = max(Decimal('0'), balance.consumed_days - Decimal(leave_request.total_days))
            balance.save(update_fields=['consumed_days', 'updated_at'])

    leave_request.status = 'cancelled'
    leave_request.save()


@transaction.atomic
def adjust_leave_balance(employee, leave_type, adjustment_type, days, reason, adjusted_by):
    """Manually adjust a leave balance (primarily for sick leave)."""
    from payroll.leave_models import LeaveBalance, LeaveAdjustment

    year = date.today().year
    balance, _ = LeaveBalance.objects.get_or_create(
        employee=employee,
        leave_type=leave_type,
        year=year,
        defaults={'accrued_days': Decimal('0'), 'consumed_days': Decimal('0'), 'adjusted_days': Decimal('0')},
    )

    previous_available = balance.available_days
    days = Decimal(days)

    if adjustment_type == 'add':
        balance.adjusted_days += days
    elif adjustment_type == 'deduct':
        balance.adjusted_days -= days
    elif adjustment_type == 'correction':
        balance.adjusted_days = days
    else:
        raise ValueError(f"Invalid adjustment type: {adjustment_type}")

    balance.save(update_fields=['adjusted_days', 'updated_at'])

    LeaveAdjustment.objects.create(
        employee=employee,
        leave_type=leave_type,
        adjustment_type=adjustment_type,
        days=days,
        previous_balance=previous_available,
        new_balance=balance.available_days,
        reason=reason,
        adjusted_by=adjusted_by,
    )

    return balance


def process_monthly_accrual(month, year):
    """Process monthly leave accruals for all active employees.

    Creates LeaveAccrual records and updates LeaveBalance for CL and SL.
    """
    from payroll.leave_models import LeaveType, LeaveBalance, LeaveAccrual
    from employees.models import Employee

    accrual_date = date(year, month, 1)

    try:
        from payroll.leave_models import LeaveSettings
        leave_settings = LeaveSettings.objects.filter(is_active=True, is_deleted=False).first()
    except Exception:
        leave_settings = None

    if leave_settings and leave_settings.implementation_date:
        if accrual_date < leave_settings.implementation_date:
            return 0

    leave_types = LeaveType.objects.filter(
        code__in=['casual', 'sick'], is_active=True, is_deleted=False
    )

    employees = Employee.objects.filter(
        is_active=True,
        is_deleted=False,
        assignments__is_primary=True,
        assignments__is_deleted=False,
    ).distinct()

    created_count = 0
    for emp in employees:
        joining_date = _get_joining_date(emp)
        if not joining_date:
            continue

        effective_start = max(joining_date, leave_settings.implementation_date) if (leave_settings and leave_settings.implementation_date) else joining_date

        for lt in leave_types:
            existing = LeaveAccrual.objects.filter(
                employee=emp, leave_type=lt,
                period_month=month, period_year=year, is_deleted=False
            ).exists()
            if existing:
                continue

            completed = _completed_months(effective_start, accrual_date)
            if lt.accrual_timing == 'end' and completed < 1:
                continue

            days = lt.accrual_days_per_period

            LeaveAccrual.objects.create(
                employee=emp,
                leave_type=lt,
                accrual_date=accrual_date,
                days_accrued=days,
                period_month=month,
                period_year=year,
            )

            balance, _ = LeaveBalance.objects.get_or_create(
                employee=emp, leave_type=lt, year=year,
                defaults={
                    'accrued_days': Decimal('0'),
                    'consumed_days': Decimal('0'),
                    'adjusted_days': Decimal('0'),
                },
            )
            balance.accrued_days += days
            balance.save(update_fields=['accrued_days', 'updated_at'])

            created_count += 1

    return created_count


def seed_leave_types():
    """Create default leave types if they don't exist."""
    from payroll.leave_models import LeaveType

    defaults = [
        {
            'name': 'Annual Leave',
            'code': 'annual',
            'annual_entitlement': 15,
            'accrual_frequency': 'yearly',
            'accrual_days_per_period': Decimal('15.00'),
            'accrual_timing': 'beginning',
            'requires_confirmation': True,
        },
        {
            'name': 'Casual Leave',
            'code': 'casual',
            'annual_entitlement': 12,
            'accrual_frequency': 'monthly',
            'accrual_days_per_period': Decimal('1.00'),
            'accrual_timing': 'end',
            'requires_confirmation': False,
        },
        {
            'name': 'Sick Leave',
            'code': 'sick',
            'annual_entitlement': 12,
            'accrual_frequency': 'monthly',
            'accrual_days_per_period': Decimal('1.00'),
            'accrual_timing': 'end',
            'requires_confirmation': False,
        },
    ]

    created = 0
    for d in defaults:
        _, was_created = LeaveType.objects.get_or_create(
            code=d['code'],
            defaults=d,
        )
        if was_created:
            created += 1
    return created
