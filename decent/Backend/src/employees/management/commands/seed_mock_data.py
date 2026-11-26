"""
Seed realistic mock data for local/dev testing: Organization, Institutions,
Branches, Departments, Designations, and Employees in all three lifecycle
states (Pending Approval, Assigned/needs-placement, fully Active).

IDEMPOTENT — every object is created with get_or_create() keyed on its real
unique field (org_code, inst_code, branch_code, dept_code+parent,
position_code+department, cnic), so running this command again never
creates duplicates; it just reports "exists" and moves on.

No real emails are sent while this command runs: EMAIL_BACKEND is swapped
to Django's console backend for the duration of the command (see
`with override_settings(...)` below), so any notification that the model
layer fires on primary-assignment creation (see EmployeeAssignment.save())
is printed to the terminal instead of attempting real SMTP delivery.

Run it:

    # Local (non-docker), from HRMS/Backend/src:
    python manage.py seed_mock_data

    # Inside the docker-compose stack:
    docker compose exec hrms-service python manage.py seed_mock_data

    # Wipe and recreate everything this command owns, then reseed:
    python manage.py seed_mock_data --reset

Note on --reset: it permanently deletes (hard delete, via a plain queryset
.delete()) only the Organization/Institutions/Branches/Departments/
Designations/Employees this command itself created — nothing else in the
database is touched. This is a real delete, not the app's soft_delete().
"""
import random
from datetime import date

from django.core.management.base import BaseCommand
from django.db import transaction
from django.test.utils import override_settings

from employees.models import (
    Organization, Institution, Branch, Department, Designation,
    Employee, EmployeeAssignment, EmployeeStatus,
)
from payroll.models import (
    Salary, Attendance, ESPSettings, ESPEmployeeEnrollment,
    ESPMatchingBracket, EmployeeLoan, LoanInstallment,
    LeaveBalance, LeaveRequest, LeaveAdjustment,
)
from payroll.loan_services import generate_installment_schedule
from payroll.leave_services import seed_leave_types

ORG_CODE = "IAK"

# ─────────────────────────── Reference data ───────────────────────────

INSTITUTIONS = [
    {
        "inst_code": "AIT01", "name": "Al Khair Institute of Technology",
        "inst_type": "educational", "city": "Karachi",
        "branches": [
            {"branch_code": "C01", "branch_name": "Gulshan Campus", "city": "Karachi"},
            {"branch_code": "C02", "branch_name": "Korangi Campus", "city": "Karachi"},
        ],
    },
    {
        "inst_code": "AMC01", "name": "Al Khair Medical Center",
        "inst_type": "healthcare", "city": "Lahore",
        "branches": [
            {"branch_code": "H01", "branch_name": "Lahore Main Hospital", "city": "Lahore"},
            {"branch_code": "H02", "branch_name": "Model Town Clinic", "city": "Lahore"},
        ],
    },
    {
        "inst_code": "AKK01", "name": "Al Khair Community Kitchen",
        "inst_type": "social_welfare", "city": "Karachi",
        "branches": [
            {"branch_code": "K01", "branch_name": "Malir Kitchen", "city": "Karachi"},
            {"branch_code": "K02", "branch_name": "Landhi Kitchen", "city": "Karachi"},
        ],
    },
    {
        "inst_code": "AKHO1", "name": "Al Khair Head Office",
        "inst_type": "administrative", "city": "Islamabad",
        "branches": [
            {"branch_code": "O01", "branch_name": "Islamabad Head Office", "city": "Islamabad"},
        ],
    },
]

# Global departments live directly under the Organization (no institution/branch).
GLOBAL_DEPARTMENTS = [
    {"dept_code": "HR", "dept_name": "Human Resources",
     "designations": [("HRM", "HR Manager"), ("HRO", "HR Officer")]},
    {"dept_code": "FIN", "dept_name": "Finance",
     "designations": [("FM", "Finance Manager"), ("ACC", "Accountant")]},
]

