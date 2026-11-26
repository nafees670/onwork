"""
Seed a full monthly payroll + ESP history for demonstration.

WIPES all payroll *transactional* data (payslips, ESP contributions,
attendance, salaries, loans, leaves, enrollments, withdrawals) and rebuilds
it month-by-month from the ESP implementation date up to the current month.

Result per employee:
  * attendance record for every month in the range
  * PAID payslip for every completed month (current month = draft)
  * one ESPContribution row per payslip that had ESP applied
  * employer matching % advances on ACTUAL contribution count
    (12 contributions = 1 bracket year), not calendar time

Org structure, employees, credentials and the ESP settings/brackets are kept.
Employee contribution starts automatically at the first payslip AFTER the
enrollment date. Employees joined after implementation start later — their
bracket just lags, which is realistic.

Run from Backend/src:
    python manage.py seed_esp_history
    docker compose exec hrms-service python manage.py seed_esp_history
"""
import calendar
import random
from datetime import date
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.test.utils import override_settings

from employees.models import Employee, EmployeeAssignment
from payroll.loan_models import LoanPayment
from payroll.loan_services import (
    generate_installment_schedule,
    calculate_loan_deduction_for_month,
    apply_loan_deductions,
)
from payroll.leave_models import (
    LeaveType, LeaveBalance, LeaveRequest, LeaveAccrual, LeaveAdjustment,
)
from payroll.leave_services import seed_leave_types, get_accrued_leave
from payroll.models import (
    Salary, Attendance, Payslip, ESPSettings, ESPMatchingBracket,
    ESPEmployeeEnrollment, ESPContribution, ESPWithdrawal,
    EmployeeLoan, LoanInstallment,
)
from payroll.services import calculate_payslip, calc_and_validate

DEFAULT_IMPLEMENTATION = date(2025, 3, 1)

ESP_MATCHING_BRACKETS = [
    {"min_tenure_years": 0, "max_tenure_years": 1, "matching_pct": Decimal("0.00")},
    {"min_tenure_years": 1, "max_tenure_years": 2, "matching_pct": Decimal("25.00")},
    {"min_tenure_years": 2, "max_tenure_years": 3, "matching_pct": Decimal("50.00")},
    {"min_tenure_years": 3, "max_tenure_years": 4, "matching_pct": Decimal("75.00")},
    {"min_tenure_years": 4, "max_tenure_years": None, "matching_pct": Decimal("100.00")},
]

LOAN_PLANS = [
    {"amount": 100000, "installments": 10, "reason": "Medical emergency"},
    {"amount": 50000, "installments": 5, "reason": "Home renovation"},
    {"amount": 200000, "installments": 12, "reason": "Children education"},
]

DEFAULT_GROSS = 60000


