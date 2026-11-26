"""
Authentication API endpoints using Django Ninja.

Endpoints:
- POST /api/auth/login - Login with employee_code + password
- POST /api/auth/register - Public self-registration for employees
- POST /api/auth/login-hdms - Login with HDMS role validation
- POST /api/auth/logout - Logout (blacklist token)
- POST /api/auth/refresh - Refresh access token
- GET /api/auth/me - Get current user info
"""
import logging
import re
import secrets
from typing import Optional, List, Union
from django.http import HttpRequest
from ninja import Router, Schema
from ninja.security import HttpBearer
from ninja.errors import HttpError
from datetime import datetime, timedelta
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from django.conf import settings
from django.core import signing
from django.core.mail import send_mail
from django.contrib.auth.hashers import check_password
from employees.models import Employee, EmployeeStatus
from employees.notifications import send_password_reset_otp_email
from permissions.models import ServiceAccess, HdmsRole, VmsRole
from .models import UserCredentials, RefreshToken, BlacklistedToken, PasswordResetChallenge, OTP_MAX_ATTEMPTS
from .superadmin_models import SuperAdmin
from .password_policy import validate_password_policy
from .jwt_utils import (
    generate_access_token,
    generate_refresh_token,
    generate_challenge_token,
    decode_scoped_token,
    decode_token,
    verify_access_token,
    verify_refresh_token,
    get_token_expiry
)

router = Router(tags=["Authentication"])
logger = logging.getLogger(__name__)


# Shared error when a default-password employee tries to bypass the OTP
# reset flow via a service-specific login endpoint (hdms/vms/sis) instead
# of completing it through the main /login -> /verify-otp -> /complete-password-reset flow.
PASSWORD_RESET_REQUIRED_ERROR = {
    "error": "password_reset_required",
    "detail": (
        "Your password must be reset before you can use this service. "
        "Please log in via the main portal to complete your password reset."
    ),
}


def _generate_numeric_otp(length: int = 6) -> str:
    """Cryptographically random numeric OTP (uses secrets, not random)."""
    return "".join(secrets.choice("0123456789") for _ in range(length))


def _resolve_employee(identifier: str):
    """
    Resolve a login identifier to an Employee. Tries, in order:
    1. `employee_id` (IAK-0001, always unique) — the primary identifier.
    2. `personal_email` (unique + required at the DB level since migration
       0025 — the >1-match branch is a defensive backstop for any legacy
       rows created before that constraint existed).
    3. `org_email` (not unique — a shared org_email is reported as
       ambiguous, never silently resolved to an arbitrary match).
    4. `employee_code` (the long legacy code, e.g. C01-G-26-COORD-0002) —
       no longer generated for new employees, but kept as a fallback so
       employees who already have one (from an old welcome email) can still
       use it.

    Returns (employee_or_None, ambiguous_bool). `ambiguous=True` means the
    identifier matched more than one employee — the caller should reject
    with a clear "use your Employee ID instead" message rather than
    guessing (silently picking one, e.g. via `.first()`, would risk logging
    someone into the wrong account).
    """
    clean_id = (identifier or "").strip()
    if not clean_id:
        return None, False

    # Check employee_id (try exact, then with hyphens/spaces normalized)
    id_variants = [clean_id, clean_id.replace(" ", "-"), clean_id.replace("-", " ")]
    for var in id_variants:
        emp = Employee.all_objects.filter(
            employee_id__iexact=var, is_deleted=False
        ).first()
        if emp:
            if not emp.is_active and getattr(emp, "status", "active") not in ("terminated", "resigned"):
                emp.is_active = True
                emp.save(update_fields=['is_active'])
            return emp, False

    # Check personal_email
    matches = list(Employee.all_objects.filter(
        personal_email__iexact=clean_id, is_deleted=False
    ))
    if len(matches) == 1:
        emp = matches[0]
        if not emp.is_active and getattr(emp, "status", "active") not in ("terminated", "resigned"):
            emp.is_active = True
            emp.save(update_fields=['is_active'])
        return emp, False
    if len(matches) > 1:
        return None, True

    # Check org_email
    matches = list(Employee.all_objects.filter(
        org_email__iexact=clean_id, is_deleted=False
    ))
    if len(matches) == 1:
        emp = matches[0]
        if not emp.is_active and getattr(emp, "status", "active") not in ("terminated", "resigned"):
            emp.is_active = True
            emp.save(update_fields=['is_active'])
        return emp, False
    if len(matches) > 1:
        return None, True

    return None, False


AMBIGUOUS_IDENTIFIER_ERROR = {
    "error": "Invalid credentials",
    "detail": "Multiple accounts use this email. Please log in with your Employee ID instead.",
}


# ================== Schemas ==================

class LoginRequest(Schema):
    identifier: str  # Employee ID (IAK-0001) or personal email
    password: str


class HdmsLoginRequest(Schema):
    """Login request for HDMS with role validation"""
    identifier: str  # Employee ID (IAK-0001) or personal email
    password: str


class LoginResponse(Schema):
    access_token: str = ""
    refresh_token: str = ""
    expires_in: int = 3600  # seconds
    employee: dict = {}
    must_change_password: Optional[bool] = False
    reset_token: Optional[str] = None


class RefreshRequest(Schema):
    refresh_token: str


class RefreshResponse(Schema):
    access_token: str
    expires_in: int


class LogoutRequest(Schema):
    access_token: str


class MessageResponse(Schema):
    message: str


class EmployeeInfoResponse(Schema):
    employee_id: str
    full_name: str
    email: str
    department: str
    designation: str
    is_superadmin: bool
    is_active: bool


class ErrorResponse(Schema):
    error: str
    detail: str = None


# ================== OTP Password-Reset Schemas ==================

class OtpRequiredResponse(Schema):
    """Returned by /login instead of tokens when the account still has a
    default (must-change) password — the frontend should route to the OTP
    entry screen using `challenge_token`."""
    otp_required: bool
    challenge_token: str