# Institution-level departments (institution set, no branch) — e.g. a
# hospital-wide administration desk that isn't tied to one clinic location.
INSTITUTION_DEPARTMENTS = {
    "AMC01": [
        {"dept_code": "MEDADM", "dept_name": "Medical Administration",
         "designations": [("MAD", "Medical Administrator")]},
    ],
}

# Branch-level departments, keyed by branch_code.
BRANCH_DEPARTMENTS = {
    "C01": [
        {"dept_code": "ACAD", "dept_name": "Academics",
         "designations": [("TCH", "Teacher"), ("PRN", "Principal")]},
        {"dept_code": "ADM", "dept_name": "Administration",
         "designations": [("ADO", "Admin Officer")]},
    ],
    "C02": [
        {"dept_code": "ACAD", "dept_name": "Academics",
         "designations": [("TCH", "Teacher"), ("LAB", "Lab Assistant")]},
        {"dept_code": "IT", "dept_name": "IT Support",
         "designations": [("ITO", "IT Support Officer")]},
    ],
    "H01": [
        {"dept_code": "NUR", "dept_name": "Nursing",
         "designations": [("NRS", "Staff Nurse"), ("HNR", "Head Nurse")]},
        {"dept_code": "ER", "dept_name": "Emergency",
         "designations": [("EDR", "Emergency Doctor")]},
    ],
    "H02": [
        {"dept_code": "OPD", "dept_name": "Outpatient",
         "designations": [("GP", "General Physician")]},
    ],
    "K01": [
        {"dept_code": "KOP", "dept_name": "Kitchen Operations",
         "designations": [("HCK", "Head Cook"), ("KH", "Kitchen Helper")]},
        {"dept_code": "LOG", "dept_name": "Logistics",
         "designations": [("LGO", "Logistics Officer")]},
    ],
    "K02": [
        {"dept_code": "KOP", "dept_name": "Kitchen Operations",
         "designations": [("HCK", "Head Cook"), ("KH", "Kitchen Helper")]},
    ],
    "O01": [
        {"dept_code": "ADM", "dept_name": "Administration",
         "designations": [("ADA", "Admin Assistant")]},
        {"dept_code": "ACC", "dept_name": "Accounts",
         "designations": [("ACO", "Accounts Officer")]},
    ],
}

MALE_NAMES = [
    "Ahmed Raza", "Usman Khalid", "Bilal Ahmed", "Hamza Tariq", "Faisal Mahmood",
    "Imran Sheikh", "Tariq Javed", "Zeeshan Aslam", "Kashif Iqbal", "Waqas Hussain",
    "Adeel Nazir", "Shahzad Malik",
]
FEMALE_NAMES = [
    "Sana Malik", "Ayesha Siddiqui", "Fatima Noor", "Hira Shahid", "Mariam Yousuf",
    "Sadia Khan", "Nadia Aslam", "Rabia Saeed", "Amina Farooq", "Zara Hassan",
    "Sobia Riaz", "Komal Anwar",
]

CITIES = ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan"]

# Payroll mock data
SALARY_BY_POSITION = {
    "HRM": 120000, "HRO": 65000, "FM": 130000, "ACC": 75000,
    "MAD": 95000, "TCH": 55000, "PRN": 110000, "ADO": 60000,
    "LAB": 35000, "ITO": 70000, "NRS": 65000, "HNR": 85000,
    "EDR": 150000, "GP": 120000, "HCK": 55000, "KH": 32000,
    "LGO": 50000, "ADA": 45000, "ACO": 70000,
}

ESP_MATCHING_BRACKETS = [
    {"min_tenure_years": 0, "max_tenure_years": 1, "matching_pct": 0.00},
    {"min_tenure_years": 1, "max_tenure_years": 2, "matching_pct": 25.00},
    {"min_tenure_years": 2, "max_tenure_years": 3, "matching_pct": 50.00},
    {"min_tenure_years": 3, "max_tenure_years": 4, "matching_pct": 75.00},
    {"min_tenure_years": 4, "max_tenure_years": None, "matching_pct": 100.00},
]

