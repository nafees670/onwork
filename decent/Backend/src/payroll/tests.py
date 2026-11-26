"""
Unit tests for the payroll calculation engine and models.
"""
import pytest
from decimal import Decimal
from datetime import date

from django.core.exceptions import ValidationError

from payroll.services import (
    late_to_absent,
    deducted_absent_days,
    calculate_earning_breakdown,
    calculate_esp,
    calculate_esp_from_settings,
    calculate_annual_tax_fy_2026_27,
    calculate_monthly_income_tax,
    calculate_deductions,
    calculate_payslip,
    calculate_work_days,
    calculate_presents,
    validate_attendance_counts,
    calc_and_validate,
)
from payroll.models import (
    Salary,
    Attendance,
    Payslip,
    ESPSettings,
    ESPMatchingBracket,
    ESPEmployeeEnrollment,
)


# ---------------------------------------------------------------------------
# 8.1 Late rule
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("lates,expected", [
    (0, Decimal('0.00')),
    (1, Decimal('0.00')),
    (2, Decimal('0.00')),
    (3, Decimal('0.00')),
    (4, Decimal('1.00')),
    (5, Decimal('1.50')),
    (6, Decimal('2.00')),
    (7, Decimal('2.50')),
    (8, Decimal('3.00')),
    (9, Decimal('3.50')),
    (10, Decimal('4.00')),
])
def test_late_to_absent(lates, expected):
    assert late_to_absent(lates) == expected


def test_late_to_absent_negative_returns_zero():
    assert late_to_absent(-5) == Decimal('0.00')


# ---------------------------------------------------------------------------
# Work-day & attendance auto-calc (Mon–Sat policy, Sunday off)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("month,year,expected", [
    (1, 2026, 31),   # Jan 2026: 31 days
    (2, 2025, 28),   # Feb 2025: 28 days
    (2, 2024, 29),   # Feb 2024 (leap): 29 days
    (12, 2026, 31),  # Dec 2026: 31 days
])
def test_calculate_work_days(month, year, expected):
    assert calculate_work_days(month, year) == expected


def test_calculate_presents_excludes_leaves():
    assert calculate_presents(31, 4, 2) == 25
    assert calculate_presents(31, 0, 0) == 31
    assert calculate_presents(31, 35, 0) == 0  # clamps to 0


def test_validate_attendance_counts_ok():
    validate_attendance_counts(31, 4, 2, 25, 25)  # lates == presents OK


def test_validate_absents_over_work_days_raises():
    with pytest.raises(ValueError):
        validate_attendance_counts(31, 30, 2, 0, -1)


def test_validate_lates_over_presents_raises():
    with pytest.raises(ValueError):
        validate_attendance_counts(31, 4, 2, 26, 25)


def test_calc_and_validate_returns_work_days_and_presents():
    work_days, presents = calc_and_validate(1, 2026, 4, 2, 3)
    assert work_days == 31
    assert presents == 25


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# 8.2 Absent-day deduction (reported leaves only — no quota table)
# ---------------------------------------------------------------------------

def test_deducted_absent_days_no_leaves():
    # 5 effective absents, 0 leaves -> 5 deducted
    assert deducted_absent_days(Decimal('5'), 0) == Decimal('5')

def test_deducted_absent_days_with_leaves():
    # 5 effective absents, 2 leaves -> 3 deducted
    assert deducted_absent_days(Decimal('5'), 2) == Decimal('3')

def test_deducted_absent_days_leaves_cover_all():
    # 3 effective absents, 5 leaves -> 0 deducted (clamped)
    assert deducted_absent_days(Decimal('3'), 5) == Decimal('0')

def test_deducted_absent_days_zero():
    assert deducted_absent_days(Decimal('0'), 0) == Decimal('0')

# ---------------------------------------------------------------------------
# Earning breakdown (derived from gross_salary)
# ---------------------------------------------------------------------------
# Earning breakdown (derived from gross_salary)
# ---------------------------------------------------------------------------

def test_earning_breakdown_percentages():
    result = calculate_earning_breakdown(Decimal('26000'))
    assert result['basic_salary'] == Decimal('13000.00')       # 50% of gross
    assert result['hra'] == Decimal('5200.00')                 # 40% of basic
    assert result['conveyance'] == Decimal('3900.00')          # 30% of basic
    assert result['utility'] == Decimal('2600.00')             # 20% of basic
    assert result['medical'] == Decimal('1300.00')             # 10% of basic
    assert result['gross_salary'] == Decimal('26000.00')


def test_earning_breakdown_components_sum_to_gross():
    # basic(50%) + hra+conv+util+med (100% of basic) == 100% of gross
    result = calculate_earning_breakdown(Decimal('80000'))
    total = (result['basic_salary'] + result['hra'] + result['conveyance']
             + result['utility'] + result['medical'])
    assert total == Decimal('80000.00')


