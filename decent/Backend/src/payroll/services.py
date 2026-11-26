"""
Payroll business logic: salary calculation engine.

Implements the decided business rules:
- 8.1 Late rule: lates -> absent-day equivalent.
- 8.2 Leave accrual: monthly quota table, absents -> leaves, uncovered absents deduct.
- 8.3 Tax: Pakistan FY 2026-2027 salaried slabs (annual -> monthly).
- Earning breakdown: derived from gross_salary using fixed percentages.
"""
from decimal import Decimal, ROUND_HALF_UP
import calendar
from datetime import date as _date, date

# ---------------------------------------------------------------------------
# Attendance days (Calendar Month Days policy)
# ---------------------------------------------------------------------------

def calculate_work_days(month: int, year: int) -> int:
    """Total working days for a month under Calendar Month Days policy.

    Work days equal the total calendar days in the month (e.g. 28/29, 30, 31).
    Leap years are handled automatically by the calendar library.
    total_work_days = month_days.
    """
    return calendar.monthrange(year, month)[1]



def calculate_presents(total_work_days: int, absents: int, leaves: int) -> int:
    """Presents = total work days − absents − leaves (leaves not counted as present)."""
    return max(0, int(total_work_days) - int(absents) - int(leaves))


def validate_attendance_counts(total_work_days: int, absents: int, leaves: int,
                               lates: int, presents: int) -> None:
    """Enforce HR attendance constraints. Raises ValueError on violation.

    - absents + leaves cannot exceed total_work_days
    - lates cannot exceed presents (someone can only be late as many days as present)
    """
    if absents + leaves > total_work_days:
        raise ValueError(
            f"absents + leaves ({absents} + {leaves} = {absents + leaves}) cannot "
            f"exceed total_work_days ({total_work_days})"
        )
    if lates > presents:
        raise ValueError(
            f"lates ({lates}) cannot exceed presents ({presents})"
        )


def calc_and_validate(month: int, year: int, absents: int, leaves: int, lates: int):
    """Compute total_work_days + presents and validate counts. Returns (work_days, presents)."""
    work_days = calculate_work_days(month, year)
    presents = calculate_presents(work_days, absents, leaves)
    validate_attendance_counts(work_days, absents, leaves, lates, presents)
    return work_days, presents


# ---------------------------------------------------------------------------
# 8.1 Late rule
# ---------------------------------------------------------------------------

def late_to_absent(lates: int) -> Decimal:
    """Convert a number of lates into an absent-day equivalent.

    Rule: 3 lates = 0 days, 4 lates = 1 day, 5 lates = 1.5 days,
    then every late after that adds +0.5 day.
    """
    if lates is None or lates < 0:
        lates = 0
    if lates <= 3:
        return Decimal('0.00')
    return Decimal('1.00') + (Decimal(lates) - Decimal('4')) * Decimal('0.50')


# ---------------------------------------------------------------------------
# 8.2 Absent-day deduction (reported leaves only — no quota table)
# ---------------------------------------------------------------------------

def deducted_absent_days(effective_absents, leaves_reported=0) -> Decimal:
    """Days that actually deduct from salary.

    effective_absents is a Decimal (absents + late equivalent).
    Only the leaves the HR actually reported cover absents; there is no
    monthly quota table. Uncovered absents are salary-deducted.
    """
    uncovered = max(Decimal('0'), Decimal(effective_absents) - Decimal(leaves_reported or 0))
    return uncovered


# ---------------------------------------------------------------------------
# Earning Breakdown (derived from gross_salary)
# ---------------------------------------------------------------------------