LOAN_PLANS = [
    {"amount": 100000, "installments": 10, "reason": "Medical emergency"},
    {"amount": 50000, "installments": 5, "reason": "Home renovation"},
    {"amount": 200000, "installments": 12, "reason": "Children education"},
    {"amount": 75000, "installments": 6, "reason": "Vehicle purchase"},
]


class Command(BaseCommand):
    help = (
        "Seed mock Organization/Institutions/Branches/Departments/Designations "
        "and Employees (Pending, Assigned, Active) for local/dev testing. "
        "Idempotent — safe to run multiple times. Use --reset to delete first."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset", action="store_true",
            help="Permanently delete every object this command previously created before reseeding.",
        )

    def handle(self, *args, **options):
        with override_settings(EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend"):
            if options["reset"]:
                self._reset()
            with transaction.atomic():
                org = self._seed_organization()
                branches_by_code, depts_by_key, desigs_by_key = self._seed_structure(org)
                placed_employees = self._seed_employees(org, branches_by_code, depts_by_key, desigs_by_key)
                self._seed_payroll_data(org, placed_employees, desigs_by_key)

        self.stdout.write(self.style.SUCCESS("\nMock data seed complete."))

    # ─────────────────────────── Reset ───────────────────────────

    def _reset(self):
        self.stdout.write("Deleting previously seeded mock data...")
        org = Organization.all_objects.filter(org_code=ORG_CODE).first()
        if not org:
            self.stdout.write("  Nothing to reset (no IAK organization found).")
            return
        employees = Employee.all_objects.filter(organization=org)
        # Payroll data (must be deleted before employees due to FK constraints)
        from payroll.models import Payslip, ESPContribution, ESPWithdrawal
        from payroll.loan_models import LoanPayment
        from payroll.leave_models import LeaveAccrual
        ESPContribution.all_objects.filter(employee__in=employees).delete()
        ESPWithdrawal.all_objects.filter(employee__in=employees).delete()
        LoanPayment.all_objects.filter(employee__in=employees).delete()
        LoanInstallment.all_objects.filter(loan__employee__in=employees).delete()
        EmployeeLoan.all_objects.filter(employee__in=employees).delete()
        LeaveAccrual.all_objects.filter(employee__in=employees).delete()
        LeaveAdjustment.all_objects.filter(employee__in=employees).delete()
        LeaveRequest.all_objects.filter(employee__in=employees).delete()
        LeaveBalance.all_objects.filter(employee__in=employees).delete()
        ESPEmployeeEnrollment.all_objects.filter(employee__in=employees).delete()
        ESPEmployeeEnrollment.all_objects.filter(esp_settings__organization=org).delete()
        ESPMatchingBracket.all_objects.filter(settings__organization=org).delete()
        ESPSettings.all_objects.filter(organization=org).delete()
        Payslip.all_objects.filter(employee__in=employees).delete()
        Salary.all_objects.filter(employee__in=employees).delete()
        Attendance.all_objects.filter(employee__in=employees).delete()
        # HR data
        EmployeeAssignment.all_objects.filter(employee__in=employees).delete()
        employees.delete()
        Designation.all_objects.filter(department__organization=org).delete()
        Designation.all_objects.filter(department__institution__organization=org).delete()
        Designation.all_objects.filter(department__branch__institution__organization=org).delete()
        Department.all_objects.filter(organization=org).delete()
        Department.all_objects.filter(institution__organization=org).delete()
        Department.all_objects.filter(branch__institution__organization=org).delete()
        Branch.all_objects.filter(institution__organization=org).delete()
        Institution.all_objects.filter(organization=org).delete()
        org.delete()
        self.stdout.write("  Reset done.\n")

    # ─────────────────────────── Org / structure ───────────────────────────

    def _seed_organization(self):
        org, created = Organization.objects.get_or_create(
            org_code=ORG_CODE,
            defaults={
                "name": "Idara Al Khair",
                "website": "https://idaraalkhair.sbs",
                "email": "info@idaraalkhair.sbs",
                "phone": "021-111-222-333",
                "address": "Head Office, Islamabad, Pakistan",
            },
        )
        self._report("Organization", org.org_code, created)
        return org

    def _seed_structure(self, org):
        branches_by_code = {}
        depts_by_key = {}   # key: (scope_kind, scope_code, dept_code) -> Department
        desigs_by_key = {}  # key: (dept_pk, position_code) -> Designation

        # Global (organization-level) departments
        for d in GLOBAL_DEPARTMENTS:
            dept, created = Department.objects.get_or_create(
                organization=org, dept_code=d["dept_code"],
                defaults={"dept_name": d["dept_name"]},
            )
            self._report("  Department (global)", dept.dept_name, created)
            depts_by_key[("global", None, d["dept_code"])] = dept
            self._seed_designations(dept, d["designations"], desigs_by_key)

        # Institutions + branches
        for inst_data in INSTITUTIONS:
            inst, created = Institution.objects.get_or_create(
                inst_code=inst_data["inst_code"],
                defaults={
                    "organization": org,
                    "name": inst_data["name"],
                    "inst_type": inst_data["inst_type"],
                    "city": inst_data["city"],
                    "address": f"{inst_data['name']}, {inst_data['city']}",
                    "contact_number": "021-111-000-111",
                },
            )
            self._report("Institution", inst.inst_code, created)

            for dd in INSTITUTION_DEPARTMENTS.get(inst_data["inst_code"], []):
                dept, created = Department.objects.get_or_create(
                    institution=inst, dept_code=dd["dept_code"],
                    defaults={"dept_name": dd["dept_name"]},
                )
                self._report("  Department (institution)", dept.dept_name, created)
                depts_by_key[("institution", inst_data["inst_code"], dd["dept_code"])] = dept
                self._seed_designations(dept, dd["designations"], desigs_by_key)

            for br_data in inst_data["branches"]:
                branch, created = Branch.objects.get_or_create(
                    branch_code=br_data["branch_code"],
                    defaults={
                        "institution": inst,
                        "branch_name": br_data["branch_name"],
                        "city": br_data["city"],
                        "address": f"{br_data['branch_name']}, {br_data['city']}",
                        "contact_number": "021-111-000-222",
                        "established_year": random.randint(2005, 2022),
                        "status": "active",
                    },
                )
                self._report("  Branch", branch.branch_code, created)
                branches_by_code[branch.branch_code] = branch

                for bd in BRANCH_DEPARTMENTS.get(br_data["branch_code"], []):
                    dept, created = Department.objects.get_or_create(
                        branch=branch, dept_code=bd["dept_code"],
                        defaults={"dept_name": bd["dept_name"]},
                    )
                    self._report("    Department (branch)", f"{dept.dept_name} @ {branch.branch_code}", created)
                    depts_by_key[("branch", br_data["branch_code"], bd["dept_code"])] = dept
                    self._seed_designations(dept, bd["designations"], desigs_by_key)

        return branches_by_code, depts_by_key, desigs_by_key

    def _seed_designations(self, dept, designations, desigs_by_key):
        for position_code, position_name in designations:
            desig, created = Designation.objects.get_or_create(
                department=dept, position_code=position_code,
                defaults={"position_name": position_name},
            )
            self._report("    Designation", desig.position_name, created)
            desigs_by_key[(dept.pk, position_code)] = desig

    # ─────────────────────────── Employees ───────────────────────────

    def _provision_credentials_if_needed(self, emp):
        """Ensure active placed employees have login credentials for testing."""
        from employees.api import _provision_default_credentials
        from authentication.models import UserCredentials
        if not UserCredentials.objects.filter(employee=emp, is_deleted=False).exists():
            _provision_default_credentials(emp)
            self.stdout.write(f"    -> credentials provisioned for {emp.full_name}")

    def _seed_employees(self, org, branches_by_code, depts_by_key, desigs_by_key):
        placements = [
            # (scope_kind, scope_code, dept_code, position_code)
            ("branch", "C01", "ACAD", "TCH"), ("branch", "C01", "ADM", "ADO"),
            ("branch", "C02", "ACAD", "TCH"), ("branch", "C02", "IT", "ITO"),
            ("branch", "H01", "NUR", "NRS"), ("branch", "H01", "ER", "EDR"),
            ("branch", "H02", "OPD", "GP"),
            ("branch", "K01", "KOP", "HCK"), ("branch", "K01", "LOG", "LGO"),
            ("branch", "K02", "KOP", "KH"),
            ("branch", "O01", "ADM", "ADA"), ("branch", "O01", "ACC", "ACO"),
            ("institution", "AMC01", "MEDADM", "MAD"),
            ("global", None, "HR", "HRM"), ("global", None, "HR", "HRO"),
            ("global", None, "FIN", "FM"), ("global", None, "FIN", "ACC"),
        ]
        random.shuffle(placements)

        names = [(n, "male") for n in MALE_NAMES] + [(n, "female") for n in FEMALE_NAMES]
        random.shuffle(names)
        name_cycle = iter(names)

        def next_person():
            try:
                return next(name_cycle)
            except StopIteration:
                n, g = random.choice(MALE_NAMES + FEMALE_NAMES), random.choice(["male", "female"])
                return f"{n} Jr.", g

        counter = {"n": 0}
        placed_employees = []  # [(employee, position_code), ...]

        def make_employee(status, assign=False):
            counter["n"] += 1
            i = counter["n"]
            full_name, gender = next_person()
            slug = full_name.lower().replace(" ", "").replace("'", "")
            cnic = f"42101{20000000 + i:08d}"
            year = random.randint(1985, 2001)
            month = random.randint(1, 12)
            day = random.randint(1, 28)

            emp, created = Employee.objects.get_or_create(
                cnic=cnic,
                defaults={
                    "organization": org,
                    "full_name": full_name,
                    "gender": gender,
                    "dob": date(year, month, day),
                    "personal_email": f"{slug}{i}@mailinator.com",
                    "org_email": f"{slug}{i}@idaraalkhair.sbs",
                    "personal_phone": f"03{100000000 + i * 7:09d}",
                    "city": random.choice(CITIES),
                    "residential_address": f"House {i}, {random.choice(CITIES)}, Pakistan",
                    "employment_type": random.choice(["full_time", "full_time", "full_time", "contract", "probation"]),
                    "education": random.choice(["Bachelor's", "Master's", "Intermediate", "Diploma"]),
                    "nationality": "Pakistani",
                    "status": status,
                },
            )
            self._report(f"Employee [{status}]", emp.full_name, created)

            position_code = None
            if assign and created and placements:
                scope_kind, scope_code, dept_code, position_code = placements.pop()
                dept = depts_by_key[(scope_kind, scope_code, dept_code)]
                desig = desigs_by_key[(dept.pk, position_code)]
                EmployeeAssignment.objects.create(
                    employee=emp,
                    department=dept,
                    designation=desig,
                    joining_date=date(random.randint(2019, 2025), random.randint(1, 12), random.randint(1, 28)),
                    shift="general",
                    is_primary=True,
                )
                self.stdout.write(f"    -> assigned to {dept.dept_name} / {desig.position_name}")
            elif assign and not created:
                assignment = emp.assignments.filter(is_primary=True, is_deleted=False).first()
                if assignment and assignment.designation:
                    position_code = assignment.designation.position_code

            return emp, position_code

        # Group A — fresh "create employee" requests awaiting approval.
        for _ in range(8):
            make_employee(EmployeeStatus.PENDING_APPROVAL)

        # Group B — approved and active but not yet placed.
        for _ in range(6):
            make_employee(EmployeeStatus.ACTIVE)

        # Group C — fully placed employees (appear in "All", have an employee_code).
        for _ in range(10):
            emp, pos_code = make_employee(EmployeeStatus.ACTIVE, assign=True)
            placed_employees.append((emp, pos_code))

        # Group D — assign the previously unplaced active employees so every
        # active employee has a code, department, and can accrue leave.
        for emp in Employee.objects.filter(
            organization=org,
            status=EmployeeStatus.ACTIVE,
            is_deleted=False,
        ).exclude(assignments__is_deleted=False).distinct():
            if not placements:
                break
            scope_kind, scope_code, dept_code, position_code = placements.pop()
            dept = depts_by_key[(scope_kind, scope_code, dept_code)]
            desig = desigs_by_key[(dept.pk, position_code)]
            EmployeeAssignment.objects.create(
                employee=emp,
                department=dept,
                designation=desig,
                joining_date=date(random.randint(2019, 2025), random.randint(1, 12), random.randint(1, 28)),
                shift="general",
                is_primary=True,
            )
            self.stdout.write(f"    -> assigned {emp.full_name} to {dept.dept_name} / {desig.position_name}")
            placed_employees.append((emp, position_code))

        self._spread_created_at(placed_employees)

        # Ensure every active placed employee can log in for local testing.
        self.stdout.write("  Provisioning login credentials...")
        for emp, _ in placed_employees:
            self._provision_credentials_if_needed(emp)

        return placed_employees

    def _spread_created_at(self, placed_employees):
        """Distribute created_at timestamps across the last 7 days for trend realism."""
        from django.utils import timezone
        from datetime import timedelta, time

        if not placed_employees:
            return

        base = timezone.now().replace(hour=9, minute=0, second=0, microsecond=0)
        for idx, (emp, _) in enumerate(placed_employees):
            day_offset = idx % 7
            minute_offset = (idx // 7) * 15
            created = base - timedelta(days=day_offset, minutes=minute_offset)
            Employee.all_objects.filter(pk=emp.pk).update(created_at=created)

    # ─────────────────────────── Payroll data ───────────────────────────

    def _seed_payroll_data(self, org, placed_employees, desigs_by_key):
        self.stdout.write("\n── Payroll data ──")
        salaries = self._seed_salary_and_attendance(placed_employees, desigs_by_key)
        esp_settings = self._seed_esp_data(org, placed_employees)
        self._seed_loans(placed_employees)
        self._seed_leave_data(placed_employees)

    def _seed_salary_and_attendance(self, placed_employees, desigs_by_key):
        from decimal import Decimal
        salaries = {}
        for emp, pos_code in placed_employees:
            gross = SALARY_BY_POSITION.get(pos_code, 60000)
            salary, created = Salary.objects.get_or_create(
                employee=emp, is_active=True,
                defaults={
                    "gross_salary": Decimal(str(gross)),
                    "currency": "PKR",
                    "effective_from": date(2026, 1, 1),
                },
            )
            self._report("  Salary", f"{emp.full_name} = {gross}", created)
            salaries[emp.pk] = salary

            for month, year, work_days in [(8, 2026, 26), (9, 2026, 22)]:
                presents = work_days - random.randint(0, 3)
                lates = random.randint(0, 2)
                att, created = Attendance.objects.get_or_create(
                    employee=emp, month=month, year=year,
                    defaults={
                        "total_work_days": work_days,
                        "presents": presents,
                        "absents": work_days - presents,
                        "lates": lates,
                        "leaves": 0,
                    },
                )
                if created:
                    self.stdout.write(f"    Attendance {year}/{month:02d}: {presents}/{work_days}")

        return salaries

    def _seed_esp_data(self, org, placed_employees):
        from decimal import Decimal

        esp_settings, created = ESPSettings.objects.get_or_create(
            organization=org,
            defaults={
                "implementation_date": date(2026, 9, 1),
                "employee_contribution_pct": Decimal("8.33"),
                "basic_salary_pct": Decimal("50.00"),
                "is_active": True,
            },
        )
        self._report("ESP Settings", org.name, created)

        for bracket in ESP_MATCHING_BRACKETS:
            _, bcreated = ESPMatchingBracket.objects.get_or_create(
                settings=esp_settings,
                min_tenure_years=bracket["min_tenure_years"],
                max_tenure_years=bracket["max_tenure_years"],
                defaults={"matching_pct": Decimal(str(bracket["matching_pct"]))},
            )
            upper = bracket["max_tenure_years"] or "∞"
            if bcreated:
                self.stdout.write(f"    Bracket {bracket['min_tenure_years']}–{upper}yr: {bracket['matching_pct']}%")

        for emp, _ in placed_employees:
            assignment = emp.assignments.filter(is_primary=True, is_deleted=False).first()
            enroll_date = assignment.joining_date if assignment else date(2024, 1, 1)
            _, ecreated = ESPEmployeeEnrollment.objects.get_or_create(
                employee=emp,
                defaults={
                    "enrollment_date": enroll_date,
                    "esp_settings": esp_settings,
                    "is_active": True,
                },
            )
            if ecreated:
                self.stdout.write(f"    ESP enrolled: {emp.full_name} from {enroll_date}")

        return esp_settings

    def _seed_loans(self, placed_employees):
        from decimal import Decimal

        candidates = [emp for emp, _ in placed_employees[:4]]
        for idx, emp in enumerate(candidates):
            plan = LOAN_PLANS[idx % len(LOAN_PLANS)]
            amount = Decimal(str(plan["amount"]))
            n_inst = plan["installments"]
            monthly = (amount / Decimal(n_inst)).quantize(Decimal("0.01"))

            loan, created = EmployeeLoan.objects.get_or_create(
                employee=emp,
                start_date=date(2026, 3, 1),
                defaults={
                    "loan_amount": amount,
                    "num_installments": n_inst,
                    "monthly_installment": monthly,
                    "first_deduction_month": 4,
                    "first_deduction_year": 2026,
                    "status": "active",
                    "reason": plan["reason"],
                },
            )
            self._report("  Loan", f"{emp.full_name} — {amount} ({n_inst}mo)", created)

            if created:
                installments = generate_installment_schedule(
                    loan_amount=amount,
                    num_installments=n_inst,
                    first_deduction_month=4,
                    first_deduction_year=2026,
                    monthly_installment=monthly,
                )
                for inst_data in installments:
                    LoanInstallment.objects.create(loan=loan, **inst_data)
                self.stdout.write(f"    -> {len(installments)} installments generated")

                if idx < 2:
                    paid_months = 2 if idx == 0 else 1
                    paid = loan.installments.filter(status="pending").order_by("installment_number")[:paid_months]
                    for inst in paid:
                        inst.status = "paid"
                        inst.paid_amount = inst.installment_amount
                        inst.save(update_fields=["status", "paid_amount", "updated_at"])
                    self.stdout.write(f"    -> {paid_months} installment(s) marked paid")

    def _seed_leave_data(self, placed_employees):
        from decimal import Decimal
        from payroll.leave_models import LeaveType, LeaveBalance, LeaveRequest, LeaveAdjustment, LeaveAccrual
        from payroll.leave_services import get_accrued_leave
        from employees.models import Employee

        count = seed_leave_types()
        self.stdout.write(f"  Leave types: {count} new (rest existed)")

        leave_types = {lt.code: lt for lt in LeaveType.objects.filter(is_active=True, is_deleted=False)}

        if placed_employees:
            all_placed = [emp for emp, _ in placed_employees]
        else:
            all_placed = list(Employee.objects.filter(is_deleted=False, is_active=True))

        admin_emp = all_placed[0] if all_placed else None
        accrual_created_count = 0

        for emp in all_placed:
            for code, lt in leave_types.items():
                accrued = get_accrued_leave(emp, lt, as_of_date=date.today())

                balance, bcreated = LeaveBalance.objects.get_or_create(
                    employee=emp, leave_type=lt, year=2026,
                    defaults={
                        "accrued_days": accrued,
                        "consumed_days": Decimal("0.00"),
                        "adjusted_days": Decimal("0.00"),
                    },
                )

            # Seed monthly accruals for 2026 (Jan to Sep)
            for m in range(1, 10):
                cl = leave_types.get("casual")
                if cl:
                    _, created = LeaveAccrual.objects.get_or_create(
                        employee=emp,
                        leave_type=cl,
                        period_month=m,
                        period_year=2026,
                        defaults={
                            "accrual_date": date(2026, m, 1),
                            "days_accrued": Decimal("1.00"),
                        },
                    )
                    if created:
                        accrual_created_count += 1

                sl = leave_types.get("sick")
                if sl:
                    _, created = LeaveAccrual.objects.get_or_create(
                        employee=emp,
                        leave_type=sl,
                        period_month=m,
                        period_year=2026,
                        defaults={
                            "accrual_date": date(2026, m, 1),
                            "days_accrued": Decimal("0.83"),
                        },
                    )
                    if created:
                        accrual_created_count += 1

                al = leave_types.get("annual")
                if al:
                    _, created = LeaveAccrual.objects.get_or_create(
                        employee=emp,
                        leave_type=al,
                        period_month=m,
                        period_year=2026,
                        defaults={
                            "accrual_date": date(2026, m, 1),
                            "days_accrued": Decimal("1.16"),
                        },
                    )
                    if created:
                        accrual_created_count += 1

            cl = leave_types.get("casual")
            if cl:
                LeaveRequest.objects.get_or_create(
                    employee=emp,
                    leave_type=cl,
                    start_date=date(2026, 7, 15),
                    end_date=date(2026, 7, 16),
                    defaults={
                        "total_days": 2,
                        "status": "approved",
                        "reason": "Family event",
                        "approved_at": "2026-07-10T10:00:00Z",
                    },
                )

        adj_samples = [
            ("casual", "add", Decimal("2.00"), "Discretionary HR bonus leave awarded for outstanding project delivery"),
            ("sick", "deduct", Decimal("1.00"), "Adjustment for unexcused absence correction"),
            ("annual", "correction", Decimal("14.00"), "Annual leave entitlement rollover correction"),
            ("casual", "add", Decimal("1.50"), "Special attendance award extra leave"),
            ("sick", "add", Decimal("3.00"), "Medical emergency extended allowance"),
            ("annual", "deduct", Decimal("2.00"), "Unapproved extended leave deduction"),
            ("casual", "correction", Decimal("10.00"), "Mid-year casual leave balance realignment"),
            ("sick", "add", Decimal("2.00"), "HR approved health wellness grant"),
        ]

        adj_created_count = 0
        for i, emp in enumerate(all_placed[:8]):
            code, adj_type, days, reason = adj_samples[i % len(adj_samples)]
            lt = leave_types.get(code)
            if lt:
                bal, _ = LeaveBalance.objects.get_or_create(
                    employee=emp, leave_type=lt, year=2026,
                    defaults={"accrued_days": Decimal("10.00"), "consumed_days": Decimal("0.00"), "adjusted_days": Decimal("0.00")}
                )
                prev_bal = bal.available_days
                if adj_type == "add":
                    bal.adjusted_days += days
                elif adj_type == "deduct":
                    bal.adjusted_days -= days
                elif adj_type == "correction":
                    bal.adjusted_days = days
                bal.save(update_fields=["adjusted_days", "updated_at"])

                _, created = LeaveAdjustment.objects.get_or_create(
                    employee=emp,
                    leave_type=lt,
                    reason=reason,
                    defaults={
                        "adjustment_type": adj_type,
                        "days": days,
                        "previous_balance": prev_bal,
                        "new_balance": bal.available_days,
                        "adjusted_by": admin_emp,
                    },
                )
                if created:
                    adj_created_count += 1

        self.stdout.write(f"  Leave accruals: {accrual_created_count} created ({LeaveAccrual.objects.count()} total)")
        self.stdout.write(f"  Leave adjustments: {adj_created_count} created ({LeaveAdjustment.objects.count()} total)")

    # ─────────────────────────── Helpers ───────────────────────────

    def _report(self, label, name, created):
        tag = self.style.SUCCESS("created") if created else self.style.WARNING("exists ")
        self.stdout.write(f"  [{tag}] {label}: {name}")
