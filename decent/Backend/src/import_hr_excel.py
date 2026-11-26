"""One-shot, dry-run-by-default importer for HR Foramate.xlsx."""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from unittest.mock import patch

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(PROJECT_ROOT / ".env")

# The root .env uses Docker's service hostname. When this script is launched
# directly from the host, PostgreSQL is exposed as localhost instead.
if not Path("/.dockerenv").exists():
    for variable in ("AUTH_DATABASE_URL", "DATABASE_URL"):
        value = os.environ.get(variable)
        if value:
            os.environ[variable] = value.replace("@erp_postgres:", "@localhost:")

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
import django  # noqa: E402

django.setup()

import openpyxl  # noqa: E402
from django.core.exceptions import ValidationError  # noqa: E402
from django.conf import settings  # noqa: E402
from django.db import IntegrityError, transaction  # noqa: E402
from django.test import override_settings  # noqa: E402
from authentication.models import UserCredentials  # noqa: E402
from permissions.models import EmployeeRole, Role  # noqa: E402
from employees.models import (  # noqa: E402
    Branch,
    Department,
    Designation,
    Employee,
    EmployeeAssignment,
    Institution,
    Organization,
)

logger = logging.getLogger(__name__)

SHEET_NAME = "Employee Bio Data"
ORG_CODE = "IAK"
ORG_NAME = "Idara Alkhair"
CAMPUS_SKIP = {"STEAM", "CLG", "ENG", "FRP", "TC-1", "RB", "RG", "PSD", "HO"}
DOB_PLACEHOLDER = date(1990, 1, 1)
JOINING_DATE_PLACEHOLDER = date(2026, 7, 1)
HEADERS = [
    "Employee ID", "Employee Code", "Employee Name", "Father Name", "CNIC",
    "Date of Birth", "Gender", "Marital Status", "Salary ", "Mobile Number",
    "Emergency Contact", "Email", "Present Address", "Permanent Address",
    "Department", "Designation", "Grade", "Campus", "Date of Joining",
    "Confirmation Date", "Employment Type", "Shift", "Bank Name",
    "Account Number / IBAN", "EOBI Number", "Social Security Number", "NTN",
    "Salary Mode", "Blood Group", "Active/Inactive",
]


class ImportConfigurationError(RuntimeError):
    """Existing hierarchy differs from the approved import configuration."""


class AlreadyImportedError(RuntimeError):
    """The same workbook was already committed to this database."""


class _DryRunAbort(Exception):
    pass


@dataclass(frozen=True)
class CampusInfo:
    institution_code: str
    institution_name: str
    institution_type: str
    branch_code: str
    branch_name: str
    shift_hint: str | None = None


_LITERAL_CAMPUS_MAP = {
    "AIT": CampusInfo("AIT", "Alkhair Institute of Technology", "technical", "AIT01", "Alkhair Institute of Technology (01)"),
    "ANCH": CampusInfo("ANCH", "Alkhair North City Hospital", "healthcare", "ANCH01", "Alkhair North City Hospital 01"),
    "CFK": CampusInfo("CFK", "Central Food Kitchen", "social_welfare", "CFK01", "Central Food Kitchen 01"),
    "M/C": CampusInfo("ANCH", "Alkhair North City Hospital", "healthcare", "MC01", "Medical Center"),
}
_NUMERIC_CAMPUS_RE = re.compile(r"^([1-8])([AM])?$")


def normalize_campus_code(raw):
    if raw is None:
        return None
    if isinstance(raw, float) and raw.is_integer():
        raw = int(raw)
    text = str(raw).strip()
    return text.upper() if text else None


def parse_campus(raw):
    code = normalize_campus_code(raw)
    if not code or code in CAMPUS_SKIP:
        return None
    if code in _LITERAL_CAMPUS_MAP:
        return _LITERAL_CAMPUS_MAP[code]
    match = _NUMERIC_CAMPUS_RE.fullmatch(code)
    if not match:
        return None
    number, suffix = int(match.group(1)), match.group(2)
    return CampusInfo(
        "AKS", "Alkhair School System", "educational",
        f"C{number:02d}", f"Campus {number:02d}",
        {"A": "afternoon", "M": "morning"}.get(suffix),
    )


ALL_CAMPUS_INFOS = list(_LITERAL_CAMPUS_MAP.values()) + [parse_campus(str(n)) for n in range(1, 9)]


