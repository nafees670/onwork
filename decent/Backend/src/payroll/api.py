"""
Payroll API endpoints for Auth Service.

Provides full CRUD for Salary, Attendance, Payslip, plus:
- Payslip generation (POST /payslip/generate/)
- Bulk attendance upload from CSV (POST /attendance/bulk-upload/)
"""
import csv
import io
from typing import Optional, List
from decimal import Decimal, ROUND_HALF_UP
from datetime import date as _date

from django.db import transaction
from django.db.models import Sum, Q
from django.shortcuts import get_object_or_404
from django.core.exceptions import ValidationError
from django.utils import timezone

from ninja import Router, File
from ninja.errors import HttpError
from ninja.files import UploadedFile

from employees.models import Employee, Organization, EmployeeAssignment
from authentication.api import AuthBearer
from permissions.rbac import require_permission

from .models import (
    Salary, Attendance, Payslip,
    ESPSettings, ESPMatchingBracket, ESPEmployeeEnrollment,
    ESPContribution, ESPWithdrawal, SystemFeatureToggle,
    is_feature_enabled, set_feature_enabled,
)
from .schemas import (
    SalaryIn, SalaryUpdate, SalaryOut,
    AttendanceIn, AttendanceUpdate, AttendanceOut,
    PayslipGenerateIn, PayslipUpdate, PayslipOut,
    BulkUploadResult, BulkDeleteIn, BulkDeleteResult, MessageOut,
    ESPSettingsIn, ESPSettingsOut, ESPMatchingBracketOut,
    ESPEmployeeEnrollmentIn, ESPEmployeeEnrollmentUpdate, ESPEmployeeEnrollmentOut,
    ESPContributionOut, ESPContributionSummaryOut,
    ESPWithdrawalIn, ESPWithdrawalReviewIn, ESPWithdrawalOut, ESPBalanceOut,
)
from ninja import Schema
from .services import calculate_payslip, calculate_work_days, calc_and_validate, calculate_esp_from_settings
from .loan_services import calculate_loan_deduction_for_month, apply_loan_deductions

class SystemToggleUpdate(Schema):
    key: str
    enabled: bool

class SystemTogglesOut(Schema):
    allow_loan_requests: bool
    allow_esp_withdrawal_requests: bool

router = Router(tags=["payroll"], auth=AuthBearer())



def _get_employee(employee_id: str) -> Employee:
    emp = Employee.objects.filter(employee_id=employee_id, is_deleted=False).first()
    if not emp:
        raise HttpError(404, f"Employee not found: {employee_id}")
    return emp


def _raise_if_invalid_month(month: int):
    if not (1 <= month <= 12):
        raise HttpError(422, "month must be between 1 and 12")


def _get_total_working_days(year: int, month: int) -> int:
    """Compute total working days for a given month/year consistently.
    Uses Calendar Month Days policy: total days in month.
    """
    return calculate_work_days(month, year)



# ---------------------------------------------------------------------------
# Salary CRUD
# ---------------------------------------------------------------------------

@router.get("/salary", response=List[SalaryOut])
@require_permission("payroll.salary.view")
def list_salaries(request, employee_id: Optional[str] = None,
                  active_only: bool = False):
    qs = Salary.objects.select_related('employee').all()
    if employee_id:
        qs = qs.filter(employee__employee_id=employee_id)
    if active_only:
        qs = qs.filter(is_active=True)
    return [
        {
            'id': str(s.id),
            'employee_id': s.employee.employee_id,
            'gross_salary': s.gross_salary,
            'currency': s.currency,
            'effective_from': s.effective_from,
            'effective_to': s.effective_to,
            'is_active': s.is_active,
            'notes': s.notes,
            'created_at': s.created_at,
        }
        for s in qs
    ]


@router.post("/salary", response=SalaryOut)
@require_permission("payroll.salary.create")
def create_salary(request, payload: SalaryIn):
    emp = _get_employee(payload.employee_id)
    salary = Salary.objects.create(
        employee=emp,
        gross_salary=payload.gross_salary,
        currency=payload.currency,
        effective_from=payload.effective_from,
        is_active=payload.is_active,
        notes=payload.notes,
    )
    return {
        'id': str(salary.id),
        'employee_id': emp.employee_id,
        'gross_salary': salary.gross_salary,
        'currency': salary.currency,
        'effective_from': salary.effective_from,
        'effective_to': salary.effective_to,
        'is_active': salary.is_active,
        'notes': salary.notes,
        'created_at': salary.created_at,
    }


@router.get("/salary/{salary_id}", response=SalaryOut)
@require_permission("payroll.salary.view")
def get_salary(request, salary_id: str):
    s = get_object_or_404(Salary, id=salary_id, is_deleted=False)
    return {
        'id': str(s.id),
        'employee_id': s.employee.employee_id,
        'gross_salary': s.gross_salary,
        'currency': s.currency,
        'effective_from': s.effective_from,
        'effective_to': s.effective_to,
        'is_active': s.is_active,
        'notes': s.notes,
        'created_at': s.created_at,
    }


@router.put("/salary/{salary_id}", response=SalaryOut)
@require_permission("payroll.salary.update")
def update_salary(request, salary_id: str, payload: SalaryUpdate):
    s = get_object_or_404(Salary, id=salary_id, is_deleted=False)
    data = payload.dict(exclude_unset=True)
    for field, value in data.items():
        if field != 'employee_id':
            setattr(s, field, value)
    s.save()
    return {
        'id': str(s.id),
        'employee_id': s.employee.employee_id,
        'gross_salary': s.gross_salary,
        'currency': s.currency,
        'effective_from': s.effective_from,
        'effective_to': s.effective_to,
        'is_active': s.is_active,
        'notes': s.notes,
        'created_at': s.created_at,
    }


@router.delete("/salary/{salary_id}", response=MessageOut)
@require_permission("payroll.salary.delete")
def delete_salary(request, salary_id: str):
    s = get_object_or_404(Salary, id=salary_id, is_deleted=False)
    s.soft_delete(deleted_by=request.auth.id if hasattr(request.auth, 'id') else None,
                  reason='Deleted via API')
    return {'success': True, 'message': 'Salary deleted'}


@router.post("/salary/{salary_id}/deactivate", response=MessageOut)
@require_permission("payroll.salary.update")
def deactivate_salary(request, salary_id: str):
    s = get_object_or_404(Salary, id=salary_id, is_deleted=False)
    s.is_active = False
    s.save(update_fields=['is_active', 'updated_at'])
    return {'success': True, 'message': 'Salary deactivated'}


# ---------------------------------------------------------------------------
# Attendance CRUD
# ---------------------------------------------------------------------------

@router.get("/attendance", response=List[AttendanceOut])
@require_permission("payroll.attendance.view")
def list_attendance(request, employee_id: Optional[str] = None,
                    month: Optional[int] = None, year: Optional[int] = None):
    qs = Attendance.objects.select_related('employee').all()
    if employee_id:
        qs = qs.filter(employee__employee_id=employee_id)
    if month:
        qs = qs.filter(month=month)
    if year:
        qs = qs.filter(year=year)
    return [
        {
            'id': str(a.id),
            'employee_id': a.employee.employee_id,
            'month': a.month,
            'year': a.year,
            'total_work_days': a.total_work_days,
            'presents': a.presents,
            'absents': a.absents,
            'lates': a.lates,
            'leaves': a.leaves,
            'notes': a.notes,
        }
        for a in qs
    ]