class VerifyOtpRequest(Schema):
    challenge_token: str
    otp: str


class VerifyOtpResponse(Schema):
    reset_token: str


class CompletePasswordResetRequest(Schema):
    reset_token: str
    new_password: str


# ================== Forgot-Password Schemas ==================
# Separate, voluntary "I forgot my password" self-service flow (login page
# link) — distinct from the forced OTP reset above, which only fires when
# must_change_password is set on a default-password account.

class ForgotPasswordRequest(Schema):
    email: str
    # Required to disambiguate when several employees share one personal email.
    employee_id: Optional[str] = None


class ForgotPasswordAccount(Schema):
    employee_id: str
    full_name: str


class ForgotPasswordRequestResponse(Schema):
    message: str
    # Populated only when the email maps to multiple accounts — the user must
    # pick one before an OTP is sent.
    accounts: Optional[List[ForgotPasswordAccount]] = None


class ForgotPasswordVerifyRequest(Schema):
    email: str
    code: str
    employee_id: Optional[str] = None


class ForgotPasswordResetRequest(Schema):
    reset_token: str
    password: str
    confirm_password: str


def _password_error(password, confirmation):
    if password != confirmation:
        return "Password and confirmation do not match"
    if len(password) < 8:
        return "Password must be at least 8 characters"
    if not re.search(r"[A-Z]", password) or not re.search(r"[a-z]", password):
        return "Password must contain uppercase and lowercase letters"
    if not re.search(r"\d", password) or not re.search(r"[^A-Za-z0-9]", password):
        return "Password must contain a number and a special character"
    return None


def _credential_action_token(credentials, purpose, **extra):
    return signing.dumps({
        "credential_id": str(credentials.id),
        "purpose": purpose,
        "password_version": credentials.password_changed_at.isoformat(),
        **extra,
    }, salt="authentication.password-action", compress=True)


def _load_credential_action_token(token, purpose, max_age):
    data = signing.loads(token, salt="authentication.password-action", max_age=max_age)
    if data.get("purpose") != purpose:
        raise signing.BadSignature("Wrong token purpose")
    credentials = UserCredentials.objects.get(id=data["credential_id"], is_deleted=False)
    if data.get("password_version") != credentials.password_changed_at.isoformat():
        raise signing.BadSignature("Password has already changed")
    return credentials, data


# ================== Registration Schemas ==================

class RegisterEducationItem(Schema):
    degree: str = ""
    institute: str = ""
    passing_year: str = ""


class RegisterExperienceItem(Schema):
    employer: str = ""
    job_title: str = ""
    start_date: str = ""
    currently_working: bool = False
    end_date: Optional[str] = ""
    responsibilities: str = ""


class RegisterRequest(Schema):
    full_name: str
    cnic: str = ""
    gender: str
    marital_status: str = ""
    nationality: str = "Pakistani"
    religion: str = "Islam"
    personal_phone: str
    personal_email: str
    dob: str  # Format: YYYY-MM-DD
    emergency_name: Optional[str] = ""
    emergency_phone: Optional[str] = ""
    residential_address: Optional[str] = ""
    permanent_address: Optional[str] = ""
    city: Optional[str] = ""
    bio: Optional[str] = ""
    current_working_sector: Optional[str] = ""
    password: str = ""  # Optional - auto-generated if not provided
    education: List[RegisterEducationItem] = []
    experience: List[RegisterExperienceItem] = []


class RegisterResponse(Schema):
    access_token: str
    refresh_token: str
    expires_in: int
    employee: dict


# ================== Bearer Token Authentication ==================

class AuthBearer(HttpBearer):
    """Bearer token authentication for both employees and superadmins"""
    
    def authenticate(self, request: HttpRequest, token: str):
        # Check if token is blacklisted
        if BlacklistedToken.is_blacklisted(token):
            return None
        
        # Verify token
        verify_result = verify_access_token(token)
        if not verify_result:
            return None
            
        user_id, is_superadmin = verify_result
        
        if is_superadmin:
            try:
                return SuperAdmin.objects.get(id=user_id, is_active=True)
            except SuperAdmin.DoesNotExist:
                return None
        else:
            try:
                return Employee.objects.get(id=user_id, is_active=True, is_deleted=False)
            except Employee.DoesNotExist:
                return None


def _issue_login_tokens(request: HttpRequest, user) -> dict:
    """
    Mint access+refresh tokens for `user` (Employee or SuperAdmin), persist
    the refresh token, and build the LoginResponse-shaped payload.

    Shared by the normal /login success tail and
    /complete-password-reset's tail (once the OTP reset finishes, the
    employee is logged in exactly like a normal successful login) so the
    two stay in sync.
    """
    is_superadmin = getattr(user, 'is_superadmin', False)
    client_ip = request.META.get('REMOTE_ADDR')
    user_agent = request.META.get('HTTP_USER_AGENT', '')

    access_token = generate_access_token(user)
    refresh_token_str = generate_refresh_token(user)

    RefreshToken.objects.create(
        employee=user if not is_superadmin else None,
        superadmin=user if is_superadmin else None,
        token=refresh_token_str,
        expires_at=timezone.now() + timedelta(days=7),
        device_info=user_agent[:255],
        ip_address=client_ip
    )

    user_info = {
        "id": str(user.id),
        "code": getattr(user, 'superadmin_code', None) or getattr(user, 'employee_id', None),
        "full_name": user.full_name,
        "email": user.email,
        "is_superadmin": is_superadmin,
        "status": getattr(user, "status", "active"),
        "must_change_password": getattr(
            UserCredentials.objects.filter(
                employee=user if not is_superadmin else None,
                superadmin=user if is_superadmin else None,
                is_deleted=False
            ).first(),
            "must_change_password",
            False
        ),
    }

    if not is_superadmin:
        from permissions.models import EmployeeRole
        from permissions.rbac import get_effective_permissions

        user_info.update({
            "employee_id": user.employee_id,
            "department": getattr(user.department, 'dept_name', None),
            "designation": getattr(user.designation, 'position_name', None),
        })

        active_roles = EmployeeRole.objects.filter(
            employee=user,
            is_deleted=False,
            role__is_deleted=False
        ).select_related('role')

        user_info["roles"] = [
            {
                "id": str(ar.role.id),
                "name": ar.role.name,
                "description": ar.role.description or ""
            }
            for ar in active_roles
        ]
        user_info["permissions"] = sorted(list(get_effective_permissions(str(user.id))))
    else:
        user_info["roles"] = [
            {
                "id": "superadmin",
                "name": "Super Admin",
                "description": "Full System Access"
            }
        ]
        user_info["permissions"] = ["*"]

    return {
        "access_token": access_token,
        "refresh_token": refresh_token_str,
        "expires_in": 3600,
        "employee": user_info
    }


