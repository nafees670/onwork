"""
Pydantic/Django Ninja schemas for the payroll app.
"""
from typing import Optional, List
from ninja import Schema
from datetime import date, datetime
from decimal import Decimal


# ---------------------------------------------------------------------------
# Salary
# ---------------------------------------------------------------------------

class SalaryIn(Schema):
    employee_id: str
    gross_salary: Decimal
    currency: str = 'PKR'
    effective_from: date
    is_active: bool = True
    notes: Optional[str] = None


class SalaryUpdate(Schema):
    gross_salary: Optional[Decimal] = None
    currency: Optional[str] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class SalaryOut(Schema):
    id: str
    employee_id: str
    gross_salary: Decimal
    currency: str
    effective_from: date
    effective_to: Optional[date] = None
    is_active: bool
    notes: Optional[str] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------

class AttendanceIn(Schema):
    employee_id: str
    month: int
    year: int
    total_work_days: Optional[int] = None  # ignored by server; auto-calc from month/year
    presents: Optional[int] = None  # ignored by server; auto-calc from work_days/absents/leaves
    absents: int = 0
    lates: int = 0
    leaves: int = 0
    notes: Optional[str] = None


class AttendanceUpdate(Schema):
    total_work_days: Optional[int] = None
    presents: Optional[int] = None
    absents: Optional[int] = None
    lates: Optional[int] = None
    leaves: Optional[int] = None
    notes: Optional[str] = None


class AttendanceOut(Schema):
    id: str
    employee_id: str
    month: int
    year: int
    total_work_days: int
    presents: int
    absents: int
    lates: int
    leaves: int
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Payslip
# ---------------------------------------------------------------------------

class PayslipGenerateIn(Schema):
    employee_id: str
    month: int
    year: int


class PayslipUpdate(Schema):
    status: Optional[str] = None
    notes: Optional[str] = None


class PayslipOut(Schema):
    id: str
    employee_id: str
    month: int
    year: int
    # Earnings breakdown
    basic_salary: Decimal
    hra: Decimal
    conveyance: Decimal
    utility: Decimal
    medical: Decimal
    gross_salary: Decimal
    # Attendance
    total_work_days: int
    per_day_salary: Decimal
    late_absent_equivalent: Decimal
    effective_absents: int
    absent_days_deducted: Decimal
    absent_deduction: Decimal
    # Deductions
    esp: Decimal
    income_tax: Decimal
    taxable_income: Optional[Decimal] = None
    total_deductions: Decimal
    loan_deduction: Optional[Decimal] = Decimal('0.00')
    unpaid_leave_deduction: Optional[Decimal] = Decimal('0.00')
    # ESP breakdown
    esp_employee_contribution: Optional[Decimal] = None
    esp_employer_contribution: Optional[Decimal] = None
    esp_employee_pct_snapshot: Optional[Decimal] = None
    esp_employer_pct_snapshot: Optional[Decimal] = None
    esp_enrollment_id_snapshot: Optional[str] = None
    # Final
    net_pay: Decimal
    status: str
    notes: Optional[str] = None
    generated_at: datetime


# ---------------------------------------------------------------------------
# Bulk upload
# ---------------------------------------------------------------------------

class BulkUploadResult(Schema):
    processed: int
    succeeded: int
    failed: int
    errors: List[dict] = []


class BulkDeleteIn(Schema):
    ids: List[str]


class BulkDeleteResult(Schema):
    deleted: int
    not_found: int


# ---------------------------------------------------------------------------
# Message wrapper
# ---------------------------------------------------------------------------

class MessageOut(Schema):
    success: bool
    message: str


# ---------------------------------------------------------------------------
# ESP (Employee Savings Plan)
# ---------------------------------------------------------------------------

class ESPMatchingBracketIn(Schema):
    min_tenure_years: int
    max_tenure_years: Optional[int] = None
    matching_pct: Decimal


class ESPSettingsIn(Schema):
    implementation_date: date
    employee_contribution_pct: Decimal = Decimal('8.33')
    basic_salary_pct: Decimal = Decimal('50.00')
    is_active: bool = True
    notes: Optional[str] = None
    matching_brackets: List[ESPMatchingBracketIn] = []


class ESPMatchingBracketOut(Schema):
    id: str
    min_tenure_years: int
    max_tenure_years: Optional[int] = None
    matching_pct: Decimal


class ESPSettingsOut(Schema):
    id: str
    organization_id: str
    implementation_date: date
    employee_contribution_pct: Decimal
    basic_salary_pct: Decimal
    is_active: bool
    notes: Optional[str] = None
    matching_brackets: List[ESPMatchingBracketOut] = []
    created_at: datetime
    auto_enrolled: Optional[int] = None
    updated_dates: Optional[int] = None


class ESPEmployeeEnrollmentIn(Schema):
    employee_id: str
    enrollment_date: date
    is_active: bool = True
    notes: Optional[str] = None


class ESPEmployeeEnrollmentUpdate(Schema):
    enrollment_date: Optional[date] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class ESPEmployeeEnrollmentOut(Schema):
    id: str
    employee_id: str
    employee_name: str
    enrollment_date: date
    is_active: bool
    notes: Optional[str] = None
    created_at: datetime


class ESPContributionOut(Schema):
    id: str
    employee_id: str
    employee_name: str
    payslip_id: str
    contribution_date: date
    payroll_period_month: int
    payroll_period_year: int
    gross_salary_used: Decimal
    basic_salary_used: Decimal
    employee_contribution_pct_snapshot: Decimal
    employee_contribution_amount: Decimal
    employer_matching_pct_snapshot: Decimal
    employer_matching_amount: Decimal
    total_contribution: Decimal
    tenure_years_at_contribution: Decimal
    implementation_date_snapshot: date
    enrollment_date_snapshot: date
    date_of_joining_snapshot: date


class ESPContributionSummaryOut(Schema):
    employee_id: str
    employee_name: str
    total_employee_contributions: Decimal
    total_employer_contributions: Decimal
    total_balance: Decimal
    contribution_count: int


class ESPWithdrawalIn(Schema):
    employee_id: str
    requested_amount: Decimal
    reason: str


class ESPWithdrawalReviewIn(Schema):
    review_notes: Optional[str] = None


class ESPWithdrawalOut(Schema):
    id: str
    employee_id: str
    employee_name: str
    requested_amount: Decimal
    reason: str
    status: str
    requested_at: datetime
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    disbursed_at: Optional[datetime] = None


class ESPBalanceOut(Schema):
    employee_id: str
    employee_name: str
    total_employee_contributions: Decimal
    total_employer_contributions: Decimal
    total_withdrawn: Decimal
    current_balance: Decimal