def calculate_earning_breakdown(gross_salary: Decimal) -> dict:
    """Calculate all earning components from gross_salary.

    Per HR policy:
    - Basic Salary = gross_salary × 50%
    - HRA = basic_salary × 40%
    - Conveyance = basic_salary × 30%
    - Utility = basic_salary × 20%
    - Medical = basic_salary × 10%
    """
    gross = Decimal(gross_salary)
    basic = (gross * Decimal('0.5')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    hra = (basic * Decimal('0.4')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    conveyance = (basic * Decimal('0.3')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    utility = (basic * Decimal('0.2')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    medical = (basic * Decimal('0.1')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    return {
        'basic_salary': basic,
        'hra': hra,
        'conveyance': conveyance,
        'utility': utility,
        'medical': medical,
        'gross_salary': gross,
    }


# ---------------------------------------------------------------------------
# Deductions (ESP + Income Tax)
# ---------------------------------------------------------------------------

def calculate_esp(basic_salary: Decimal) -> Decimal:
    """Employee Saving Plan = basic_salary × 8.33%"""
    return (Decimal(basic_salary) * Decimal('0.0833')).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )


# ---------------------------------------------------------------------------
# ESP settings-aware calculation
# ---------------------------------------------------------------------------

def contributions_to_tenure_years(contribution_count) -> Decimal:
    """Convert a count of actual monthly contributions into bracket tenure years.

    12 actual salary contributions = 1 year of tenure for employer matching.
    """
    count = max(0, int(contribution_count or 0))
    return (Decimal(count) / Decimal('12')).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )


def _resolve_matching_bracket(esp_settings, tenure_years: Decimal) -> Decimal:
    """Walk the settings' matching brackets and return the matching % for the given tenure."""
    for bracket in esp_settings.matching_brackets.filter(is_deleted=False).order_by('min_tenure_years'):
        min_yr = Decimal(bracket.min_tenure_years)
        max_yr = Decimal(bracket.max_tenure_years) if bracket.max_tenure_years is not None else None
        if tenure_years >= min_yr and (max_yr is None or tenure_years < max_yr):
            return Decimal(bracket.matching_pct)
    return Decimal('0')


def calculate_esp_from_settings(gross_salary, esp_settings, enrollment, joining_date, contribution_date,
                                prior_contribution_count=0):
    """Compute full ESP breakdown using org settings.

    Employer matching tenure is based on the number of ACTUAL monthly
    contributions the employee has accumulated since implementation
    (``prior_contribution_count``, from existing payslips), NOT on calendar
    time. 12 actual contributions = 1 year of bracket tenure.

    Returns a dict with all ESP fields, or None if ESP is not applicable
    (no settings, before implementation date, or before enrollment date).
    """
    if not esp_settings or not esp_settings.is_active:
        return None
    if contribution_date < esp_settings.implementation_date:
        return None
    if not enrollment or not enrollment.is_active:
        return None
    if enrollment.enrollment_date > contribution_date:
        return None

    gross = Decimal(gross_salary)
    basic_pct = esp_settings.basic_salary_pct / Decimal('100')
    basic = (gross * basic_pct).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    emp_pct = esp_settings.employee_contribution_pct / Decimal('100')
    emp_amount = (basic * emp_pct).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    tenure_years = contributions_to_tenure_years(prior_contribution_count)
    matching_pct = _resolve_matching_bracket(esp_settings, tenure_years)
    employer_amount = (emp_amount * matching_pct / Decimal('100')).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )

    return {
        'basic_salary_used': basic,
        'employee_contribution_pct': esp_settings.employee_contribution_pct,
        'employee_contribution_amount': emp_amount,
        'employer_matching_pct': matching_pct,
        'employer_matching_amount': employer_amount,
        'total_contribution': (emp_amount + employer_amount).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        ),
        'tenure_years': tenure_years,
        'implementation_date': esp_settings.implementation_date,
        'enrollment_date': enrollment.enrollment_date,
        'esp_settings_id': esp_settings.id,
        'enrollment_id': enrollment.id,
    }


def calculate_annual_tax_fy_2026_27(t: Decimal) -> Decimal:
    """Calculate annual income tax for Pakistan FY 2026-2027 salaried individuals."""
    t = Decimal(t)
    if t <= 600_000:
        return Decimal('0')
    elif t <= 1_200_000:
        return (t - 600_000) * Decimal('0.01')
    elif t <= 2_200_000:
        return Decimal('6000') + (t - 1_200_000) * Decimal('0.11')
    elif t <= 3_200_000:
        return Decimal('116000') + (t - 2_200_000) * Decimal('0.20')
    elif t <= 4_100_000:
        return Decimal('316000') + (t - 3_200_000) * Decimal('0.25')
    elif t <= 5_600_000:
        return Decimal('541000') + (t - 4_100_000) * Decimal('0.29')
    elif t <= 7_000_000:
        return Decimal('976000') + (t - 5_600_000) * Decimal('0.32')
    else:
        return Decimal('1424000') + (t - 7_000_000) * Decimal('0.35')


def calculate_monthly_income_tax(monthly_taxable_income: Decimal) -> Decimal:
    """Calculate monthly income tax from monthly taxable income.

    Taxable income = gross_salary minus absent_deduction (HR-confirmed).
    Annualizes, applies slabs, then divides by 12.
    """
    monthly = Decimal(monthly_taxable_income)
    annual_taxable = monthly * 12
    annual_tax = calculate_annual_tax_fy_2026_27(annual_taxable)
    monthly_tax = (annual_tax / 12).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return monthly_tax


def calculate_deductions(basic_salary: Decimal, taxable_income: Decimal) -> dict:
    """Calculate all deductions: ESP + Income Tax.

    taxable_income = gross_salary − absent_deduction (income tax applies after
    the attendance deduction, ESP is not subtracted before tax).
    """
    basic = Decimal(basic_salary)

    esp = calculate_esp(basic)
    income_tax = calculate_monthly_income_tax(taxable_income)

    return {
        'esp': esp,
        'income_tax': income_tax,
        'total_deductions': (esp + income_tax).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
    }


# ---------------------------------------------------------------------------
# Full payslip calculation
# ---------------------------------------------------------------------------

def calculate_payslip(attendance, salary, esp_settings=None, enrollment=None,
                      joining_date=None, loan_deduction=Decimal('0.00'),
                      unpaid_leave_deduction=Decimal('0.00'),
                      esp_prior_contributions=0):
    """Compute all payslip snapshot fields from an Attendance + Salary.

    Returns a dict of computed fields. Does NOT persist anything.
    
    Flow:
    1. Earning breakdown from gross_salary (all 5 components)
    2. Per-day rate = Gross / total_work_days
    3. Late -> absent equivalent
    4. Effective absents = actual absents + late equivalent
    5. Deducted days = effective absents − reported leaves (no quota table)
    6. Absent deduction = per_day × deducted days
    7. ESP: use settings if available, else fall back to hardcoded 8.33%
    8. Taxable income = gross − absent_deduction  (ESP not subtracted before tax)
    9. Income tax applied on taxable income (after absents)
    10. Net Pay = Gross − ESP − Income Tax − Absent Deduction
    """
    if attendance.total_work_days == 0:
        raise ValueError('total_work_days must be greater than 0')

    gross_salary = Decimal(salary.gross_salary)
    total_work_days = attendance.total_work_days

    # 1. Earning breakdown from gross_salary
    earnings = calculate_earning_breakdown(gross_salary)
    basic = earnings['basic_salary']
    hra = earnings['hra']
    conveyance = earnings['conveyance']
    utility = earnings['utility']
    medical = earnings['medical']
    gross = earnings['gross_salary']

    # 2. Per-day rate = Gross / total_work_days
    per_day = (gross / Decimal(total_work_days)).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )

    # 3. Late -> absent equivalent
    late_eq = late_to_absent(attendance.lates)

    # 4. Effective absents = actual absents + late equivalent
    effective_absents = Decimal(attendance.absents) + late_eq

    # 5. Deducted days = effective absents − reported leaves (no quota)
    absent_days_deducted = deducted_absent_days(effective_absents, attendance.leaves)

    # 6. Attendance deduction
    absent_deduction = (per_day * absent_days_deducted).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )

    # 7. ESP — settings-aware if provided, otherwise legacy 8.33%
    import calendar as _cal
    contribution_date = _date(attendance.year, attendance.month,
                              _cal.monthrange(attendance.year, attendance.month)[1])

    esp_detail = calculate_esp_from_settings(
        gross_salary, esp_settings, enrollment, joining_date, contribution_date,
        prior_contribution_count=esp_prior_contributions,
    ) if esp_settings and enrollment and joining_date else None

    if esp_detail:
        esp = esp_detail['employee_contribution_amount']
    else:
        esp = calculate_esp(basic)

    # 8. Taxable income = gross − absent_deduction
    taxable_income = (gross - absent_deduction).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )

    # 9. Income tax on taxable income (after attendance deduction)
    income_tax = calculate_monthly_income_tax(taxable_income)

    # 10. Final Net Pay = Gross − ESP − Tax − Absent Deduction − Loan − Unpaid Leave
    loan_ded = Decimal(loan_deduction or '0.00')
    unpaid_ded = Decimal(unpaid_leave_deduction or '0.00')
    total_deductions = (esp + income_tax + absent_deduction + loan_ded + unpaid_ded).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )
    net_pay = (gross - esp - income_tax - absent_deduction - loan_ded - unpaid_ded).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )

    result = {
        # Earnings breakdown
        'basic_salary': basic,
        'hra': hra,
        'conveyance': conveyance,
        'utility': utility,
        'medical': medical,
        'gross_salary': gross,

        # Attendance
        'total_work_days': total_work_days,
        'per_day_salary': per_day,
        'late_absent_equivalent': late_eq,
        'effective_absents': int(effective_absents),
        'absent_days_deducted': absent_days_deducted,
        'absent_deduction': absent_deduction,

        # Deductions
        'esp': esp,
        'income_tax': income_tax,
        'taxable_income': taxable_income,
        'total_deductions': total_deductions,
        'net_pay': net_pay,
        'loan_deduction': loan_ded,
        'unpaid_leave_deduction': unpaid_ded,
    }

    # ESP breakdown fields (null when settings not applicable)
    if esp_detail:
        result['esp_employee_contribution'] = esp_detail['employee_contribution_amount']
        result['esp_employer_contribution'] = esp_detail['employer_matching_amount']
        result['esp_employee_pct_snapshot'] = esp_detail['employee_contribution_pct']
        result['esp_employer_pct_snapshot'] = esp_detail['employer_matching_pct']
        result['esp_enrollment_id_snapshot'] = esp_detail['enrollment_id']
        result['esp_basic_salary_used'] = esp_detail['basic_salary_used']
        result['esp_tenure_years'] = esp_detail['tenure_years']

    return result


