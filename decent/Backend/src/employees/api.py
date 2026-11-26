"""
Employees API endpoints for Auth Service.

Provides REST API for employee management including creation,
retrieval, and updates for integration with HDMS frontend.
"""
from ninja import Router, File, Form, Schema
from ninja.errors import HttpError
from ninja.files import UploadedFile
import requests
import os
from typing import Optional, List
from pydantic import BaseModel, validator, model_validator
from datetime import date, datetime
from django.utils import timezone
from django.conf import settings
from employees.models import Employee, Organization, Institution, Department, Designation, EmployeeAssignment, Branch, EmployeeStatus
from django.db import transaction, models
from django.shortcuts import get_object_or_404
import re
import logging
import csv
import io
from django.http import HttpResponse
from django.core.exceptions import ValidationError



from authentication.api import AuthBearer
from permissions.rbac import require_permission, has_permission

router = Router(tags=["employees"], auth=AuthBearer())
logger = logging.getLogger(__name__)


# Pydantic Schemas
class EducationSchema(BaseModel):
    """Education record from frontend"""
    degree: str
    institute: str
    passingYear: str


class ExperienceSchema(BaseModel):
    """Work experience record from frontend"""
    employer: str
    jobTitle: str
    startDate: str
    endDate: str
    responsibilities: str


class InstitutionSchema(Schema):
    """Schema for Institution details"""
    id: Optional[str] = None
    inst_code: str
    name: str
    inst_type: str
    address: Optional[str] = None
    city: Optional[str] = None
    contact_number: Optional[str] = None
    organization_code: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class BranchSchema(Schema):
    """Schema for Branch details"""
    branch_id: str
    branch_code: str
    branch_name: str
    institution_code: str
    organization_code: Optional[str] = None
    status: str
    address: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    postal_code: Optional[str] = None
    contact_number: Optional[str] = None
    secondary_contact: Optional[str] = None
    email: Optional[str] = None
    branch_head_name: Optional[str] = None
    branch_head_contact: Optional[str] = None
    branch_head_email: Optional[str] = None
    established_year: Optional[int] = None
    registration_number: Optional[str] = None

class AssignmentCreateSchema(BaseModel):
    """Single role assignment within the multi-role create flow (M3 Form 2)."""
    branch_code: Optional[str] = None
    department_id: Optional[str] = None
    designation_id: Optional[str] = None
    department_code: Optional[str] = None
    designation_code: Optional[str] = None
    joining_date: Optional[str] = None
    shift: Optional[str] = 'general'
    is_primary: bool = False

    @validator('shift')
    def validate_shift(cls, v):
        if v is None:
            return v
        allowed = ['general', 'morning', 'afternoon', 'night', 'hourly', 'both']
        if v.lower() not in allowed:
            raise ValueError(f"shift must be one of: {', '.join(allowed)}")
        return v.lower()


class EmployeeCreateSchema(BaseModel):
    """Schema for creating employee from frontend form"""
    # Personal Information
    fullName: str
    dob: Optional[str] = None
    cnic: str
    gender: str
    maritalStatus: Optional[str] = None
    nationality: Optional[str] = 'Pakistani'
    religion: Optional[str] = 'Islam'
    
    # Contact Information
    personalEmail: str
    mobile: str
    orgEmail: Optional[str] = None
    orgPhone: Optional[str] = None
    emergencyName: Optional[str] = None
    emergencyPhone: Optional[str] = None
    residentialAddress: str
    permanentAddress: Optional[str] = None
    city: Optional[str] = None
    bio: Optional[str] = None
    currentWorkingSector: Optional[str] = None

    
    # Assignment Details
    organizationCode: str = 'IAK'
    institutionCode: Optional[str] = None
    branchCode: Optional[str] = None  # Added for Branch support
    departmentCode: Optional[str] = None
    designationCode: Optional[str] = None
    joiningDate: Optional[str] = None
    shift: Optional[str] = 'general'
    
    # Multi-role assignments (M3 Form 2). When provided, the flat assignment
    # fields above are ignored and every assignment below is created atomically.
    assignments: Optional[List[AssignmentCreateSchema]] = None
    
    # Bank Information
    bankName: Optional[str] = None
    accountNumber: Optional[str] = None
    
    # Additional Data
    education: Optional[List[EducationSchema]] = None
    experience: Optional[List[ExperienceSchema]] = None

    @validator('cnic')
    def validate_cnic(cls, v):
        if not re.match(r'^\d{5}-?\d{7}-?\d{1}$', v):
            raise ValueError('Invalid Pakistani CNIC format (XXXXX-XXXXXXX-X)')
        return v.replace('-', '')

    @validator('mobile', 'emergencyPhone', 'orgPhone')
    def validate_phone(cls, v):
        if v and not re.match(r'^(\+92|92|0|0092)?3\d{2}-?\d{7}$', v):
            raise ValueError('Invalid Pakistani Mobile number format')
        return v

    @validator('personalEmail')
    def validate_personal_email(cls, v):
        if not v or not v.strip():
            raise ValueError('Personal email is required')
        if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', v):
            raise ValueError('Invalid email format')
        return v.strip().lower()

    @validator('orgEmail')
    def validate_org_email(cls, v):
        if v and not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', v):
            raise ValueError('Invalid email format')
        return v

    @validator('dob')
    def validate_dob(cls, v):
        if not v:
            return v
        try:
            dob_date = datetime.strptime(v, '%Y-%m-%d').date()
        except ValueError:
            raise ValueError('Date of birth must be YYYY-MM-DD format')
        today = date.today()
        age = today.year - dob_date.year - ((today.month, today.day) < (dob_date.month, dob_date.day))
        if age < 13:
            raise ValueError('Employee must be at least 13 years old')
        return v

    @validator('gender')
    def validate_gender(cls, v):
        allowed = ['male', 'female']
        if v and v.lower() not in allowed:
            raise ValueError(f"gender must be one of: {', '.join(allowed)}")
        return v.lower() if v else v

    @validator('maritalStatus')
    def validate_marital_status(cls, v):
        if v is None:
            return v
        allowed = ['single', 'married', 'divorced', 'widowed']
        if v.lower() not in allowed:
            raise ValueError(f"maritalStatus must be one of: {', '.join(allowed)}")
        return v.lower()

    @validator('shift')
    def validate_shift(cls, v):
        if v is None:
            return v
        allowed = ['general', 'morning', 'afternoon', 'night', 'hourly', 'both']
        if v.lower() not in allowed:
            raise ValueError(f"shift must be one of: {', '.join(allowed)}")
        return v.lower()


class EmployeeResponseSchema(BaseModel):
    """Response schema after employee creation"""
    message: str
    employee_id: str
    
    class Config:
        from_attributes = True


class ErrorResponseSchema(BaseModel):
    """Error response schema"""
    error: str


def _validate_institution_type(value: Optional[str]) -> Optional[str]:
    """Normalize and validate an institution type against the model choices.

    Keeping the API validator tied to ``Institution.INST_TYPE_CHOICES`` prevents
    the request schema and database model from silently drifting apart.
    """
    if value is None:
        return None

    normalized = value.strip().lower().replace('-', '_').replace(' ', '_')
    allowed = {choice for choice, _label in Institution.INST_TYPE_CHOICES}
    if normalized not in allowed:
        raise ValueError(f"inst_type must be one of: {', '.join(sorted(allowed))}")
    return normalized

class InstitutionCreateSchema(BaseModel):
    """Request body for POST /institutions."""
    organization_code: Optional[str] = None  # Falls back to first Organization when absent
    inst_code: str
    name: str
    inst_type: str = "educational"
    address: Optional[str] = None
    city: Optional[str] = None
    contact_number: Optional[str] = None

    @validator('inst_type')
    def validate_inst_type(cls, v):
        return _validate_institution_type(v)


class InstitutionUpdateSchema(BaseModel):
    """Request body for PUT /institutions/{id}. All fields optional."""
    organization_code: Optional[str] = None
    inst_code: Optional[str] = None
    name: Optional[str] = None
    inst_type: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    contact_number: Optional[str] = None

    @validator('inst_type')
    def validate_inst_type(cls, v):
        return _validate_institution_type(v)


class BranchCreateSchema(BaseModel):
    """Request body for POST /branches."""
    institution_code: str
    branch_code: str
    branch_name: str
    status: str = "active"
    address: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    postal_code: Optional[str] = None
    contact_number: Optional[str] = None
    secondary_contact: Optional[str] = None
    email: Optional[str] = None
    branch_head_name: Optional[str] = None
    branch_head_contact: Optional[str] = None
    branch_head_email: Optional[str] = None
    established_year: Optional[int] = None
    registration_number: Optional[str] = None

    @validator('status')
    def validate_status(cls, v):
        allowed = ['active', 'inactive', 'closed', 'under_construction']
        if v and v.lower() not in allowed:
            raise ValueError(f"status must be one of: {', '.join(allowed)}")
        return v.lower() if v else v


class BranchUpdateSchema(BaseModel):
    """Request body for PUT /branches/{key}. All fields optional."""
    institution_code: Optional[str] = None
    branch_code: Optional[str] = None
    branch_name: Optional[str] = None
    status: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    postal_code: Optional[str] = None
    contact_number: Optional[str] = None
    secondary_contact: Optional[str] = None
    email: Optional[str] = None
    branch_head_name: Optional[str] = None
    branch_head_contact: Optional[str] = None
    branch_head_email: Optional[str] = None
    established_year: Optional[int] = None
    registration_number: Optional[str] = None

    @validator('status')
    def validate_status(cls, v):
        if v is None:
            return v
        allowed = ['active', 'inactive', 'closed', 'under_construction']
        if v.lower() not in allowed:
            raise ValueError(f"status must be one of: {', '.join(allowed)}")
        return v.lower()


class DepartmentCreateSchema(BaseModel):
    """Schema for creating a department"""
    dept_code: str
    dept_name: str
    institution_code: Optional[str] = None  # Link to institution
    branch_code: Optional[str] = None      # Link to branch
    description: Optional[str] = None

class DepartmentUpdateSchema(BaseModel):
    """Schema for updating a department"""
    dept_name: Optional[str] = None
    institution_code: Optional[str] = None
    branch_code: Optional[str] = None
    description: Optional[str] = None

class DepartmentDetailSchema(BaseModel):
    """Schema for department detail response"""
    department_id: str
    dept_code: str
    dept_name: str
    institution_code: Optional[str] = None
    branch_code: Optional[str] = None
    description: Optional[str] = None
    employee_count: int
    designations: list

class DesignationCreateSchema(BaseModel):
    """Schema for creating a designation"""
    department_id: Optional[str] = None
    department_code: Optional[str] = None
    department_ids: Optional[list] = None
    branch_codes: Optional[List[str]] = None
    institution_codes: Optional[List[str]] = None
    target_dept_code: Optional[str] = None
    target_dept_name: Optional[str] = None
    position_code: str
    position_name: str
    description: Optional[str] = None

    @model_validator(mode='after')
    def validate_targets(self):
        has_legacy = (
            self.department_ids
            or self.department_id
            or self.department_code
        )
        has_locations = (
            self.branch_codes
            or self.institution_codes
        )
        if not has_legacy and not has_locations:
            raise ValueError("Select at least one department or target location")
        if has_locations:
            if not self.target_dept_code:
                raise ValueError("target_dept_code is required when selecting locations")
            if not self.target_dept_name:
                raise ValueError("target_dept_name is required when selecting locations")
        return self

class DesignationUpdateSchema(BaseModel):
    """Schema for updating a designation"""
    position_name: Optional[str] = None
    description: Optional[str] = None


EMPLOYEE_BULK_COLUMNS = [
    "organization_code", "full_name", "cnic", "dob", "gender",
    "personal_email", "personal_phone", "residential_address",
    "marital_status", "nationality",
]