@router.post("/attendance", response=AttendanceOut)
@require_permission("payroll.attendance.create")
def create_attendance(request, payload: AttendanceIn):
    emp = _get_employee(payload.employee_id)
    _raise_if_invalid_month(payload.month)
    try:
        total_work_days, presents = calc_and_validate(
            payload.month, payload.year, payload.absents, payload.leaves, payload.lates
        )
        att, _ = Attendance.objects.update_or_create(
            employee=emp, month=payload.month, year=payload.year,
            defaults={
                'total_work_days': total_work_days,
                'presents': presents,
                'absents': payload.absents,
                'lates': payload.lates,
                'leaves': payload.leaves,
                'notes': payload.notes,
            },
        )
    except (ValueError, ValidationError) as exc:
        raise HttpError(422, str(exc))
    return {
        'id': str(att.id),
        'employee_id': emp.employee_id,
        'month': att.month,
        'year': att.year,
        'total_work_days': att.total_work_days,
        'presents': att.presents,
        'absents': att.absents,
        'lates': att.lates,
        'leaves': att.leaves,
        'notes': att.notes,
    }


@router.post("/attendance/bulk-upload", response=BulkUploadResult)
@require_permission("payroll.attendance.create")
def bulk_upload_attendance(request, file: UploadedFile = File(...)):
    """Bulk upload attendance from CSV or Excel file.

    Columns: employee_id, month, year, total_work_days, presents, absents, lates, leaves
    Supported formats: .csv, .xlsx
    """
    import json
    from decimal import Decimal
    processed = succeeded = failed = 0
    errors = []

    file_name = file.name
    file_ext = file_name.lower().split('.')[-1] if '.' in file_name else ''

    with transaction.atomic():
        if file_ext == 'csv':
            if file.name and not file.name.lower().endswith('.csv'):
                raise HttpError(422, "Only CSV files are supported for .csv extension")

            decoded = file.read().decode('utf-8-sig')
            reader = csv.DictReader(io.StringIO(decoded))
            if reader.fieldnames:
                reader.fieldnames = [f.strip() if f else f for f in reader.fieldnames]

            expected = {'employee_id', 'month', 'year'}
            if not expected.issubset(set(reader.fieldnames or [])):
                raise HttpError(
                    422,
                    "CSV must have columns: employee_id, month, year, absents, lates, leaves (total_work_days/presents optional — auto-calculated)"
                )

            for row_num, row in enumerate(reader, start=2):
                if not row or not any(str(v).strip() for v in row.values() if v is not None):
                    continue
                emp_id = str(row.get('employee_id') or '').strip()
                if not emp_id:
                    continue

                processed += 1
                try:
                    emp = Employee.objects.filter(
                        employee_id=emp_id, is_deleted=False
                    ).first()
                    if not emp:
                        raise ValueError(f"Employee not found: {emp_id}")
                    month = int(float(row['month']))
                    year = int(float(row['year']))
                    _raise_if_invalid_month(month)
                    absents = int(float(row.get('absents') or 0))
                    lates = int(float(row.get('lates') or 0))
                    leaves = int(float(row.get('leaves') or 0))
                    total_work_days, presents = calc_and_validate(month, year, absents, leaves, lates)
                    Attendance.objects.update_or_create(
                        employee=emp, month=month, year=year,
                        defaults={
                            'total_work_days': total_work_days,
                            'presents': presents,
                            'absents': absents,
                            'lates': lates,
                            'leaves': leaves,
                            'notes': row.get('notes') or None,
                        },
                    )
                    succeeded += 1
                except Exception as exc:
                    failed += 1
                    errors.append({'row': row_num, 'error': str(exc)})

        elif file_ext in ('xlsx', 'xls'):
            from openpyxl import load_workbook

            decoded = io.BytesIO(file.read())
            wb = load_workbook(decoded, data_only=True)
            ws = wb.active

            if ws is None:
                raise HttpError(422, "Excel file has no worksheets")

            headers = [str(cell.value).strip() if cell.value is not None else '' for cell in next(ws.iter_rows(min_row=1, max_row=1))]
            expected = {'employee_id', 'month', 'year'}
            if not expected.issubset(set(headers)):
                raise HttpError(
                    422,
                    f"Excel must have columns: {', '.join(expected)} (total_work_days/presents optional — auto-calculated)"
                )

            for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
                row_data = dict(zip(headers, row))
                if not row_data or not any(str(v).strip() for v in row_data.values() if v is not None):
                    continue
                emp_id = str(row_data.get('employee_id') or '').strip()
                if not emp_id:
                    continue

                processed += 1
                try:
                    emp = Employee.objects.filter(
                        employee_id=emp_id, is_deleted=False
                    ).first()
                    if not emp:
                        raise ValueError(f"Employee not found: {emp_id}")
                    month = int(float(row_data.get('month') or 0))
                    year = int(float(row_data.get('year') or 0))
                    _raise_if_invalid_month(month)
                    absents = int(float(row_data.get('absents') or 0))
                    lates = int(float(row_data.get('lates') or 0))
                    leaves = int(float(row_data.get('leaves') or 0))
                    total_work_days, presents = calc_and_validate(month, year, absents, leaves, lates)
                    Attendance.objects.update_or_create(
                        employee=emp, month=month, year=year,
                        defaults={
                            'total_work_days': total_work_days,
                            'presents': presents,
                            'absents': absents,
                            'lates': lates,
                            'leaves': leaves,
                            'notes': str(row_data.get('notes')) if row_data.get('notes') else None,
                        },
                    )
                    succeeded += 1
                except Exception as exc:
                    failed += 1
                    errors.append({'row': row_num, 'error': str(exc)})

        else:
            raise HttpError(422, f"Unsupported file format: .{file_ext}")

    return {'processed': processed, 'succeeded': succeeded, 'failed': failed, 'errors': errors}






@router.get("/attendance/template")
@require_permission("payroll.attendance.view")
def attendance_template(request, month: int = None, year: int = None, branch: str = None):
    """Generate attendance template CSV file for given month/year/branch.
    
    Columns: employee_id, employee_name, branch, designation, month, year, total_work_days, presents, absents, lates, leaves
    """
    from django.http import HttpResponse
    from datetime import date as _date
    import csv
    import io

    if month:
        _raise_if_invalid_month(month)

    year_val = int(year) if year else _date.today().year
    month_val = int(month) if month else _date.today().month
    total = calculate_work_days(month_val, year_val)
    
    # Build employee queryset
    from employees.models import Employee
    qs = Employee.objects.filter(is_deleted=False).prefetch_related(
        'assignments__designation',
        'assignments__department__branch',
        'assignments__department__institution',
        'assignments__department__organization',
    )
    if branch:
        from django.db import models
        qs = qs.filter(
            models.Q(assignments__department__branch__branch_name__icontains=branch) |
            models.Q(assignments__department__branch__branch_code__iexact=branch) |
            models.Q(assignments__department__institution__name__icontains=branch) |
            models.Q(assignments__department__organization__name__icontains=branch)
        )
    qs = qs.distinct()
    
    # Create CSV
    output = io.StringIO()
    # UTF-8 BOM for Microsoft Excel compatibility
    output.write('\ufeff')
    writer = csv.writer(output)

    headers = [
        'employee_id', 'employee_name', 'branch', 'designation',
        'month', 'year', 'total_work_days', 'presents', 'absents', 'lates', 'leaves'
    ]
    writer.writerow(headers)

    for emp in qs.order_by('employee_id'):
        pa = emp.assignments.filter(is_deleted=False).order_by('-is_primary', 'created_at').first()
        branch_name = ""
        desig_name = ""
        if pa:
            if pa.designation:
                desig_name = pa.designation.position_name or ""
            if pa.department:
                if pa.department.branch:
                    branch_name = pa.department.branch.branch_name
                elif pa.department.institution:
                    branch_name = pa.department.institution.name
                elif pa.department.organization:
                    branch_name = pa.department.organization.name

        writer.writerow([
            emp.employee_id,
            emp.full_name,
            branch_name,
            desig_name,
            month_val,
            year_val,
            total,
            0,
            0,
            0,
            0,
        ])

    response = HttpResponse(
        output.getvalue(),
        content_type='text/csv; charset=utf-8'
    )
    filename = f"attendance_template_{month_val}_{year_val}.csv"
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