# ---------------------------------------------------------------------------
# ESP deduction
# ---------------------------------------------------------------------------

def test_esp_is_8_33_percent_of_basic():
    assert calculate_esp(Decimal('13000')) == Decimal('1082.90')


# ---------------------------------------------------------------------------
# Income tax — Pakistan FY 2026-2027 salaried slabs
# ---------------------------------------------------------------------------

def test_annual_tax_zero_band():
    assert calculate_annual_tax_fy_2026_27(Decimal('500000')) == Decimal('0')
    assert calculate_annual_tax_fy_2026_27(Decimal('600000')) == Decimal('0')


def test_annual_tax_one_percent_band():
    # 800,000 -> (800,000 - 600,000) * 1% = 2,000
    assert calculate_annual_tax_fy_2026_27(Decimal('800000')) == Decimal('2000.00')


def test_annual_tax_eleven_percent_band():
    # 1,700,000 -> 6,000 + (1,700,000 - 1,200,000) * 11% = 61,000
    assert calculate_annual_tax_fy_2026_27(Decimal('1700000')) == Decimal('61000.00')


def test_annual_tax_twenty_percent_band():
    # 2,700,000 -> 116,000 + (2,700,000 - 2,200,000) * 20% = 216,000
    assert calculate_annual_tax_fy_2026_27(Decimal('2700000')) == Decimal('216000.00')


def test_annual_tax_twenty_five_percent_band():
    # 3,650,000 -> 316,000 + (3,650,000 - 3,200,000) * 25% = 428,500
    assert calculate_annual_tax_fy_2026_27(Decimal('3650000')) == Decimal('428500.00')


def test_annual_tax_twenty_nine_percent_band():
    # 4,850,000 -> 541,000 + (4,850,000 - 4,100,000) * 29% = 758,500
    assert calculate_annual_tax_fy_2026_27(Decimal('4850000')) == Decimal('758500.00')


def test_annual_tax_thirty_two_percent_band():
    # 6,300,000 -> 976,000 + (6,300,000 - 5,600,000) * 32% = 1,200,000
    assert calculate_annual_tax_fy_2026_27(Decimal('6300000')) == Decimal('1200000.00')


def test_annual_tax_thirty_five_percent_band():
    # 8,000,000 -> 1,424,000 + (8,000,000 - 7,000,000) * 35% = 1,774,000
    assert calculate_annual_tax_fy_2026_27(Decimal('8000000')) == Decimal('1774000.00')


def test_monthly_tax_zero_band():
    # monthly 50,000 -> annual 600,000 -> tax-free
    assert calculate_monthly_income_tax(Decimal('50000')) == Decimal('0.00')


def test_monthly_tax_eleven_percent_band():
    # monthly 100,000 -> annual 1,200,000 -> annual tax 6,000 -> monthly 500.00
    assert calculate_monthly_income_tax(Decimal('100000')) == Decimal('500.00')


def test_monthly_tax_thirty_five_percent_band():
    # monthly 650,000 -> annual 7,800,000 -> annual tax 1,704,000 -> monthly 142,000.00
    assert calculate_monthly_income_tax(Decimal('650000')) == Decimal('142000.00')


def test_calculate_deductions_combines_esp_and_tax():
    result = calculate_deductions(Decimal('13000'), Decimal('26000'))
    assert result['esp'] == Decimal('1082.90')
    assert result['income_tax'] == Decimal('0.00')  # annual 312,000 < 600,000
    assert result['total_deductions'] == Decimal('1082.90')


# ---------------------------------------------------------------------------
# Full payslip calculation
# ---------------------------------------------------------------------------

@pytest.fixture
def emp(db, org):
    from employees.models import Employee
    from datetime import date as _date
    return Employee.objects.create(
        organization=org,
        full_name="Calc Employee",
        cnic="1111222233334",
        personal_email="calc.employee@example.com",
        dob=_date(1990, 1, 1),
        gender="male",
    )


def _make(emp, month=1, year=2026, absents=0, lates=0, leaves=0, gross=26000):
    salary = Salary.objects.create(
        employee=emp, gross_salary=gross, effective_from=date(2026, 1, 1),
    )
    total_work_days = calculate_work_days(month, year)
    presents = max(0, total_work_days - absents - leaves)
    att = Attendance.objects.create(
        employee=emp, month=month, year=year, total_work_days=total_work_days,
        presents=presents, absents=absents, lates=lates, leaves=leaves,
    )
    return salary, att


def test_per_day_is_gross_over_total_work_days(emp):
    salary, att = _make(emp, gross=26000)
    result = calculate_payslip(att, salary)
    assert result['per_day_salary'] == Decimal('838.71')