# ================== Endpoints ==================

@router.post("/login", response={200: Union[LoginResponse, OtpRequiredResponse], 401: ErrorResponse, 403: ErrorResponse, 423: ErrorResponse, 503: ErrorResponse})
def login(request: HttpRequest, payload: LoginRequest):
    """
    Login with Employee ID, personal/org email, or (legacy) employee code —
    or superadmin code/email — and password.
    """
    # Try finding as employee first (employee_id -> personal_email ->
    # org_email -> legacy employee_code, see _resolve_employee)
    user = None
    employee, ambiguous = _resolve_employee(payload.identifier)
    if ambiguous:
        return 401, AMBIGUOUS_IDENTIFIER_ERROR
    if employee:
        user = employee
    else:
        # Try finding as superadmin, by code or email. `email` is unique on
        # SuperAdmin, so this can safely use `.first()`/`.get()` without an
        # ambiguity check.
        user = SuperAdmin.objects.filter(
            Q(superadmin_code__iexact=payload.identifier) | Q(email__iexact=payload.identifier),
            is_active=True
        ).first()
        if not user:
            return 401, {
                "error": "Invalid credentials",
                "detail": "User not found or account inactive"
            }

    # Get user credentials
    is_superadmin = getattr(user, 'is_superadmin', False)
    cred_filter = {'superadmin': user} if is_superadmin else {'employee': user}

    try:
        credentials = UserCredentials.objects.get(**cred_filter, is_deleted=False)
    except UserCredentials.DoesNotExist:
        if not is_superadmin and user:
            from employees.api import _provision_default_credentials
            provisioning = _provision_default_credentials(user, force_default_password=True)
            if provisioning.get("credentials"):
                credentials = provisioning["credentials"]
            else:
                return 401, {
                    "error": "Invalid credentials",
                    "detail": "No credentials found for this user"
                }
        else:
            return 401, {
                "error": "Invalid credentials",
                "detail": "No credentials found for this user"
            }

    # Check if account is locked
    if credentials.is_locked():
        return 423, {
            "error": "Account locked",
            "detail": f"Too many failed attempts. Try again after {credentials.locked_until}"
        }

    # Verify password
    default_pwd = getattr(settings, "DEFAULT_EMPLOYEE_PASSWORD", "idaraalkhair12@#")
    pwd_valid = credentials.check_password(payload.password)
    if not pwd_valid and (credentials.must_change_password or not credentials.password_hash) and payload.password.strip().lower() == default_pwd.lower():
        credentials.set_password(default_pwd, must_change=True)
        credentials.save(update_fields=["password_hash", "password_changed_at", "failed_login_attempts", "locked_until", "must_change_password"])
        pwd_valid = True

    if not pwd_valid:
        credentials.record_failed_login()
        return 401, {
            "error": "Invalid credentials",
            "detail": "Incorrect password"
        }

    # If employee must change password, issue a verified reset token to force password change
    if not is_superadmin and credentials.must_change_password:
        otp = _generate_numeric_otp()
        challenge = PasswordResetChallenge(
            employee=user,
            consumed_at=timezone.now(),
            expires_at=timezone.now() + timedelta(minutes=15),
        )
        challenge.set_otp(otp)
        challenge.save()
        reset_token = generate_challenge_token(
            user, scope="password_reset_verified", expires_minutes=15,
            cid=str(challenge.id),
        )
        client_ip = request.META.get('REMOTE_ADDR')
        credentials.record_successful_login(ip_address=client_ip)
        return 200, {
            "access_token": "",
            "refresh_token": "",
            "expires_in": 0,
            "employee": {
                "id": str(user.id),
                "employee_id": getattr(user, 'employee_id', ''),
                "full_name": user.full_name,
                "email": user.email,
            },
            "must_change_password": True,
            "reset_token": reset_token,
        }

    # Record success and issue tokens directly
    client_ip = request.META.get('REMOTE_ADDR')
    credentials.record_successful_login(ip_address=client_ip)

    return 200, _issue_login_tokens(request, user)


@router.post("/verify-otp", response={200: VerifyOtpResponse, 401: ErrorResponse, 429: ErrorResponse})
def verify_otp(request: HttpRequest, payload: VerifyOtpRequest):
    """
    Step 2 of the default-password reset flow: verify the 6-digit OTP sent
    by /login and exchange it for a `reset_token` that /complete-password-reset
    will accept.
    """
    claims = decode_scoped_token(payload.challenge_token, expected_scope="password_reset_challenge")
    if not claims:
        return 401, {"error": "invalid_or_expired_challenge"}
    employee_id = claims.get('sub') or claims.get('user_id')
    challenge_id = claims.get('cid')
    if not employee_id or not challenge_id:
        return 401, {"error": "invalid_or_expired_challenge"}

    with transaction.atomic():
        # Lock the exact challenge this token was minted for — not just
        # "whichever challenge is newest" — so a stale token can't be
        # paired with a different, newer OTP, and so concurrent verify
        # attempts against the same challenge can't race on `attempts`.
        challenge = (
            PasswordResetChallenge.objects
            .select_for_update()
            .filter(
                id=challenge_id, employee_id=employee_id,
                consumed_at__isnull=True, expires_at__gt=timezone.now(),
            )
            .first()
        )
        if not challenge:
            return 401, {"error": "invalid_or_expired_challenge"}

        if challenge.attempts >= OTP_MAX_ATTEMPTS:
            return 429, {
                "error": "too_many_attempts",
                "detail": "Request a new code by logging in again."
            }

        if not challenge.check_otp(payload.otp):
            challenge.attempts += 1
            challenge.save(update_fields=['attempts'])
            return 401, {"error": "invalid_otp"}

        challenge.consumed_at = timezone.now()
        challenge.save(update_fields=['consumed_at'])

        try:
            employee = Employee.objects.get(id=employee_id, is_active=True, is_deleted=False)
        except Employee.DoesNotExist:
            return 401, {"error": "invalid_or_expired_challenge"}

    reset_token = generate_challenge_token(
        employee, scope="password_reset_verified", expires_minutes=10,
        cid=str(challenge.id),
    )
    return 200, {"reset_token": reset_token}


