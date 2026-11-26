"""
Leave Management API endpoints.

CRUD for leave requests, balances, adjustments, accruals, and dashboards.
"""
from typing import Optional, List
from decimal import Decimal
from datetime import date

from django.db.models import Sum, Q
from django.shortcuts import get_object_or_404

from ninja import Router
from ninja.errors import HttpError

from django.db import transaction
from employees.models import Employee, Organization
from authentication.api import AuthBearer
from permissions.rbac import require_permission

from payroll.leave_models import (
    LeaveType, LeaveBalance, LeaveRequest, LeaveAdjustment, LeaveAccrual,
    LeaveSettings, LeaveSettingBracket,
)
from payroll.leave_schemas import (
    LeaveTypeOut, LeaveBalanceOut, LeaveRequestIn, LeaveRequestUpdate,
    LeaveRequestOut, LeaveAdjustmentIn, LeaveAdjustmentOut, LeaveAccrualOut,
    LeaveBalanceSummaryOut, MyLeaveBalanceOut,
    LeaveSettingsIn, LeaveSettingsOut, LeaveBracketIn, LeaveBracketOut,
)
from payroll.leave_services import (
    get_leave_balance, validate_leave_request, approve_leave_request,
    reject_leave_request, cancel_leave_request, adjust_leave_balance,
    process_monthly_accrual, seed_leave_types, get_accrued_leave,
    _get_joining_date, _completed_years,
)

leave_router = Router(tags=["leaves"], auth=AuthBearer())


def _get_employee(employee_id: str) -> Employee:
    emp = Employee.objects.filter(employee_id=employee_id, is_deleted=False).first()
    if not emp:
        raise HttpError(404, f"Employee not found: {employee_id}")
    return emp


def _leave_type_out(lt: LeaveType) -> dict:
    return {
        'id': str(lt.id),
        'name': lt.name,
        'code': lt.code,
        'annual_entitlement': lt.annual_entitlement,
        'accrual_frequency': lt.accrual_frequency,
        'accrual_days_per_period': lt.accrual_days_per_period,
        'accrual_timing': lt.accrual_timing,
        'requires_confirmation': lt.requires_confirmation,
        'is_active': lt.is_active,
        'is_paid': getattr(lt, 'is_paid', True),
    }


def _leave_settings_out(s: LeaveSettings) -> dict:
    brackets = list(s.brackets.filter(is_deleted=False).order_by('order', 'id'))
    return {
        'id': str(s.id),
        'organization_id': str(s.organization_id),
        'implementation_date': s.implementation_date,
        'is_active': s.is_active,
        'notes': s.notes,
        'brackets': [
            {
                'id': str(b.id),
                'leave_name': b.leave_name,
                'code': b.code,
                'days_per_year': b.days_per_year,
                'is_paid': b.is_paid,
                'order': b.order,
            }
            for b in brackets
        ],
        'created_at': s.created_at,
        'updated_at': s.updated_at,
    }



def _balance_out(b: LeaveBalance) -> dict:
    return {
        'id': str(b.id),
        'employee_id': b.employee.employee_id,
        'employee_name': b.employee.full_name,
        'leave_type_id': str(b.leave_type_id),
        'leave_type_code': b.leave_type.code,
        'leave_type_name': b.leave_type.name,
        'accrued_days': b.accrued_days,
        'consumed_days': b.consumed_days,
        'adjusted_days': b.adjusted_days,
        'available_days': b.available_days,
        'year': b.year,
    }


def _request_out(r: LeaveRequest) -> dict:
    return {
        'id': str(r.id),
        'employee_id': r.employee.employee_id,
        'employee_name': r.employee.full_name,
        'leave_type_id': str(r.leave_type_id),
        'leave_type_code': r.leave_type.code,
        'leave_type_name': r.leave_type.name,
        'start_date': r.start_date,
        'end_date': r.end_date,
        'total_days': r.total_days,
        'reason': r.reason,
        'status': r.status,
        'approved_by_name': r.approved_by.full_name if r.approved_by else None,
        'approved_at': r.approved_at,
        'rejection_reason': r.rejection_reason,
        'is_override': r.is_override,
        'created_at': r.created_at,
    }