# ---------------------------------------------------------------------------
# Automatic Employee Payroll & Leave Onboarding / Auto-Sync
# ---------------------------------------------------------------------------

def auto_onboard_employee_payroll(employee):
    """
    Automatically onboard an active placed employee into Payroll systems:
    1. Auto-enroll in ESP (Employees' Savings Program / Provident Fund)
    2. Auto-initialize Leave Balances & Accruals (Annual, Casual, Sick leaves)
    """
    if not employee or not getattr(employee, 'is_active', False):
        return

    import logging
    logger = logging.getLogger(__name__)

    # 1. ESP Auto-Enrollment
    try:
        from payroll.models import ESPSettings, ESPEmployeeEnrollment
        org = getattr(employee, 'organization', None)
        esp_settings = (
            ESPSettings.objects.filter(organization=org, is_active=True, is_deleted=False).first()
            if org else ESPSettings.objects.filter(is_active=True, is_deleted=False).first()
        )
        if esp_settings:
            assignment = (
                employee.assignments.filter(is_primary=True, is_deleted=False).order_by('created_at').first()
                or employee.assignments.filter(is_deleted=False).order_by('created_at').first()
            )
            joining_date = assignment.joining_date if assignment else date.today()

            enroll_date = joining_date
            if esp_settings.implementation_date and enroll_date < esp_settings.implementation_date:
                enroll_date = esp_settings.implementation_date

            enrollment, created = ESPEmployeeEnrollment.objects.get_or_create(
                employee=employee,
                defaults={
                    "enrollment_date": enroll_date,
                    "esp_settings": esp_settings,
                    "is_active": True,
                }
            )
            if created:
                logger.info(f"Auto-enrolled employee {employee.employee_id} ({employee.full_name}) into ESP")
    except Exception as exc:
        logger.error("Failed to auto-enroll employee %s in ESP: %s", getattr(employee, 'employee_id', employee.id), exc)

    # 2. Leave Balances & Accruals Auto-Initialization
    try:
        from payroll.leave_services import seed_leave_types, get_accrued_leave, _get_joining_date, _completed_months
        from payroll.leave_models import LeaveType, LeaveBalance, LeaveAccrual

        seed_leave_types()
        joining_date = _get_joining_date(employee)
        if joining_date:
            today = date.today()
            leave_types = LeaveType.objects.filter(is_active=True, is_deleted=False)

            for lt in leave_types:
                accrued = get_accrued_leave(employee, lt, as_of_date=today)
                bal, _ = LeaveBalance.objects.get_or_create(
                    employee=employee, leave_type=lt, year=today.year,
                    defaults={
                        "accrued_days": accrued,
                        "consumed_days": Decimal("0.00"),
                        "adjusted_days": Decimal("0.00"),
                    }
                )
                if accrued != bal.accrued_days:
                    bal.accrued_days = accrued
                    bal.save(update_fields=['accrued_days', 'updated_at'])

            from payroll.leave_models import LeaveSettings
            leave_settings = LeaveSettings.objects.filter(is_active=True, is_deleted=False).first()
            effective_start = max(joining_date, leave_settings.implementation_date) if (leave_settings and leave_settings.implementation_date) else joining_date
            start_year = max(2025, effective_start.year)
            for yr in range(start_year, today.year + 1):
                m_start = effective_start.month if yr == effective_start.year else 1
                m_end = today.month if yr == today.year else 12
                for m in range(m_start, m_end + 1):
                    accrual_date = date(yr, m, 1)
                    if leave_settings and leave_settings.implementation_date and accrual_date < leave_settings.implementation_date:
                        continue
                    for lt in leave_types.filter(code__in=['casual', 'sick']):
                        completed = _completed_months(effective_start, accrual_date)
                        if lt.accrual_timing == 'end' and completed < 1:
                            continue
                        LeaveAccrual.objects.get_or_create(
                            employee=employee,
                            leave_type=lt,
                            period_month=m,
                            period_year=yr,
                            defaults={
                                "accrual_date": accrual_date,
                                "days_accrued": lt.accrual_days_per_period,
                            }
                        )
    except Exception as exc:
        logger.error("Failed to auto-initialize leave balances for %s: %s", getattr(employee, 'employee_id', employee.id), exc)