@router.post("/complete-password-reset", response={200: LoginResponse, 400: dict, 401: ErrorResponse})
def complete_password_reset(request: HttpRequest, payload: CompletePasswordResetRequest):
    """
    Step 3 of the default-password reset flow: set a new password (subject
    to the same policy as employees.set_employee_credentials) and log the
    employee in exactly like a normal successful login.
    """
    claims = decode_scoped_token(payload.reset_token, expected_scope="password_reset_verified")
    if not claims:
        return 401, {"error": "invalid_or_expired_reset_token"}
    employee_id = claims.get('sub') or claims.get('user_id')
    challenge_id = claims.get('cid')
    if not employee_id or not challenge_id:
        return 401, {"error": "invalid_or_expired_reset_token"}

    pwd_errors = validate_password_policy(payload.new_password)
    if pwd_errors:
        return 400, {
            "error": "Validation failed",
            "field_errors": {"new_password": [f"Password must contain {e}" for e in pwd_errors]},
        }

    with transaction.atomic():
        # Lock the challenge this reset_token was verified against. A
        # verified reset_token is otherwise a bare, stateless JWT that
        # stays valid for its whole 10-minute window — reset_used_at is
        # what actually makes it single-use: the first successful reset
        # sets it, and every later replay of the same token is rejected.
        try:
            challenge = PasswordResetChallenge.objects.select_for_update().get(
                id=challenge_id, employee_id=employee_id,
            )
        except PasswordResetChallenge.DoesNotExist:
            return 401, {"error": "invalid_or_expired_reset_token"}

        if not challenge.consumed_at or challenge.reset_used_at:
            return 401, {"error": "invalid_or_expired_reset_token"}

        try:
            employee = Employee.objects.get(id=employee_id, is_active=True, is_deleted=False)
        except Employee.DoesNotExist:
            return 401, {"error": "invalid_or_expired_reset_token"}

        try:
            credentials = UserCredentials.objects.get(employee=employee, is_deleted=False)
        except UserCredentials.DoesNotExist:
            return 401, {"error": "invalid_or_expired_reset_token"}

        challenge.reset_used_at = timezone.now()
        challenge.save(update_fields=['reset_used_at'])

        credentials.set_password(payload.new_password)
        credentials.must_change_password = False
        credentials.save()

        # A password reset invalidates any sessions issued under the old
        # (default, potentially-known-to-others) password.
        RefreshToken.objects.filter(employee=employee, is_revoked=False).update(is_revoked=True)

        client_ip = request.META.get('REMOTE_ADDR')
        credentials.record_successful_login(ip_address=client_ip)

        tokens = _issue_login_tokens(request, employee)

    return 200, tokens


@router.post("/forgot-password/request", response={200: ForgotPasswordRequestResponse}, auth=None)
def forgot_password_request(request: HttpRequest, payload: ForgotPasswordRequest):
    generic = {"message": "If an account matches, a verification code has been sent."}
    email = payload.email.strip().lower()
    employees = list(Employee.objects.filter(
        personal_email__iexact=email, is_active=True, is_deleted=False
    ))
    if not employees:
        return 200, generic
    # Only employees with credentials can reset a password — exclude the
    # rest from disambiguation so the picker never offers a dead end.
    cred_emp_ids = set(UserCredentials.objects.filter(
        employee_id__in=[e.id for e in employees], is_deleted=False
    ).values_list('employee_id', flat=True))
    eligible = [e for e in employees if e.id in cred_emp_ids]
    if payload.employee_id and payload.employee_id.strip():
        code = payload.employee_id.strip().upper()
        employee = next((e for e in eligible if e.employee_id.upper() == code), None)
        if not employee:
            return 200, {"message": "No account matches this email and employee ID combination."}
    elif len(eligible) > 1:
        # Shared personal email: the caller must pick an account before an
        # OTP is issued, otherwise the reset lands on a random one.
        return 200, {
            "message": "Multiple accounts share this email. Select your account to continue.",
            "accounts": [
                {"employee_id": e.employee_id, "full_name": e.full_name}
                for e in eligible
            ],
        }
    elif len(eligible) == 1:
        employee = eligible[0]
    else:
        return 200, generic
    credentials = UserCredentials.objects.filter(employee=employee, is_deleted=False).first()
    if not credentials:
        return 200, generic
    window = timezone.now() - timedelta(minutes=settings.PASSWORD_RESET_REQUEST_WINDOW_MINUTES)
    if PasswordResetChallenge.objects.filter(employee=employee, created_at__gte=window).count() >= settings.PASSWORD_RESET_REQUEST_LIMIT:
        return 200, generic
    otp = f"{secrets.randbelow(1_000_000):06d}"
    challenge = PasswordResetChallenge(
        employee=employee,
        expires_at=timezone.now() + timedelta(minutes=settings.PASSWORD_RESET_OTP_EXPIRY_MINUTES),
    )
    challenge.set_otp(otp)
    challenge.save()
    try:
        send_mail(
            "Your Idara Al Khair password reset code",
            f"Your password reset verification code is: {otp}\n\nIt expires in {settings.PASSWORD_RESET_OTP_EXPIRY_MINUTES} minutes. If you did not request this, ignore this email.",
            settings.DEFAULT_FROM_EMAIL,
            [employee.personal_email],
            fail_silently=False,
        )
        logger.info(
            "Forgot-password OTP email sent to %s for employee %s",
            employee.personal_email, employee.employee_id,
        )
    except Exception as exc:
        logger.error(
            "Forgot-password email failed for employee %s (%s): %s",
            employee.employee_id, employee.personal_email, exc,
        )
        # Do not disclose delivery/account state; invalidate an undelivered OTP.
        challenge.consumed_at = timezone.now()
        challenge.save(update_fields=["consumed_at"])
    return 200, generic