def _adjustment_out(a: LeaveAdjustment) -> dict:
    return {
        'id': str(a.id),
        'employee_id': a.employee.employee_id,
        'employee_name': a.employee.full_name,
        'leave_type_code': a.leave_type.code,
        'leave_type_name': a.leave_type.name,
        'adjustment_type': a.adjustment_type,
        'days': a.days,
        'previous_balance': a.previous_balance,
        'new_balance': a.new_balance,
        'reason': a.reason,
        'adjusted_by_name': a.adjusted_by.full_name if a.adjusted_by else None,
        'created_at': a.created_at,
    }


def _accrual_out(a: LeaveAccrual) -> dict:
    return {
        'id': str(a.id),
        'employee_id': a.employee.employee_id,
        'employee_name': a.employee.full_name,
        'leave_type_code': a.leave_type.code,
        'leave_type_name': a.leave_type.name,
        'accrual_date': a.accrual_date,
        'days_accrued': a.days_accrued,
        'period_month': a.period_month,
        'period_year': a.period_year,
    }


# --- Leave Settings ---

@leave_router.get("/leave/settings", response=LeaveSettingsOut)
@require_permission("payroll.leave.view")
def get_leave_settings(request):
    org = Organization.objects.filter(is_deleted=False).first()
    if not org:
        raise HttpError(404, "No organization found")
    s = LeaveSettings.objects.filter(organization=org, is_deleted=False).first()
    if not s:
        from datetime import date
        today = date.today()
        s = LeaveSettings.objects.create(
            organization=org,
            implementation_date=date(today.year, 1, 1),
            is_active=True,
            notes="Organization Leave Policy",
        )
        defaults = [
            {"leave_name": "Annual Leave", "code": "annual", "days_per_year": Decimal("14.00"), "is_paid": True, "order": 1},
            {"leave_name": "Casual Leave", "code": "casual", "days_per_year": Decimal("6.00"), "is_paid": False, "order": 2},
            {"leave_name": "Sick Leave", "code": "sick", "days_per_year": Decimal("8.00"), "is_paid": False, "order": 3},
        ]
        for d in defaults:
            LeaveSettingBracket.objects.create(
                settings=s,
                leave_name=d["leave_name"],
                code=d["code"],
                days_per_year=d["days_per_year"],
                is_paid=d["is_paid"],
                order=d["order"],
            )
            lt, _ = LeaveType.objects.get_or_create(
                code=d["code"],
                defaults={
                    "name": d["leave_name"],
                    "annual_entitlement": int(d["days_per_year"]),
                    "is_paid": d["is_paid"],
                    "is_active": True,
                }
            )
            if lt.name != d["leave_name"] or lt.annual_entitlement != int(d["days_per_year"]) or lt.is_paid != d["is_paid"]:
                lt.name = d["leave_name"]
                lt.annual_entitlement = int(d["days_per_year"])
                lt.is_paid = d["is_paid"]
                lt.is_active = True
                lt.save()

    return _leave_settings_out(s)


