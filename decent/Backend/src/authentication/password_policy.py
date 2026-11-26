"""
Shared password-policy validation.

Single source of truth for the 5-rule password policy enforced everywhere a
user (or an admin on their behalf) sets a password: initial credential
creation (employees.api.set_employee_credentials) and the self-service
OTP password-reset flow (authentication.api.complete_password_reset).

Import `validate_password_policy` instead of re-implementing the regex
checks — this is a neutral module (no dependency on employees or
authentication app internals) so both apps can import it without risking
a circular import.
"""
import re


def validate_password_policy(password: str) -> list:
    """
    Validate `password` against the standard policy:
      - at least 8 characters
      - at least 1 uppercase letter
      - at least 1 lowercase letter
      - at least 1 digit
      - at least 1 special (non-alphanumeric) character

    Returns a list of human-readable rule-violation descriptions (empty
    list means the password passes). Callers format each entry into their
    own error message, e.g. f"Password must contain {rule}".
    """
    pwd = password or ""
    errors = []
    if len(pwd) < 8:
        errors.append("At least 8 characters")
    if not re.search(r"[A-Z]", pwd):
        errors.append("One uppercase letter")
    if not re.search(r"[a-z]", pwd):
        errors.append("One lowercase letter")
    if not re.search(r"\d", pwd):
        errors.append("One digit")
    if not re.search(r"[^A-Za-z0-9]", pwd):
        errors.append("One special character")
    return errors