@router.post("/forgot-password/verify", response={200: dict, 400: ErrorResponse}, auth=None)
def forgot_password_verify(request: HttpRequest, payload: ForgotPasswordVerifyRequest):
    email = payload.email.strip().lower()
    employees = Employee.objects.filter(
        personal_email__iexact=email, is_active=True, is_deleted=False
    )
    if payload.employee_id and payload.employee_id.strip():
        code = payload.employee_id.strip().upper()
        employee = next(
            (e for e in employees if e.employee_id.upper() == code), None
        )
    else:
        employee = employees.first()
    credentials = UserCredentials.objects.filter(employee=employee, is_deleted=False).first() if employee else None
    challenge = (PasswordResetChallenge.objects.filter(
        employee=employee, consumed_at__isnull=True
    ).order_by("-created_at").first() if credentials else None)
    invalid = (not challenge or challenge.expires_at <= timezone.now() or
               challenge.attempts >= settings.PASSWORD_RESET_MAX_ATTEMPTS)
    if not invalid and not challenge.check_otp(payload.code.strip()):
        challenge.attempts += 1
        if challenge.attempts >= settings.PASSWORD_RESET_MAX_ATTEMPTS:
            challenge.consumed_at = timezone.now()
        challenge.save(update_fields=["attempts", "consumed_at"])
        invalid = True
    if invalid:
        return 400, {"error": "invalid_code", "detail": "Verification code is invalid or expired"}
    challenge.consumed_at = timezone.now()
    challenge.save(update_fields=["consumed_at"])
    token = _credential_action_token(credentials, "forgot-reset", challenge_id=str(challenge.id))
    return 200, {"message": "Code verified", "reset_token": token, "expires_in": settings.PASSWORD_RESET_TOKEN_MAX_AGE}


@router.post("/forgot-password/reset", response={200: MessageResponse, 400: ErrorResponse}, auth=None)
def forgot_password_reset(request: HttpRequest, payload: ForgotPasswordResetRequest):
    error = _password_error(payload.password, payload.confirm_password)
    if error:
        return 400, {"error": "invalid_password", "detail": error}
    try:
        credentials, data = _load_credential_action_token(
            payload.reset_token, "forgot-reset", settings.PASSWORD_RESET_TOKEN_MAX_AGE
        )
        challenge = PasswordResetChallenge.objects.get(
            id=data["challenge_id"], employee=credentials.employee, consumed_at__isnull=False
        )
    except (signing.BadSignature, signing.SignatureExpired, UserCredentials.DoesNotExist,
            PasswordResetChallenge.DoesNotExist, KeyError):
        return 400, {"error": "invalid_or_expired_token", "detail": "Password reset session is invalid or expired"}
    if credentials.check_password(payload.password):
        return 400, {"error": "invalid_password", "detail": "Choose a password different from the current password"}
    with transaction.atomic():
        credentials.set_password(payload.password, must_change=False)
        credentials.save()
        target = {"employee_id": credentials.employee_id} if credentials.employee_id else {"superadmin_id": credentials.superadmin_id}
        RefreshToken.objects.filter(**target, is_revoked=False).update(is_revoked=True)
    return 200, {"message": "Password reset successfully. Please log in."}


# ================== Registration Endpoint ==================