@router.patch("/attendance/employee/{employee_id}", response=AttendanceOut)
@require_permission("payroll.attendance.update")
def patch_attendance_single(request, employee_id: str, month: int = None, year: int = None):
    """Manual single-employee attendance edit.
    
    Upserts attendance record for the given employee/month/year using the same
    logic as bulk upload per-row processing.
    """
    emp = _get_employee(employee_id)
    _raise_if_invalid_month(month) if month else None
    
    # Read payload fields (partial update allowed)
    from payroll.schemas import AttendanceUpdate
    # We'll read directly from request body since it's PATCH
    import json as _json
    try:
        payload = _json.loads(request.body) if request.body else {}
    except Exception:
        payload = {}
    
    absents = payload.get('absents')
    lates = payload.get('lates')
    leaves = payload.get('leaves')
    notes = payload.get('notes')
    
    try:
        # If month and year not provided, preserve existing record values
        if not month or not year:
            existing = Attendance.objects.filter(
                employee=emp, is_deleted=False
            ).order_by('-year', '-month').first()
            month = month or (existing.month if existing else None)
            year = year or (existing.year if existing else None)
            if month is None or year is None:
                raise ValueError('month and year are required to create attendance')
            _raise_if_invalid_month(month)
            absents = absents if absents is not None else existing.absents
            lates = lates if lates is not None else existing.lates
            leaves = leaves if leaves is not None else existing.leaves
            total_work_days, presents = calc_and_validate(month, year, absents, leaves, lates)
        else:
            total_work_days, presents = calc_and_validate(month, year, absents or 0, leaves or 0, lates or 0)
        att, _ = Attendance.objects.update_or_create(
            employee=emp, month=month, year=year,
            defaults={
                'total_work_days': total_work_days,
                'presents': presents,
                'absents': absents if absents is not None else 0,
                'lates': lates if lates is not None else 0,
                'leaves': leaves if leaves is not None else 0,
                'notes': notes,
            },
        )
    except (ValueError, Exception) as exc:
        raise HttpError(422, str(exc))
    
    return {
        'id': str(att.id),
        'employee_id': att.employee.employee_id,
        'month': att.month,
        'year': att.year,
        'total_work_days': att.total_work_days,
        'presents': att.presents,
        'absents': att.absents,
        'lates': att.lates,
        'leaves': att.leaves,
        'notes': att.notes,
    }


@router.delete("/attendance/bulk-delete", response=BulkDeleteResult)
@require_permission("payroll.attendance.delete")
def bulk_delete_attendance(request, payload: BulkDeleteIn):
    """Soft-delete multiple attendance records by id.

    Only currently-active (is_deleted False) records matching the given ids
    are soft-deleted. Returns how many were deleted vs not found.
    """
    deleted_by = request.auth.id if hasattr(request.auth, 'id') else None
    qs = Attendance.objects.filter(id__in=payload.ids, is_deleted=False)

    deleted = 0
    found_ids = set()
    with transaction.atomic():
        for a in qs:
            a.soft_delete(deleted_by=deleted_by, reason='Bulk delete via API')
            deleted += 1
            found_ids.add(str(a.id))

    not_found = len(set(payload.ids).difference(found_ids))
    return {'deleted': deleted, 'not_found': not_found}


@router.get("/attendance/{attendance_id}", response=AttendanceOut)
@require_permission("payroll.attendance.view")
def get_attendance(request, attendance_id: str):
    a = get_object_or_404(Attendance, id=attendance_id, is_deleted=False)
    return {
        'id': str(a.id),
        'employee_id': a.employee.employee_id,
        'month': a.month,
        'year': a.year,
        'total_work_days': a.total_work_days,
        'presents': a.presents,
        'absents': a.absents,
        'lates': a.lates,
        'leaves': a.leaves,
        'notes': a.notes,
    }


@router.put("/attendance/{attendance_id}", response=AttendanceOut)
@require_permission("payroll.attendance.update")
def update_attendance(request, attendance_id: str, payload: AttendanceUpdate):
    a = get_object_or_404(Attendance, id=attendance_id, is_deleted=False)
    data = payload.dict(exclude_unset=True)
    # Apply provided fields, then enforce auto-calc invariants.
    for field, value in data.items():
        if field in ('total_work_days', 'presents'):
            continue  # derived fields — always recomputed server-side
        setattr(a, field, value)
    try:
        a.total_work_days = calculate_work_days(a.month, a.year)
        a.presents = a.total_work_days - a.absents - a.leaves
        calc_and_validate(a.month, a.year, a.absents, a.leaves, a.lates)
        a.save()
    except (ValueError, ValidationError) as exc:
        raise HttpError(422, str(exc))
    return {
        'id': str(a.id),
        'employee_id': a.employee.employee_id,
        'month': a.month,
        'year': a.year,
        'total_work_days': a.total_work_days,
        'presents': a.presents,
        'absents': a.absents,
        'lates': a.lates,
        'leaves': a.leaves,
        'notes': a.notes,
    }


@router.delete("/attendance/{attendance_id}", response=MessageOut)
@require_permission("payroll.attendance.delete")
def delete_attendance(request, attendance_id: str):
    a = get_object_or_404(Attendance, id=attendance_id, is_deleted=False)
    a.soft_delete(deleted_by=request.auth.id if hasattr(request.auth, 'id') else None,
                  reason='Deleted via API')
    return {'success': True, 'message': 'Attendance deleted'}


# ---------------------------------------------------------------------------
# Payslip CRUD + Generation
# ---------------------------------------------------------------------------

@router.get("/payslip", response=List[PayslipOut])
@require_permission("payroll.payslip.view")
def list_payslips(request, employee_id: Optional[str] = None,
                  month: Optional[int] = None, year: Optional[int] = None,
                  status: Optional[str] = None):
    qs = Payslip.objects.select_related('employee').all()
    if employee_id:
        qs = qs.filter(employee__employee_id=employee_id)
    if month:
        qs = qs.filter(month=month)
    if year:
        qs = qs.filter(year=year)
    if status:
        qs = qs.filter(status=status)
    return [_payslip_out(p) for p in qs]