@dataclass
class ImportReport:
    source_rows: int = 0
    eligible_rows: int = 0
    skipped_campus: list[dict] = field(default_factory=list)
    skipped_duplicate_code: list[dict] = field(default_factory=list)
    skipped_duplicate_cnic: list[dict] = field(default_factory=list)
    created: list[str] = field(default_factory=list)
    credentials_created: int = 0
    errors: list[tuple[dict, str]] = field(default_factory=list)
    placeholder_dob: list[str] = field(default_factory=list)
    placeholder_joining_date: list[str] = field(default_factory=list)
    shift_conflicts: list[str] = field(default_factory=list)
    branches: Counter = field(default_factory=Counter)
    departments: Counter = field(default_factory=Counter)
    designations: Counter = field(default_factory=Counter)

    def summary(self):
        return (
            f"source={self.source_rows} eligible={self.eligible_rows} created={len(self.created)} "
            f"skipped_campus={len(self.skipped_campus)} "
            f"skipped_duplicate_code={len(self.skipped_duplicate_code)} errors={len(self.errors)}"
            f" duplicate_cnic={len(self.skipped_duplicate_cnic)} credentials={self.credentials_created}"
        )


@dataclass
class BaseHierarchy:
    organization: Organization
    institutions: dict[str, Institution]
    branches: dict[str, Branch]