@router.post("/register", response={201: RegisterResponse, 400: dict, 409: dict}, auth=None)
def register(request: HttpRequest, payload: RegisterRequest):
    """
    Public employee self-registration.
    Creates employee with status=PENDING_APPROVAL and auto-issues JWT tokens.
    """
    # --- Validation ---
    errors = {}

    # Full name: required, alphabets + spaces only
    if not payload.full_name.strip():
        errors["full_name"] = "Full name is required"
    elif not re.match(r'^[a-zA-Z\s]+$', payload.full_name.strip()):
        errors["full_name"] = "Full name must contain only alphabets and spaces"

    # CNIC: format XXXXX-XXXXXXX-X (13 digits with dashes) - required
    cnic_clean = payload.cnic.strip().replace(" ", "") if payload.cnic else ""
    if not cnic_clean:
        errors["cnic"] = "CNIC is required"
    elif not re.match(r'^\d{5}-\d{7}-\d{1}$', cnic_clean):
        errors["cnic"] = "Invalid CNIC format. Expected: XXXXX-XXXXXXX-X"
    elif Employee.all_objects.filter(cnic=cnic_clean).exists():
        errors["cnic"] = "CNIC is already registered"

    # Phone: Pakistani format +92XXXXXXXXXX
    phone = payload.personal_phone.strip()
    if not re.match(r'^\+92\d{10}$', phone):
        errors["personal_phone"] = "Invalid phone format. Expected: +92XXXXXXXXXX"

    # Email: valid format + unique
    email = payload.personal_email.strip().lower()
    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
        errors["personal_email"] = "Invalid email address"
    elif Employee.all_objects.filter(personal_email__iexact=email).exists() or SuperAdmin.objects.filter(email__iexact=email).exists():
        errors["personal_email"] = "Email is already registered"

    # Gender: must be one of male, female, other
    gender = payload.gender.strip().lower()
    valid_genders = ['male', 'female', 'other']
    if gender not in valid_genders:
        errors["gender"] = "Gender must be male, female, or other"

    # Date of Birth: valid date, not in future, reasonable age (16-100)
    from datetime import date
    try:
        dob = date.fromisoformat(payload.dob.strip())
        today = date.today()
        if dob > today:
            errors["dob"] = "Date of birth cannot be in the future"
        else:
            age = (today.year - dob.year) - ((today.month, today.day) < (dob.month, dob.day))
            if age < 16:
                errors["dob"] = "You must be at least 16 years old"
            elif age > 100:
                errors["dob"] = "Invalid date of birth"
    except ValueError:
        errors["dob"] = "Invalid date format. Use YYYY-MM-DD"

    # Password: auto-generate if not provided, else validate
    pwd = payload.password.strip() if payload.password else ""
    if not pwd:
        import secrets
        pwd = secrets.token_urlsafe(12) + "A1!"  # Auto-generate: 12 chars + uppercase + number + special
    else:
        if len(pwd) < 8:
            errors["password"] = "Password must be at least 8 characters"
        elif not re.search(r'[A-Z]', pwd):
            errors["password"] = "Password must contain at least 1 uppercase letter"
        elif not re.search(r'\d', pwd):
            errors["password"] = "Password must contain at least 1 number"
        elif not re.search(r'[!@#$%^&*(),.?\":{}|<>]', pwd):
            errors["password"] = "Password must contain at least 1 special character"

    if errors:
        return 400, {"error": "Validation failed", "field_errors": errors}

    # --- Create Employee + Credentials (atomic) ---
    try:
        with transaction.atomic():
            # Create Employee with PENDING_APPROVAL status
            employee = Employee.objects.create(
                full_name=payload.full_name.strip(),
                cnic=cnic_clean,
                gender=gender,
                marital_status=payload.marital_status.strip() if payload.marital_status else None,
                nationality=payload.nationality.strip() or "Pakistani",
                religion=payload.religion.strip() or "Islam",
                personal_phone=phone,
                personal_email=email,
                dob=dob,
                emergency_contact_name=payload.emergency_name.strip() if payload.emergency_name else None,
                emergency_contact_phone=payload.emergency_phone.strip() if payload.emergency_phone else None,
                residential_address=payload.residential_address.strip() if payload.residential_address else None,
                permanent_address=payload.permanent_address.strip() if payload.permanent_address else None,
                city=payload.city.strip() if payload.city else None,
                bio=payload.bio.strip() if payload.bio else None,
                current_working_sector=payload.current_working_sector.strip() if payload.current_working_sector else None,
                status=EmployeeStatus.PENDING_APPROVAL,
                education_history=[
                    {"degree": e.degree, "institute": e.institute, "passingYear": e.passing_year}
                    for e in payload.education
                ],
                work_experience=[
                    {
                        "employer": e.employer,
                        "jobTitle": e.job_title,
                        "startDate": e.start_date,
                        "currentlyWorking": e.currently_working,
                        "endDate": e.end_date,
                        "responsibilities": e.responsibilities,
                    }
                    for e in payload.experience
                ],
            )

            # Create UserCredentials
            credentials = UserCredentials(employee=employee)
            credentials.set_password(pwd)
            credentials.save()

        # --- Generate JWT tokens (auto-login) ---
        client_ip = request.META.get('REMOTE_ADDR')
        user_agent = request.META.get('HTTP_USER_AGENT', '')

        access_token = generate_access_token(employee)
        refresh_token_str = generate_refresh_token(employee)

        # Store refresh token
        RefreshToken.objects.create(
            employee=employee,
            token=refresh_token_str,
            expires_at=timezone.now() + timedelta(days=7),
            device_info=user_agent[:255],
            ip_address=client_ip,
        )

        return 201, {
            "access_token": access_token,
            "refresh_token": refresh_token_str,
            "expires_in": 3600,
            "employee": {
                "id": str(employee.id),
                "employee_id": employee.employee_id,
                "full_name": employee.full_name,
                "status": employee.status,
                "personal_email": employee.personal_email,
                "personal_phone": employee.personal_phone,
            },
            "auto_password": pwd if not payload.password else None,
        }

    except Exception as e:
        return 400, {"error": "Registration failed", "detail": str(e)}


@router.post("/logout", response={200: MessageResponse, 401: ErrorResponse}, auth=AuthBearer())
def logout(request: HttpRequest, payload: LogoutRequest):
    """
    Logout by blacklisting access token.
    
    Requires: Bearer token in Authorization header
    """
    try:
        # Get token expiry
        expires_at = get_token_expiry(payload.access_token)
        if not expires_at:
            expires_at = timezone.now() + timedelta(hours=1)
        
        # Blacklist the access token
        BlacklistedToken.objects.create(
            token=payload.access_token,
            expires_at=expires_at,
            reason='logout'
        )
        
        # Revoke all refresh tokens for this user (employee or superadmin)
        is_sa = getattr(request.auth, 'is_superadmin', False)
        filter_key = {'superadmin': request.auth} if is_sa else {'employee': request.auth}
        RefreshToken.objects.filter(**filter_key, is_revoked=False).update(is_revoked=True)
        
        return 200, {"message": "Logged out successfully"}
    
    except Exception as e:
        return 401, {
            "error": "Logout failed",
            "detail": str(e)
        }