def _load_esp_context(emp):
    """Load ESP settings, enrollment, and joining_date for payslip generation.

    Returns (esp_settings, enrollment, joining_date) or (None, None, None) if
    ESP is not applicable for this employee.
    """
    from employees.models import Organization
    org = getattr(emp, 'organization', None) or Organization.objects.filter(is_deleted=False).first()
    if not org:
        return None, None, None

    if not getattr(emp, 'organization_id', None) and org:
        try:
            emp.organization = org
            emp.save(update_fields=['organization', 'updated_at'])
        except Exception:
            pass

    esp_settings = (
        ESPSettings.objects.filter(organization=org, is_deleted=False, is_active=True).first()
        or ESPSettings.objects.filter(is_deleted=False, is_active=True).first()
    )
    if not esp_settings:
        return None, None, None

    assignment = (
        emp.assignments.filter(is_primary=True, is_deleted=False).order_by('created_at').first()
        or emp.assignments.filter(is_deleted=False).order_by('created_at').first()
    )
    joining_date = assignment.joining_date if (assignment and assignment.joining_date) else getattr(emp, 'hire_date', None) or (emp.created_at.date() if getattr(emp, 'created_at', None) else None)

    enrollment = ESPEmployeeEnrollment.objects.filter(
        employee=emp, is_deleted=False, is_active=True
    ).first()
    if not enrollment and emp.is_active:
        # ESP is org-wide: auto-enroll employees who were never enrolled
        # (e.g. hired after ESP was configured). Deliberately deleted or
        # deactivated rows are respected — no re-creation.
        if not ESPEmployeeEnrollment.objects.filter(employee=emp).exists():
            enrollment = ESPEmployeeEnrollment.objects.create(
                employee=emp,
                enrollment_date=_esp_enrollment_date(esp_settings, joining_date),
                esp_settings=esp_settings,
                is_active=True,
            )
    if not enrollment:
        return None, None, None

    if not joining_date:
        return None, None, None

    return esp_settings, enrollment, joining_date


def _prior_esp_contribution_count(emp, month, year):
    """Number of ESP contributions already generated strictly before this payroll period.

    Employer matching % is driven by ACTUAL completed salary contributions
    (12 contributions = 1 year), not calendar time since ESP implementation.
    """
    before = Q(payroll_period_year__lt=year) | Q(
        payroll_period_year=year, payroll_period_month__lt=month
    )
    return ESPContribution.objects.filter(
        employee=emp, is_deleted=False
    ).filter(before).count()


def _create_esp_contribution(payslip, calc, emp, esp_settings, enrollment, joining_date):
    """Create or update an ESPContribution record from a payslip calc dict, if ESP was applied."""
    emp_amount = calc.get('esp_employee_contribution') or payslip.esp
    if not emp_amount or emp_amount <= 0:
        return None

    import calendar as _cal
    contribution_date = _date(
        payslip.year, payslip.month,
        _cal.monthrange(payslip.year, payslip.month)[1]
    )
    org_amount = calc.get('esp_employer_contribution') or Decimal('0.00')

    contrib, _ = ESPContribution.objects.update_or_create(
        payslip=payslip,
        defaults={
            'employee': emp,
            'enrollment': enrollment,
            'esp_settings': esp_settings,
            'contribution_date': contribution_date,
            'payroll_period_month': payslip.month,
            'payroll_period_year': payslip.year,
            'implementation_date_snapshot': esp_settings.implementation_date,
            'enrollment_date_snapshot': enrollment.enrollment_date,
            'date_of_joining_snapshot': joining_date,
            'gross_salary_used': calc.get('gross_salary', payslip.gross_salary),
            'basic_salary_used': calc.get('esp_basic_salary_used', payslip.basic_salary),
            'employee_contribution_pct_snapshot': calc.get('esp_employee_pct_snapshot') or getattr(esp_settings, 'employee_contribution_pct', Decimal('8.33')),
            'employee_contribution_amount': emp_amount,
            'employer_matching_pct_snapshot': calc.get('esp_employer_pct_snapshot') or Decimal('0.00'),
            'employer_matching_amount': org_amount,
            'total_contribution': emp_amount + org_amount,
            'tenure_years_at_contribution': calc.get('esp_tenure_years') or Decimal('0.00'),
            'is_deleted': False,
        }
    )
    return contrib


def _sync_payslip_esp_contribution(payslip):
    """Ensure an ESPContribution record exists and is synced for a given payslip with ESP."""
    if not payslip or getattr(payslip, 'esp', 0) <= 0:
        return None
    emp = payslip.employee
    esp_settings, enrollment, joining_date = _load_esp_context(emp)
    if not esp_settings or not enrollment or not joining_date:
        return None

    calc = {
        'gross_salary': payslip.gross_salary,
        'esp_basic_salary_used': payslip.basic_salary,
        'esp_employee_pct_snapshot': payslip.esp_employee_pct_snapshot or getattr(esp_settings, 'employee_contribution_pct', Decimal('8.33')),
        'esp_employee_contribution': payslip.esp_employee_contribution or payslip.esp,
        'esp_employer_pct_snapshot': payslip.esp_employer_pct_snapshot or Decimal('0.00'),
        'esp_employer_contribution': payslip.esp_employer_contribution or Decimal('0.00'),
        'esp_tenure_years': payslip.esp_tenure_years or Decimal('0.00'),
    }
    if not payslip.esp_employee_contribution:
        payslip.esp_employee_contribution = calc['esp_employee_contribution']
        payslip.esp_employer_contribution = calc['esp_employer_contribution']
        payslip.save(update_fields=['esp_employee_contribution', 'esp_employer_contribution', 'updated_at'])

    return _create_esp_contribution(payslip, calc, emp, esp_settings, enrollment, joining_date)


@router.post("/payslip/generate", response=PayslipOut)
@require_permission("payroll.payslip.generate")
def generate_payslip(request, payload: PayslipGenerateIn):
    emp = _get_employee(payload.employee_id)
    _raise_if_invalid_month(payload.month)

    att = Attendance.objects.filter(
        employee=emp, month=payload.month, year=payload.year, is_deleted=False
    ).first()
    if not att:
        raise HttpError(404, "No attendance record for this employee/month/year")

    salary = Salary.objects.filter(
        employee=emp, is_active=True, is_deleted=False
    ).order_by('-effective_from').first()
    if not salary:
        raise HttpError(404, "No active salary for this employee")

    existing = Payslip.objects.filter(
        employee=emp, month=payload.month, year=payload.year, is_deleted=False
    ).first()
    if existing:
        raise HttpError(409, "Payslip already exists for this employee/month/year")

    esp_settings, enrollment, joining_date = _load_esp_context(emp)

    loan_deduction, installment_deductions = calculate_loan_deduction_for_month(
        emp, payload.month, payload.year
    )

    prior_esp = _prior_esp_contribution_count(emp, payload.month, payload.year)
    calc = calculate_payslip(att, salary, esp_settings=esp_settings,
                             enrollment=enrollment, joining_date=joining_date,
                             loan_deduction=loan_deduction,
                             esp_prior_contributions=prior_esp)

    generated_by = request.auth if hasattr(request.auth, 'employee_id') else None

    with transaction.atomic():
        payslip = Payslip.objects.create(
            employee=emp,
            salary=salary,
            attendance=att,
            month=payload.month,
            year=payload.year,
            generated_by=generated_by,
            status='draft',
            **calc,
        )

        if payslip.esp > 0:
            _sync_payslip_esp_contribution(payslip)

        if installment_deductions:
            apply_loan_deductions(payslip, installment_deductions)

    return _payslip_out(payslip)