@leave_router.put("/leave/settings", response=LeaveSettingsOut)
@require_permission("payroll.leave.edit")
def upsert_leave_settings(request, payload: LeaveSettingsIn):
    org = Organization.objects.filter(is_deleted=False).first()
    if not org:
        raise HttpError(404, "No organization found")

    with transaction.atomic():
        s = LeaveSettings.objects.filter(organization=org, is_deleted=False).first()
        if s:
            s.implementation_date = payload.implementation_date
            s.is_active = payload.is_active
            s.notes = payload.notes
            s.save()
            for old_b in s.brackets.filter(is_deleted=False):
                old_b.soft_delete(reason="Replaced via leave settings update")
        else:
            s = LeaveSettings.objects.create(
                organization=org,
                implementation_date=payload.implementation_date,
                is_active=payload.is_active,
                notes=payload.notes,
            )

        import re
        order_idx = 1
        active_codes = []
        for b in payload.brackets:
            clean_name = b.leave_name.strip()
            name_lower = clean_name.lower()
            if 'annual' in name_lower or (b.code and 'annual' in b.code.lower()):
                code = 'annual'
            elif 'casual' in name_lower or (b.code and 'casual' in b.code.lower()):
                code = 'casual'
            elif 'sick' in name_lower or (b.code and 'sick' in b.code.lower()):
                code = 'sick'
            elif 'unpaid' in name_lower or (b.code and 'unpaid' in b.code.lower()):
                code = 'unpaid'
            else:
                code = b.code.strip().lower() if b.code else re.sub(r'[^a-z0-9_]', '', name_lower.replace(" ", "_"))[:50]
                if not code:
                    code = f"leave_{order_idx}"

            active_codes.append(code)

            LeaveSettingBracket.objects.create(
                settings=s,
                leave_name=clean_name,
                code=code,
                days_per_year=b.days_per_year,
                is_paid=b.is_paid,
                order=b.order or order_idx,
            )

            lt, created = LeaveType.objects.get_or_create(
                code=code,
                defaults={
                    "name": clean_name,
                    "annual_entitlement": int(b.days_per_year),
                    "is_paid": b.is_paid,
                    "is_active": True,
                    "requires_confirmation": False,
                    "accrual_frequency": "yearly" if code == "annual" else "monthly",
                    "accrual_days_per_period": Decimal("15.00") if code == "annual" else Decimal("1.00"),
                }
            )
            lt.name = clean_name
            lt.annual_entitlement = int(b.days_per_year)
            lt.is_paid = b.is_paid
            lt.is_active = True
            lt.requires_confirmation = False
            lt.save()

            order_idx += 1

        if payload.is_active:
            LeaveType.objects.exclude(code__in=active_codes).update(is_active=False)
            try:
                from payroll.services import auto_sync_all_leave_balances
                auto_sync_all_leave_balances()
            except Exception:
                pass

    return _leave_settings_out(s)


# --- Leave Types ---

@leave_router.get("/leave-types", response=List[LeaveTypeOut])
@require_permission("payroll.leave.view")
def list_leave_types(request):
    types = LeaveType.objects.filter(is_active=True, is_deleted=False)
    return [_leave_type_out(lt) for lt in types]


@leave_router.post("/leave-types/seed")
@require_permission("payroll.leave.edit")
def seed_types_endpoint(request):
    created = seed_leave_types()
    return {'success': True, 'message': f'Created {created} leave types', 'created': created}


# --- Leave Balances ---

@leave_router.get("/leave-balances", response=List[LeaveBalanceOut])
@require_permission("payroll.leave.view")
def list_leave_balances(request, employee_id: Optional[str] = None,
                        leave_type_code: Optional[str] = None,
                        year: Optional[int] = None,
                        department: Optional[str] = None,
                        branch: Optional[str] = None):
    seed_leave_types()
    try:
        from payroll.services import auto_sync_all_leave_balances
        auto_sync_all_leave_balances()
    except Exception as exc:
        pass

    qs = LeaveBalance.objects.select_related('employee', 'leave_type').filter(
        is_deleted=False,
        employee__assignments__is_primary=True,
        employee__assignments__is_deleted=False,
    ).distinct()
    if employee_id:
        qs = qs.filter(employee__employee_id=employee_id)
    if leave_type_code:
        qs = qs.filter(leave_type__code=leave_type_code)
    if year:
        qs = qs.filter(year=year)
    if department:
        qs = qs.filter(
            employee__assignments__designation__department__dept_name=department,
            employee__assignments__is_primary=True,
        )
    if branch:
        qs = qs.filter(
            employee__assignments__designation__department__branch__branch_name=branch,
            employee__assignments__is_primary=True,
        )

    results = []
    for b in qs:
        bal = get_leave_balance(b.employee, b.leave_type)
        results.append({
            'id': str(b.id),
            'employee_id': b.employee.employee_id,
            'employee_name': b.employee.full_name,
            'leave_type_id': str(b.leave_type_id),
            'leave_type_code': b.leave_type.code,
            'leave_type_name': b.leave_type.name,
            'accrued_days': bal['accrued'],
            'consumed_days': bal['consumed'],
            'adjusted_days': bal['adjusted'],
            'available_days': bal['available'],
            'year': b.year,
        })
    return results


