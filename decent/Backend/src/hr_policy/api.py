"""
HR Policy library API.

Every authenticated employee/superadmin can list and view (as a converted,
view-only PDF) any active policy — this is a company-wide library, not
per-employee content, so listing/viewing is intentionally NOT gated behind
a permission codename. Only upload/replace/delete requires
"hr_policy.manage".
"""
import os
from typing import List, Optional

from django.http import FileResponse
from django.core.files.base import ContentFile
from django.shortcuts import get_object_or_404
from ninja import Router, Schema, Form, File
from ninja.errors import HttpError
from ninja.files import UploadedFile

from authentication.api import AuthBearer
from permissions.rbac import require_permission
from hr_policy.models import HRPolicy
from hr_policy.services import convert_to_pdf, ConversionError

router = Router(tags=["hr_policy"], auth=AuthBearer())

ALLOWED_EXTENSIONS = {".pptx": "pptx", ".docx": "docx"}
MAX_UPLOAD_SIZE = 25 * 1024 * 1024  # 25 MB


class HRPolicyOut(Schema):
    id: str
    title: str
    description: str
    file_type: str
    original_filename: str
    updated_at: str
    uploaded_by_name: Optional[str] = None


def _serialize(policy: HRPolicy) -> dict:
    uploader = None
    if policy.uploaded_by_id:
        uploader = policy.uploaded_by.full_name
    elif policy.uploaded_by_superadmin_id:
        uploader = getattr(policy.uploaded_by_superadmin, "full_name", None) or "Administrator"
    return {
        "id": str(policy.id),
        "title": policy.title,
        "description": policy.description,
        "file_type": policy.file_type,
        "original_filename": policy.original_filename,
        "updated_at": policy.updated_at.isoformat(),
        "uploaded_by_name": uploader,
    }


def _validate_and_convert(file: UploadedFile):
    ext = os.path.splitext(file.name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HttpError(400, "Only .pptx and .docx files are supported")
    if file.size > MAX_UPLOAD_SIZE:
        raise HttpError(400, "File must be 25 MB or smaller")

    tmp_path = f"/tmp/hr_policy_upload_{os.urandom(8).hex()}{ext}"
    with open(tmp_path, "wb") as fh:
        for chunk in file.chunks():
            fh.write(chunk)
    try:
        pdf_bytes = convert_to_pdf(tmp_path, file.name)
    except ConversionError as exc:
        raise HttpError(400, str(exc))
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass

    return ALLOWED_EXTENSIONS[ext], pdf_bytes


@router.get("/policies", response=List[HRPolicyOut])
def list_policies(request):
    """Every authenticated user sees the same company-wide policy library."""
    policies = HRPolicy.objects.select_related("uploaded_by", "uploaded_by_superadmin")
    return [_serialize(p) for p in policies]


@router.get("/policies/{policy_id}/view")
def view_policy_pdf(request, policy_id: str):
    """Stream the converted PDF inline. Never the original file, never a download."""
    policy = get_object_or_404(HRPolicy, id=policy_id, is_deleted=False)
    return FileResponse(
        policy.converted_pdf.open("rb"),
        content_type="application/pdf",
    )


@router.post("/policies", response=HRPolicyOut)
@require_permission("hr_policy.manage")
def create_policy(
    request,
    title: str = Form(...),
    description: str = Form(""),
    file: UploadedFile = File(...),
):
    file_type, pdf_bytes = _validate_and_convert(file)

    policy = HRPolicy(
        title=title,
        description=description,
        file_type=file_type,
        original_filename=file.name,
    )
    is_superadmin = getattr(request.auth, "is_superadmin", False)
    if is_superadmin:
        policy.uploaded_by_superadmin = request.auth
    else:
        policy.uploaded_by = request.auth

    policy.original_file.save(file.name, file, save=False)
    policy.converted_pdf.save(
        os.path.splitext(file.name)[0] + ".pdf",
        ContentFile(pdf_bytes),
        save=False,
    )
    policy.save()
    return _serialize(policy)


@router.put("/policies/{policy_id}", response=HRPolicyOut)
@require_permission("hr_policy.manage")
def update_policy(
    request,
    policy_id: str,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    file: Optional[UploadedFile] = File(None),
):
    policy = get_object_or_404(HRPolicy, id=policy_id, is_deleted=False)

    if title is not None:
        policy.title = title
    if description is not None:
        policy.description = description

    if file is not None:
        file_type, pdf_bytes = _validate_and_convert(file)
        policy.file_type = file_type
        policy.original_filename = file.name
        policy.original_file.save(file.name, file, save=False)
        policy.converted_pdf.save(
            os.path.splitext(file.name)[0] + ".pdf",
            ContentFile(pdf_bytes),
            save=False,
        )

    policy.save()
    return _serialize(policy)


@router.delete("/policies/{policy_id}", response=dict)
@require_permission("hr_policy.manage")
def delete_policy(request, policy_id: str):
    policy = get_object_or_404(HRPolicy, id=policy_id, is_deleted=False)
    deleted_by = getattr(request.auth, "id", None)
    policy.soft_delete(deleted_by=deleted_by)
    return {"success": True, "message": f"'{policy.title}' deleted successfully"}