@router.post("/refresh", response={200: RefreshResponse, 401: ErrorResponse})
def refresh_token(request: HttpRequest, payload: RefreshRequest):
    """
    Refresh access token using refresh token.
    
    Returns new access token (1 hour).
    """
    try:
        # Verify refresh token
        verify_result = verify_refresh_token(payload.refresh_token)
        if not verify_result:
            return 401, {
                "error": "Invalid refresh token",
                "detail": "Token is invalid or expired"
            }
        
        user_id, is_superadmin = verify_result
        
        # Check refresh token database
        cred_filter = {'superadmin__id': user_id} if is_superadmin else {'employee__id': user_id}
        try:
            refresh_token_obj = RefreshToken.objects.get(
                token=payload.refresh_token,
                **cred_filter
            )
        except RefreshToken.DoesNotExist:
            return 401, {
                "error": "Invalid refresh token",
                "detail": "Token not found in database"
            }
        
        if not refresh_token_obj.is_valid():
            return 401, {
                "error": "Invalid refresh token",
                "detail": "Token has been revoked or expired"
            }
        
        # Get user
        if is_superadmin:
            user = SuperAdmin.objects.get(id=user_id, is_active=True)
        else:
            user = Employee.objects.get(id=user_id, is_active=True, is_deleted=False)
        
        # Generate new access token
        new_access_token = generate_access_token(user)
        
        return 200, {
            "access_token": new_access_token,
            "expires_in": 3600
        }
    
    except (Employee.DoesNotExist, SuperAdmin.DoesNotExist):
        return 401, {
            "error": "User not found",
            "detail": "Account is inactive or deleted"
        }
    except Exception as e:
        return 401, {
            "error": "Refresh failed",
            "detail": str(e)
        }


@router.get("/me", response={200: dict, 401: ErrorResponse}, auth=AuthBearer())
def get_current_user(request: HttpRequest):
    """
    Get current authenticated user info.
    """
    user = request.auth
    is_superadmin = getattr(user, 'is_superadmin', False)
    
    user_info = {
        "id": str(user.id),
        "code": user.superadmin_code if is_superadmin else user.employee_id,
        "full_name": user.full_name,
        "email": user.email or "",
        "is_superadmin": is_superadmin,
        "is_active": user.is_active,
        "status": getattr(user, "status", "active"),
    }
    
    if not is_superadmin:
        user_info.update({
            "employee_id": user.employee_id,
            "department": user.department.dept_name if user.department else "",
            "designation": user.designation.position_name if user.designation else "",
        })
        
    return 200, user_info


# ================== HDMS Login Endpoint ==================

class HdmsLoginResponse(Schema):
    """Response for HDMS login with role and permissions"""
    access_token: str
    refresh_token: str
    expires_in: int
    user: dict


class HdmsErrorResponse(Schema):
    """Error response for HDMS login"""
    error: str
    detail: Optional[str] = None
    assigned_role: Optional[str] = None  # For role mismatch errors


@router.post("/login-hdms", response={200: HdmsLoginResponse, 401: HdmsErrorResponse, 403: HdmsErrorResponse, 423: HdmsErrorResponse})
def login_hdms(request: HttpRequest, payload: HdmsLoginRequest):
    """
    Login to HDMS with role validation.
    
    Validates:
    1. Employee credentials
    2. HDMS service access exists
    
    Returns user info with role and permissions.
    """

    # Get employee by Employee ID, personal/org email, or legacy employee code
    employee, ambiguous = _resolve_employee(payload.identifier)
    if ambiguous:
        return 401, {
            "error": "invalid_credentials",
            "detail": "Multiple accounts use this email. Please log in with your Employee ID instead.",
        }
    if not employee:
        return 401, {
            "error": "invalid_credentials",
            "detail": "Employee not found or account inactive"
        }

    # Get user credentials
    try:
        credentials = UserCredentials.objects.get(employee=employee, is_deleted=False)
    except UserCredentials.DoesNotExist:
        return 401, {
            "error": "invalid_credentials",
            "detail": "No credentials found for this employee"
        }

    # Check if account is locked
    if credentials.is_locked():
        return 423, {
            "error": "account_locked",
            "detail": f"Too many failed attempts. Try again after {credentials.locked_until}"
        }

    # Verify password
    if not credentials.check_password(payload.password):
        credentials.record_failed_login()
        return 401, {
            "error": "invalid_credentials",
            "detail": "Incorrect password"
        }

    # Default-password gate: this employee still has an auto-provisioned
    # default password and must complete the OTP reset flow via the main
    # /login endpoint before they can use HDMS.
    if credentials.must_change_password:
        return 403, PASSWORD_RESET_REQUIRED_ERROR

    # Check HDMS service access
    try:
        service_access = ServiceAccess.objects.get(
            employee=employee,
            service='hdms',
            is_active=True,
            is_deleted=False
        )
    except ServiceAccess.DoesNotExist:
        return 403, {
            "error": "no_hdms_access",
            "detail": "You don't have HDMS access. Contact admin."
        }
    
    # Get HDMS role
    try:
        hdms_role = service_access.hdms_role
    except HdmsRole.DoesNotExist:
        return 403, {
            "error": "no_hdms_role",
            "detail": "No HDMS role assigned. Contact admin."
        }
    
    # Get client IP
    client_ip = request.META.get('REMOTE_ADDR')
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    
    # Record successful login
    credentials.record_successful_login(ip_address=client_ip)
    
    # Generate tokens with specific HDMS role
    access_token = generate_access_token(employee, role=hdms_role.role_type)
    refresh_token_str = generate_refresh_token(employee)
    
    # Store refresh token in database
    RefreshToken.objects.create(
        employee=employee,
        token=refresh_token_str,
        expires_at=timezone.now() + timedelta(days=7),
        device_info=user_agent[:255],
        ip_address=client_ip
    )
    
    # Build user response with permissions
    return 200, {
        "access_token": access_token,
        "refresh_token": refresh_token_str,
        "expires_in": 3600,  # 1 hour
        "user": {
            "id": str(employee.id),
            "employee_id": employee.employee_id,
            "name": employee.full_name,
            "email": employee.email or "",
            "department": employee.department.dept_name,
            "role": hdms_role.role_type,
            "permissions": {
                "can_view_all_tickets": hdms_role.can_view_all_tickets,
                "can_assign_tickets": hdms_role.can_assign_tickets,
                "can_close_tickets": hdms_role.can_close_tickets,
                "can_manage_users": hdms_role.can_manage_users
            }
        }
    }


# ================== VMS Login Endpoint ==================

class VmsLoginResponse(Schema):
    access_token: str
    refresh_token: str
    expires_in: int
    user: dict