@leave_router.get("/leave-balances/summary", response=List[LeaveBalanceSummaryOut])
@require_permission("payroll.leave.view")
def leave_balance_summary(request, employee_id: Optional[str] = None,
                          department: Optional[str] = None):
    seed_leave_types()
    try:
        from payroll.services import auto_sync_all_leave_balances
        auto_sync_all_leave_balances()
    except Exception as exc:
        pass

    employees_qs = Employee.objects.filter(
        is_deleted=False,
        is_active=True,
        assignments__is_primary=True,
        assignments__is_deleted=False,
    ).distinct()
    if employee_id:
        employees_qs = employees_qs.filter(employee_id=employee_id)
    if department:
        employees_qs = employees_qs.filter(
            assignments__designation__department__dept_name=department,
            assignments__is_primary=True,
        )

    leave_types = {lt.code: lt for lt in LeaveType.objects.filter(is_deleted=False)}
    lt_annual = leave_types.get('annual') or next((lt for lt in leave_types.values() if 'annual' in lt.code.lower()), None)
    lt_casual = leave_types.get('casual') or next((lt for lt in leave_types.values() if 'casual' in lt.code.lower()), None)
    lt_sick = leave_types.get('sick') or next((lt for lt in leave_types.values() if 'sick' in lt.code.lower()), None)
    results = []

    for emp in employees_qs:
        annual = get_leave_balance(emp, lt_annual) if lt_annual else {
            'accrued': Decimal('0'), 'consumed': Decimal('0'), 'available': Decimal('0'), 'eligible': False
        }
        casual = get_leave_balance(emp, lt_casual) if lt_casual else {
            'accrued': Decimal('0'), 'consumed': Decimal('0'), 'available': Decimal('0'), 'eligible': True
        }
        sick = get_leave_balance(emp, lt_sick) if lt_sick else {
            'accrued': Decimal('0'), 'consumed': Decimal('0'), 'available': Decimal('0'), 'eligible': True
        }

        results.append({
            'employee_id': emp.employee_id,
            'employee_name': emp.full_name,
            'annual_accrued': annual['accrued'],
            'annual_consumed': annual['consumed'],
            'annual_available': annual['available'],
            'annual_eligible': annual['eligible'],
            'casual_accrued': casual['accrued'],
            'casual_consumed': casual['consumed'],
            'casual_available': casual['available'],
            'sick_accrued': sick['accrued'],
            'sick_consumed': sick['consumed'],
            'sick_available': sick['available'],
        })

    return results


# --- Leave Requests ---

@leave_router.get("/leave-requests", response=List[LeaveRequestOut])
@require_permission("payroll.leave.view")
def list_leave_requests(request, employee_id: Optional[str] = None,
                        status: Optional[str] = None,
                        leave_type_code: Optional[str] = None,
                        year: Optional[int] = None):
    qs = LeaveRequest.objects.select_related('employee', 'leave_type', 'approved_by').filter(
        is_deleted=False
    )
    if employee_id:
        qs = qs.filter(employee__employee_id=employee_id)
    if status:
        qs = qs.filter(status=status)
    if leave_type_code:
        qs = qs.filter(leave_type__code=leave_type_code)
    if year:
        qs = qs.filter(start_date__year=year)
    return [_request_out(r) for r in qs]


@leave_router.post("/leave-requests", response=LeaveRequestOut)
@require_permission("payroll.leave.create")
def create_leave_request(request, payload: LeaveRequestIn):
    emp = _get_employee(payload.employee_id)

    lt = LeaveType.objects.filter(code=payload.leave_type_code, is_deleted=False, is_active=True).first()
    if not lt:
        raise HttpError(404, f"Leave type not found: {payload.leave_type_code}")

    if payload.total_days < 1:
        raise HttpError(422, "Total days must be at least 1")

    is_valid, error = validate_leave_request(
        emp, lt, payload.start_date, payload.end_date,
        payload.total_days, payload.is_override,
    )
    if not is_valid:
        raise HttpError(422, error)

    lr = LeaveRequest.objects.create(
        employee=emp,
        leave_type=lt,
        start_date=payload.start_date,
        end_date=payload.end_date,
        total_days=payload.total_days,
        reason=payload.reason,
        is_override=payload.is_override,
    )
    return _request_out(lr)


@leave_router.get("/leave-requests/{request_id}", response=LeaveRequestOut)
@require_permission("payroll.leave.view")
def get_leave_request(request, request_id: str):
    lr = get_object_or_404(LeaveRequest, id=request_id, is_deleted=False)
    return _request_out(lr)