@router.get("/employees/bulk-upload/template")
@require_permission("employee.create")
def employee_bulk_upload_template(request):
    """Download the canonical CSV header plus one example row."""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=EMPLOYEE_BULK_COLUMNS)
    writer.writeheader()
    writer.writerow({
        "organization_code": "IAK", "full_name": "Example Employee",
        "cnic": "42201-1234567-1", "dob": "1990-01-31", "gender": "male",
        "personal_email": "employee@example.com", "personal_phone": "03001234567",
        "residential_address": "Karachi", "marital_status": "single", "nationality": "Pakistani",
    })
    response = HttpResponse(output.getvalue(), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = 'attachment; filename="employee_bulk_upload_template.csv"'
    return response


@router.post("/employees/bulk-upload", response={200: dict, 400: dict})
@require_permission("employee.create")
def employee_bulk_upload(request, file: UploadedFile = File(...)):
    """Validate a CSV and create basic pending employees without provisioning side effects."""
    if not file.name.lower().endswith(".csv"):
        return 400, {"error": "Only CSV files are supported"}
    if file.size > 5 * 1024 * 1024:
        return 400, {"error": "CSV file must be 5 MB or smaller"}
    try:
        text = file.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        return 400, {"error": "CSV must use UTF-8 encoding"}

    reader = csv.DictReader(io.StringIO(text))
    headers = [h.strip() for h in (reader.fieldnames or [])]
    required_headers = {"organization_code", "full_name", "cnic", "dob", "gender", "personal_email"}
    missing = sorted(required_headers.difference(headers))
    if missing:
        return 400, {"error": f"Missing required columns: {', '.join(missing)}"}

    created, errors, seen_cnics, seen_emails = [], [], set(), set()
    for row_number, raw in enumerate(reader, start=2):
        if row_number > 5001:
            errors.append({"row": row_number, "name": "", "errors": ["maximum 5,000 data rows per upload"]})
            break
        row = {key.strip(): (value or "").strip() for key, value in raw.items() if key is not None}
        row_errors = []
        full_name = row.get("full_name", "")
        cnic = re.sub(r"[-\s]", "", row.get("cnic", ""))
        org = Organization.objects.filter(org_code=row.get("organization_code", ""), is_deleted=False).first()
        if not full_name:
            row_errors.append("full_name is required")
        if not re.fullmatch(r"\d{13}", cnic):
            row_errors.append("cnic must contain exactly 13 digits")
        elif cnic in seen_cnics:
            row_errors.append("duplicate CNIC in this CSV")
        elif Employee.all_objects.filter(cnic=cnic).exists():
            row_errors.append("CNIC already exists")
        if not org:
            row_errors.append("organization_code not found")
        try:
            dob = datetime.strptime(row.get("dob", ""), "%Y-%m-%d").date()
            if dob >= date.today():
                row_errors.append("dob must be in the past")
        except ValueError:
            dob = None
            row_errors.append("dob must be YYYY-MM-DD")
        gender = row.get("gender", "").lower()
        if gender not in dict(Employee.GENDER_CHOICES):
            row_errors.append("gender must be male, female, or other")
        marital_status = row.get("marital_status", "").lower() or None
        if marital_status and marital_status not in dict(Employee.MARITAL_STATUS_CHOICES):
            row_errors.append("invalid marital_status")
        email = (row.get("personal_email") or "").strip().lower() or None
        if not email:
            row_errors.append("personal_email is required")
        else:
            from django.core.validators import validate_email
            try:
                validate_email(email)
            except ValidationError:
                row_errors.append("personal_email is invalid")
            else:
                if email in seen_emails:
                    row_errors.append("duplicate personal_email in this CSV")
                elif Employee.all_objects.filter(personal_email__iexact=email).exists():
                    row_errors.append("personal_email already exists")
        if row_errors:
            errors.append({"row": row_number, "name": full_name, "errors": row_errors})
            continue
        seen_cnics.add(cnic)
        seen_emails.add(email)
        try:
            with transaction.atomic():
                employee = Employee.objects.create(
                    organization=org, full_name=full_name, cnic=cnic, dob=dob,
                    gender=gender, personal_email=email,
                    personal_phone=row.get("personal_phone") or None,
                    residential_address=row.get("residential_address") or None,
                    marital_status=marital_status,
                    nationality=row.get("nationality") or "Pakistani",
                    status=EmployeeStatus.PENDING_APPROVAL,
                )
            created.append({"row": row_number, "employee_id": employee.employee_id, "full_name": employee.full_name})
        except Exception as exc:
            errors.append({"row": row_number, "name": full_name, "errors": [str(exc)]})
    return {"total": len(created) + len(errors), "created_count": len(created), "failed_count": len(errors), "created": created, "errors": errors}






# ========================================
# ORGANIZATION API (READ ONLY)
# ========================================

@router.get("/organizations", response=List[dict])
@require_permission("organization.view")
def list_organizations(request):
    """
    ONLY READ-ONLY (Fixed Master Org)
    """
    return [
        {
            "id": str(org.id),
            "name": org.name,
            "org_code": org.org_code,
            "email": org.email,
            "phone": org.phone,
            "logo_url": org.logo_url,
            "website": org.website,
            "address": org.address,
        }
        for org in Organization.objects.filter(is_deleted=False)
    ]

# ========================================
# INSTITUTION SCHEMAS
# ========================================


@router.get("/institutions", response=List[InstitutionSchema])
@require_permission("institution.view")
def list_institutions(request, organization_code: str = None):
    """Get all active institutions, optionally filtered by organization."""
    institutions = Institution.objects.filter(is_deleted=False)
    if organization_code:
        institutions = institutions.filter(organization__org_code=organization_code)

    return [
        {
            "id": str(inst.id),
            "organization_code": inst.organization.org_code if inst.organization_id else None,
            "inst_code": inst.inst_code,
            "name": inst.name,
            "inst_type": inst.inst_type,
            "address": inst.address,
            "city": inst.city,
            "contact_number": inst.contact_number,

            "created_at": inst.created_at.isoformat() if inst.created_at else None,
            "updated_at": inst.updated_at.isoformat() if inst.updated_at else None,
        }
        for inst in institutions
    ]


@router.post("/institutions", response={201: InstitutionSchema, 400: ErrorResponseSchema})
@require_permission("institution.create")
def create_institution(request, payload: InstitutionCreateSchema):
    """Create a new institution"""
    try:
        org_code = payload.organization_code
        if org_code:
            org = Organization.objects.filter(org_code=org_code).first()
        else:
            org = Organization.objects.first()

        if not org:
            return 400, {"error": "Organization not found"}

        inst = Institution.objects.create(
            organization=org,
            inst_code=payload.inst_code,
            name=payload.name,
            inst_type=payload.inst_type,
            address=payload.address,
            city=payload.city,
            contact_number=payload.contact_number,
        )

        return 201, {
            "id": str(inst.id),

            "inst_code": inst.inst_code,
            "name": inst.name,
            "inst_type": inst.inst_type,
            "address": inst.address,
            "city": inst.city,
            "contact_number": inst.contact_number,

            "created_at": inst.created_at.isoformat() if inst.created_at else None,
            "updated_at": inst.updated_at.isoformat() if inst.updated_at else None,
        }

    except Exception as e:
        return 400, {"error": str(e)}


@router.get(
    "/institutions/{institution_id}",
    response={200: InstitutionSchema, 404: ErrorResponseSchema}
)
@require_permission("institution.view")
def get_institution(request, institution_id: str):
    """Get single institution"""
    inst = Institution.objects.filter(
        id=institution_id,
        is_deleted=False
    ).first()

    if not inst:
        return 404, {"error": "Institution not found"}

    return 200, {
        "id": str(inst.id),
        "inst_code": inst.inst_code,
        "name": inst.name,
        "inst_type": inst.inst_type,
        "address": inst.address,
        "city": inst.city,
        "contact_number": inst.contact_number,
        "created_at": inst.created_at.isoformat() if inst.created_at else None,
        "updated_at": inst.updated_at.isoformat() if inst.updated_at else None,
    }


@router.put(
    "/institutions/{institution_id}",
    response={200: InstitutionSchema, 404: ErrorResponseSchema}
)
@require_permission("institution.edit")
def update_institution(request, institution_id: str, payload: InstitutionUpdateSchema):
    """Update institution"""
    inst = Institution.objects.filter(
        id=institution_id,
        is_deleted=False
    ).first()

    if not inst:
        return 404, {"error": "Institution not found"}

    data = payload.dict(exclude_unset=True)

    inst.inst_code = data["inst_code"] if "inst_code" in data else inst.inst_code
    inst.name = data["name"] if "name" in data else inst.name
    inst.inst_type = data["inst_type"] if "inst_type" in data else inst.inst_type
    inst.address = data["address"] if "address" in data else inst.address
    inst.city = data["city"] if "city" in data else inst.city
    inst.contact_number = data["contact_number"] if "contact_number" in data else inst.contact_number

    org_code = data.get("organization_code")
    if org_code:
        org = Organization.objects.filter(org_code=org_code).first()
        if org:
            inst.organization = org

    inst.save()

    return 200, {
        "id": str(inst.id),
        "inst_code": inst.inst_code,
        "name": inst.name,
        "inst_type": inst.inst_type,
        "address": inst.address,
        "city": inst.city,
        "contact_number": inst.contact_number,
        "created_at": inst.created_at.isoformat() if inst.created_at else None,
        "updated_at": inst.updated_at.isoformat() if inst.updated_at else None,
    }


@router.delete(
    "/institutions/{institution_id}",
    response={200: dict, 404: ErrorResponseSchema}
)
@require_permission("institution.delete")
def delete_institution(request, institution_id: str):
    """Soft delete institution"""
    inst = Institution.objects.filter(
        id=institution_id,
        is_deleted=False
    ).first()

    if not inst:
        return 404, {"error": "Institution not found"}

    inst.is_deleted = True
    inst.save()

    return 200, {"message": "Institution deleted successfully"}

@router.get("/branches", response=List[BranchSchema])
@require_permission("branch.view")
def list_branches(request, institution_code: str = None, organization_code: str = None):
    """Get all active branches, optionally filtered by institution or organization"""
    query = Branch.objects.filter(is_deleted=False).select_related('institution__organization')
    if institution_code:
        query = query.filter(institution__inst_code=institution_code)
    if organization_code:
        query = query.filter(institution__organization__org_code=organization_code)
    
    return [_branch_response(b) for b in query]


@router.post("/branches", response={201: BranchSchema, 400: ErrorResponseSchema})
@require_permission("branch.create")
def create_branch(request, payload: BranchCreateSchema):
    """Create a new branch under an institution"""
    try:
        inst = get_object_or_404(Institution, inst_code=payload.institution_code)
        branch = Branch.objects.create(
            institution=inst,
            branch_code=payload.branch_code,
            branch_name=payload.branch_name,
            status=payload.status,
            address=payload.address,
            city=payload.city,
            district=payload.district,
            postal_code=payload.postal_code,
            contact_number=payload.contact_number,
            secondary_contact=payload.secondary_contact,
            email=payload.email,
            branch_head_name=payload.branch_head_name,
            branch_head_contact=payload.branch_head_contact,
            branch_head_email=payload.branch_head_email,
            established_year=payload.established_year,
            registration_number=payload.registration_number,
        )
        return 201, _branch_response(branch)
    except Exception as e:
        return 400, {"error": str(e)}


def _branch_response(branch):
    """Build consistent branch dict for all branch endpoints."""
    return {
        "branch_id": branch.branch_id,
        "branch_code": branch.branch_code,
        "branch_name": branch.branch_name,
        "institution_code": branch.institution.inst_code,
        "organization_code": branch.institution.organization.org_code if branch.institution.organization_id else None,
        "status": branch.status,
        "address": branch.address,
        "city": branch.city,
        "district": branch.district,
        "postal_code": branch.postal_code,
        "contact_number": branch.contact_number,
        "secondary_contact": branch.secondary_contact,
        "email": branch.email,
        "branch_head_name": branch.branch_head_name,
        "branch_head_contact": branch.branch_head_contact,
        "branch_head_email": branch.branch_head_email,
        "established_year": branch.established_year,
        "registration_number": branch.registration_number,
    }


def _resolve_branch(branch_key: str):
    """Lookup a non-deleted branch by branch_id or branch_code."""
    return Branch.objects.filter(is_deleted=False).filter(
        models.Q(branch_id=branch_key) | models.Q(branch_code=branch_key)
    ).first()


def _branch_mismatch(asn, dept):
    """Return an error message if an assignment's branch does not match its department's branch."""
    branch_code = getattr(asn, 'branch_code', None)
    if branch_code:
        if not dept.branch_id or dept.branch.branch_code != branch_code:
            return f"Department '{dept.dept_code}' does not belong to branch '{branch_code}'"
    return None


def _assignment_institution(asn):
    """Derive institution from the assignment's actual department."""
    dept = asn.department
    if dept.branch_id and dept.branch.institution_id:
        return dept.branch.institution
    if dept.institution_id:
        return dept.institution
    return None


def _department_institution(dept):
    """Return the institution owning a branch/local department, if any."""
    if dept.branch_id:
        return dept.branch.institution
    return dept.institution if dept.institution_id else None


def _department_organization(dept):
    institution = _department_institution(dept)
    return institution.organization if institution else dept.organization


def _designation_scope_q(dept):
    """Only the department's own designations — no institution-wide sharing.

    A designation is created per campus/department, so placements must resolve
    against exactly the department it was attached to.
    """
    return models.Q(department=dept)


def _designation_matches_department(designation, dept):
    """Designations belong to exactly one department/campus."""
    return bool(dept and designation.department_id == dept.id)


@router.put("/branches/{branch_key}", response={200: BranchSchema, 400: ErrorResponseSchema, 404: ErrorResponseSchema})
@require_permission("branch.edit")
def update_branch(request, branch_key: str, payload: BranchUpdateSchema):
    """Update a branch. Accepts branch_id or branch_code as key."""
    branch = _resolve_branch(branch_key)
    if not branch:
        return 404, {"error": "Branch not found"}

    data = payload.dict(exclude_unset=True)

    inst_code = data.get("institution_code")
    if inst_code and inst_code != branch.institution.inst_code:
        inst = Institution.objects.filter(inst_code=inst_code, is_deleted=False).first()
        if not inst:
            return 400, {"error": f"Institution '{inst_code}' not found"}
        branch.institution = inst

    new_code = data.get("branch_code")
    if new_code and new_code != branch.branch_code:
        if Branch.objects.filter(branch_code=new_code).exclude(pk=branch.pk).exists():
            return 400, {"error": f"Branch code '{new_code}' already exists"}
        branch.branch_code = new_code

    for field in (
        "branch_name", "status", "address", "city", "district", "postal_code",
        "contact_number", "secondary_contact", "email",
        "branch_head_name", "branch_head_contact", "branch_head_email",
        "established_year", "registration_number",
    ):
        if field in data:
            setattr(branch, field, data[field])

    try:
        branch.save()
    except Exception as e:
        return 400, {"error": str(e)}

    return 200, _branch_response(branch)


@router.delete("/branches/{branch_key}", response={200: dict, 404: ErrorResponseSchema})
@require_permission("branch.delete")
def delete_branch(request, branch_key: str):
    """Soft delete a branch. Accepts branch_id or branch_code as key."""
    branch = _resolve_branch(branch_key)
    if not branch:
        return 404, {"error": "Branch not found"}
    branch.is_deleted = True
    branch.save()
    return 200, {"message": "Branch deleted successfully"}


@router.get("/departments", response=List[dict])
@require_permission("department.view")
def list_departments(request, branch_code: str = None, institution_code: str = None, organization_code: str = None):
    """Get departments, optionally filtered by hierarchy"""
    query = Department.objects.filter(is_deleted=False)
    
    if branch_code:
        query = query.filter(branch__branch_code=branch_code)
    elif institution_code:
        query = query.filter(institution__inst_code=institution_code)
    elif organization_code:
        query = query.filter(
            models.Q(organization__org_code=organization_code)
            | models.Q(institution__organization__org_code=organization_code)
            | models.Q(branch__institution__organization__org_code=organization_code)
        )

    from django.db.models.functions import Coalesce
    departments = query.annotate(
        _institution_code=Coalesce('institution__inst_code', 'branch__institution__inst_code')
    ).values('id', 'dept_code', 'dept_name', '_institution_code', 'branch__branch_code', 'organization__org_code')
    return [
        {
            'id': str(d['id']),
            'dept_code': d['dept_code'],
            'dept_name': d['dept_name'],
            'institution_code': d['_institution_code'],
            'branch_code': d['branch__branch_code'],
            'organization_code': d['organization__org_code'],
        }
        for d in departments
    ]

@router.post("/departments", response={201: dict, 400: ErrorResponseSchema})
@require_permission("department.create")
def create_department(request, payload: DepartmentCreateSchema):
    """Create a new department under a branch, institution, or organization scope.

    Department codes are only unique *within* their scope, so the same code
    (e.g. ``ACC``) can exist under different branches/institutions/organizations.
    """
    import re
    # Validate dept_code format
    if len(payload.dept_code) > 6:
        return 400, {"error": "Department code must be 6 characters or less"}
    if not re.match(r'^[A-Za-z0-9]+$', payload.dept_code):
        return 400, {"error": "Department code must be alphanumeric only"}
    if not payload.branch_code and not payload.institution_code:
        return 400, {"error": "Select a branch or institution for the department"}

    code = payload.dept_code.upper()
    try:
        inst = None
        branch = None
        if payload.branch_code:
            from employees.models import Branch as BranchModel
            branch = BranchModel.objects.filter(branch_code=payload.branch_code, is_deleted=False).first()
            if not branch:
                return 400, {"error": f"Branch '{payload.branch_code}' not found"}
            if Department.objects.filter(branch=branch, dept_code=code, is_deleted=False).exists():
                return 400, {"error": f"Department code '{code}' already exists in branch '{payload.branch_code}'"}
        elif payload.institution_code:
            inst = Institution.objects.filter(inst_code=payload.institution_code, is_deleted=False).first()
            if not inst:
                return 400, {"error": f"Institution '{payload.institution_code}' not found"}
            if Department.objects.filter(institution=inst, dept_code=code, is_deleted=False).exists():
                return 400, {"error": f"Department code '{code}' already exists in institution '{payload.institution_code}'"}

        dept = Department.objects.create(
            institution=inst,
            branch=branch,
            dept_code=code,
            dept_name=payload.dept_name,
            description=payload.description or None
        )
        return 201, {
            "message": "Department created successfully",
            "department_id": str(dept.id),
            "dept_code": dept.dept_code
        }
    except Exception as e:
        return 400, {"error": str(e)}


@router.get("/departments/{department_id}", response={200: dict, 404: ErrorResponseSchema})
@require_permission("department.view")
def get_department(request, department_id: str):
    """Get single department with employee count and designations"""
    try:
        dept = Department.objects.get(id=department_id)
        return 200, {
            "department_id": str(dept.id),
            "dept_code": dept.dept_code,
            "dept_name": dept.dept_name,
            "institution_code": dept.institution.inst_code if dept.institution else None,
            "branch_code": dept.branch.branch_code if dept.branch else None,
            "description": dept.description,
            "employee_count": dept.assignments.filter(is_deleted=False).count(),
            "designations": [
                {"position_code": d.position_code, "position_name": d.position_name}
                for d in dept.designations.filter(is_deleted=False)
            ]
        }
    except Department.DoesNotExist:
        return 404, {"error": f"Department not found"}


@router.put("/departments/{department_id}", response={200: dict, 400: ErrorResponseSchema, 404: ErrorResponseSchema})
@require_permission("department.edit")
def update_department(request, department_id: str, payload: DepartmentUpdateSchema):
    """Update department details"""
    try:
        dept = Department.objects.get(id=department_id)
        if payload.dept_name is not None:
            dept.dept_name = payload.dept_name
        if payload.description is not None:
            dept.description = payload.description
        if payload.branch_code is not None:
            from employees.models import Branch as BranchModel
            dept.branch = BranchModel.objects.filter(branch_code=payload.branch_code, is_deleted=False).first() if payload.branch_code else None
            dept.institution = None  # branch takes priority, clear institution
        elif payload.institution_code is not None:
            dept.institution = Institution.objects.filter(inst_code=payload.institution_code, is_deleted=False).first() if payload.institution_code else None
            dept.branch = None  # institution set, clear branch
        dept.save()
        return 200, {
            "message": "Department updated successfully",
            "dept_code": dept.dept_code,
            "department_id": str(dept.id),
        }
    except Department.DoesNotExist:
        return 404, {"error": "Department not found"}
    except Exception as e:
        return 400, {"error": str(e)}


@router.delete("/departments/{department_id}", response={200: dict, 400: ErrorResponseSchema, 404: ErrorResponseSchema})
@require_permission("department.delete")
def delete_department(request, department_id: str):
    """Soft delete a department (only if no active employees)"""
    try:
        dept = Department.objects.get(id=department_id)
        active_employees = dept.assignments.filter(is_deleted=False).count()
        if active_employees > 0:
            return 400, {"error": f"Cannot delete department with {active_employees} active employees"}
        dept.soft_delete()
        return 200, {"message": f"Department '{dept.dept_code}' deleted successfully"}
    except Department.DoesNotExist:
        return 404, {"error": "Department not found"}


@router.get("/designations", response=List[dict])
@require_permission("designation.view")
def list_designations(request, department_id: str = None, department_code: str = None):
    """Get designations; a department filter returns only that department's catalog."""
    query = Designation.objects.filter(is_deleted=False)
    dept = None
    if department_id:
        dept = Department.objects.filter(id=department_id, is_deleted=False).first()
    elif department_code:
        dept = Department.objects.filter(dept_code=department_code, is_deleted=False).first()
    if department_id or department_code:
        query = query.filter(_designation_scope_q(dept)) if dept else query.none()
    designations = query.values(
        'id', 'position_code', 'position_name', 'description',
        'department__id', 'department__dept_code'
    )
    return [
        {
            'id': d['id'],
            'position_code': d['position_code'],
            'position_name': d['position_name'],
            'description': d['description'],
            'department_id': d['department__id'],
            'department__dept_code': d['department__dept_code'],
        }
        for d in designations
    ]


def _resolve_or_create_department(
    dept_code,
    dept_name,
    branch=None,
    institution=None,
    organization=None,
):
    """Find or create a Department under the given parent scope.

    Returns (department, created) where created is True if a new row was made.
    """
    code = dept_code.upper().strip()
    lookup = {"dept_code": code, "is_deleted": False}
    if branch:
        lookup["branch"] = branch
    elif institution:
        lookup["institution"] = institution
    elif organization:
        lookup["organization"] = organization
    else:
        raise ValueError("A parent scope (branch, institution, or organization) is required")

    dept = Department.objects.filter(**lookup).first()
    if dept:
        return dept, False

    create_kwargs = {
        "dept_code": code,
        "dept_name": dept_name,
        "branch": branch,
    }
    if not branch:
        create_kwargs["institution"] = institution
    if not branch and not institution:
        create_kwargs["organization"] = organization
    dept = Department.objects.create(**create_kwargs)
    return dept, True


@router.post("/designations", response={201: dict, 400: ErrorResponseSchema})
@require_permission("designation.create")
def create_designation(request, payload: DesignationCreateSchema):
    """Create a designation for one or more selected departments/campuses.

    Supports two targeting paths:
    - Path A (legacy): department_ids / department_id / department_code
    - Path B (location-based): branch_codes / institution_codes + target_dept_code / target_dept_name
      Auto-creates missing departments at selected locations.
    """
    try:
        resolved_depts = []
        dept_created_count = 0

        # Path A: Legacy department_ids flow
        target_ids = []
        if payload.department_ids:
            target_ids = [str(did) for did in payload.department_ids]
        elif payload.department_id:
            target_ids = [payload.department_id]
        elif payload.department_code:
            dept = Department.objects.filter(dept_code=payload.department_code, is_deleted=False).first()
            if dept:
                target_ids = [str(dept.id)]

        if target_ids:
            depts = {str(d.id): d for d in Department.objects.filter(id__in=target_ids, is_deleted=False)}
            for tid in target_ids:
                dept = depts.get(tid)
                if dept:
                    resolved_depts.append((dept, "explicit"))

        # Path B: Location-based flow
        if payload.branch_codes or payload.institution_codes:
            dept_code = payload.target_dept_code.upper().strip()
            dept_name = payload.target_dept_name.strip()

            with transaction.atomic():
                if payload.branch_codes:
                    branches_map = {
                        b.branch_code: b
                        for b in Branch.objects.filter(
                            branch_code__in=payload.branch_codes, is_deleted=False
                        ).select_related("institution")
                    }
                    for bc in payload.branch_codes:
                        branch = branches_map.get(bc)
                        if not branch:
                            continue
                        dept, created = _resolve_or_create_department(
                            dept_code, dept_name, branch=branch
                        )
                        if created:
                            dept_created_count += 1
                        resolved_depts.append((dept, f"branch:{bc}"))

                if payload.institution_codes:
                    insts_map = {
                        i.inst_code: i
                        for i in Institution.objects.filter(
                            inst_code__in=payload.institution_codes, is_deleted=False
                        )
                    }
                    for ic in payload.institution_codes:
                        inst = insts_map.get(ic)
                        if not inst:
                            continue
                        dept, created = _resolve_or_create_department(
                            dept_code, dept_name, institution=inst
                        )
                        if created:
                            dept_created_count += 1
                        resolved_depts.append((dept, f"institution:{ic}"))

        if not resolved_depts:
            return 400, {"error": "No valid target locations resolved"}

        created, skipped, failed = [], [], []
        seen_dept_ids = set()

        for dept, source in resolved_depts:
            dept_id_str = str(dept.id)
            if dept_id_str in seen_dept_ids:
                continue
            seen_dept_ids.add(dept_id_str)

            if Designation.objects.filter(department=dept, position_code=payload.position_code, is_deleted=False).exists():
                skipped.append({
                    "department_id": dept_id_str,
                    "department_code": dept.dept_code,
                    "source": source,
                    "reason": "already exists",
                })
                continue

            try:
                designation = Designation.objects.create(
                    department=dept,
                    position_code=payload.position_code,
                    position_name=payload.position_name,
                    description=payload.description,
                )
                created.append({
                    "id": str(designation.id),
                    "department_id": dept_id_str,
                    "department_code": dept.dept_code,
                    "source": source,
                })
            except Exception as e:
                failed.append({"department_id": dept_id_str, "source": source, "reason": str(e)})

        if payload.branch_codes:
            known = set(
                Branch.objects.filter(
                    branch_code__in=payload.branch_codes, is_deleted=False
                ).values_list("branch_code", flat=True)
            )
            for bc in payload.branch_codes:
                if bc not in known:
                    failed.append({"branch_code": bc, "reason": "branch not found"})

        if payload.institution_codes:
            known = set(
                Institution.objects.filter(
                    inst_code__in=payload.institution_codes, is_deleted=False
                ).values_list("inst_code", flat=True)
            )
            for ic in payload.institution_codes:
                if ic not in known:
                    failed.append({"institution_code": ic, "reason": "institution not found"})

        if not created and skipped and not failed:
            return 400, {"error": f"Position code '{payload.position_code}' already exists in all selected locations"}

        message = f"Designation created in {len(created)} location(s)"
        if dept_created_count:
            message += f"; {dept_created_count} department(s) auto-created"
        if skipped:
            message += f"; skipped {len(skipped)} (already exists)"
        if failed:
            message += f"; failed {len(failed)}"
        return 201, {
            "message": message,
            "position_code": payload.position_code,
            "position_name": payload.position_name,
            "created": created,
            "created_count": len(created),
            "skipped": skipped,
            "skipped_count": len(skipped),
            "failed": failed,
            "failed_count": len(failed),
            "departments_auto_created": dept_created_count,
        }
    except Exception as e:
        return 400, {"error": str(e)}


# Create employee with Branch support
@router.post(
    "/employees",
    response={201: dict, 400: dict},
    summary="Create New Employee",
)
@require_permission("employee.create")
def create_employee(request, payload: EmployeeCreateSchema):
    """Create a new employee. Accepts JSON body. Resume upload moved to a separate endpoint."""
    print("back bio", payload.bio)
    field_errors = {}
    try:
        cnic_clean = payload.cnic.replace('-', '').replace(' ', '') if payload.cnic else ""
        if Employee.all_objects.filter(models.Q(cnic=cnic_clean) | models.Q(cnic=payload.cnic)).exists():
            field_errors['cnic'] = ['An employee with this CNIC already exists']

        if Employee.all_objects.filter(personal_email__iexact=payload.personalEmail).exists():
            field_errors['personalEmail'] = ['An employee with this personal email already exists']

        if payload.orgEmail and Employee.all_objects.filter(org_email__iexact=payload.orgEmail).exists():
            field_errors['orgEmail'] = ['An employee with this official email already exists']

        if payload.orgEmail and Employee.objects.filter(org_email__iexact=payload.orgEmail, is_deleted=False).exists():
            field_errors['orgEmail'] = ['An employee with this organization email already exists']

        org = Organization.objects.filter(org_code=payload.organizationCode).first()
        if not org:
            field_errors['organizationCode'] = ["Organization not found"]
            
        inst = None
        if payload.institutionCode:
            inst = Institution.objects.filter(inst_code=payload.institutionCode).first()
            if not inst:
                field_errors['institutionCode'] = ["Institution not found"]

        # Build assignment list — multi-role payload wins, else fall back to flat legacy fields.
        assignments = payload.assignments
        if not assignments:
            if not payload.departmentCode or not payload.designationCode:
                field_errors['assignments'] = [
                    "At least one assignment is required (send `assignments` array "
                    "or the flat departmentCode/designationCode fields)"
                ]
            assignments = [AssignmentCreateSchema(
                branch_code=payload.branchCode,
                department_code=payload.departmentCode,
                designation_code=payload.designationCode,
                joining_date=payload.joiningDate,
                shift=payload.shift,
                is_primary=True,
            )]

        # Validate each assignment (dept → designation scope + branch → dept relationship).
        resolved = []
        seen_keys = {}
        for idx, asn in enumerate(assignments):
            pref = f"assignments.{idx}"
            if asn.joining_date:
                try:
                    jd = datetime.strptime(asn.joining_date, '%Y-%m-%d').date()
                    if jd > date.today():
                        field_errors[f"{pref}.joining_date"] = ["Joining date cannot be in the future"]
                except (ValueError, TypeError):
                    field_errors[f"{pref}.joining_date"] = ["Must be YYYY-MM-DD"]
            key = (asn.department_id or asn.department_code, asn.designation_id or asn.designation_code)
            if key in seen_keys:
                field_errors[f"{pref}.designation_code"] = [
                    f"Duplicate role: department '{asn.department_id or asn.department_code}' with designation "
                    f"'{asn.designation_id or asn.designation_code}' already exists in row {seen_keys[key] + 1}"
                ]
            else:
                seen_keys[key] = idx
            dept = None
            if asn.department_id:
                dept = Department.objects.filter(id=asn.department_id, is_deleted=False).first()
            elif asn.department_code:
                dept = Department.objects.filter(dept_code=asn.department_code, is_deleted=False).first()
            if not dept:
                field_errors[f"{pref}.department_code"] = ["Department not found"]
                continue
            branch_err = _branch_mismatch(asn, dept)
            if branch_err:
                field_errors[f"{pref}.branch_code"] = [branch_err]
            designation = None
            if asn.designation_id:
                designation = Designation.objects.filter(id=asn.designation_id, is_deleted=False).first()
            else:
                designation = Designation.objects.filter(_designation_scope_q(dept), position_code=asn.designation_code, is_deleted=False).first()
            if not designation or not _designation_matches_department(designation, dept):
                field_errors[f"{pref}.designation_code"] = [f"Designation '{asn.designation_id or asn.designation_code}' is not available in this institution"]
            resolved.append((dept, designation, asn))

        if field_errors:
            return 400, {"error": "Validation failed", "field_errors": field_errors}

        # Multi-primary is allowed (M3). Only guard: if none flagged, the first row is primary.
        primary_indices = [i for i, (_, _, a) in enumerate(resolved) if a.is_primary]
        if not primary_indices:
            resolved[0][2].is_primary = True

        if not payload.dob:
            return 400, {"error": "Validation failed", "field_errors": {"dob": ["Date of birth is required"]}}
        dob = datetime.strptime(payload.dob, '%Y-%m-%d').date()

        with transaction.atomic():
            employee = Employee.objects.create(
                organization=org,
                full_name=payload.fullName,
                cnic=cnic_clean,
                personal_phone=payload.mobile,
                personal_email=payload.personalEmail,
                org_email=payload.orgEmail or None,
                org_phone=payload.orgPhone or None,
                dob=dob,
                gender=payload.gender,
                marital_status=payload.maritalStatus,
                nationality=payload.nationality or 'Pakistani',
                religion=payload.religion or 'Islam',
                residential_address=payload.residentialAddress,
                permanent_address=payload.permanentAddress,
                city=payload.city,
                bio=payload.bio,
                current_working_sector=payload.currentWorkingSector,
                emergency_contact_name=payload.emergencyName,
                emergency_contact_phone=payload.emergencyPhone,
                bank_name=payload.bankName,
                account_number=payload.accountNumber,
                education_history=[e.dict() for e in payload.education or []],
                work_experience=[e.dict() for e in payload.experience or []],
            )

            for asn_idx, (dept, designation, asn) in enumerate(resolved):
                joining_date = date.today()
                if asn.joining_date:
                    joining_date = datetime.strptime(asn.joining_date, '%Y-%m-%d').date()
                EmployeeAssignment.objects.create(
                    employee=employee,
                    department=dept,
                    designation=designation,
                    joining_date=joining_date,
                    is_primary=asn.is_primary,
                    shift=asn.shift or 'general'
                )

            # This employee is brand new, so any assignment just created here
            # is by definition their first — provision login credentials now.
            # Without this, EmployeeAssignment.save() still (re)generates the
            # employee_code and emails a "default password" that was never
            # actually set, and the employee can't log in (see
            # _provision_default_credentials for the no-op-if-exists guard).
            default_credentials_created = False
            if resolved:
                provisioning = _provision_default_credentials(employee, force_default_password=True)
                default_credentials_created = provisioning["created"]
                try:
                    from payroll.services import auto_onboard_employee_payroll
                    auto_onboard_employee_payroll(employee)
                except Exception as exc:
                    logger.error(f"Auto-onboard payroll failed on creation for {employee.employee_id}: {exc}")

        # Welcome email is sent AFTER the transaction commits — never inside
        # it — so we never notify about a write that could still roll back.
        welcome_email_status = "not_applicable"
        email_sent_to: list = []
        email_failed_for: list = []
        if resolved:
            from employees.notifications import send_welcome_employee_email

            plain_password = getattr(settings, "DEFAULT_EMPLOYEE_PASSWORD", "idaraalkhair12@#")
            _email_results = send_welcome_employee_email(employee, plain_password=plain_password)
            email_sent_to = _email_results.get("sent", [])
            email_failed_for = _email_results.get("failed", [])
            if email_sent_to and email_failed_for:
                welcome_email_status = "partial_failure"
            elif email_sent_to:
                welcome_email_status = "sent"
            elif email_failed_for:
                welcome_email_status = "failed"
            else:
                welcome_email_status = "not_attempted_no_recipient"

            if default_credentials_created:
                _log_credential_provisioning_audit(
                    employee=employee,
                    actor=request.auth,
                    welcome_email_status=welcome_email_status,
                    email_sent_to=email_sent_to,
                    email_failed_for=email_failed_for,
                )

        # Resume proxy logic would go here (truncated for brevity in this replace call)
        return 201, {
            "message": "Employee created successfully",
            "employee_id": employee.employee_id,
            "default_credentials_created": default_credentials_created,
            "welcome_email_sent_to": email_sent_to,
            "welcome_email_failed_for": email_failed_for,
            "welcome_email_status": welcome_email_status,
        }
    except Exception as e:
        logger.error(f"Error creating employee: {str(e)}", exc_info=True)
        return 400, {"error": str(e)}


@router.get("/designations/{designation_id}", response={200: dict, 404: ErrorResponseSchema})
@require_permission("designation.view")
def get_designation(request, designation_id: str):
    """Get single designation details"""
    try:
        designation = Designation.objects.select_related('department').get(id=designation_id)
        return 200, {
            "id": str(designation.id),
            "position_code": designation.position_code,
            "position_name": designation.position_name,
            "description": designation.description,
            "department": {
                "dept_code": designation.department.dept_code,
                "dept_name": designation.department.dept_name
            }
        }
    except Designation.DoesNotExist:
        return 404, {"error": "Designation not found"}


@router.put("/designations/{designation_id}", response={200: dict, 400: ErrorResponseSchema, 404: ErrorResponseSchema})
@require_permission("designation.edit")
def update_designation(request, designation_id: str, payload: DesignationUpdateSchema):
    """Update designation details"""
    try:
        designation = Designation.objects.get(id=designation_id)
        
        if payload.position_name is not None:
            designation.position_name = payload.position_name
        if payload.description is not None:
            designation.description = payload.description
        
        designation.save()
        return 200, {
            "message": "Designation updated successfully",
            "position_code": designation.position_code
        }
    except Designation.DoesNotExist:
        return 404, {"error": "Designation not found"}
    except Exception as e:
        return 400, {"error": str(e)}


@router.delete("/designations/{designation_id}", response={200: dict, 400: ErrorResponseSchema, 404: ErrorResponseSchema})
@require_permission("designation.delete")
def delete_designation(request, designation_id: str):
    """Soft delete a designation (only if no active employees)"""
    try:
        designation = Designation.objects.get(id=designation_id)
        
        # Check for active employees via assignments
        active_employees = designation.assignments.filter(is_deleted=False).count()
        if active_employees > 0:
            return 400, {"error": f"Cannot delete designation with {active_employees} active employees"}
        
        designation.soft_delete()  # Use soft_delete method
        return 200, {"message": f"Designation '{designation.position_code}' deleted successfully"}
    except Designation.DoesNotExist:
        return 404, {"error": "Designation not found"}


@router.get("/employees/dashboard-stats")
def get_dashboard_stats(request):
    """Get counts and employee data for the 3-tab dashboard: all, assigned, pending."""
    all_emps = Employee.objects.filter(is_deleted=False)
    pending_emps = all_emps.filter(status=EmployeeStatus.PENDING_APPROVAL)
    assigned_emps = all_emps.filter(status=EmployeeStatus.ACTIVE)

    def serialize_emp(e):
        assignment = e.assignments.filter(is_primary=True).first() or e.assignments.first()
        dept_name = ""
        desig_name = ""
        branch_name = ""
        inst_name = ""
        if assignment:
            dept_name = assignment.department.dept_name if assignment.department else ""
            desig_name = assignment.designation.position_name if assignment.designation else ""
            branch_name = assignment.department.branch.branch_name if assignment.department and assignment.department.branch else ""
            inst_name = assignment.department.branch.institution.name if assignment.department and assignment.department.branch and assignment.department.branch.institution else ""
        return {
            "id": str(e.id),
            "employee_id": e.employee_id or "",
            "full_name": e.full_name,
            "personal_email": e.personal_email or "",
            "personal_phone": e.personal_phone or "",
            "cnic": e.cnic or "",
            "gender": e.gender or "",
            "dob": str(e.dob) if e.dob else "",
            "education": e.education or "",
            "status": e.status,
            "department": dept_name,
            "designation": desig_name,
            "branch": branch_name,
            "institution": inst_name,
            "created_at": e.created_at.isoformat() if hasattr(e, 'created_at') and e.created_at else "",
        }

    return {
        "counts": {
            "all": all_emps.count(),
            "assigned": assigned_emps.count(),
            "pending": pending_emps.count(),
        },
        "employees": {
            "all": [serialize_emp(e) for e in all_emps.order_by("-created_at")[:100]],
            "assigned": [serialize_emp(e) for e in assigned_emps.order_by("-created_at")[:100]],
            "pending": [serialize_emp(e) for e in pending_emps.order_by("-created_at")[:100]],
        },
    }


@router.get("/employees", response=dict)
@require_permission("employee.view")
def list_employees(
    request,
    page: int = 1,
    per_page: int = 20,
    search: str = None,
    department: str = None,
    designation: str = None,
    employment_type: str = None,
    status: str = None
):
    """
    List employees with pagination and filters.
    
    Query params:
    - page: Page number (default 1)
    - per_page: Items per page (default 20, max 100); use 0 to return all
    - search: Search in name, email, employee_id
    - department: Filter by department code
    - designation: Filter by designation code
    - employment_type: Filter by employment type
    - status: Filter by status ('active', 'pending', 'unassigned', 'all'). Default is active & placed employees.
    """
    try:
        # Base query - only non-deleted employees
        query = Employee.objects.filter(is_deleted=False).prefetch_related(
            'assignments',
            'assignments__department',
            'assignments__department__branch',
            'assignments__department__branch__institution',
            'assignments__department__institution',
            'assignments__designation',
            'assignments__designation__department',
            'assignments__designation__department__branch',
        )

        # Status & Placement filtering (default: only active + assigned/placed employees)
        if status == 'pending':
            query = query.filter(status=EmployeeStatus.PENDING_APPROVAL)
        elif status == 'unassigned':
            query = query.filter(status=EmployeeStatus.ACTIVE).exclude(assignments__is_deleted=False)
        elif status == 'all':
            pass
        else:
            query = query.filter(
                status=EmployeeStatus.ACTIVE,
                assignments__is_deleted=False
            )
        
        # Apply search filter
        if search:
            from django.db.models import Q
            query = query.filter(
                Q(full_name__icontains=search) |
                Q(personal_email__icontains=search) |
                Q(org_email__icontains=search) |
                Q(employee_id__icontains=search)
            )
        
        # Apply department filter (via assignments)
        if department:
            query = query.filter(assignments__department__dept_code=department)
        
        # Apply designation filter (via assignments)
        if designation:
            query = query.filter(assignments__designation__position_code=designation)
        
        # Get total count
        total = query.distinct().count()
        
        # Pagination. The personnel registry has an explicit "All" mode, for
        # which per_page=0 returns the full filtered result set.
        if per_page == 0:
            employees = query.order_by('-created_at').distinct()
            total_pages = 1 if total else 0
        else:
            per_page = max(1, min(per_page, 100))
            page = max(1, page)
            start = (page - 1) * per_page
            employees = query.order_by('-created_at').distinct()[start:start + per_page]
            total_pages = (total + per_page - 1) // per_page
        
        employee_list = []
        for emp in employees:
            assignments_list = list(emp.assignments.all())
            primary = next((a for a in assignments_list if a.is_primary), None) or (assignments_list[0] if assignments_list else None)
            
            has_assignment = emp.assignments.filter(is_deleted=False).exists()
            if emp.status == EmployeeStatus.PENDING_APPROVAL:
                display_status = "Pending"
            elif emp.status == EmployeeStatus.ACTIVE and has_assignment:
                display_status = "Active"
            elif emp.status == EmployeeStatus.ACTIVE:
                display_status = "Assigned"
            else:
                display_status = emp.status.replace('_', ' ').title()

            employee_list.append({
                'employee_id': emp.employee_id,
                'full_name': emp.full_name,
                'email': emp.personal_email,
                'personal_email': emp.personal_email,
                'org_email': emp.org_email,
                'phone': emp.personal_phone,
                'cnic': emp.cnic,
                'bio': emp.bio,
                'location': emp.city,
                'department': {
                    'dept_name': primary.department.dept_name if primary else None,
                    'dept_code': primary.department.dept_code if primary else None
                } if primary else None,
                'designation': {
                    'position_name': primary.designation.position_name if primary else None,
                    'position_code': primary.designation.position_code if primary else None
                } if primary else None,
                'primary_assignment': {
                    'department': primary.department.dept_name if primary else None,
                    'designation': primary.designation.position_name if primary else None,
                    'institution': _assignment_institution(primary).name if primary and _assignment_institution(primary) else "Global",
                    'joining_date': primary.joining_date.isoformat() if primary and primary.joining_date else None,
                } if primary else None,
                'employment_type': emp.get_employment_type_display(),
                'is_active': emp.is_active,
                'gender': emp.gender,
                'created_at': emp.created_at.isoformat(),
                'join_date': primary.joining_date.isoformat() if primary and primary.joining_date else None,
                'status': emp.status,
                'assignment_status': display_status,
            })
        
        return {
            'employees': employee_list,
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': total_pages
        }
    
    except Exception as e:
        logger.error(f"Error listing employees: {str(e)}", exc_info=True)
        return {
            'employees': [],
            'total': 0,
            'page': 1,
            'per_page': per_page,
            'total_pages': 0,
            'error': str(e)
        }


@router.get("/employees/by-user/{user_id}", response=dict)
@require_permission("employee.view")
def get_employee_by_user_id(request, user_id: str):
    """
    Lightweight lookup by Employee.id (UUID) — used by HDMS ticket-service
    to resolve requestor_id (which is the auth-service user UUID) to a name.
    """
    try:
        employee = Employee.objects.get(id=user_id, is_deleted=False)
        return {
            'employee_id': employee.employee_id,
            'full_name': employee.full_name,
        }
    except Employee.DoesNotExist:
        return 404, {'error': f'Employee with user ID {user_id} not found'}
    except Exception as e:
        logger.error(f"Error getting employee by user_id {user_id}: {str(e)}", exc_info=True)
        return 400, {'error': str(e)}


# ================== Admin: Registration Approval Endpoints ==================
# NOTE: These MUST be registered BEFORE /employees/{employee_id} to avoid
# Django Ninja matching "pending" as an employee_id.

class RejectRequest(Schema):
    reason: str = ""


@router.get("/employees/pending")
def list_pending_registrations(request):
    """List employees with status=pending_approval. Requires superadmin."""
    if not getattr(request.auth, 'is_superadmin', False):
        raise HttpError(403, 'Only superadmins can view pending registrations')

    pending = Employee.objects.filter(
        status=EmployeeStatus.PENDING_APPROVAL,
        is_deleted=False,
    ).order_by('-created_at')

    return [
        {
            "id": str(emp.id),
            "employee_id": emp.employee_id,
            "full_name": emp.full_name,
            "cnic": emp.cnic,
            "personal_email": emp.personal_email,
            "personal_phone": emp.personal_phone,
            "status": emp.status,
            "created_at": emp.created_at.isoformat() if emp.created_at else None,
        }
        for emp in pending
    ]


@router.post("/employees/{employee_id}/approve")
def approve_employee(request, employee_id: str):
    """Approve a pending registration. Requires superadmin."""
    if not getattr(request.auth, 'is_superadmin', False):
        raise HttpError(403, 'Only superadmins can approve registrations')

    try:
        emp = Employee.objects.get(employee_id=employee_id, is_deleted=False)
    except Employee.DoesNotExist:
        raise HttpError(404, 'Employee not found')

    if emp.status != EmployeeStatus.PENDING_APPROVAL:
        raise HttpError(400, f'Employee is not pending approval (current status: {emp.status})')

    emp.status = EmployeeStatus.ACTIVE
    emp.save(update_fields=['status', 'updated_at'])

    # Provision default credentials if needed, but do NOT send welcome email here.
    # Welcome email is deferred until the employee receives their Placement (Department + Designation).
    provisioning = _provision_default_credentials(emp)
    default_credentials_created = provisioning["created"]

    try:
        from payroll.services import auto_onboard_employee_payroll
        auto_onboard_employee_payroll(emp)
    except Exception as exc:
        logger.error(f"Auto-onboard payroll failed on approval for {emp.employee_id}: {exc}")

    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Employee {emp.employee_id} ({emp.full_name}) approved by {request.auth.full_name}")

    return {
        'message': 'Employee approved successfully',
        'employee_id': emp.employee_id,
        'full_name': emp.full_name,
        'status': emp.status,
        'credentials_created': default_credentials_created,
    }


@router.post("/employees/{employee_id}/reject")
def reject_employee(request, employee_id: str, payload: RejectRequest):
    """Reject a pending registration. Requires superadmin."""
    if not getattr(request.auth, 'is_superadmin', False):
        raise HttpError(403, 'Only superadmins can reject registrations')

    try:
        emp = Employee.objects.get(employee_id=employee_id, is_deleted=False)
    except Employee.DoesNotExist:
        raise HttpError(404, 'Employee not found')

    if emp.status != EmployeeStatus.PENDING_APPROVAL:
        raise HttpError(400, f'Employee is not pending approval (current status: {emp.status})')

    emp.status = EmployeeStatus.REJECTED
    emp.save(update_fields=['status', 'updated_at'])

    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Employee {emp.employee_id} ({emp.full_name}) rejected by {request.auth.full_name}. Reason: {payload.reason}")

    return {
        'message': 'Employee rejected',
        'employee_id': emp.employee_id,
        'full_name': emp.full_name,
        'status': emp.status,
        'reason': payload.reason,
    }


class AssignRoleRequest(Schema):
    department_id: str
    designation_id: str
    branch_code: str = ""
    joining_date: Optional[str] = None
    shift: str = "general"
    is_primary: bool = False
    organization_code: Optional[str] = None
    institution_code: Optional[str] = None


def _provision_default_credentials(employee, force_default_password=False):
    """
    Auto-provision login credentials with DEFAULT_EMPLOYEE_PASSWORD when the
    employee has none yet (fires on their first live assignment). Also attaches
    the default 'Employee Baseline' role — same policy as set_employee_credentials.

    Credentials created here are always kept — there is no rollback path.
    Even if the follow-up welcome email can't be delivered, the employee must
    still be able to log in with the default password.

    Returns:
        {"created": bool, "credentials": UserCredentials | None}
    """
    # Local import avoids a circular dependency (authentication -> employees).
    from authentication.models import UserCredentials

    result = {"created": False, "credentials": None}
    default_password = getattr(settings, "DEFAULT_EMPLOYEE_PASSWORD", "idaraalkhair12@#")

    credentials = UserCredentials.objects.filter(employee=employee, is_deleted=False).first()
    if not credentials:
        credentials = UserCredentials(employee=employee)
        credentials.set_password(default_password, must_change=True)
        credentials.must_change_password = True
        credentials.save()
        result["created"] = True
        result["credentials"] = credentials
    else:
        # If force_default_password is True or user must change password, ensure default password is set
        if force_default_password or credentials.must_change_password or not credentials.password_hash:
            credentials.set_password(default_password, must_change=True)
            credentials.must_change_password = True
            credentials.save()
            result["created"] = True
        else:
            result["created"] = False
        result["credentials"] = credentials

    return result


def _log_credential_provisioning_audit(employee, actor, welcome_email_status, email_sent_to, email_failed_for):
    """
    Durable record of a default-credential auto-provisioning event, so the
    fact that a default password was created (and whether it ever reached
    the employee) survives beyond the HTTP response even if nothing reads
    it (closed tab, crash, etc).

    NEVER pass the plaintext password in here — only the delivery outcome.
    """
    from audit.models import AuditLog
    from django.contrib.contenttypes.models import ContentType

    try:
        AuditLog.objects.create(
            content_type=ContentType.objects.get_for_model(Employee),
            object_id=str(employee.id),
            action='create',
            field_name='default_login_credentials',
            new_value=welcome_email_status,
            changed_by_superadmin=actor if getattr(actor, 'is_superadmin', False) else None,
            notes=(
                f"Default login credentials auto-provisioned for "
                f"{employee.full_name} ({employee.employee_id}) "
                f"on first assignment. Welcome email status: {welcome_email_status}. "
                f"Sent to: {email_sent_to or 'none'}; failed for: {email_failed_for or 'none'}."
            ),
        )
    except Exception as e:
        # Audit logging must never block the request that already committed
        # the actual credential/assignment writes.
        logger.error(
            f"Failed to write credential-provisioning AuditLog for employee "
            f"{employee.employee_id}: {e}"
        )


@router.post(
    "/employees/{employee_id}/assign-role",
    response={200: dict, 400: dict, 404: dict},
)
def assign_role(request, employee_id: str, payload: AssignRoleRequest):
    """Assign department + designation to an employee."""
    if not getattr(request.auth, 'is_superadmin', False):
        raise HttpError(403, 'Only superadmins can assign roles')

    try:
        emp = Employee.objects.get(employee_id=employee_id, is_deleted=False)
    except Employee.DoesNotExist:
        return 404, {"error": "Employee not found"}

    if emp.status not in (EmployeeStatus.ACTIVE, EmployeeStatus.PENDING_APPROVAL):
        return 400, {"error": f"Cannot assign role to employee in '{emp.status}' status"}

    if emp.status == EmployeeStatus.PENDING_APPROVAL:
        emp.status = EmployeeStatus.ACTIVE
        emp.save(update_fields=['status', 'updated_at'])

    try:
        dept = Department.objects.get(id=payload.department_id, is_deleted=False)
    except Department.DoesNotExist:
        return 400, {"error": "Department not found"}

    try:
        desig = Designation.objects.get(id=payload.designation_id, is_deleted=False)
    except Designation.DoesNotExist:
        return 400, {"error": "Designation not found"}

    if not _designation_matches_department(desig, dept):
        return 400, {"error": "Designation does not belong to the selected department"}

    existing = EmployeeAssignment.objects.filter(
        employee=emp, department=dept, designation=desig, is_deleted=False
    ).first()

    # Parse joining_date from payload if provided
    joining_date = timezone.now().date()
    if payload.joining_date:
        try:
            from datetime import datetime
            joining_date = datetime.strptime(payload.joining_date, "%Y-%m-%d").date()
            if joining_date > timezone.now().date():
                return 400, {"error": "Joining date cannot be in the future"}
        except ValueError:
            pass  # fallback to today

    # Determine primary: if payload says true, or if this is the first assignment
    was_first_assignment = not emp.assignments.filter(is_deleted=False).exists()
    is_primary = payload.is_primary
    if not is_primary and (was_first_assignment or not emp.assignments.filter(is_deleted=False, is_primary=True).exists()):
        is_primary = True

    default_credentials_created = False
    with transaction.atomic():
        if existing:
            assignment = existing
            if payload.shift:
                assignment.shift = payload.shift
            if payload.joining_date:
                assignment.joining_date = joining_date
            if is_primary:
                emp.assignments.exclude(id=assignment.id).update(is_primary=False)
                assignment.is_primary = True
            assignment.save()
        else:
            if is_primary:
                emp.assignments.filter(is_primary=True).update(is_primary=False)
            assignment = EmployeeAssignment.objects.create(
                employee=emp,
                department=dept,
                designation=desig,
                joining_date=joining_date,
                shift=payload.shift,
                is_primary=is_primary,
            )

        provisioning = _provision_default_credentials(emp, force_default_password=True)
        default_credentials_created = provisioning["created"]

        try:
            from payroll.services import auto_onboard_employee_payroll
            auto_onboard_employee_payroll(emp)
        except Exception as exc:
            logger.error(f"Auto-onboard payroll failed on assign_role for {emp.employee_id}: {exc}")

    # Welcome email sent when role/placement is assigned
    email_sent_to = []
    email_failed_for = []
    welcome_email_status = "not_applicable"
    from employees.notifications import send_welcome_employee_email

    plain_password = getattr(
        settings, "DEFAULT_EMPLOYEE_PASSWORD", "idaraalkhair12@#"
    )
    _email_results = send_welcome_employee_email(emp, plain_password=plain_password)
    email_sent_to = _email_results.get("sent", [])
    email_failed_for = _email_results.get("failed", [])

    if email_sent_to and email_failed_for:
        welcome_email_status = "partial_failure"
    elif email_sent_to:
        welcome_email_status = "sent"
    elif email_failed_for:
        welcome_email_status = "failed"
    else:
        welcome_email_status = "not_attempted_no_recipient"

    if default_credentials_created and email_failed_for:
        logger.warning(
            f"Welcome email undeliverable for employee {emp.employee_id} — "
            f"default credentials were still created and kept"
        )

    if default_credentials_created:
        _log_credential_provisioning_audit(
            employee=emp,
            actor=request.auth,
            welcome_email_status=welcome_email_status,
            email_sent_to=email_sent_to,
            email_failed_for=email_failed_for,
        )

    return 200, {
        "message": "Role assigned successfully",
        "assignment_id": str(assignment.id),
        "employee_id": emp.employee_id,
        "department": dept.dept_name,
        "designation": desig.position_name,
        "joining_date": joining_date.isoformat(),
        "shift": payload.shift,
        "is_primary": is_primary,
        "welcome_email_sent_to": email_sent_to,
        "welcome_email_failed_for": email_failed_for,
        "welcome_email_status": welcome_email_status,
        "default_credentials_created": default_credentials_created,
    }


class CredentialsCreateSchema(Schema):
    """Payload for setting an employee's login password (post-approval)."""
    password: str


@router.post(
    "/employees/{employee_id}/credentials",
    response={201: dict, 400: dict, 404: dict, 409: dict},
    summary="Set employee login password and attach default role",
)
@require_permission("employee.create")
def set_employee_credentials(request, employee_id: str, payload: CredentialsCreateSchema):
    """
    Create UserCredentials for an approved employee (Assigned queue).
    Also attaches the default 'Employee Baseline' role when it exists.
    Does NOT send any email here — the welcome email fires on first
    assignment instead.
    """
    pwd = payload.password or ""

    # --- 1. Password policy: min 8 + upper + lower + digit + special ---
    # (shared with authentication.api.complete_password_reset — see
    #  authentication/password_policy.py, do not duplicate the regexes)
    from authentication.password_policy import validate_password_policy
    pwd_errors = validate_password_policy(pwd)
    if pwd_errors:
        return 400, {
            "error": "Validation failed",
            "field_errors": {"password": [f"Password must contain {e}" for e in pwd_errors]},
        }

    # --- 2. Employee lookup (by org-wide employee_id, consistent with
    #       approve/reject/assign-role) ---
    emp = Employee.objects.filter(employee_id=employee_id, is_deleted=False).first()
    if not emp:
        return 404, {"error": "Employee not found"}

    # --- 3. Idempotency guard: never silently overwrite credentials ---
    # Local import avoids a circular dependency (authentication -> employees).
    from authentication.models import UserCredentials
    if UserCredentials.objects.filter(employee=emp, is_deleted=False).exists():
        return 409, {
            "error": "Credentials already exist for this employee. "
                     "Use the password reset flow instead."
        }

    # --- 4. Atomic: hashed credentials + default RBAC role ---
    role_assigned = False
    with transaction.atomic():
        credentials = UserCredentials(employee=emp)
        credentials.set_password(pwd, must_change=True)  # admin-issued password is temporary
        credentials.save()

    return 201, {
        "message": "Credentials created successfully",
        "employee_id": emp.employee_id,
        "role_assigned": False,
    }


@router.post(
    "/employees/{employee_id}/reset-credentials",
    response={200: dict, 400: dict, 404: dict},
    summary="Admin-driven password reset (works even if credentials already exist)",
)
@require_permission("employee.create")
def reset_employee_credentials(request, employee_id: str, payload: CredentialsCreateSchema):
    """
    Recovery path for an employee who is stuck with `must_change_password=True`
    but has no email on file — /api/auth/login refuses to issue an OTP for
    them (see login's otp_email_missing case), and set_employee_credentials
    above 409s because credentials already exist. This endpoint is the only
    way an admin can unblock that employee: it overwrites the existing
    password directly (handed to the employee out-of-band by the admin, so
    no OTP/email round-trip is needed) and clears must_change_password.

    Also invalidates any outstanding OTP challenges and revokes existing
    refresh tokens, since a password reset should not leave old sessions or
    half-finished reset attempts valid.
    """
    pwd = payload.password or ""

    from authentication.password_policy import validate_password_policy
    pwd_errors = validate_password_policy(pwd)
    if pwd_errors:
        return 400, {
            "error": "Validation failed",
            "field_errors": {"password": [f"Password must contain {e}" for e in pwd_errors]},
        }

    emp = Employee.objects.filter(employee_id=employee_id, is_deleted=False).first()
    if not emp:
        return 404, {"error": "Employee not found"}

    from authentication.models import UserCredentials, RefreshToken, PasswordResetChallenge

    with transaction.atomic():
        credentials, _created = UserCredentials.objects.get_or_create(employee=emp)
        credentials.set_password(pwd)
        credentials.must_change_password = False
        credentials.save()

        # Any in-flight OTP challenge for the old password is now moot.
        # Two cases: not-yet-verified challenges get expired outright (their
        # challenge_token becomes unusable); already-verified-but-not-yet-
        # completed ones get flagged as reset_used so a still-valid
        # reset_token from before this admin reset can't later overwrite
        # the password the admin just set.
        now = timezone.now()
        PasswordResetChallenge.objects.filter(
            employee=emp, consumed_at__isnull=True
        ).update(expires_at=now)
        PasswordResetChallenge.objects.filter(
            employee=emp, consumed_at__isnull=False, reset_used_at__isnull=True
        ).update(reset_used_at=now)

        RefreshToken.objects.filter(employee=emp, is_revoked=False).update(is_revoked=True)

        try:
            from audit.models import AuditLog
            from django.contrib.contenttypes.models import ContentType
            AuditLog.objects.create(
                content_type=ContentType.objects.get_for_model(Employee),
                object_id=str(emp.id),
                action='update',
                field_name='password_reset_by_admin',
                changed_by_superadmin=request.auth if getattr(request.auth, 'is_superadmin', False) else None,
                notes=(
                    f"Password force-reset by admin for {emp.full_name} "
                    f"({emp.employee_id}) — must_change_password "
                    f"cleared, outstanding OTP challenges expired, refresh tokens revoked."
                ),
            )
        except Exception as e:
            logger.error(f"Failed to write reset-credentials AuditLog for {emp.employee_id}: {e}")

    return 200, {
        "message": "Credentials reset successfully",
        "employee_id": emp.employee_id,
    }


@router.get("/employees/{employee_id}", response=dict)
def get_employee(request, employee_id: str):
    """
    Get single employee details by employee_id.

    Self-service: an employee can always fetch their own record (no RBAC
    needed — it's their own data). Viewing anyone else's record still
    requires employee.view.
    """
    is_self = employee_id == getattr(request.auth, 'employee_id', None)
    if not is_self and not has_permission(request.auth, "employee.view"):
        raise HttpError(403, "Permission denied")
    try:
        employee = Employee.objects.prefetch_related(
            'assignments',
            'assignments__department',
            'assignments__department__branch',
            'assignments__department__branch__institution',
            'assignments__department__institution',
            'assignments__designation',
            'assignments__designation__department',
            'assignments__designation__department__branch',
            'assignments__designation__department__branch__institution',
        ).filter(is_deleted=False).filter(
            employee_id=employee_id
        ).first()
        if not employee:
            raise Employee.DoesNotExist()
        
        assignments = []
        for asn in employee.assignments.filter(is_deleted=False):
            assignments.append({
                'institution': _assignment_institution(asn).name if _assignment_institution(asn) else "Global",
                'institution_code': _assignment_institution(asn).inst_code if _assignment_institution(asn) else None,
                'branch_name': asn.department.branch.branch_name if asn.department.branch_id else "N/A",
                'branch_code': asn.department.branch.branch_code if asn.department.branch_id else None,
                'department': asn.department.dept_name if asn.department else None,
                'department_code': asn.department.dept_code if asn.department else None,
                'department_id': str(asn.department.id) if asn.department else None,
                'designation': asn.designation.position_name if asn.designation else None,
                'designation_code': asn.designation.position_code if asn.designation else None,
                'designation_id': str(asn.designation.id) if asn.designation else None,
                'shift': asn.shift,
                'joining_date': asn.joining_date.isoformat(),
                'is_primary': asn.is_primary,
                'role_data': asn.role_data
            })

        return {
            'employee_id': employee.employee_id,
            'organization_code': employee.organization.org_code if employee.organization else None,
            'full_name': employee.full_name,
            'personal_email': employee.personal_email,
            'personal_phone': employee.personal_phone,
            'email': employee.personal_email, # Alias for frontend consistency
            'phone': employee.personal_phone, # Alias for frontend consistency
            'org_email': employee.org_email,
            'org_phone': employee.org_phone,
            'cnic': employee.cnic,
            'dob': employee.dob.isoformat() if employee.dob else None,
            'gender': employee.gender,
            'gender_display': employee.get_gender_display(),
            'marital_status': employee.marital_status,
            'marital_status_display': employee.get_marital_status_display(),
            'employment_type': employee.employment_type,
            'employment_type_display': employee.get_employment_type_display(),
            'nationality': employee.nationality,
            'religion': employee.religion,
            'current_working_sector': employee.current_working_sector,
            'currentWorkingSector': employee.current_working_sector,
            'emergency_contact': {
                'name': employee.emergency_contact_name,
                'phone': employee.emergency_contact_phone
            },
            'address': {
                'residential': employee.residential_address,
                'permanent': employee.permanent_address,
                'city': employee.city,
            },
            'assignments': assignments,
            'bank_info': {
                'bank_name': employee.bank_name,
                'account_number': employee.account_number,
            },
            'education_history': employee.education_history,
            'work_experience': employee.work_experience,
            'resume': employee.resume_url, # Renamed for frontend convenience
            'resume_url': employee.resume_url,
            'is_active': employee.is_active,
            'created_at': employee.created_at.isoformat(),
        }
    
    except Employee.DoesNotExist:
        return 404, {'error': f'Employee with ID {employee_id} not found'}
    except Exception as e:
        logger.error(f"Error getting employee {employee_id}: {str(e)}", exc_info=True)
        return 400, {'error': str(e)}


@router.delete("/employees/{employee_id}", response=dict)
@require_permission("employee.delete")
def delete_employee(request, employee_id: str):
    """
    Soft delete an employee by setting is_deleted=True.
    
    This preserves the employee record but marks it as deleted.
    """
    try:
        employee = Employee.objects.filter(is_deleted=False).filter(
            employee_id=employee_id
        ).first()
        if not employee:
            raise Employee.DoesNotExist()

        # Soft delete
        employee.is_deleted = True
        employee.save()
        
        logger.info(f"Employee soft deleted: {employee.employee_id} - {employee.full_name}")
        
        return {
            'success': True,
            'message': f'Employee {employee.employee_id} deleted successfully',
            'employee_id': employee.employee_id
        }
    
    except Employee.DoesNotExist:
        return 404, {'error': f'Employee with ID {employee_id} not found'}
    except Exception as e:
        logger.error(f"Error deleting employee {employee_id}: {str(e)}", exc_info=True)
        return 400, {'error': str(e)}


# ========================================
# UPDATE EMPLOYEE (PUT)
# ========================================

class EmployeeUpdateSchema(BaseModel):
    """Partial employee update. All fields optional; only provided fields are applied."""
    # Personal
    fullName: Optional[str] = None
    dob: Optional[str] = None
    cnic: Optional[str] = None
    gender: Optional[str] = None
    maritalStatus: Optional[str] = None
    nationality: Optional[str] = None
    religion: Optional[str] = None

    # Contact
    personalEmail: Optional[str] = None
    mobile: Optional[str] = None
    orgEmail: Optional[str] = None
    orgPhone: Optional[str] = None
    emergencyName: Optional[str] = None
    emergencyPhone: Optional[str] = None
    residentialAddress: Optional[str] = None
    permanentAddress: Optional[str] = None
    city: Optional[str] = None
    currentWorkingSector: Optional[str] = None


    # Primary assignment (flat, same shape as create payload)
    organizationCode: Optional[str] = None
    institutionCode: Optional[str] = None
    departmentId: Optional[str] = None
    designationId: Optional[str] = None
    departmentCode: Optional[str] = None
    designationCode: Optional[str] = None
    joiningDate: Optional[str] = None
    shift: Optional[str] = None

    # Bank
    bankName: Optional[str] = None
    accountNumber: Optional[str] = None

    # History (replace-on-update semantics)
    education: Optional[List[EducationSchema]] = None
    experience: Optional[List[ExperienceSchema]] = None

    # Status & HR fields
    employmentType: Optional[str] = None
    isActive: Optional[bool] = None

    @validator('cnic')
    def validate_cnic(cls, v):
        if v is None:
            return v
        if not re.match(r'^\d{5}-?\d{7}-?\d{1}$', v):
            raise ValueError('Invalid Pakistani CNIC format (XXXXX-XXXXXXX-X)')
        return v.replace('-', '')

    @validator('mobile', 'emergencyPhone', 'orgPhone')
    def validate_phone(cls, v):
        if v and not re.match(r'^(\+92|92|0|0092)?3\d{2}-?\d{7}$', v):
            raise ValueError('Invalid Pakistani Mobile number format')
        return v

    @validator('personalEmail')
    def validate_personal_email(cls, v):
        if v is None:
            return v  # not provided in this partial update — leave unchanged
        if not v.strip():
            raise ValueError('Personal email is required and cannot be blank')
        if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', v):
            raise ValueError('Invalid email format')
        return v.strip().lower()

    @validator('orgEmail')
    def validate_org_email(cls, v):
        if v and not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', v):
            raise ValueError('Invalid email format')
        return v

    @validator('dob')
    def validate_dob(cls, v):
        if not v:
            return v
        try:
            dob_date = datetime.strptime(v, '%Y-%m-%d').date()
        except ValueError:
            raise ValueError('Date of birth must be YYYY-MM-DD format')
        today = date.today()
        age = today.year - dob_date.year - ((today.month, today.day) < (dob_date.month, dob_date.day))
        if age < 13:
            raise ValueError('Employee must be at least 13 years old')
        return v

    @validator('gender')
    def validate_gender(cls, v):
        if not v:
            return None
        allowed = ['male', 'female']
        if v.lower() not in allowed:
            raise ValueError(f"gender must be one of: {', '.join(allowed)}")
        return v.lower()

    @validator('maritalStatus')
    def validate_marital_status(cls, v):
        if not v:
            return None
        allowed = ['single', 'married', 'divorced', 'widowed']
        if v.lower() not in allowed:
            raise ValueError(f"maritalStatus must be one of: {', '.join(allowed)}")
        return v.lower()

    @validator('shift')
    def validate_shift(cls, v):
        if not v:
            return None
        allowed = ['general', 'morning', 'afternoon', 'night', 'hourly', 'both']
        if v.lower() not in allowed:
            raise ValueError(f"shift must be one of: {', '.join(allowed)}")
        return v.lower()

    @validator('employmentType')
    def validate_employment_type(cls, v):
        if not v:
            return None
        allowed = ['full_time', 'part_time', 'contract', 'intern', 'volunteer', 'probation']
        if v.lower() not in allowed:
            raise ValueError(f"employmentType must be one of: {', '.join(allowed)}")
        return v.lower()


#: Fields a self-editing employee (no employee.edit permission) may never set —
#: organizational placement, employment status, and bank details stay HR-controlled.
_SELF_EDIT_BLOCKED_FIELDS = (
    'organizationCode', 'institutionCode', 'departmentId', 'departmentCode',
    'designationId', 'designationCode', 'joiningDate', 'shift',
    'bankName', 'accountNumber', 'isActive', 'employmentType',
    'orgEmail', 'orgPhone',
)


@router.put(
    "/employees/{employee_id}",
    response={200: dict, 400: dict, 404: dict},
    summary="Update Employee",
)
def update_employee(request, employee_id: str, payload: EmployeeUpdateSchema):
    """
    Partial update of an employee. Only fields present in the request body are applied.
    Primary assignment FKs (institutionCode/branchCode/departmentCode/designationCode)
    update the employee's primary EmployeeAssignment row in place.

    Self-service: an employee can always update their own personal-info fields (no
    employee.edit needed). Organizational/status/bank fields (_SELF_EDIT_BLOCKED_FIELDS)
    are silently dropped unless the caller also holds employee.edit; editing anyone
    else's record still requires employee.edit outright.
    """
    is_self = employee_id == getattr(request.auth, 'employee_id', None)
    can_admin_edit = has_permission(request.auth, "employee.edit")
    if not is_self and not can_admin_edit:
        raise HttpError(403, "Permission denied")
    if is_self and not can_admin_edit:
        for field in _SELF_EDIT_BLOCKED_FIELDS:
            setattr(payload, field, None)

    employee = Employee.objects.filter(is_deleted=False).filter(
        employee_id=employee_id
    ).first()
    if not employee:
        return 404, {'error': f'Employee with ID {employee_id} not found'}

    field_errors = {}

    # Resolve optional FKs
    inst = None
    if payload.institutionCode:
        inst = Institution.objects.filter(inst_code=payload.institutionCode, is_deleted=False).first()
        if not inst:
            field_errors['institutionCode'] = ['Institution not found']

    dept = None
    if payload.departmentId:
        dept = Department.objects.filter(id=payload.departmentId, is_deleted=False).first()
    elif payload.departmentCode:
        dept = Department.objects.filter(dept_code=payload.departmentCode, is_deleted=False).first()
    if payload.departmentId or payload.departmentCode:
        if not dept:
            field_errors['departmentCode'] = ['Department not found']

    designation = None
    if payload.designationId or payload.designationCode:
        primary_existing = employee.primary_assignment
        scope_dept = dept or (primary_existing.department if primary_existing else None)
        if not scope_dept:
            field_errors['designationCode'] = ['Cannot validate designation without a department']
        else:
            designation = None
            if payload.designationId:
                designation = Designation.objects.filter(id=payload.designationId, is_deleted=False).first()
            else:
                designation = Designation.objects.filter(
                    _designation_scope_q(scope_dept), position_code=payload.designationCode, is_deleted=False
                ).first()
            if not designation or not _designation_matches_department(designation, scope_dept):
                field_errors['designationCode'] = ['Designation not found for this institution']

    # CNIC uniqueness (excluding self)
    if payload.cnic and Employee.all_objects.filter(cnic=payload.cnic).exclude(pk=employee.pk).exists():
        field_errors['cnic'] = ['An employee with this CNIC already exists']

    # Personal email uniqueness (excluding self)
    if payload.personalEmail and Employee.all_objects.filter(
        personal_email__iexact=payload.personalEmail
    ).exclude(pk=employee.pk).exists():
        field_errors['personalEmail'] = ['An employee with this personal email already exists']

    # Org email uniqueness (excluding self)
    if payload.orgEmail and Employee.all_objects.filter(
        org_email__iexact=payload.orgEmail
    ).exclude(pk=employee.pk).exists():
        field_errors['orgEmail'] = ['An employee with this official email already exists']

    # Org email uniqueness (excluding self)
    if payload.orgEmail and Employee.objects.filter(
        org_email__iexact=payload.orgEmail, is_deleted=False
    ).exclude(pk=employee.pk).exists():
        field_errors['orgEmail'] = ['An employee with this organization email already exists']

    if field_errors:
        return 400, {'error': 'Validation failed', 'field_errors': field_errors}

    old_personal_email = (employee.personal_email or "").strip().lower()
    old_status = employee.status
    old_primary = employee.primary_assignment
    old_dept_id = old_primary.department_id if old_primary else None
    old_desig_id = old_primary.designation_id if old_primary else None
    had_placement_before = bool(old_dept_id and old_desig_id)

    try:
        with transaction.atomic():
            field_map = {
                'fullName': 'full_name',
                'cnic': 'cnic',
                'mobile': 'personal_phone',
                'personalEmail': 'personal_email',
                'orgEmail': 'org_email',
                'orgPhone': 'org_phone',
                'gender': 'gender',
                'maritalStatus': 'marital_status',
                'nationality': 'nationality',
                'religion': 'religion',
                'residentialAddress': 'residential_address',
                'permanentAddress': 'permanent_address',
                'city': 'city',
                'emergencyName': 'emergency_contact_name',
                'emergencyPhone': 'emergency_contact_phone',
                'bankName': 'bank_name',
                'accountNumber': 'account_number',
                'currentWorkingSector': 'current_working_sector',
            }
            data = payload.dict(exclude_unset=True)
            # For nullable unique fields, treat "" as None to avoid unique-constraint collisions.
            # personalEmail is NOT in this set — it's required/non-nullable now, and the
            # schema validator already rejects a blank value before we get here.
            NULLABLE_BLANK_TO_NONE = {"orgEmail", "orgPhone"}
            for payload_key, model_field in field_map.items():
                if payload_key in data:
                    val = data[payload_key]
                    if payload_key in NULLABLE_BLANK_TO_NONE and val == "":
                        val = None
                    setattr(employee, model_field, val)

            if 'dob' in data and data['dob']:
                employee.dob = datetime.strptime(data['dob'], '%Y-%m-%d').date()

            if payload.education is not None:
                employee.education_history = [e.dict() for e in payload.education]
            if payload.experience is not None:
                employee.work_experience = [e.dict() for e in payload.experience]
            if payload.isActive is not None:
                employee.is_active = payload.isActive
            if payload.employmentType is not None:
                employee.employment_type = payload.employmentType

            employee.save()

            # Update primary assignment if any assignment field was provided
            assignment_fields_provided = any([
                payload.institutionCode,
                payload.departmentId, payload.designationId,
                payload.departmentCode, payload.designationCode,
                payload.joiningDate, payload.shift
            ])
            first_placement_created = False
            if assignment_fields_provided:
                primary = employee.primary_assignment
                if primary:
                    if dept is not None:
                        primary.department = dept
                    if designation is not None:
                        primary.designation = designation
                    if payload.joiningDate:
                        primary.joining_date = datetime.strptime(payload.joiningDate, '%Y-%m-%d').date()
                    if payload.shift:
                        primary.shift = payload.shift
                    primary.save()
                elif dept and designation:
                    jd = datetime.strptime(payload.joiningDate, '%Y-%m-%d').date() if payload.joiningDate else date.today()
                    primary = EmployeeAssignment.objects.create(
                        employee=employee,
                        department=dept,
                        designation=designation,
                        joining_date=jd,
                        shift=payload.shift or 'general',
                        is_primary=True,
                    )
                    first_placement_created = True

            # Primary assignment verification after save
            current_primary = employee.assignments.filter(is_primary=True, is_deleted=False).order_by('created_at', 'id').first()
            has_valid_placement = bool(current_primary and current_primary.department_id and current_primary.designation_id)
            new_dept_id = current_primary.department_id if current_primary else None
            new_desig_id = current_primary.designation_id if current_primary else None

            placement_changed = has_valid_placement and (old_dept_id != new_dept_id or old_desig_id != new_desig_id)
            if not had_placement_before and has_valid_placement:
                first_placement_created = True

            # If employee was pending approval and now has a placement, activate them
            if employee.status == EmployeeStatus.PENDING_APPROVAL and has_valid_placement:
                employee.status = EmployeeStatus.ACTIVE
                employee.save(update_fields=['status', 'updated_at'])

            new_personal_email = (employee.personal_email or "").strip().lower()
            email_changed = bool(new_personal_email and new_personal_email != old_personal_email)

            if first_placement_created:
                try:
                    from payroll.services import auto_onboard_employee_payroll
                    auto_onboard_employee_payroll(employee)
                except Exception as exc:
                    logger.error(f"Auto-onboard payroll failed on first placement for {employee.employee_id}: {exc}")

            # Send welcome email if:
            # - has_valid_placement is True (STRICT: Never send if placement is incomplete)
            # AND any of:
            # 1. First placement created, OR
            # 2. Placement changed (department or designation updated), OR
            # 3. Email was changed and employee has a valid placement (user corrected wrong email!), OR
            # 4. Employee was pending approval and just got activated with placement
            should_send_welcome = has_valid_placement and (
                first_placement_created or
                placement_changed or
                email_changed or
                (old_status == EmployeeStatus.PENDING_APPROVAL and employee.status == EmployeeStatus.ACTIVE)
            )

            welcome_email_status = "not_attempted"
            if should_send_welcome:
                # Force default credentials so credentials in DB are guaranteed to match DEFAULT_EMPLOYEE_PASSWORD
                # and must_change_password is set to True.
                provisioning = _provision_default_credentials(employee, force_default_password=True)
                default_credentials_created = provisioning["created"]
                try:
                    from employees.notifications import send_welcome_employee_email
                    plain_password = getattr(settings, "DEFAULT_EMPLOYEE_PASSWORD", "idaraalkhair12@#")
                    email_res = send_welcome_employee_email(employee, plain_password=plain_password)
                    if email_res.get("sent"):
                        welcome_email_status = "sent"
                        logger.info(f"Welcome email successfully sent to {employee.employee_id} ({new_personal_email})")
                    else:
                        welcome_email_status = "failed"
                        logger.warning(f"Welcome email failed for {employee.employee_id} ({new_personal_email}): {email_res.get('failed')}")
                except Exception as exc:
                    welcome_email_status = "error"
                    logger.error(f"Failed sending welcome email on update for {employee.employee_id}: {exc}")
            else:
                # Normal update without placement change / email change — provision default credentials if missing, but do not overwrite
                _provision_default_credentials(employee, force_default_password=False)

        logger.info(f"Employee updated: {employee.employee_id} - {employee.full_name}")
        return 200, {
            'success': True,
            'message': 'Employee updated successfully',
            'employee_id': employee.employee_id,
            'welcome_email_status': welcome_email_status,
        }
    except Exception as e:
        logger.error(f"Error updating employee {employee_id}: {str(e)}", exc_info=True)
        return 400, {'error': str(e)}


@router.post(
    "/employees/{employee_id}/resend-welcome-email",
    response={200: dict, 400: dict, 404: dict},
    summary="Resend Welcome Email",
)
@require_permission("employee.edit")
def resend_welcome_email(request, employee_id: str):
    """
    Manually resend the welcome email with login credentials to the employee's personal email.
    """
    employee = Employee.objects.filter(is_deleted=False).filter(employee_id=employee_id).first()
    if not employee:
        return 404, {'error': f'Employee with ID {employee_id} not found'}

    if not employee.personal_email and not employee.org_email:
        return 400, {'error': 'Employee has no email address configured'}

    # Ensure credentials exist and password is confirmed
    _provision_default_credentials(employee, force_default_password=True)

    try:
        from employees.notifications import send_welcome_employee_email
        default_pwd = getattr(settings, "DEFAULT_EMPLOYEE_PASSWORD", "idaraalkhair12@#")
        res = send_welcome_employee_email(employee, plain_password=default_pwd)
        if res.get("sent"):
            return 200, {
                "success": True,
                "message": f"Welcome email sent successfully to {', '.join(res['sent'])}",
                "sent_to": res["sent"],
            }
        elif res.get("skipped") == "no_placement":
            return 400, {
                "error": f"Cannot send welcome email: Employee {employee.employee_id} has not been assigned a placement (Department & Designation) yet.",
            }
        else:
            return 400, {
                "error": f"Failed to send welcome email to {employee.personal_email or employee.org_email}. Please check mail settings.",
                "failed": res.get("failed", []),
            }
    except Exception as exc:
        logger.error(f"Error resending welcome email to {employee.employee_id}: {exc}", exc_info=True)
        return 400, {"error": str(exc)}


class EmployeeOffboardSchema(BaseModel):
    status: str  # 'resigned' or 'terminated'
    exit_date: str  # YYYY-MM-DD
    exit_reason: Optional[str] = None


@router.post(
    "/employees/{employee_id}/offboard",
    response={200: dict, 400: dict, 404: dict},
    summary="Offboard Employee (resign/terminate)",
)
@require_permission("employee.edit")
def offboard_employee(request, employee_id: str, payload: EmployeeOffboardSchema):
    """
    Marks an employee as resigned/terminated with an exit date, so turnover
    reporting (dashboard) has real data to compute from. Does not delete the
    employee record.
    """
    if payload.status not in (EmployeeStatus.RESIGNED, EmployeeStatus.TERMINATED):
        return 400, {'error': "status must be 'resigned' or 'terminated'"}

    employee = Employee.objects.filter(is_deleted=False).filter(
        employee_id=employee_id
    ).first()
    if not employee:
        return 404, {'error': f'Employee with ID {employee_id} not found'}

    try:
        exit_date = datetime.strptime(payload.exit_date, '%Y-%m-%d').date()
    except ValueError:
        return 400, {'error': 'exit_date must be YYYY-MM-DD'}

    employee.status = payload.status
    employee.exit_date = exit_date
    employee.exit_reason = payload.exit_reason
    employee.is_active = False
    employee.save(update_fields=['status', 'exit_date', 'exit_reason', 'is_active'])

    logger.info(f"Employee offboarded: {employee.employee_id} - {employee.full_name} ({payload.status})")
    return 200, {
        'success': True,
        'message': 'Employee offboarded successfully',
        'employee_id': employee.employee_id,
        'status': employee.status,
        'exit_date': employee.exit_date.isoformat(),
    }


# ========================================
# EMPLOYEE ASSIGNMENTS (dedicated endpoints)
# ========================================

class EmployeeAssignmentCreateSchema(BaseModel):
    branch_code: Optional[str] = None
    department_id: Optional[str] = None
    designation_id: Optional[str] = None
    department_code: Optional[str] = None
    designation_code: Optional[str] = None
    joining_date: Optional[str] = None
    shift: str = 'general'
    is_primary: bool = False

    @validator('shift')
    def validate_shift(cls, v):
        allowed = ['general', 'morning', 'afternoon', 'night', 'hourly', 'both']
        if v and v.lower() not in allowed:
            raise ValueError(f"shift must be one of: {', '.join(allowed)}")
        return v.lower() if v else v


class EmployeeAssignmentUpdateSchema(BaseModel):
    department_id: Optional[str] = None
    designation_id: Optional[str] = None
    department_code: Optional[str] = None
    designation_code: Optional[str] = None
    joining_date: Optional[str] = None
    shift: Optional[str] = None
    is_primary: Optional[bool] = None
    is_active: Optional[bool] = None

    @validator('shift')
    def validate_shift(cls, v):
        if v is None:
            return v
        allowed = ['general', 'morning', 'afternoon', 'night', 'hourly', 'both']
        if v.lower() not in allowed:
            raise ValueError(f"shift must be one of: {', '.join(allowed)}")
        return v.lower()


def _assignment_response(asn) -> dict:
    inst = _assignment_institution(asn)
    return {
        'id': str(asn.id),
        'institution': inst.name if inst else None,
        'institution_code': inst.inst_code if inst else None,
        'branch_name': asn.department.branch.branch_name if asn.department.branch_id else None,
        'branch_code': asn.department.branch.branch_code if asn.department.branch_id else None,
        'department': asn.department.dept_name,
        'department_code': asn.department.dept_code,
        'department_id': str(asn.department.id),
        'designation': asn.designation.position_name,
        'designation_code': asn.designation.position_code,
        'designation_id': str(asn.designation.id),
        'shift': asn.shift,
        'joining_date': asn.joining_date.isoformat() if asn.joining_date else None,
        'is_primary': asn.is_primary,
        'is_active': asn.is_active,
    }


@router.post(
    "/employees/{employee_key}/assignments",
    response={201: dict, 400: dict, 404: dict},
)
@require_permission("assignment.create")
def create_assignment(request, employee_key: str, payload: EmployeeAssignmentCreateSchema):
    """Add a new assignment to an employee."""
    emp = Employee.objects.filter(
        employee_id=employee_key,
        is_deleted=False
    ).first()
    if not emp:
        return 404, {'error': 'Employee not found'}

    dept = None
    if payload.department_id:
        dept = Department.objects.filter(id=payload.department_id, is_deleted=False).first()
    elif payload.department_code:
        dept = Department.objects.filter(dept_code=payload.department_code, is_deleted=False).first()
    if not dept:
        return 400, {'error': 'Department not found'}

    branch_err = _branch_mismatch(payload, dept)
    if branch_err:
        return 400, {'error': branch_err}

    desig = None
    if payload.designation_id:
        desig = Designation.objects.filter(id=payload.designation_id, is_deleted=False).first()
    else:
        desig = Designation.objects.filter(_designation_scope_q(dept), position_code=payload.designation_code, is_deleted=False).first()
    if not desig or not _designation_matches_department(desig, dept):
        return 400, {'error': f"Designation '{payload.designation_id or payload.designation_code}' not found in this institution"}

    joining_date = None
    if payload.joining_date:
        try:
            joining_date = datetime.strptime(payload.joining_date, '%Y-%m-%d').date()
            if joining_date > date.today():
                return 400, {'error': 'Joining date cannot be in the future'}
        except ValueError:
            return 400, {'error': 'joining_date must be YYYY-MM-DD'}

    if joining_date is None:
        joining_date = date.today()

    # Must be read BEFORE creating the new assignment below.
    was_first_assignment = not emp.assignments.filter(is_deleted=False).exists()

    default_credentials_created = False
    with transaction.atomic():
        asn = EmployeeAssignment.objects.create(
            employee=emp,
            department=dept,
            designation=desig,
            joining_date=joining_date,
            shift=payload.shift,
            is_primary=payload.is_primary,
            is_active=True,
        )
        if was_first_assignment or payload.is_primary:
            provisioning = _provision_default_credentials(emp, force_default_password=True)
            default_credentials_created = provisioning["created"]

    # Welcome email is sent AFTER the transaction commits — never inside it —
    # so we never notify about a write that could still roll back.
    if was_first_assignment or payload.is_primary:
        from employees.notifications import send_welcome_employee_email

        plain_password = getattr(settings, "DEFAULT_EMPLOYEE_PASSWORD", "idaraalkhair12@#")
        _email_results = send_welcome_employee_email(emp, plain_password=plain_password)
        email_sent_to = _email_results.get("sent", [])
        email_failed_for = _email_results.get("failed", [])
        if default_credentials_created:
            welcome_email_status = (
                "partial_failure" if email_sent_to and email_failed_for
                else "sent" if email_sent_to
                else "failed" if email_failed_for
                else "not_attempted_no_recipient"
            )
            _log_credential_provisioning_audit(
                employee=emp,
                actor=request.auth,
                welcome_email_status=welcome_email_status,
                email_sent_to=email_sent_to,
                email_failed_for=email_failed_for,
            )

    return 201, _assignment_response(asn)


@router.put(
    "/employees/{employee_key}/assignments/{assignment_id}",
    response={200: dict, 400: dict, 404: dict},
)
@require_permission("assignment.edit")
def update_assignment(request, employee_key: str, assignment_id: str, payload: EmployeeAssignmentUpdateSchema):
    """Update a specific assignment."""
    emp = Employee.objects.filter(
        employee_id=employee_key,
        is_deleted=False
    ).first()
    if not emp:
        return 404, {'error': 'Employee not found'}

    try:
        asn = emp.assignments.get(id=assignment_id, is_deleted=False)
    except EmployeeAssignment.DoesNotExist:
        return 404, {'error': 'Assignment not found'}

    if payload.department_id or payload.department_code:
        dept = None
        if payload.department_id:
            dept = Department.objects.filter(id=payload.department_id, is_deleted=False).first()
        else:
            dept = Department.objects.filter(dept_code=payload.department_code, is_deleted=False).first()
        if not dept:
            return 400, {'error': 'Department not found'}
        asn.department = dept

    if payload.designation_id or payload.designation_code:
        scope_dept = asn.department
        desig = None
        if payload.designation_id:
            desig = Designation.objects.filter(id=payload.designation_id, is_deleted=False).first()
        else:
            desig = Designation.objects.filter(_designation_scope_q(scope_dept), position_code=payload.designation_code, is_deleted=False).first()
        if not desig or not _designation_matches_department(desig, scope_dept):
            return 400, {'error': 'Designation not found in this institution'}
        asn.designation = desig

    if payload.joining_date is not None:
        try:
            jd = datetime.strptime(payload.joining_date, '%Y-%m-%d').date()
            if jd > date.today():
                return 400, {'error': 'Joining date cannot be in the future'}
            asn.joining_date = jd
        except ValueError:
            return 400, {'error': 'joining_date must be YYYY-MM-DD'}

    if payload.shift is not None:
        asn.shift = payload.shift
    if payload.is_primary is not None:
        asn.is_primary = payload.is_primary
    if payload.is_active is not None:
        asn.is_active = payload.is_active

    asn.save()
    return 200, _assignment_response(asn)


@router.delete(
    "/employees/{employee_key}/assignments/{assignment_id}",
    response={200: dict, 400: dict, 404: dict},
)
@require_permission("assignment.delete")
def delete_assignment(request, employee_key: str, assignment_id: str):
    """Soft-delete an assignment. Cannot delete the last remaining assignment."""
    emp = Employee.objects.filter(
        employee_id=employee_key,
        is_deleted=False
    ).first()
    if not emp:
        return 404, {'error': 'Employee not found'}

    try:
        asn = emp.assignments.get(id=assignment_id, is_deleted=False)
    except EmployeeAssignment.DoesNotExist:
        return 404, {'error': 'Assignment not found'}

    if emp.assignments.filter(is_deleted=False).count() <= 1:
        return 400, {'error': 'Cannot delete the only assignment. Employee must have at least one assignment.'}

    asn.soft_delete()
    return 200, {'message': 'Assignment deleted successfully'}