@router.post("/generate", response=dict)
@require_permission("payroll.payslip.generate")
def generate_all_payslips(request, month: int, year: int):
    """Generate payslips for ALL employees with attendance data in the given month/year.
    
    Uses the Priority-1 earning breakdown (gross_salary-driven model) and proration logic.
    """
    _raise_if_invalid_month(month)
    
    # Get all active employees with attendance for this month/year
    attendances = Attendance.objects.filter(
        month=month, year=year, is_deleted=False
    ).select_related('employee', 'employee__organization')
    
    # Get all active salaries
    salaries = Salary.objects.filter(is_active=True, is_deleted=False)
    
    results = {
        'generated': 0,
        'failed': 0,
        'errors': [],
        'skipped': 0,  # employees without active salary
    }
    
    for att in attendances:
        # Find matching active salary
        salary = salaries.filter(employee=att.employee).first()
        if not salary:
            results['skipped'] += 1
            continue

        # Check if payslip already exists
        existing = Payslip.objects.filter(
            employee=att.employee, month=month, year=year, is_deleted=False
        ).first()
        if existing:
            results['skipped'] += 1
            continue

        try:
            # Each employee's insert runs in its own transaction/savepoint.
            # If one employee's data raises a DB-level error (e.g. a numeric
            # overflow from a bad calc value), only that savepoint rolls
            # back — it must NOT poison a shared outer transaction, or every
            # subsequent employee in the loop would fail with
            # "TransactionManagementError: You can't execute queries until
            # the end of the 'atomic' block" and the whole batch would
            # silently produce zero payslips.
            with transaction.atomic():
                esp_settings, enrollment, joining_date = _load_esp_context(att.employee)
                loan_deduction, installment_deductions = calculate_loan_deduction_for_month(
                    att.employee, month, year
                )
                prior_esp = _prior_esp_contribution_count(att.employee, month, year)
                calc = calculate_payslip(att, salary, esp_settings=esp_settings,
                                         enrollment=enrollment, joining_date=joining_date,
                                         loan_deduction=loan_deduction,
                                         esp_prior_contributions=prior_esp)
                generated_by = request.auth if hasattr(request.auth, 'employee_id') else None
                payslip = Payslip.objects.create(
                    employee=att.employee,
                    salary=salary,
                    attendance=att,
                    month=month,
                    year=year,
                    generated_by=generated_by,
                    status='draft',
                    **calc,
                )
                if payslip.esp > 0:
                    _sync_payslip_esp_contribution(payslip)
                if installment_deductions:
                    apply_loan_deductions(payslip, installment_deductions)
            results['generated'] += 1
        except Exception as exc:
            results['failed'] += 1
            results['errors'].append({
                'employee_id': att.employee.employee_id,
                'error': str(exc),
            })

    return results


@router.get("/payslip/my", response=List[PayslipOut])
def list_my_payslips(request):
    """Self-service: logged-in employee's own finalized/paid payslips, newest first."""
    employee_id = getattr(request.auth, 'employee_id', None)
    if not employee_id:
        raise HttpError(404, "No employee record for this account")
    qs = Payslip.objects.select_related('employee').filter(
        employee__employee_id=employee_id, status__in=['final', 'paid'], is_deleted=False,
    ).order_by('-year', '-month')
    return [_payslip_out(p) for p in qs]


@router.get("/payslip/my/{payslip_id}/pdf")
def download_my_payslip_pdf(request, payslip_id: str):
    """Self-service: logged-in employee downloads their own finalized/paid payslip PDF."""
    employee_id = getattr(request.auth, 'employee_id', None)
    if not employee_id:
        raise HttpError(404, "No employee record for this account")
    p = get_object_or_404(
        Payslip, id=payslip_id, employee__employee_id=employee_id,
        status__in=['final', 'paid'], is_deleted=False,
    )
    return _build_payslip_pdf_response(p)


@router.get("/payslip/{payslip_id}", response=PayslipOut)
@require_permission("payroll.payslip.view")
def get_payslip(request, payslip_id: str):
    p = get_object_or_404(Payslip, id=payslip_id, is_deleted=False)
    return _payslip_out(p)


@router.get("/payslip/{payslip_id}/pdf")
@require_permission("payroll.payslip.view")
def download_payslip_pdf(request, payslip_id: str):
    p = get_object_or_404(Payslip, id=payslip_id, is_deleted=False)
    return _build_payslip_pdf_response(p)


def _build_payslip_pdf_response(p):
    from django.http import FileResponse
    from payroll.pdf_service import make_payslip_pdf

    month_names = ["", "January","February","March","April","May","June","July",
                   "August","September","October","November","December"]

    import calendar as _calendar
    assignment = (
        p.employee.assignments.filter(is_primary=True, is_deleted=False).order_by('created_at').first()
        or p.employee.assignments.filter(is_deleted=False).first()
    )
    title = department = campus = joining_date = None
    if assignment:
        title = assignment.designation.position_name
        dept = assignment.designation.department
        department = dept.dept_name
        if dept.branch_id:
            campus = dept.branch.branch_name
        elif dept.institution_id:
            campus = dept.institution.name
        elif dept.organization_id:
            campus = dept.organization.name
        joining_date = assignment.joining_date.strftime('%d-%b-%y')
    month_days = _calendar.monthrange(p.year, p.month)[1]

    pdf = make_payslip_pdf(
        employee_name=p.employee.full_name,
        employee_id=p.employee.employee_id,
        month=month_names[p.month] if 1 <= p.month <= 12 else str(p.month),
        year=p.year,
        data={
            'basic_salary': p.basic_salary,
            'hra': p.hra,
            'conveyance': p.conveyance,
            'utility': p.utility,
            'medical': p.medical,
            'gross_salary': p.gross_salary,
            'total_work_days': p.total_work_days,
            'per_day_salary': p.per_day_salary,
            'late_absent_equivalent': p.late_absent_equivalent,
            'effective_absents': p.effective_absents,
            'absent_days_deducted': p.absent_days_deducted,
            'absent_deduction': p.absent_deduction,
            'esp': p.esp,
            'income_tax': p.income_tax,
            'taxable_income': p.taxable_income,
            'loan_deduction': p.loan_deduction,
            'unpaid_leave_deduction': p.unpaid_leave_deduction,
            'total_deductions': p.total_deductions,
            'net_pay': p.net_pay,
        },
        employee_meta={
            'cnic': p.employee.cnic,
            'title': title,
            'department': department,
            'campus': campus,
            'joining_date': joining_date,
            'days_worked': p.attendance.presents,
            'month_days': month_days,
        },
    )
    return FileResponse(io.BytesIO(pdf), content_type='application/pdf',
                        filename=f"payslip_{p.employee.employee_id}_{p.year}_{p.month}.pdf")


@router.put("/payslip/{payslip_id}", response=PayslipOut)
@require_permission("payroll.payslip.update")
def update_payslip(request, payslip_id: str, payload: PayslipUpdate):
    p = get_object_or_404(Payslip, id=payslip_id, is_deleted=False)
    data = payload.dict(exclude_unset=True)
    if 'status' in data:
        valid = [c[0] for c in Payslip.STATUS_CHOICES]
        if data['status'] not in valid:
            raise HttpError(422, f"status must be one of {valid}")
    for field, value in data.items():
        setattr(p, field, value)
    p.save()
    if p.esp > 0:
        _sync_payslip_esp_contribution(p)
    return _payslip_out(p)


@router.delete("/payslip/{payslip_id}", response=MessageOut)
@require_permission("payroll.payslip.delete")
def delete_payslip(request, payslip_id: str):
    p = get_object_or_404(Payslip, id=payslip_id, is_deleted=False)
    p.soft_delete(deleted_by=request.auth.id if hasattr(request.auth, 'id') else None,
                  reason='Deleted via API')
    return {'success': True, 'message': 'Payslip deleted'}