def _text(value):
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _date(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        text = value.strip()
        # This workbook uses US-style month/day/year strings. Do not also accept
        # day/month/year here: ambiguous values such as 01/02/2000 would silently
        # acquire the wrong meaning.
        for date_format in ("%m/%d/%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(text, date_format).date()
            except ValueError:
                continue
    raise ValueError(f"invalid date value: {value!r}")


def read_excel_rows(path):
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        if SHEET_NAME not in workbook.sheetnames:
            raise ValueError(f"sheet {SHEET_NAME!r} not found")
        sheet = workbook[SHEET_NAME]
        header = [cell.value for cell in next(sheet.iter_rows(min_row=1, max_row=1))]
        missing = [name for name in HEADERS if name not in header]
        if missing:
            raise ValueError(f"missing required Excel columns: {', '.join(missing)}")
        return [dict(zip(header, values)) for values in sheet.iter_rows(min_row=2, values_only=True) if any(v is not None for v in values)]
    finally:
        workbook.close()


def filter_and_dedupe_rows(rows, report):
    report.source_rows = len(rows)
    seen = set()
    seen_cnics = set()
    kept = []
    for row in rows:
        if parse_campus(row.get("Campus")) is None:
            report.skipped_campus.append(row)
            continue
        code = _text(row.get("Employee Code"))
        code_key = code.upper() if code else None
        if code_key and code_key in seen:
            report.skipped_duplicate_code.append(row)
            continue
        if code_key:
            seen.add(code_key)
        cnic = _text(row.get("CNIC"))
        cnic_key = cnic.upper() if cnic else None
        if cnic_key and cnic_key in seen_cnics:
            report.skipped_duplicate_cnic.append(row)
            continue
        if cnic_key:
            seen_cnics.add(cnic_key)
        kept.append(row)
    report.eligible_rows = len(kept)
    return kept


def map_gender(raw):
    value = (_text(raw) or "female").lower()
    if value not in {"male", "female", "other"}:
        raise ValueError(f"unsupported gender: {raw!r}")
    return value


def map_marital_status(raw):
    value = _text(raw)
    if not value:
        return None
    value = value.lower()
    if value not in {"single", "married", "divorced", "widowed"}:
        raise ValueError(f"unsupported marital status: {raw!r}")
    return value


def map_employment_type(raw):
    value = (_text(raw) or "permanent").lower()
    mapping = {"permanent": "full_time", "probation": "probation", "contract": "contract"}
    if value not in mapping:
        raise ValueError(f"unsupported employment type: {raw!r}")
    return mapping[value]


def resolve_shift(row, campus_shift_hint):
    if campus_shift_hint:
        return campus_shift_hint
    value = (_text(row.get("Shift")) or "general").lower()
    aliases = {"general/office": "general", "m+a": "both", "both (m+a)": "both"}
    value = aliases.get(value, value)
    if value not in {choice for choice, _ in EmployeeAssignment.SHIFT_CHOICES}:
        raise ValueError(f"unsupported shift: {row.get('Shift')!r}")
    return value


def build_employee_kwargs(row):
    name = _text(row.get("Employee Name"))
    if not name:
        raise ValueError("Employee Name is required")
    active_value = (_text(row.get("Active/Inactive")) or "active").lower()
    if active_value not in {"active", "inactive"}:
        raise ValueError(f"unsupported Active/Inactive value: {row.get('Active/Inactive')!r}")
    is_active = active_value == "active"
    return {
        "full_name": name, "cnic": _text(row.get("CNIC")),
        "dob": _date(row.get("Date of Birth")) or DOB_PLACEHOLDER,
        "gender": map_gender(row.get("Gender")),
        "marital_status": map_marital_status(row.get("Marital Status")),
        "personal_phone": _text(row.get("Mobile Number")),
        "emergency_contact_phone": _text(row.get("Emergency Contact")),
        "personal_email": _text(row.get("Email")),
        "residential_address": _text(row.get("Present Address")),
        "permanent_address": _text(row.get("Permanent Address")),
        "employment_type": map_employment_type(row.get("Employment Type")),
        "bank_name": _text(row.get("Bank Name")),
        "account_number": _text(row.get("Account Number / IBAN")),
        "is_active": is_active, "status": "active" if is_active else "suspended",
    }


def build_assignment_kwargs(row, shift):
    return {"joining_date": _date(row.get("Date of Joining")) or JOINING_DATE_PLACEHOLDER, "shift": shift, "is_primary": True, "is_active": True}


def _assert_fields(obj, label, expected):
    mismatches = [f"{key}={getattr(obj, key)!r} (expected {value!r})" for key, value in expected.items() if getattr(obj, key) != value]
    if mismatches:
        raise ImportConfigurationError(f"Existing {label} mismatch: " + "; ".join(mismatches))


def ensure_base_hierarchy():
    org, created = Organization.all_objects.get_or_create(org_code=ORG_CODE, defaults={"name": ORG_NAME})
    if not created:
        _assert_fields(org, f"organization {ORG_CODE}", {"name": ORG_NAME, "is_deleted": False})
    institutions = {}
    for info in ALL_CAMPUS_INFOS:
        if info.institution_code in institutions:
            continue
        inst, created = Institution.all_objects.get_or_create(inst_code=info.institution_code, defaults={"organization": org, "name": info.institution_name, "inst_type": info.institution_type})
        if not created:
            _assert_fields(inst, f"institution {info.institution_code}", {"organization_id": org.id, "name": info.institution_name, "inst_type": info.institution_type, "is_deleted": False})
        institutions[info.institution_code] = inst
    branches = {}
    for info in ALL_CAMPUS_INFOS:
        if info.branch_code in branches:
            continue
        inst = institutions[info.institution_code]
        branch, created = Branch.all_objects.get_or_create(branch_code=info.branch_code, defaults={"institution": inst, "branch_name": info.branch_name})
        if not created:
            _assert_fields(branch, f"branch {info.branch_code}", {"institution_id": inst.id, "branch_name": info.branch_name, "is_deleted": False})
        branches[info.branch_code] = branch
    return BaseHierarchy(org, institutions, branches)


_DEPT_CODES = {"academic": "ACAD", "admin": "ADM", "finance": "FIN", "hr": "HR", "it": "IT", "operations": "OPS", "sales": "SALES"}


def ensure_department(branch, dept_name):
    name = _text(dept_name)
    if not name:
        raise ValueError("Department is required")
    code = _DEPT_CODES.get(name.lower(), re.sub(r"[^A-Z0-9]", "", name.upper())[:10])
    if not code:
        raise ValueError(f"cannot derive department code from {name!r}")
    by_name = Department.all_objects.filter(branch=branch, dept_name__iexact=name).first()
    if by_name:
        _assert_fields(by_name, f"department {name} at {branch.branch_code}", {"dept_code": code, "is_deleted": False})
        return by_name
    by_code = Department.all_objects.filter(branch=branch, dept_code=code).first()
    if by_code:
        raise ImportConfigurationError(f"Department code collision at {branch.branch_code}: {code} is already used by {by_code.dept_name!r}")
    return Department.objects.create(branch=branch, dept_code=code, dept_name=name)


def _position_code(name, existing):
    base = "".join(word[0] for word in re.findall(r"[A-Za-z0-9]+", name)).upper()[:10] or "ROLE"
    if base not in existing:
        return base
    suffix = 2
    while True:
        candidate = f"{base[:10-len(str(suffix))]}{suffix}"
        if candidate not in existing:
            return candidate
        suffix += 1


def ensure_designation(department, position_name):
    name = _text(position_name)
    if not name:
        raise ValueError("Designation is required")
    existing = Designation.all_objects.filter(department=department)
    match = existing.filter(position_name__iexact=name).first()
    if match:
        _assert_fields(match, f"designation {name}", {"is_deleted": False})
        return match
    return Designation.objects.create(department=department, position_name=name, position_code=_position_code(name, set(existing.values_list("position_code", flat=True))))


def import_employee_row(row, hierarchy, report, default_role=None):
    try:
        with transaction.atomic():
            info = parse_campus(row.get("Campus"))
            if info is None:
                raise ValueError(f"unsupported campus: {row.get('Campus')!r}")
            branch = hierarchy.branches[info.branch_code]
            department = ensure_department(branch, row.get("Department"))
            designation = ensure_designation(department, row.get("Designation"))
            employee_kwargs = build_employee_kwargs(row)
            employee_kwargs["organization"] = hierarchy.organization
            shift = resolve_shift(row, info.shift_hint)
            sheet_shift = (_text(row.get("Shift")) or "general").lower()
            if info.shift_hint and sheet_shift != info.shift_hint:
                report.shift_conflicts.append(
                    f"{row.get('Employee ID')}: sheet={sheet_shift}, campus={info.shift_hint}"
                )
            with patch("employees.notifications.send_employee_code_notification"):
                employee = Employee.objects.create(**employee_kwargs)
                EmployeeAssignment.objects.create(employee=employee, department=department, designation=designation, **build_assignment_kwargs(row, shift))
            credentials = UserCredentials(employee=employee)
            credentials.set_password(settings.DEFAULT_EMPLOYEE_PASSWORD)
            credentials.save()
            try:
                if default_role:
                    EmployeeRole.objects.get_or_create(employee=employee, role=default_role)
            except (IntegrityError, ValidationError):
                logger.exception("Default role assignment failed for %s", employee.employee_id)
            report.created.append(employee.employee_id)
            report.credentials_created += 1
            if row.get("Date of Birth") in (None, ""):
                report.placeholder_dob.append(employee.employee_id)
            if row.get("Date of Joining") in (None, ""):
                report.placeholder_joining_date.append(employee.employee_id)
            report.branches[branch.branch_code] += 1
            report.departments[f"{branch.branch_code} / {department.dept_name}"] += 1
            report.designations[f"{branch.branch_code} / {department.dept_name} / {designation.position_name}"] += 1
    except ImportConfigurationError:
        raise
    except (IntegrityError, ValidationError, ValueError, TypeError, KeyError) as exc:
        report.errors.append((row, str(exc)))


def _database_key():
    from django.conf import settings
    db = settings.DATABASES["default"]
    identity = f"{db.get('ENGINE')}|{db.get('HOST')}|{db.get('PORT')}|{db.get('NAME')}"
    return hashlib.sha256(identity.encode()).hexdigest()[:16]


def _fingerprint(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _receipt_path(path):
    receipt_dir = Path(__file__).resolve().parent / ".hr_import_receipts"
    return receipt_dir / f"{_database_key()}-{_fingerprint(path)}.json"


def run_import(xlsx_path, commit=False, force=False):
    path = str(Path(xlsx_path).resolve())
    receipt = _receipt_path(path)
    if commit and receipt.exists() and not force:
        raise AlreadyImportedError("This workbook was already committed to this database. Use --force only for an intentional re-import.")
    report = ImportReport()
    try:
        # Password hashing is deliberately expensive. A dry-run uses Django's
        # fast test hasher because every generated hash is rolled back anyway;
        # committed imports continue to use the configured secure hasher.
        hashers = settings.PASSWORD_HASHERS if commit else [
            "django.contrib.auth.hashers.MD5PasswordHasher"
        ]
        with override_settings(PASSWORD_HASHERS=hashers), transaction.atomic():
            rows = filter_and_dedupe_rows(read_excel_rows(path), report)
            hierarchy = ensure_base_hierarchy()
            default_role = (
                Role.objects.filter(name="Employee Baseline", service="auth", is_deleted=False).first()
                or Role.objects.filter(is_default=True, is_deleted=False).first()
            )
            for row in rows:
                import_employee_row(row, hierarchy, report, default_role=default_role)
            if not commit:
                raise _DryRunAbort
    except _DryRunAbort:
        return report
    if commit:
        receipt.parent.mkdir(exist_ok=True)
        receipt.write_text(json.dumps({"workbook": path, "fingerprint": _fingerprint(path), "summary": report.summary()}, indent=2) + "\n")
    return report


def _log_breakdown(title, values):
    logger.info("%s:", title)
    for key, count in sorted(values.items()):
        logger.info("  %s: %d", key, count)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", default=str(PROJECT_ROOT / "HR Foramate.xlsx"))
    parser.add_argument("--commit", action="store_true")
    parser.add_argument("--force", action="store_true", help="Allow intentional repeat commit")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    try:
        report = run_import(args.path, commit=args.commit, force=args.force)
    except (ImportConfigurationError, AlreadyImportedError, ValueError) as exc:
        parser.exit(1, f"ERROR: {exc}\n")
    logger.info("Import finished [%s]: %s", "COMMIT" if args.commit else "DRY-RUN", report.summary())
    logger.info(
        "Review flags: placeholder_dob=%d placeholder_joining_date=%d shift_conflicts=%d",
        len(report.placeholder_dob), len(report.placeholder_joining_date), len(report.shift_conflicts),
    )
    _log_breakdown("Branch breakdown", report.branches)
    _log_breakdown("Department breakdown", report.departments)
    _log_breakdown("Designation breakdown", report.designations)
    if report.errors:
        logger.info("Row errors:")
        for row, message in report.errors:
            logger.info("  %s [legacy ID=%s, campus=%s]: %s", row.get("Employee Name"), row.get("Employee ID"), row.get("Campus"), message)


if __name__ == "__main__":
    main()