def test_no_deductions_full_attendance(emp):
    # gross 26000: basic 13000, esp 1082.90, tax 0 (annual 312,000 < 600,000).
    salary, att = _make(emp, gross=26000)
    result = calculate_payslip(att, salary)
    assert result['gross_salary'] == Decimal('26000.00')
    assert result['basic_salary'] == Decimal('13000.00')
    assert result['hra'] == Decimal('5200.00')
    assert result['conveyance'] == Decimal('3900.00')
    assert result['utility'] == Decimal('2600.00')
    assert result['medical'] == Decimal('1300.00')
    assert result['esp'] == Decimal('1082.90')
    assert result['income_tax'] == Decimal('0.00')
    assert result['total_deductions'] == Decimal('1082.90')
    assert result['net_pay'] == Decimal('24917.10')


def test_absent_deduction(emp):
    # gross 26000. Jan 2026 = 31 work days. 4 absents, 0 leaves -> 4 deducted
    # per_day = 26000/31 = 838.71
    # absent_deduction = 4 * 838.71 = 3354.84
    # basic = 13000, esp = 1082.90
    # taxable = 26000 - 3354.84 = 22645.16 -> annual 271741.92 < 600000 -> tax = 0
    # net = 26000 - 1082.90 - 3354.84 = 21562.26
    salary, att = _make(emp, month=1, absents=4, gross=26000)
    result = calculate_payslip(att, salary)
    assert result['total_work_days'] == 31
    assert result['absent_days_deducted'] == Decimal('4')
    assert result['absent_deduction'] == Decimal('3354.84')
    assert result['net_pay'] == Decimal('21562.26')


def test_late_rule_included_in_absent_deduction(emp):
    # 5 lates -> 1.5 day eq. Jan 2026 = 31 work days. leaves=2.
    # effective_absents = 0 + 1.5 = 1.5
    # deducted = max(0, 1.5 - 2) = 0 -> no deduction
    salary, att = _make(emp, month=1, lates=5, leaves=2, gross=26000)
    result = calculate_payslip(att, salary)
    assert result['total_work_days'] == 31
    assert result['late_absent_equivalent'] == Decimal('1.50')
    assert result['absent_deduction'] == Decimal('0.00')
    assert result['net_pay'] == Decimal('24917.10')


def test_late_rule_over_quota_deducts(emp):
    # Feb 2026 = 28 work days. lates=8 -> late_eq=3. absents=0.
    # effective_absents = 3. leaves=0 -> 3 deducted.
    # per_day = 26000/28 = 928.57
    # absent_deduction = 3 * 928.57 = 2785.71
    # basic = 13000, esp = 1082.90
    # taxable = 26000 - 2785.71 = 23214.29 -> annual 278571.48 < 600000 -> tax = 0
    # net = 26000 - 1082.90 - 2785.71 = 22131.39
    salary, att = _make(emp, month=2, lates=8, gross=26000)
    result = calculate_payslip(att, salary)
    assert result['total_work_days'] == 28
    assert result['absent_days_deducted'] == Decimal('3')
    assert result['absent_deduction'] == Decimal('2785.71')
    assert result['net_pay'] == Decimal('22131.39')


def test_tax_applies_on_full_gross_regardless_of_attendance(emp):
    # gross 600,000. Jan 2026 = 31 work days. No absents -> no absent_deduction.
    # basic = 300,000, esp = 24,990.00
    # taxable = 600000 - 0 = 600000 -> annual 7,200,000
    # annual tax = 1,424,000 + 200,000*0.35 = 1,494,000
    # monthly tax = 124,500.00
    # per_day = 600000 / 31 = 19354.84
    # net = 600000 - 24990 - 124500 = 450510
    salary, att = _make(emp, month=1, gross=600000)
    result = calculate_payslip(att, salary)
    assert result['basic_salary'] == Decimal('300000.00')
    assert result['esp'] == Decimal('24990.00')
    assert result['income_tax'] == Decimal('124500.00')
    assert result['total_deductions'] == Decimal('149490.00')
    assert result['per_day_salary'] == Decimal('19354.84')
    assert result['net_pay'] == Decimal('450510.00')


def test_zero_work_days_raises(emp):
    salary = Salary.objects.create(
        employee=emp, gross_salary=26000, effective_from=date(2026, 1, 1),
    )
    att = Attendance.objects.create(
        employee=emp, month=1, year=2026, total_work_days=0, presents=0,
    )
    with pytest.raises(ValueError):
        calculate_payslip(att, salary)


# ---------------------------------------------------------------------------
# Model behaviors
# ---------------------------------------------------------------------------