def _payslip_out(p) -> dict:
    return {
        'id': str(p.id),
        'employee_id': p.employee.employee_id,
        'month': p.month,
        'year': p.year,
        # Earnings breakdown
        'basic_salary': p.basic_salary,
        'hra': p.hra,
        'conveyance': p.conveyance,
        'utility': p.utility,
        'medical': p.medical,
        'gross_salary': p.gross_salary,
        # Attendance
        'total_work_days': p.total_work_days,
        'per_day_salary': p.per_day_salary,
        'late_absent_equivalent': p.late_absent_equivalent,
        'effective_absents': p.effective_absents,
        'absent_days_deducted': p.absent_days_deducted,
        'absent_deduction': p.absent_deduction,
        # Deductions
        'esp': p.esp,
        'income_tax': p.income_tax,
        'taxable_income': p.taxable_income,
        'total_deductions': p.total_deductions,
        'loan_deduction': p.loan_deduction,
        'unpaid_leave_deduction': p.unpaid_leave_deduction,
        # ESP breakdown
        'esp_employee_contribution': p.esp_employee_contribution,
        'esp_employer_contribution': p.esp_employer_contribution,
        'esp_employee_pct_snapshot': p.esp_employee_pct_snapshot,
        'esp_employer_pct_snapshot': p.esp_employer_pct_snapshot,
        'esp_enrollment_id_snapshot': str(p.esp_enrollment_id_snapshot) if p.esp_enrollment_id_snapshot else None,
        # Final
        'net_pay': p.net_pay,
        'status': p.status,
        'notes': p.notes,
        'generated_at': p.generated_at,
    }


# ===========================================================================
# ESP (Employee Savings Plan) Endpoints
# ===========================================================================

def _esp_settings_out(s: ESPSettings) -> dict:
    brackets = [
        {
            'id': str(b.id),
            'min_tenure_years': b.min_tenure_years,
            'max_tenure_years': b.max_tenure_years,
            'matching_pct': b.matching_pct,
        }
        for b in s.matching_brackets.filter(is_deleted=False).order_by('min_tenure_years')
    ]
    return {
        'id': str(s.id),
        'organization_id': str(s.organization_id),
        'implementation_date': s.implementation_date,
        'employee_contribution_pct': s.employee_contribution_pct,
        'basic_salary_pct': s.basic_salary_pct,
        'is_active': s.is_active,
        'notes': s.notes,
        'matching_brackets': brackets,
        'created_at': s.created_at,
    }


def _enrollment_out(e: ESPEmployeeEnrollment) -> dict:
    return {
        'id': str(e.id),
        'employee_id': e.employee.employee_id,
        'employee_name': e.employee.full_name,
        'enrollment_date': e.enrollment_date,
        'is_active': e.is_active,
        'notes': e.notes,
        'created_at': e.created_at,
    }


def _contribution_out(c: ESPContribution) -> dict:
    return {
        'id': str(c.id),
        'employee_id': c.employee.employee_id,
        'employee_name': c.employee.full_name,
        'payslip_id': str(c.payslip_id),
        'contribution_date': c.contribution_date,
        'payroll_period_month': c.payroll_period_month,
        'payroll_period_year': c.payroll_period_year,
        'gross_salary_used': c.gross_salary_used,
        'basic_salary_used': c.basic_salary_used,
        'employee_contribution_pct_snapshot': c.employee_contribution_pct_snapshot,
        'employee_contribution_amount': c.employee_contribution_amount,
        'employer_matching_pct_snapshot': c.employer_matching_pct_snapshot,
        'employer_matching_amount': c.employer_matching_amount,
        'total_contribution': c.total_contribution,
        'tenure_years_at_contribution': c.tenure_years_at_contribution,
        'implementation_date_snapshot': c.implementation_date_snapshot,
        'enrollment_date_snapshot': c.enrollment_date_snapshot,
        'date_of_joining_snapshot': c.date_of_joining_snapshot,
    }


def _withdrawal_out(w: ESPWithdrawal) -> dict:
    return {
        'id': str(w.id),
        'employee_id': w.employee.employee_id,
        'employee_name': w.employee.full_name,
        'requested_amount': w.requested_amount,
        'reason': w.reason,
        'status': w.status,
        'requested_at': w.requested_at,
        'reviewed_by_name': w.reviewed_by.full_name if w.reviewed_by else None,
        'reviewed_at': w.reviewed_at,
        'review_notes': w.review_notes,
        'disbursed_at': w.disbursed_at,
    }


def _esp_enrollment_date(esp_settings, joining_date):
    """Enrollment starts at the later of ESP implementation date or employee joining date."""
    if joining_date and joining_date > esp_settings.implementation_date:
        return joining_date
    return esp_settings.implementation_date


def _auto_enroll_all_employees(esp_settings: ESPSettings) -> int:
    """Create ESP enrollments for every employee who has none.

    ESP is org-wide: everyone is enrolled from the implementation date
    (or their joining date, if later). Inactive employees get an inactive
    enrollment. Existing rows — active, inactive, or soft-deleted — are
    never touched, so admin decisions are preserved.
    """
    enrolled_employee_ids = set(
        ESPEmployeeEnrollment.objects.values_list('employee_id', flat=True)
    )

    joining = _employee_joining_dates()

    to_create = []
    for emp in Employee.objects.filter(is_deleted=False).only('id', 'is_active'):
        if emp.id in enrolled_employee_ids:
            continue
        to_create.append(ESPEmployeeEnrollment(
            employee=emp,
            enrollment_date=_esp_enrollment_date(esp_settings, joining.get(emp.id, (None, None))[0]),
            esp_settings=esp_settings,
            is_active=emp.is_active,
        ))
    if to_create:
        ESPEmployeeEnrollment.objects.bulk_create(to_create)
    return len(to_create)


def _employee_joining_dates() -> dict:
    """Return {employee_id: (joining_date, is_primary)} using the same logic as
    _load_esp_context: earliest primary assignment wins, otherwise earliest any.
    """
    joining = {}
    for a in (
        EmployeeAssignment.objects.filter(is_deleted=False)
        .order_by('created_at')
        .values('employee_id', 'joining_date', 'is_primary')
    ):
        cur = joining.get(a['employee_id'])
        if cur is None or (a['is_primary'] and not cur[1]):
            joining[a['employee_id']] = (a['joining_date'], a['is_primary'])
    return joining


def _sync_esp_enrollment_dates(esp_settings: ESPSettings) -> int:
    """Recompute enrollment_date for every non-deleted enrollment so that a
    changed implementation_date takes effect for existing rows too.
    """
    joining = _employee_joining_dates()
    updated = 0
    enrollments = list(ESPEmployeeEnrollment.objects.filter(is_deleted=False))
    for e in enrollments:
        new_date = _esp_enrollment_date(esp_settings, joining.get(e.employee_id, (None, None))[0])
        if e.enrollment_date != new_date:
            e.enrollment_date = new_date
            updated += 1
    if updated:
        ESPEmployeeEnrollment.objects.bulk_update(enrollments, ['enrollment_date'])
    return updated


# --- ESP Settings ---

@router.get("/esp/settings", response=ESPSettingsOut)
@require_permission("payroll.esp.settings")
def get_esp_settings(request):
    org = Organization.objects.filter(is_deleted=False).first()
    if not org:
        raise HttpError(404, "No organization found")
    s = ESPSettings.objects.filter(organization=org, is_deleted=False).first()
    if not s:
        raise HttpError(404, "ESP settings not configured")
    return _esp_settings_out(s)