class Command(BaseCommand):
    help = "Wipe payroll transactional data and seed month-by-month salary/attendance/payslip/ESP history."

    def handle(self, *args, **options):
        today = date.today()

        with override_settings(EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend"):
            with transaction.atomic():
                employees = self._find_employees()
                if not employees:
                    self.stdout.write(self.style.WARNING("No active placed employees found."))
                    return

                old_gross = self._snapshot_grosses(employees)
                self._wipe_payroll_data(employees)
                settings = self._ensure_esp_settings()
                enrollments = self._ensure_enrollments(employees, settings)
                self._seed_loans(employees)
                salaries = self._seed_salaries(employees, old_gross)
                summary = self._seed_monthly_history(
                    employees, salaries, enrollments, settings, today
                )
                self._seed_leave_data(employees)

        self.stdout.write(self.style.SUCCESS("\nDone."))
        self.stdout.write(f"  Employees:         {len(employees)}")
        self.stdout.write(f"  Period:            {settings.implementation_date} -> {today.isoformat()}")
        self.stdout.write(f"  Attendance rows:   {summary['attendance']}")
        self.stdout.write(f"  Payslips:          {summary['payslips']}")
        self.stdout.write(f"  ESP contributions: {summary['contributions']}")
        self.stdout.write(f"  With employer>0:   {summary['with_employer']}")
        for k in sorted(summary['bracket_counts']):
            self.stdout.write(f"    - employer {k}% bracket: {summary['bracket_counts'][k]} contributions")

    # ─────────────────────────── helpers ───────────────────────────

    def _find_employees(self):
        assigned_ids = EmployeeAssignment.objects.filter(
            is_primary=True, is_deleted=False,
        ).values_list('employee_id', flat=True)
        return list(Employee.objects.filter(
            pk__in=assigned_ids, is_deleted=False,
        ).order_by('id'))

    def _snapshot_grosses(self, employees):
        grosses = {}
        for emp in employees:
            s = Salary.objects.filter(
                employee=emp, is_active=True, is_deleted=False,
            ).order_by('-effective_from').first()
            if s:
                grosses[emp.pk] = Decimal(s.gross_salary)
        return grosses

    def _wipe_payroll_data(self, employees):
        emp_q = Q(employee__in=employees)
        for model in (ESPContribution, ESPWithdrawal, LoanPayment,
                      LeaveAccrual, LeaveAdjustment, LeaveRequest, LeaveBalance):
            model.all_objects.filter(emp_q).delete()
        LoanInstallment.all_objects.filter(loan__employee__in=employees).delete()
        EmployeeLoan.all_objects.filter(employee__in=employees).delete()
        ESPEmployeeEnrollment.all_objects.filter(employee__in=employees).delete()
        Payslip.all_objects.filter(employee__in=employees).delete()
        Attendance.all_objects.filter(employee__in=employees).delete()
        Salary.all_objects.filter(employee__in=employees).delete()
        self.stdout.write(f"  Wiped payroll transactional data for {len(employees)} employees.")

    def _ensure_esp_settings(self):
        settings = ESPSettings.objects.filter(is_active=True, is_deleted=False).first()
        if not settings:
            org = Employee.objects.filter(is_deleted=False).first().organization
            settings = ESPSettings.objects.create(
                organization=org,
                implementation_date=DEFAULT_IMPLEMENTATION,
                employee_contribution_pct=Decimal("8.33"),
                basic_salary_pct=Decimal("50.00"),
                is_active=True,
            )
            self.stdout.write(f"  Created ESP settings (implementation {settings.implementation_date})")
        else:
            self.stdout.write(f"  Using existing ESP settings (implementation {settings.implementation_date})")

        existing = {(b.min_tenure_years, b.max_tenure_years) for b in
                    settings.matching_brackets.filter(is_deleted=False)}
        for bracket in ESP_MATCHING_BRACKETS:
            key = (bracket["min_tenure_years"], bracket["max_tenure_years"])
            if key not in existing:
                ESPMatchingBracket.objects.create(
                    settings=settings,
                    min_tenure_years=bracket["min_tenure_years"],
                    max_tenure_years=bracket["max_tenure_years"],
                    matching_pct=bracket["matching_pct"],
                )
        return settings

    def _ensure_enrollments(self, employees, settings):
        enrollments = {}
        joined_late = 0
        for emp in employees:
            assignment = emp.assignments.filter(is_primary=True, is_deleted=False).first()
            joining = assignment.joining_date if assignment else None
            enroll_date = joining if joining and joining > settings.implementation_date else settings.implementation_date
            if enroll_date > settings.implementation_date:
                joined_late += 1
            enroll, _ = ESPEmployeeEnrollment.objects.get_or_create(
                employee=emp,
                defaults={
                    "enrollment_date": enroll_date,
                    "esp_settings": settings,
                    "is_active": True,
                },
            )
            enrollments[emp.pk] = enroll
        self.stdout.write(f"  Enrollments: {len(enrollments)} ({joined_late} joined after implementation)")
        return enrollments

    def _seed_salaries(self, employees, old_gross):
        salaries = {}
        for emp in employees:
            gross = old_gross.get(emp.pk, DEFAULT_GROSS)
            salaries[emp.pk] = Salary.objects.create(
                employee=emp,
                gross_salary=gross,
                currency="PKR",
                effective_from=DEFAULT_IMPLEMENTATION,
            )
        return salaries

    def _seed_loans(self, employees):
        implementation = ESPSettings.objects.first().implementation_date
        for idx, emp in enumerate(employees[:3]):
            plan = LOAN_PLANS[idx % len(LOAN_PLANS)]
            amount = Decimal(str(plan["amount"]))
            n_inst = plan["installments"]
            monthly = (amount / Decimal(n_inst)).quantize(Decimal("0.01"))
            first_m = implementation.month + 1
            first_y = implementation.year if first_m <= 12 else implementation.year + 1
            if first_m > 12:
                first_m = 1
            loan = EmployeeLoan.objects.create(
                employee=emp,
                loan_amount=amount,
                num_installments=n_inst,
                monthly_installment=monthly,
                start_date=implementation,
                first_deduction_month=first_m,
                first_deduction_year=first_y,
                status="active",
                reason=plan["reason"],
            )
            installments = generate_installment_schedule(
                loan_amount=amount,
                num_installments=n_inst,
                first_deduction_month=first_m,
                first_deduction_year=first_y,
                monthly_installment=monthly,
            )
            for inst_data in installments:
                LoanInstallment.objects.create(loan=loan, **inst_data)
            self.stdout.write(f"  Loan: {emp.full_name} — {amount} ({n_inst}mo)")

    @staticmethod
    def _iter_months(start, end):
        y, m = start.year, start.month
        while (y, m) <= (end.year, end.month):
            yield m, y
            m += 1
            if m == 13:
                m, y = 1, y + 1

    def _seed_monthly_history(self, employees, salaries, enrollments, settings, today):
        summary = {
            'attendance': 0, 'payslips': 0, 'contributions': 0,
            'with_employer': 0, 'bracket_counts': {},
        }
        current = (today.month, today.year)

        for month, year in self._iter_months(settings.implementation_date, today):
            work_days = calc_and_validate(month, year, 0, 0, 0)[0]
            is_current = (month, year) == current
            status = 'draft' if is_current else 'paid'

            for emp in employees:
                salary = salaries[emp.pk]
                assignment = emp.assignments.filter(is_primary=True, is_deleted=False).first()
                joining = assignment.joining_date if assignment else None
                enrollment = enrollments[emp.pk]

                # ~85% perfect attendance; remainder get 1-2 absents + a stray late.
                absents = 0
                lates = 0
                if random_value(emp.id, month, year) >= 15:
                    absents = random_absents(emp.id, month)
                    lates = random_lates(emp.id, year)
                presents = max(0, work_days - absents)

                att, _ = Attendance.objects.get_or_create(
                    employee=emp, month=month, year=year,
                    defaults={
                        "total_work_days": work_days,
                        "presents": presents,
                        "absents": absents,
                        "lates": lates,
                        "leaves": 0,
                    },
                )
                summary['attendance'] += 1

                if Payslip.objects.filter(
                    employee=emp, month=month, year=year, is_deleted=False,
                ).exists():
                    continue

                prior = ESPContribution.objects.filter(
                    employee=emp, is_deleted=False,
                ).filter(
                    Q(payroll_period_year__lt=year)
                    | Q(payroll_period_year=year, payroll_period_month__lt=month)
                ).count()

                loan_deduction, installment_deductions = calculate_loan_deduction_for_month(emp, month, year)
                calc = calculate_payslip(
                    att, salary,
                    esp_settings=settings, enrollment=enrollment, joining_date=joining,
                    loan_deduction=loan_deduction,
                    esp_prior_contributions=prior,
                )

                payslip = Payslip.objects.create(
                    employee=emp, salary=salary, attendance=att,
                    month=month, year=year, status=status, **calc,
                )
                summary['payslips'] += 1

                if 'esp_employee_contribution' in calc:
                    contribution_date = date(
                        year, month, calendar.monthrange(year, month)[1]
                    )
                    c = ESPContribution.objects.create(
                        employee=emp,
                        payslip=payslip,
                        enrollment=enrollment,
                        esp_settings=settings,
                        contribution_date=contribution_date,
                        payroll_period_month=month,
                        payroll_period_year=year,
                        implementation_date_snapshot=settings.implementation_date,
                        enrollment_date_snapshot=enrollment.enrollment_date,
                        date_of_joining_snapshot=joining,
                        gross_salary_used=calc['gross_salary'],
                        basic_salary_used=calc['esp_basic_salary_used'],
                        employee_contribution_pct_snapshot=calc['esp_employee_pct_snapshot'],
                        employee_contribution_amount=calc['esp_employee_contribution'],
                        employer_matching_pct_snapshot=calc['esp_employer_pct_snapshot'],
                        employer_matching_amount=calc['esp_employer_contribution'],
                        total_contribution=calc['esp_employee_contribution'] + calc['esp_employer_contribution'],
                        tenure_years_at_contribution=calc['esp_tenure_years'],
                    )
                    summary['contributions'] += 1
                    summary['bracket_counts'][str(c.employer_matching_pct_snapshot)] = \
                        summary['bracket_counts'].get(str(c.employer_matching_pct_snapshot), 0) + 1
                    if c.employer_matching_amount > 0:
                        summary['with_employer'] += 1

                if installment_deductions:
                    apply_loan_deductions(payslip, installment_deductions)

        return summary

    def _seed_leave_data(self, employees):
        seed_leave_types()
        leave_types = {lt.code: lt for lt in LeaveType.objects.filter(is_active=True, is_deleted=False)}
        for emp in employees:
            assignment = emp.assignments.filter(is_primary=True, is_deleted=False).first()
            if not assignment:
                continue
            for lt in leave_types.values():
                accrued = get_accrued_leave(emp, lt, as_of_date=date.today())
                LeaveBalance.objects.get_or_create(
                    employee=emp, leave_type=lt, year=2026,
                    defaults={
                        "accrued_days": accrued,
                        "consumed_days": Decimal("0.00"),
                        "adjusted_days": Decimal("0.00"),
                    },
                )
        cl = leave_types.get("casual")
        sl = leave_types.get("sick")
        for emp in employees[:8]:
            if cl:
                LeaveRequest.objects.get_or_create(
                    employee=emp, leave_type=cl,
                    start_date=date(2026, 7, 15), end_date=date(2026, 7, 16),
                    defaults={
                        "total_days": 2, "status": "approved",
                        "reason": "Family event",
                        "approved_at": "2026-07-10T10:00:00Z",
                    },
                )
            if sl:
                LeaveRequest.objects.get_or_create(
                    employee=emp, leave_type=sl,
                    start_date=date(2026, 10, 1), end_date=date(2026, 10, 2),
                    defaults={
                        "total_days": 2, "status": "pending",
                        "reason": "Medical appointment",
                    },
                )
        self.stdout.write(f"  Leave: seeded balances + requests for {len(employees)} employees.")


def _stable_seed(emp_id, salt):
    return int(emp_id.int % (10 ** 9)) + salt


def random_value(emp_id, month, year):
    return random.Random(_stable_seed(emp_id, month + year * 12)).randint(0, 99)


def random_absents(emp_id, month):
    return random.Random(_stable_seed(emp_id, month)).randint(1, 2)


def random_lates(emp_id, year):
    return random.Random(_stable_seed(emp_id, year)).randint(1, 3)