def test_salary_auto_deactivates_previous(emp):
    s1 = Salary.objects.create(
        employee=emp, gross_salary=20000, effective_from=date(2026, 1, 1)
    )
    s2 = Salary.objects.create(
        employee=emp, gross_salary=25000, effective_from=date(2026, 6, 1)
    )
    s1.refresh_from_db()
    assert s1.is_active is False
    assert s1.effective_to == date(2026, 6, 1)
    assert s2.is_active is True


def test_attendance_validation_rejects_over_total(emp):
    with pytest.raises(ValidationError):
        Attendance.objects.create(
            employee=emp, month=1, year=2026, total_work_days=10,
            presents=8, absents=3, leaves=1,
        )


def test_attendance_unique_employee_month_year(emp):
    Attendance.objects.create(
        employee=emp, month=1, year=2026, total_work_days=26,
        presents=26,
    )
    with pytest.raises(ValidationError):
        Attendance.objects.create(
            employee=emp, month=1, year=2026, total_work_days=26,
            presents=26,
        )


# ---------------------------------------------------------------------------
# ESP settings-based calculation (employer matching by contribution count)
# ---------------------------------------------------------------------------

def _make_esp_ctx(emp, implementation=date(2025, 3, 1), brackets=None):
    """Org ESP settings + default 5 matching brackets + active enrollment."""
    settings = ESPSettings.objects.create(
        organization=emp.organization,
        implementation_date=implementation,
        employee_contribution_pct=Decimal('8.33'),
        basic_salary_pct=Decimal('50.00'),
        is_active=True,
    )
    for min_yr, max_yr, pct in (brackets or [
        (0, 1, 0), (1, 2, 25), (2, 3, 50), (3, 4, 75), (4, None, 100),
    ]):
        ESPMatchingBracket.objects.create(
            settings=settings,
            min_tenure_years=min_yr,
            max_tenure_years=max_yr,
            matching_pct=Decimal(pct),
        )
    enrollment = ESPEmployeeEnrollment.objects.create(
        employee=emp,
        esp_settings=settings,
        enrollment_date=implementation,
        is_active=True,
    )
    return settings, enrollment


@pytest.mark.parametrize('prior,expected_pct,expected_tenure', [
    (0, Decimal('0'), Decimal('0.00')),
    (11, Decimal('0'), Decimal('0.92')),
    (12, Decimal('25'), Decimal('1.00')),   # 12 completed contributions = 1 year
    (13, Decimal('25'), Decimal('1.08')),
    (24, Decimal('50'), Decimal('2.00')),   # 2 years
    (36, Decimal('75'), Decimal('3.00')),   # 3 years
    (48, Decimal('100'), Decimal('4.00')),  # 4 years
])
def test_esp_employer_matching_uses_contribution_count(emp, prior, expected_pct, expected_tenure):
    settings, enrollment = _make_esp_ctx(emp)
    result = calculate_esp_from_settings(
        Decimal('26000'), settings, enrollment, date(2024, 1, 1), date(2026, 9, 30),
        prior_contribution_count=prior,
    )
    assert result is not None
    assert result['employer_matching_pct'] == expected_pct
    assert result['tenure_years'] == expected_tenure


def test_esp_employer_matching_moves_completed_months_only_once(emp):
    settings, enrollment = _make_esp_ctx(emp)
    # 12th contribution: employer jumps to 25% exactly at count 12.
    prev = calculate_esp_from_settings(
        Decimal('26000'), settings, enrollment, date(2024, 1, 1), date(2026, 9, 30),
        prior_contribution_count=12,
    )
    assert prev['employer_matching_pct'] == Decimal('25')
    # Enrollment itself does not grant tenure: 0 paid months still 0%.
    fresh = calculate_esp_from_settings(
        Decimal('26000'), settings, enrollment, date(2024, 1, 1), date(2026, 9, 30),
    )
    assert fresh['employer_matching_pct'] == Decimal('0')


def test_esp_employee_contribution_constant_across_brackets(emp):
    settings, enrollment = _make_esp_ctx(emp)
    low = calculate_esp_from_settings(
        Decimal('26000'), settings, enrollment, date(2024, 1, 1), date(2026, 9, 30),
        prior_contribution_count=0,
    )
    high = calculate_esp_from_settings(
        Decimal('26000'), settings, enrollment, date(2024, 1, 1), date(2026, 9, 30),
        prior_contribution_count=48,
    )
    # Employee contribution is baisc% ⁄ 8.33% — bracket only changes employer side.
    assert low['employee_contribution_amount'] == high['employee_contribution_amount']
    assert low['employer_matching_amount'] == Decimal('0.00')
    assert high['employer_matching_amount'] == low['employee_contribution_amount']  # 100%
