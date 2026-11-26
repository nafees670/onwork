"""
General employee self-service request API.

Employee submits a request (like composing a short message — subject +
category + message, no recipient to pick since it always goes to HR/Admin)
from their own portal; admin sees every request in one queue and
approves/rejects with notes. Same lifecycle as EmployeeLoan/ESPWithdrawal.
"""
from typing import Optional, List

from django.shortcuts import get_object_or_404
from django.utils import timezone

from ninja import Router
from ninja.errors import HttpError

from employees.models import Employee
from authentication.api import AuthBearer
from permissions.rbac import require_permission

from payroll.general_request_models import EmployeeRequest
from payroll.general_request_schemas import (
    EmployeeRequestIn, EmployeeRequestReviewIn, EmployeeRequestOut,
)

general_request_router = Router(tags=["employee-requests"], auth=AuthBearer())


def _get_employee(employee_id: str) -> Employee:
    emp = Employee.objects.filter(employee_id=employee_id, is_deleted=False).first()
    if not emp:
        raise HttpError(404, f"Employee not found: {employee_id}")
    return emp


def _request_out(r: EmployeeRequest) -> dict:
    return {
        'id': str(r.id),
        'employee_id': r.employee.employee_id,
        'employee_name': r.employee.full_name,
        'category': r.category,
        'subject': r.subject,
        'message': r.message,
        'status': r.status,
        'submitted_at': r.submitted_at,
        'reviewed_by_name': r.reviewed_by.full_name if r.reviewed_by else None,
        'reviewed_at': r.reviewed_at,
        'review_notes': r.review_notes,
    }


# ── Employee self-service ──────────────────────────────────────────────────

@general_request_router.post("/my-requests", response=EmployeeRequestOut)
def create_my_request(request, payload: EmployeeRequestIn):
    employee_id = getattr(request.auth, 'employee_id', None)
    if not employee_id:
        raise HttpError(404, "No employee record for this account")
    emp = _get_employee(employee_id)

    subject = payload.subject.strip()
    message = payload.message.strip()
    if not subject or not message:
        raise HttpError(400, "Subject and message are required")

    valid_categories = dict(EmployeeRequest.CATEGORY_CHOICES)
    category = payload.category if payload.category in valid_categories else 'general'

    r = EmployeeRequest.objects.create(
        employee=emp, category=category, subject=subject, message=message,
    )
    return _request_out(r)


@general_request_router.get("/my-requests", response=List[EmployeeRequestOut])
def list_my_requests(request):
    employee_id = getattr(request.auth, 'employee_id', None)
    if not employee_id:
        raise HttpError(404, "No employee record for this account")
    qs = EmployeeRequest.objects.select_related('employee', 'reviewed_by').filter(
        employee__employee_id=employee_id, is_deleted=False
    )
    return [_request_out(r) for r in qs]


# ── Admin queue ─────────────────────────────────────────────────────────────

@general_request_router.get("/requests", response=List[EmployeeRequestOut])
@require_permission("employee_request.view")
def list_requests(request, status: Optional[str] = None, employee_id: Optional[str] = None):
    qs = EmployeeRequest.objects.select_related('employee', 'reviewed_by').filter(is_deleted=False)
    if status:
        qs = qs.filter(status=status)
    if employee_id:
        qs = qs.filter(employee__employee_id=employee_id)
    return [_request_out(r) for r in qs]


@general_request_router.put("/requests/{request_id}/approve", response=EmployeeRequestOut)
@require_permission("employee_request.review")
def approve_request(request, request_id: str, payload: EmployeeRequestReviewIn = None):
    r = get_object_or_404(EmployeeRequest, id=request_id, is_deleted=False)
    if r.status != 'pending':
        raise HttpError(400, f"Cannot approve a request in '{r.status}' status")
    reviewer = request.auth if hasattr(request.auth, 'employee_id') else None
    r.status = 'approved'
    r.reviewed_by = reviewer
    r.reviewed_at = timezone.now()
    r.review_notes = payload.review_notes if payload else None
    r.save()
    return _request_out(r)


@general_request_router.put("/requests/{request_id}/reject", response=EmployeeRequestOut)
@require_permission("employee_request.review")
def reject_request(request, request_id: str, payload: EmployeeRequestReviewIn = None):
    r = get_object_or_404(EmployeeRequest, id=request_id, is_deleted=False)
    if r.status != 'pending':
        raise HttpError(400, f"Cannot reject a request in '{r.status}' status")
    reviewer = request.auth if hasattr(request.auth, 'employee_id') else None
    r.status = 'rejected'
    r.reviewed_by = reviewer
    r.reviewed_at = timezone.now()
    r.review_notes = payload.review_notes if payload else None
    r.save()
    return _request_out(r)