def auto_enroll_unregistered_employees():
    """Auto-enroll any active placed employee who isn't enrolled in active ESP settings yet."""
    try:
        from employees.models import Employee, EmployeeStatus
        from payroll.models import ESPSettings, ESPEmployeeEnrollment
        esp_settings = ESPSettings.objects.filter(is_active=True, is_deleted=False).first()
        if not esp_settings:
            return
        enrolled_ids = set(ESPEmployeeEnrollment.all_objects.values_list('employee_id', flat=True))
        unregistered = Employee.objects.filter(
            status=EmployeeStatus.ACTIVE,
            is_deleted=False,
            assignments__is_primary=True,
            assignments__is_deleted=False,
        ).exclude(id__in=enrolled_ids).distinct()
        for emp in unregistered:
            auto_onboard_employee_payroll(emp)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("auto_enroll_unregistered_employees error: %s", exc)


def auto_sync_all_leave_balances():
    """Ensure all active placed employees have LeaveBalance and LeaveAccrual rows."""
    try:
        from employees.models import Employee, EmployeeStatus
        employees = Employee.objects.filter(
            status=EmployeeStatus.ACTIVE,
            is_deleted=False,
            assignments__is_primary=True,
            assignments__is_deleted=False,
        ).distinct()
        for emp in employees:
            auto_onboard_employee_payroll(emp)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("auto_sync_all_leave_balances error: %s", exc)