@router.post("/login-vms", response={200: VmsLoginResponse, 401: HdmsErrorResponse, 403: HdmsErrorResponse, 423: HdmsErrorResponse})
def login_vms(request: HttpRequest, payload: HdmsLoginRequest):
    """
    Login to VMS with service access + role validation.

    Validates employee credentials and VMS service access.
    Returns JWT with vms_role included.
    """
    employee, ambiguous = _resolve_employee(payload.identifier)
    if ambiguous:
        return 401, {
            "error": "invalid_credentials",
            "detail": "Multiple accounts use this email. Please log in with your Employee ID instead.",
        }
    if not employee:
        return 401, {"error": "invalid_credentials", "detail": "Employee not found or account inactive"}

    try:
        credentials = UserCredentials.objects.get(employee=employee, is_deleted=False)
    except UserCredentials.DoesNotExist:
        return 401, {"error": "invalid_credentials", "detail": "No credentials found for this employee"}

    if credentials.is_locked():
        return 423, {"error": "account_locked", "detail": f"Too many failed attempts. Try again after {credentials.locked_until}"}

    if not credentials.check_password(payload.password):
        credentials.record_failed_login()
        return 401, {"error": "invalid_credentials", "detail": "Incorrect password"}
    if credentials.must_change_password:
        return 403, PASSWORD_RESET_REQUIRED_ERROR

    try:
        service_access = ServiceAccess.objects.get(
            employee=employee,
            service='vms',
            is_active=True,
            is_deleted=False
        )
    except ServiceAccess.DoesNotExist:
        return 403, {"error": "no_vms_access", "detail": "You don't have VMS access. Contact admin."}

    try:
        vms_role = service_access.vms_role
    except VmsRole.DoesNotExist:
        return 403, {"error": "no_vms_role", "detail": "No VMS role assigned. Contact admin."}

    client_ip = request.META.get('REMOTE_ADDR')
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    credentials.record_successful_login(ip_address=client_ip)

    access_token = generate_access_token(employee, role=vms_role.role_type)
    refresh_token_str = generate_refresh_token(employee)

    RefreshToken.objects.create(
        employee=employee,
        token=refresh_token_str,
        expires_at=timezone.now() + timedelta(days=7),
        device_info=user_agent[:255],
        ip_address=client_ip
    )

    return 200, {
        "access_token": access_token,
        "refresh_token": refresh_token_str,
        "expires_in": 3600,
        "user": {
            "id": str(employee.id),
            "employee_id": employee.employee_id,
            "name": employee.full_name,
            "email": employee.email or "",
            "department": employee.department.dept_name if employee.department else "",
            "vms_role": vms_role.role_type,
        }
    }


# ================== SIS Login Endpoint ==================

class SisLoginResponse(Schema):
    access_token: str
    refresh_token: str
    expires_in: int
    user: dict


@router.post("/login-sis", response={200: SisLoginResponse, 401: ErrorResponse, 403: ErrorResponse, 423: ErrorResponse})
def login_sis(request: HttpRequest, payload: LoginRequest):
    """
    Specialized login for SIS with service access check and hydration metadata.
    """
    # 1. Credential Verification (shared logic)
    user = None
    employee, ambiguous = _resolve_employee(payload.identifier)
    if ambiguous:
        return 401, {
            "error": "invalid_credentials",
            "detail": "Multiple accounts use this email. Please log in with your Employee ID instead.",
        }
    if employee:
        user = employee
    else:
        user = SuperAdmin.objects.filter(
            Q(superadmin_code__iexact=payload.identifier) | Q(email__iexact=payload.identifier),
            is_active=True
        ).first()
        if not user:
            return 401, {"error": "invalid_credentials", "detail": "User not found"}

    is_superadmin = getattr(user, 'is_superadmin', False)
    cred_filter = {'superadmin': user} if is_superadmin else {'employee': user}
    
    try:
        credentials = UserCredentials.objects.get(**cred_filter, is_deleted=False)
    except UserCredentials.DoesNotExist:
        return 401, {"error": "invalid_credentials", "detail": "No credentials found"}

    if credentials.is_locked():
        return 423, {"error": "account_locked", "detail": "Too many failed attempts"}

    if not credentials.check_password(payload.password):
        credentials.record_failed_login()
        return 401, {"error": "invalid_credentials", "detail": "Incorrect password"}
    if not is_superadmin and credentials.must_change_password:
        return 403, PASSWORD_RESET_REQUIRED_ERROR

    # 2. Service Access Check
    try:
        ServiceAccess.objects.get(
            employee=user if not is_superadmin else None,
            superadmin=user if is_superadmin else None,
            service='sis',
            is_active=True,
            is_deleted=False
        )
    except ServiceAccess.DoesNotExist:
        return 403, {"error": "no_sis_access", "detail": "You don't have SIS access assigned."}

    # 3. Successful Login Actions
    client_ip = request.META.get('REMOTE_ADDR')
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    credentials.record_successful_login(ip_address=client_ip)
    
    access_token = generate_access_token(user)
    refresh_token_str = generate_refresh_token(user)
    
    RefreshToken.objects.create(
        employee=user if not is_superadmin else None,
        superadmin=user if is_superadmin else None,
        token=refresh_token_str,
        expires_at=timezone.now() + timedelta(days=7),
        device_info=user_agent[:255],
        ip_address=client_ip
    )

    # 4. Build SIS-Compatible Response
    return 200, {
        "access_token": access_token,
        "refresh_token": refresh_token_str,
        "expires_in": 3600,
        "user": {
            "id": str(user.id),
            "username": getattr(user, 'superadmin_code', None) or getattr(user, 'employee_id', None),
            "full_name": user.full_name,
            "first_name": user.full_name.split(' ')[0] if user.full_name else "",
            "last_name": ' '.join(user.full_name.split(' ')[1:]) if user.full_name and len(user.full_name.split(' ')) > 1 else "",
            "email": user.email or "",
            "role": "superadmin" if is_superadmin else (user.designation.position_name.lower() if user.designation else "teacher"), # Fallback role
            "is_active": user.is_active,
            "is_superadmin": is_superadmin
        }
    }