@router.put("/esp/settings", response=ESPSettingsOut)
@require_permission("payroll.esp.settings")
def upsert_esp_settings(request, payload: ESPSettingsIn):
    org = Organization.objects.filter(is_deleted=False).first()
    if not org:
        raise HttpError(404, "No organization found")

    with transaction.atomic():
        s = ESPSettings.objects.filter(organization=org, is_deleted=False).first()
        if s:
            s.implementation_date = payload.implementation_date
            s.employee_contribution_pct = payload.employee_contribution_pct
            s.basic_salary_pct = payload.basic_salary_pct
            s.is_active = payload.is_active
            s.notes = payload.notes
            s.save()
            # Replace brackets: soft-delete old ones
            for old_b in s.matching_brackets.filter(is_deleted=False):
                old_b.soft_delete(reason='Replaced via settings update')
        else:
            s = ESPSettings.objects.create(
                organization=org,
                implementation_date=payload.implementation_date,
                employee_contribution_pct=payload.employee_contribution_pct,
                basic_salary_pct=payload.basic_salary_pct,
                is_active=payload.is_active,
                notes=payload.notes,
            )

        for b in payload.matching_brackets:
            ESPMatchingBracket.objects.create(
                settings=s,
                min_tenure_years=b.min_tenure_years,
                max_tenure_years=b.max_tenure_years,
                matching_pct=b.matching_pct,
            )

        auto_enrolled = 0
        updated_dates = 0
        if payload.is_active:
            auto_enrolled = _auto_enroll_all_employees(s)
            updated_dates = _sync_esp_enrollment_dates(s)

    return {**_esp_settings_out(s), 'auto_enrolled': auto_enrolled, 'updated_dates': updated_dates}


# --- ESP Enrollments ---

@router.get("/esp/enrollments", response=List[ESPEmployeeEnrollmentOut])
@require_permission("payroll.esp.enrollment")
def list_esp_enrollments(request, employee_id: Optional[str] = None,
                         is_active: Optional[bool] = None):
    try:
        from payroll.services import auto_enroll_unregistered_employees
        auto_enroll_unregistered_employees()
    except Exception as exc:
        logger.error(f"auto_enroll_unregistered_employees failed: {exc}")

    qs = ESPEmployeeEnrollment.objects.select_related('employee').filter(is_deleted=False)
    if employee_id:
        qs = qs.filter(employee__employee_id=employee_id)
    if is_active is not None:
        qs = qs.filter(is_active=is_active)
    return [_enrollment_out(e) for e in qs]


@router.post("/esp/enrollments", response=ESPEmployeeEnrollmentOut)
@require_permission("payroll.esp.enrollment")
def create_esp_enrollment(request, payload: ESPEmployeeEnrollmentIn):
    emp = _get_employee(payload.employee_id)

    org = Organization.objects.filter(is_deleted=False).first()
    if not org:
        raise HttpError(404, "No organization found")
    settings = ESPSettings.objects.filter(organization=org, is_deleted=False, is_active=True).first()
    if not settings:
        raise HttpError(400, "ESP settings not configured or inactive")

    existing = ESPEmployeeEnrollment.objects.filter(employee=emp, is_deleted=False).first()
    if existing:
        raise HttpError(409, f"Employee {payload.employee_id} is already enrolled in ESP")

    enrollment = ESPEmployeeEnrollment.objects.create(
        employee=emp,
        enrollment_date=payload.enrollment_date,
        esp_settings=settings,
        is_active=payload.is_active,
        notes=payload.notes,
    )
    return _enrollment_out(enrollment)


@router.put("/esp/enrollments/{enrollment_id}", response=ESPEmployeeEnrollmentOut)
@require_permission("payroll.esp.enrollment")
def update_esp_enrollment(request, enrollment_id: str, payload: ESPEmployeeEnrollmentUpdate):
    e = get_object_or_404(ESPEmployeeEnrollment, id=enrollment_id, is_deleted=False)
    data = payload.dict(exclude_unset=True)
    for field, value in data.items():
        setattr(e, field, value)
    e.save()
    return _enrollment_out(e)


@router.delete("/esp/enrollments/{enrollment_id}", response=MessageOut)
@require_permission("payroll.esp.enrollment")
def delete_esp_enrollment(request, enrollment_id: str):
    e = get_object_or_404(ESPEmployeeEnrollment, id=enrollment_id, is_deleted=False)
    e.soft_delete(deleted_by=request.auth.id if hasattr(request.auth, 'id') else None,
                  reason='Deleted via API')
    return {'success': True, 'message': 'ESP enrollment deleted'}


# --- ESP Contributions ---

@router.get("/esp/contributions", response=List[ESPContributionOut])
@require_permission("payroll.esp.contribution")
def list_esp_contributions(request, employee_id: Optional[str] = None,
                           month: Optional[int] = None, year: Optional[int] = None):
    qs = ESPContribution.objects.select_related('employee').filter(is_deleted=False)
    if employee_id:
        qs = qs.filter(employee__employee_id=employee_id)
    if month:
        qs = qs.filter(payroll_period_month=month)
    if year:
        qs = qs.filter(payroll_period_year=year)
    return [_contribution_out(c) for c in qs]


@router.get("/esp/contributions/summary", response=List[ESPContributionSummaryOut])
@require_permission("payroll.esp.contribution")
def esp_contribution_summary(request):
    rows = (
        ESPContribution.objects.filter(is_deleted=False)
        .values('employee__employee_id', 'employee__full_name')
        .annotate(
            total_employee_contributions=Sum('employee_contribution_amount'),
            total_employer_contributions=Sum('employer_matching_amount'),
        )
    )
    result = []
    for row in rows:
        emp_id = row['employee__employee_id']
        withdrawn = (
            ESPWithdrawal.objects.filter(
                employee__employee_id=emp_id,
                status__in=['approved', 'disbursed'],
                is_deleted=False,
            ).aggregate(total=Sum('requested_amount'))['total']
        ) or Decimal('0')
        emp_total = row['total_employee_contributions'] or Decimal('0')
        er_total = row['total_employer_contributions'] or Decimal('0')
        result.append({
            'employee_id': emp_id,
            'employee_name': row['employee__full_name'],
            'total_employee_contributions': emp_total,
            'total_employer_contributions': er_total,
            'total_balance': emp_total + er_total - withdrawn,
            'contribution_count': ESPContribution.objects.filter(
                employee__employee_id=emp_id, is_deleted=False
            ).count(),
        })
    return result


@router.get("/esp/contributions/{contribution_id}", response=ESPContributionOut)
@require_permission("payroll.esp.contribution")
def get_esp_contribution(request, contribution_id: str):
    c = get_object_or_404(ESPContribution, id=contribution_id, is_deleted=False)
    return _contribution_out(c)


# --- ESP Withdrawals ---

@router.get("/esp/withdrawals", response=List[ESPWithdrawalOut])
@require_permission("payroll.esp.withdrawal")
def list_esp_withdrawals(request, employee_id: Optional[str] = None,
                         status: Optional[str] = None):
    qs = ESPWithdrawal.objects.select_related('employee', 'reviewed_by').filter(is_deleted=False)
    if employee_id:
        qs = qs.filter(employee__employee_id=employee_id)
    if status:
        qs = qs.filter(status=status)
    return [_withdrawal_out(w) for w in qs]


@router.post("/esp/withdrawals", response=ESPWithdrawalOut)
@require_permission("payroll.esp.withdrawal")
def create_esp_withdrawal(request, payload: ESPWithdrawalIn):
    if not is_feature_enabled('allow_esp_withdrawal_requests', False):
        raise HttpError(400, "ESP withdrawal requests are currently disabled by administration.")
    emp = _get_employee(payload.employee_id)

    enrollment = ESPEmployeeEnrollment.objects.filter(
        employee=emp, is_active=True, is_deleted=False
    ).first()
    if not enrollment:
        raise HttpError(400, "Employee is not actively enrolled in ESP")

    if payload.requested_amount <= 0:
        raise HttpError(400, "Requested amount must be positive")

    w = ESPWithdrawal.objects.create(
        employee=emp,
        enrollment=enrollment,
        requested_amount=payload.requested_amount,
        reason=payload.reason,
    )
    return _withdrawal_out(w)