@leave_router.put("/leave-requests/{request_id}/approve", response=LeaveRequestOut)
@require_permission("payroll.leave.approve")
def approve_leave(request, request_id: str, payload: LeaveRequestUpdate = None):
    lr = get_object_or_404(LeaveRequest, id=request_id, is_deleted=False)
    if lr.status != 'pending':
        raise HttpError(400, f"Cannot approve leave in '{lr.status}' status")
    if payload and payload.leave_type_code:
        lt = LeaveType.objects.filter(code=payload.leave_type_code, is_deleted=False).first()
        if not lt:
            raise HttpError(404, f"Leave type not found: {payload.leave_type_code}")
        lr.leave_type = lt
        lr.save(update_fields=['leave_type', 'updated_at'])
    approved_by = request.auth if hasattr(request.auth, 'employee_id') else None
    approve_leave_request(lr, approved_by)
    return _request_out(lr)


@leave_router.put("/leave-requests/{request_id}/reject", response=LeaveRequestOut)
@require_permission("payroll.leave.approve")
def reject_leave(request, request_id: str, payload: LeaveRequestUpdate = None):
    lr = get_object_or_404(LeaveRequest, id=request_id, is_deleted=False)
    if lr.status != 'pending':
        raise HttpError(400, f"Cannot reject leave in '{lr.status}' status")
    rejected_by = request.auth if hasattr(request.auth, 'employee_id') else None
    reason = payload.rejection_reason if payload else None
    reject_leave_request(lr, rejected_by, reason)
    return _request_out(lr)


@leave_router.put("/leave-requests/{request_id}/cancel", response=LeaveRequestOut)
@require_permission("payroll.leave.edit")
def cancel_leave(request, request_id: str):
    lr = get_object_or_404(LeaveRequest, id=request_id, is_deleted=False)
    if lr.status not in ('pending', 'approved'):
        raise HttpError(400, f"Cannot cancel leave in '{lr.status}' status")
    cancel_leave_request(lr)
    return _request_out(lr)


@leave_router.delete("/leave-requests/{request_id}")
@require_permission("payroll.leave.edit")
def delete_leave(request, request_id: str):
    lr = get_object_or_404(LeaveRequest, id=request_id, is_deleted=False)
    if lr.status == 'approved':
        cancel_leave_request(lr)
    lr.is_deleted = True
    lr.deleted_at = timezone.now()
    if hasattr(request.auth, 'id'):
        lr.deleted_by = request.auth.id
    lr.save()
    return {'success': True, 'message': 'Leave request deleted'}


# --- Leave Adjustments ---


@leave_router.get("/leave-adjustments", response=List[LeaveAdjustmentOut])
@require_permission("payroll.leave.view")
def list_leave_adjustments(request, employee_id: Optional[str] = None,
                           leave_type_code: Optional[str] = None):
    qs = LeaveAdjustment.objects.select_related(
        'employee', 'leave_type', 'adjusted_by'
    ).filter(is_deleted=False)
    if employee_id:
        qs = qs.filter(employee__employee_id=employee_id)
    if leave_type_code:
        qs = qs.filter(leave_type__code=leave_type_code)
    return [_adjustment_out(a) for a in qs]


@leave_router.post("/leave-adjustments", response=LeaveAdjustmentOut)
@require_permission("payroll.leave.edit")
def create_leave_adjustment(request, payload: LeaveAdjustmentIn):
    emp = _get_employee(payload.employee_id)

    lt = LeaveType.objects.filter(code=payload.leave_type_code, is_deleted=False).first()
    if not lt:
        raise HttpError(404, f"Leave type not found: {payload.leave_type_code}")

    if payload.adjustment_type not in ('add', 'deduct', 'correction'):
        raise HttpError(422, "adjustment_type must be add, deduct, or correction")

    adjusted_by = request.auth if hasattr(request.auth, 'employee_id') else None
    balance = adjust_leave_balance(
        emp, lt, payload.adjustment_type, payload.days, payload.reason, adjusted_by
    )

    adj = LeaveAdjustment.objects.filter(
        employee=emp, leave_type=lt, is_deleted=False
    ).order_by('-created_at').first()

    return _adjustment_out(adj)


# --- Leave Accruals ---

