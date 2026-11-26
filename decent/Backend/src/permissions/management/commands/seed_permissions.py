from django.core.management.base import BaseCommand
from permissions.models import Permission

AUTH_PERMISSIONS = [
    # Dashboard
    {"codename": "dashboard.view",          "name": "View Management Dashboard"},
    # Employees
    {"codename": "employee.view",           "name": "View Employees"},
    {"codename": "employee.create",         "name": "Create Employee"},
    {"codename": "employee.edit",           "name": "Edit Employee"},
    {"codename": "employee.delete",         "name": "Delete Employee"},
    # Employee Assignments
    {"codename": "assignment.create",       "name": "Create Employee Assignment"},
    {"codename": "assignment.edit",         "name": "Edit Employee Assignment"},
    {"codename": "assignment.delete",       "name": "Delete Employee Assignment"},
    # Organization
    {"codename": "organization.view",       "name": "View Organization"},
    # Institution
    {"codename": "institution.view",        "name": "View Institutions"},
    {"codename": "institution.create",      "name": "Create Institution"},
    {"codename": "institution.edit",        "name": "Edit Institution"},
    {"codename": "institution.delete",      "name": "Delete Institution"},
    # Branch
    {"codename": "branch.view",             "name": "View Branches"},
    {"codename": "branch.create",           "name": "Create Branch"},
    {"codename": "branch.edit",             "name": "Edit Branch"},
    {"codename": "branch.delete",           "name": "Delete Branch"},
    # Department
    {"codename": "department.view",         "name": "View Departments"},
    {"codename": "department.create",       "name": "Create Department"},
    {"codename": "department.edit",         "name": "Edit Department"},
    {"codename": "department.delete",       "name": "Delete Department"},
    # Designation
    {"codename": "designation.view",        "name": "View Designations"},
    {"codename": "designation.create",      "name": "Create Designation"},
    {"codename": "designation.edit",        "name": "Edit Designation"},
    {"codename": "designation.delete",      "name": "Delete Designation"},
    # Service Access
    {"codename": "service_access.view",     "name": "View Service Access"},
    {"codename": "service_access.grant",    "name": "Grant Service Access"},
    {"codename": "service_access.toggle",   "name": "Toggle Service Access"},
    # Roles (RBAC management)
    {"codename": "role.view",               "name": "View Roles"},
    {"codename": "role.manage",             "name": "Manage Roles"},
    # Audit
    {"codename": "audit.view",              "name": "View Audit Logs"},
    # Payroll
    {"codename": "payroll.salary.view",     "name": "View Salary"},
    {"codename": "payroll.salary.create",   "name": "Create Salary"},
    {"codename": "payroll.salary.update",   "name": "Update Salary"},
    {"codename": "payroll.salary.delete",   "name": "Delete Salary"},
    {"codename": "payroll.attendance.view", "name": "View Attendance"},
    {"codename": "payroll.attendance.create", "name": "Create Attendance"},
    {"codename": "payroll.attendance.update", "name": "Update Attendance"},
    {"codename": "payroll.attendance.delete", "name": "Delete Attendance"},
    {"codename": "payroll.payslip.view",    "name": "View Payslip"},
    {"codename": "payroll.payslip.generate", "name": "Generate Payslip"},
    {"codename": "payroll.payslip.update",  "name": "Update Payslip"},
    {"codename": "payroll.payslip.delete",  "name": "Delete Payslip"},
    # ESP (Employee Savings Plan)
    {"codename": "payroll.esp.settings",     "name": "Manage ESP Settings"},
    {"codename": "payroll.esp.enrollment",   "name": "Manage ESP Enrollments"},
    {"codename": "payroll.esp.contribution", "name": "View ESP Contributions"},
    {"codename": "payroll.esp.withdrawal",   "name": "Manage ESP Withdrawals"},
    # Loans
    {"codename": "payroll.loan.view",        "name": "View Loans"},
    {"codename": "payroll.loan.create",      "name": "Create Loan"},
    {"codename": "payroll.loan.edit",        "name": "Edit Loan"},
    {"codename": "payroll.loan.delete",      "name": "Delete Loan"},
    # Leaves
    {"codename": "payroll.leave.view",       "name": "View Leaves"},
    {"codename": "payroll.leave.create",     "name": "Create Leave Request"},
    {"codename": "payroll.leave.edit",       "name": "Edit Leave"},
    {"codename": "payroll.leave.approve",    "name": "Approve/Reject Leave"},
    # HR Policy (view is open to every authenticated employee — no codename needed)
    {"codename": "hr_policy.manage",        "name": "Manage HR Policies"},
    # Employee Requests (submitting is open to every employee — no codename needed)
    {"codename": "employee_request.view",   "name": "View Employee Requests"},
    {"codename": "employee_request.review", "name": "Approve/Reject Employee Requests"},
]


class Command(BaseCommand):
    help = "Seed Auth-service permissions. Idempotent — safe to run multiple times."

    def handle(self, *args, **options):
        created_count = 0
        for entry in AUTH_PERMISSIONS:
            _, created = Permission.objects.get_or_create(
                codename=entry["codename"],
                defaults={"name": entry["name"], "service": "auth"},
            )
            if created:
                created_count += 1
                self.stdout.write(f"  Created: {entry['codename']}")
            else:
                self.stdout.write(f"  Exists:  {entry['codename']}")

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone. {created_count} new, {len(AUTH_PERMISSIONS) - created_count} already existed."
            )
        )