@router.delete("/esp/withdrawals/{withdrawal_id}")
@require_permission("payroll.esp.withdrawal")
def delete_esp_withdrawal(request, withdrawal_id: str):
    w = get_object_or_404(ESPWithdrawal, id=withdrawal_id, is_deleted=False)
    w.is_deleted = True
    w.deleted_at = timezone.now()
    if hasattr(request.auth, 'id'):
        w.deleted_by = request.auth.id
    w.save()
    return {'success': True, 'message': 'ESP Withdrawal request deleted'}


@router.put("/esp/withdrawals/{withdrawal_id}/approve", response=ESPWithdrawalOut)
@require_permission("payroll.esp.withdrawal")
def approve_esp_withdrawal(request, withdrawal_id: str, payload: ESPWithdrawalReviewIn = None):
    w = get_object_or_404(ESPWithdrawal, id=withdrawal_id, is_deleted=False)
    if w.status != 'pending':
        raise HttpError(400, f"Cannot approve withdrawal in '{w.status}' status")
    reviewer = request.auth if hasattr(request.auth, 'employee_id') else None
    w.status = 'approved'
    w.reviewed_by = reviewer
    w.reviewed_at = timezone.now()
    w.review_notes = payload.review_notes if payload else None
    w.save()
    return _withdrawal_out(w)


@router.put("/esp/withdrawals/{withdrawal_id}/reject", response=ESPWithdrawalOut)
@require_permission("payroll.esp.withdrawal")
def reject_esp_withdrawal(request, withdrawal_id: str, payload: ESPWithdrawalReviewIn = None):
    w = get_object_or_404(ESPWithdrawal, id=withdrawal_id, is_deleted=False)
    if w.status != 'pending':
        raise HttpError(400, f"Cannot reject withdrawal in '{w.status}' status")
    reviewer = request.auth if hasattr(request.auth, 'employee_id') else None
    w.status = 'rejected'
    w.reviewed_by = reviewer
    w.reviewed_at = timezone.now()
    w.review_notes = payload.review_notes if payload else None
    w.save()
    return _withdrawal_out(w)


@router.put("/esp/withdrawals/{withdrawal_id}/disburse", response=ESPWithdrawalOut)
@require_permission("payroll.esp.withdrawal")
def disburse_esp_withdrawal(request, withdrawal_id: str):
    w = get_object_or_404(ESPWithdrawal, id=withdrawal_id, is_deleted=False)
    if w.status != 'approved':
        raise HttpError(400, f"Cannot disburse withdrawal in '{w.status}' status — must be approved first")
    w.status = 'disbursed'
    w.disbursed_at = timezone.now()
    w.save()
    return _withdrawal_out(w)


# --- Employee Self-Service ---

@router.get("/esp/my-balance", response=ESPBalanceOut)
def get_my_esp_balance(request):
    employee_id = getattr(request.auth, 'employee_id', None)
    if not employee_id:
        raise HttpError(404, "No employee record for this account")
    emp = _get_employee(employee_id)

    # Sync any paid payslips with ESP
    paid_slips = Payslip.objects.filter(
        employee=emp, status='paid', esp__gt=0, is_deleted=False
    )
    for p in paid_slips:
        _sync_payslip_esp_contribution(p)

    # ESP only counts towards balance if payslip is paid
    contribs = ESPContribution.objects.filter(
        employee=emp,
        is_deleted=False,
        payslip__status='paid',
        payslip__is_deleted=False,
    )
    emp_total = contribs.aggregate(t=Sum('employee_contribution_amount'))['t'] or Decimal('0')
    er_total = contribs.aggregate(t=Sum('employer_matching_amount'))['t'] or Decimal('0')

    withdrawn = (
        ESPWithdrawal.objects.filter(
            employee=emp, status__in=['approved', 'disbursed'], is_deleted=False
        ).aggregate(t=Sum('requested_amount'))['t'] or Decimal('0')
    )

    return {
        'employee_id': emp.employee_id,
        'employee_name': emp.full_name,
        'total_employee_contributions': emp_total,
        'total_employer_contributions': er_total,
        'total_withdrawn': withdrawn,
        'current_balance': emp_total + er_total - withdrawn,
    }


@router.get("/esp/my-contributions", response=List[ESPContributionOut])
def list_my_esp_contributions(request):
    employee_id = getattr(request.auth, 'employee_id', None)
    if not employee_id:
        raise HttpError(404, "No employee record for this account")
    emp = _get_employee(employee_id)

    # Sync any paid payslips with ESP
    paid_slips = Payslip.objects.filter(
        employee=emp, status='paid', esp__gt=0, is_deleted=False
    )
    for p in paid_slips:
        _sync_payslip_esp_contribution(p)

    qs = ESPContribution.objects.filter(
        employee=emp,
        is_deleted=False,
        payslip__status='paid',
        payslip__is_deleted=False,
    ).order_by('-payroll_period_year', '-payroll_period_month')
    return [_contribution_out(c) for c in qs]


@router.post("/esp/my-withdrawals", response=ESPWithdrawalOut)
def create_my_esp_withdrawal(request, payload: ESPWithdrawalIn):
    if not is_feature_enabled('allow_esp_withdrawal_requests', False):
        raise HttpError(400, "ESP withdrawal requests are currently disabled by administration.")
    employee_id = getattr(request.auth, 'employee_id', None)
    if not employee_id:
        raise HttpError(404, "No employee record for this account")

    emp = _get_employee(employee_id)
    if emp.employee_id != payload.employee_id:
        raise HttpError(403, "Can only request withdrawal for yourself")

    enrollment = ESPEmployeeEnrollment.objects.filter(
        employee=emp, is_active=True, is_deleted=False
    ).first()
    if not enrollment:
        raise HttpError(400, "You are not actively enrolled in ESP")

    if payload.requested_amount <= 0:
        raise HttpError(400, "Requested amount must be positive")

    w = ESPWithdrawal.objects.create(
        employee=emp,
        enrollment=enrollment,
        requested_amount=payload.requested_amount,
        reason=payload.reason,
    )
    return _withdrawal_out(w)


# --- System Feature Toggles ---

@router.get("/system-toggles", response=SystemTogglesOut)
def get_system_toggles(request):
    return {
        'allow_loan_requests': is_feature_enabled('allow_loan_requests', False),
        'allow_esp_withdrawal_requests': is_feature_enabled('allow_esp_withdrawal_requests', False),
    }


@router.put("/system-toggles", response=SystemTogglesOut)
def update_system_toggle(request, payload: SystemToggleUpdate):
    set_feature_enabled(payload.key, payload.enabled)
    return {
        'allow_loan_requests': is_feature_enabled('allow_loan_requests', False),
        'allow_esp_withdrawal_requests': is_feature_enabled('allow_esp_withdrawal_requests', False),
    }




@router.get("/esp/my-withdrawals", response=List[ESPWithdrawalOut])
def list_my_esp_withdrawals(request):
    employee_id = getattr(request.auth, 'employee_id', None)
    if not employee_id:
        raise HttpError(404, "No employee record for this account")
    qs = ESPWithdrawal.objects.select_related('employee', 'reviewed_by').filter(
        employee__employee_id=employee_id, is_deleted=False
    ).order_by('-requested_at')
    return [_withdrawal_out(w) for w in qs]