@leave_router.get("/leave-accruals", response=List[LeaveAccrualOut])
@require_permission("payroll.leave.view")
def list_leave_accruals(request, employee_id: Optional[str] = None,
                        leave_type_code: Optional[str] = None,
                        year: Optional[int] = None):
    qs = LeaveAccrual.objects.select_related('employee', 'leave_type').filter(is_deleted=False)
    if employee_id:
        qs = qs.filter(employee__employee_id=employee_id)
    if leave_type_code:
        qs = qs.filter(leave_type__code=leave_type_code)
    if year:
        qs = qs.filter(period_year=year)
    return [_accrual_out(a) for a in qs]


@leave_router.post("/leave-accruals/process")
@require_permission("payroll.leave.edit")
def process_accruals(request, month: int, year: int):
    if not (1 <= month <= 12):
        raise HttpError(422, "Month must be 1-12")
    seed_leave_types()
    count = process_monthly_accrual(month, year)
    return {'success': True, 'message': f'Created {count} accrual records', 'created': count}


# --- Employee Self-Service ---

@leave_router.get("/leave/my-balance", response=List[MyLeaveBalanceOut])
def my_leave_balance(request):
    employee_id = getattr(request.auth, 'employee_id', None)
    if not employee_id:
        raise HttpError(404, "No employee record for this account")
    emp = _get_employee(employee_id)

    try:
        from payroll.leave_models import LeaveSettings
        active_settings = LeaveSettings.objects.filter(is_active=True, is_deleted=False).first()
    except Exception:
        active_settings = None

    if active_settings:
        active_codes = list(active_settings.brackets.filter(is_deleted=False).order_by('order').values_list('code', flat=True))
        lts = LeaveType.objects.filter(code__in=active_codes, is_active=True, is_deleted=False)
        lt_dict = {lt.code: lt for lt in lts}
        leave_types = [lt_dict[c] for c in active_codes if c in lt_dict]
    else:
        seed_leave_types()
        leave_types = list(LeaveType.objects.filter(is_active=True, is_deleted=False))
    results = []

    joining_date = _get_joining_date(emp)
    today = date.today()

    for lt in leave_types:
        bal = get_leave_balance(emp, lt)
        note = None
        if lt.code == 'annual' and lt.requires_confirmation:
            years = _completed_years(joining_date, today) if joining_date else 0
            if years < 1:
                note = f"Annual leave unlocks after 1 year of service ({1 - years} year(s) remaining)"
            else:
                note = f"Eligible — completed {years} year(s) of service"

        results.append({
            'leave_type': lt.name,
            'leave_type_code': lt.code,
            'accrued': bal['accrued'],
            'consumed': bal['consumed'],
            'adjusted': bal['adjusted'],
            'available': bal['available'],
            'eligible': bal['eligible'],
            'eligibility_note': note,
        })

    return results


@leave_router.get("/leave/my-requests", response=List[LeaveRequestOut])
def my_leave_requests(request):
    employee_id = getattr(request.auth, 'employee_id', None)
    if not employee_id:
        raise HttpError(404, "No employee record for this account")
    qs = LeaveRequest.objects.select_related(
        'employee', 'leave_type', 'approved_by'
    ).filter(
        employee__employee_id=employee_id, is_deleted=False
    ).order_by('-start_date')
    return [_request_out(r) for r in qs]


@leave_router.post("/leave/my-requests", response=LeaveRequestOut)
def create_my_leave_request(request, payload: LeaveRequestIn):
    employee_id = getattr(request.auth, 'employee_id', None)
    if not employee_id:
        raise HttpError(404, "No employee record for this account")

    emp = _get_employee(employee_id)
    target_emp_id = payload.employee_id or emp.employee_id
    if emp.employee_id != target_emp_id:
        raise HttpError(403, "Can only apply leave for yourself")


    lt = LeaveType.objects.filter(code=payload.leave_type_code, is_deleted=False, is_active=True).first()
    if not lt:
        raise HttpError(404, f"Leave type not found: {payload.leave_type_code}")

    if payload.total_days < 1:
        raise HttpError(422, "Total days must be at least 1")

    is_valid, error = validate_leave_request(
        emp, lt, payload.start_date, payload.end_date, payload.total_days, False
    )
    if not is_valid:
        raise HttpError(422, error)

    lr = LeaveRequest.objects.create(
        employee=emp,
        leave_type=lt,
        start_date=payload.start_date,
        end_date=payload.end_date,
        total_days=payload.total_days,
        reason=payload.reason,
    )
    return _request_out(lr)
