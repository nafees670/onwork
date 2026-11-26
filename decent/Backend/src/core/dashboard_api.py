"""
Admin dashboard analytics endpoint.

Aggregates live HR, leave, ESP, and loan metrics for the superadmin dashboard.
"""
from decimal import Decimal
from typing import Optional, List

from django.db.models import Sum, Q
from django.utils import timezone
from ninja import Router, Schema
from ninja.errors import HttpError

from authentication.api import AuthBearer
from employees.models import Employee, EmployeeStatus
from payroll.leave_models import LeaveRequest, LeaveBalance
from payroll.models import ESPContribution, ESPWithdrawal
from payroll.loan_models import EmployeeLoan
from payroll.general_request_models import EmployeeRequest


dashboard_router = Router(tags=["dashboard"], auth=AuthBearer())


class TurnoverMonthOut(Schema):
    label: str
    exits: int
    avg_headcount: int
    rate: float


class AttritionByDeptOut(Schema):
    department: str
    exits: int


class RequestsByCategoryOut(Schema):
    category: str
    count: int


class DashboardAnalyticsOut(Schema):
    total_employees: int
    active_employees: int
    pending_employees: int
    suspended_employees: int
    total_leave_requests: int
    pending_leave_requests: int
    approved_leave_requests: int
    rejected_leave_requests: int
    total_leave_balance: Decimal
    total_esp_contributions: Decimal
    total_esp_employer_contributions: Decimal
    total_esp_withdrawals_pending: Decimal
    total_esp_balance: Decimal
    total_active_loans: int
    total_loan_outstanding: Decimal
    total_monthly_loan_deductions: Decimal
    turnover_trend: List[TurnoverMonthOut]
    attrition_by_department: List[AttritionByDeptOut]
    pending_employee_requests: int
    approved_employee_requests: int
    rejected_employee_requests: int
    requests_by_category: List[RequestsByCategoryOut]


@dashboard_router.get("/analytics", response=DashboardAnalyticsOut)
def dashboard_analytics(request):
    if not getattr(request.auth, 'is_superadmin', False):
        raise HttpError(403, "Admin access required")

    employees = Employee.objects.filter(is_deleted=False)
    # Only consider employees who are active AND placed (have assignment)
    placed_employees = employees.filter(status=EmployeeStatus.ACTIVE, assignments__is_deleted=False).distinct()
    active_employees = placed_employees.count()
    pending_employees = employees.filter(status=EmployeeStatus.PENDING_APPROVAL).count()
    suspended_employees = employees.filter(status=EmployeeStatus.SUSPENDED).count()
    total_employees = placed_employees.count()

    leave_requests = LeaveRequest.objects.filter(is_deleted=False)
    total_leave_requests = leave_requests.count()
    pending_leave_requests = leave_requests.filter(status='pending').count()
    approved_leave_requests = leave_requests.filter(status='approved').count()
    rejected_leave_requests = leave_requests.filter(status='rejected').count()

    total_leave_balance = (
        LeaveBalance.objects.filter(is_deleted=False, employee__is_deleted=False)
        .aggregate(t=Sum('accrued_days') - Sum('consumed_days') + Sum('adjusted_days'))['t']
        or Decimal('0')
    )

    esp_contributions = ESPContribution.objects.filter(is_deleted=False)
    total_esp_contributions = (
        esp_contributions.aggregate(t=Sum('employee_contribution_amount'))['t'] or Decimal('0')
    )
    total_esp_employer_contributions = (
        esp_contributions.aggregate(t=Sum('employer_matching_amount'))['t'] or Decimal('0')
    )
    total_esp_withdrawals_pending = (
        ESPWithdrawal.objects.filter(status='pending', is_deleted=False)
        .aggregate(t=Sum('requested_amount'))['t'] or Decimal('0')
    )
    total_esp_withdrawals_disbursed = (
        ESPWithdrawal.objects.filter(status__in=['approved', 'disbursed'], is_deleted=False)
        .aggregate(t=Sum('requested_amount'))['t'] or Decimal('0')
    )
    total_esp_balance = (
        total_esp_contributions + total_esp_employer_contributions - total_esp_withdrawals_disbursed
    )

    active_loans = EmployeeLoan.objects.filter(status='active', is_deleted=False)
    total_active_loans = active_loans.count()
    total_loan_outstanding = Decimal('0')
    total_monthly_loan_deductions = Decimal('0')
    for loan in active_loans:
        total_loan_outstanding += loan.total_remaining
        total_monthly_loan_deductions += loan.monthly_installment

    # ── Turnover: last 6 months, computed from real exit_date/joining_date data ──
    exited_statuses = [EmployeeStatus.RESIGNED, EmployeeStatus.TERMINATED]
    all_employees = list(
        Employee.objects.filter(is_deleted=False)
        .select_related()
        .prefetch_related('assignments__department')
    )

    def _month_bounds(months_ago: int):
        today = timezone.now().date()
        year = today.year
        month = today.month - months_ago
        while month <= 0:
            month += 12
            year -= 1
        start = today.replace(year=year, month=month, day=1)
        if month == 12:
            end = start.replace(year=year + 1, month=1, day=1)
        else:
            end = start.replace(month=month + 1, day=1)
        return start, end

    turnover_trend = []
    for months_ago in range(5, -1, -1):
        start, end = _month_bounds(months_ago)
        exits_in_month = 0
        headcount = 0
        for emp in all_employees:
            primary = emp.primary_assignment
            joined = primary.joining_date if primary else None
            if not joined or joined >= end:
                continue  # not yet joined by end of this month
            exited_before_month = emp.exit_date and emp.exit_date < start
            if exited_before_month:
                continue  # already gone before this month started
            headcount += 1
            if emp.status in exited_statuses and emp.exit_date and start <= emp.exit_date < end:
                exits_in_month += 1
        rate = round((exits_in_month / headcount) * 100, 2) if headcount else 0.0
        turnover_trend.append({
            'label': start.strftime('%b'),
            'exits': exits_in_month,
            'avg_headcount': headcount,
            'rate': rate,
        })

    attrition_counts: dict = {}
    for emp in all_employees:
        if emp.status not in exited_statuses or not emp.exit_date:
            continue
        primary = emp.primary_assignment
        dept_name = primary.department.dept_name if primary and primary.department else "Unassigned"
        attrition_counts[dept_name] = attrition_counts.get(dept_name, 0) + 1
    attrition_by_department = [
        {'department': dept, 'exits': count}
        for dept, count in sorted(attrition_counts.items(), key=lambda kv: -kv[1])
    ]

    # ── Employee Requests ──
    emp_requests = EmployeeRequest.objects.filter(is_deleted=False)
    pending_employee_requests = emp_requests.filter(status='pending').count()
    approved_employee_requests = emp_requests.filter(status='approved').count()
    rejected_employee_requests = emp_requests.filter(status='rejected').count()
    category_labels = dict(EmployeeRequest.CATEGORY_CHOICES)
    category_counts: dict = {}
    for r in emp_requests.only('category'):
        label = category_labels.get(r.category, r.category)
        category_counts[label] = category_counts.get(label, 0) + 1
    requests_by_category = [
        {'category': cat, 'count': count}
        for cat, count in sorted(category_counts.items(), key=lambda kv: -kv[1])
    ]

    return {
        'total_employees': total_employees,
        'active_employees': active_employees,
        'pending_employees': pending_employees,
        'suspended_employees': suspended_employees,
        'total_leave_requests': total_leave_requests,
        'pending_leave_requests': pending_leave_requests,
        'approved_leave_requests': approved_leave_requests,
        'rejected_leave_requests': rejected_leave_requests,
        'total_leave_balance': total_leave_balance,
        'total_esp_contributions': total_esp_contributions,
        'total_esp_employer_contributions': total_esp_employer_contributions,
        'total_esp_withdrawals_pending': total_esp_withdrawals_pending,
        'total_esp_balance': total_esp_balance,
        'total_active_loans': total_active_loans,
        'total_loan_outstanding': total_loan_outstanding,
        'total_monthly_loan_deductions': total_monthly_loan_deductions,
        'turnover_trend': turnover_trend,
        'attrition_by_department': attrition_by_department,
        'pending_employee_requests': pending_employee_requests,
        'approved_employee_requests': approved_employee_requests,
        'rejected_employee_requests': rejected_employee_requests,
        'requests_by_category': requests_by_category,
    }
