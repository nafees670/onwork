from django.core.mail import send_mail
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

def send_employee_code_notification(employee, new_code):
    """
    Sends an email notification to the employee when their code changes.
    """
    subject = f"Your New Employee Code: {new_code}"
    default_password = getattr(settings, "DEFAULT_EMPLOYEE_PASSWORD", "idaraalkhair12@#")
    message = (
        f"Hello {employee.full_name},\n\n"
        f"Your official employee code has been updated.\n\n"
        f"New Employee Code: {new_code}\n\n"
        f"Your default password is: {default_password}\n\n"
        f"For security, please change your password on first login.\n\n"
        f"Please use this code for all official purposes.\n\n"
        f"Best regards,\nIAK HR Team"
    )
    
    recipient_list = []
    if employee.personal_email:
        recipient_list.append(employee.personal_email)
    elif employee.org_email:
        recipient_list.append(employee.org_email)
    
    if not recipient_list:
        logger.warning(f"No email address found for employee {employee.employee_id}. Notification skipped.")
        return False

    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipient_list,
            fail_silently=False,
        )
        logger.info(f"Notification sent to {employee.employee_id} for code {new_code}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {employee.employee_id}: {str(e)}")
        return False


def send_welcome_employee_email(employee, plain_password=None):
    """
    Welcome email sent when an employee receives their FIRST assignment
    (i.e. they transition from the Assigned queue into the employee list).

    - plain_password: when the system just auto-created credentials with a
      default password, pass it here so it appears in the email body.
      When credentials already existed, omit it (no password line).
    - Sends individually to personal_email and org_email so one failing
      address never blocks the other.
    - NEVER raises: failures are logged and reported in the result dict.
    - Returns {"sent": [...], "failed": [...]}.
    """
    subject = "Welcome to Idara Al Khair — Your Account Has Been Created"

    # Strict Rule: DO NOT send welcome email if employee has no placement (department + designation) yet!
    pa = employee.primary_assignment
    if not pa or not pa.department or not pa.designation:
        logger.info(
            f"Employee {employee.employee_id} ({employee.full_name}) has no placement "
            f"(department/designation) yet. Welcome email deferred until placement is assigned."
        )
        return {"sent": [], "failed": [], "skipped": "no_placement"}

    dept_name = pa.department.dept_name or ""
    position_name = pa.designation.position_name or ""
    joining_date_label = str(pa.joining_date) if pa.joining_date else ""

    default_password = getattr(settings, "DEFAULT_EMPLOYEE_PASSWORD", "idaraalkhair12@#")
    if not plain_password:
        plain_password = default_password

    # Ensure credentials in DB are set to this password with must_change_password=True
    try:
        from authentication.models import UserCredentials
        creds = UserCredentials.objects.filter(employee=employee, is_deleted=False).first()
        if creds:
            creds.set_password(plain_password, must_change=True)
            creds.must_change_password = True
            creds.save()
        else:
            creds = UserCredentials(employee=employee)
            creds.set_password(plain_password, must_change=True)
            creds.must_change_password = True
            creds.save()
    except Exception as exc:
        logger.warning(f"Could not sync credentials for {employee.employee_id}: {exc}")

    login_url = getattr(settings, "FRONTEND_LOGIN_URL", "https://hrms.iak.ngo/login")

    password_line = f"Temporary Password: {plain_password}\n"
    change_note = "For security, changing your password on first login is required; replace the temporary password.\n\n"

    body = (
        f"Hello {employee.full_name},\n\n"
        f"\n"
        f"Welcome to Idara Al Khair.\n\n"
        f"Your employee account has been created successfully.\n\n"
        f"Employee Details:\n\n"
        f"Employee Name: {employee.full_name}\n"
        f"Employee ID: {employee.employee_id}\n"
        + password_line
        + f"Department: {dept_name}\n"
        f"Designation: {position_name}\n"
        + (f"Joining Date: {joining_date_label}\n" if joining_date_label else "")
        + f"\n"
        f"You can log in using either your Employee ID ({employee.employee_id}) "
        f"or your email address, together with the password above.\n\n"
        f"{change_note}"
        f"Your HRMS account has been created successfully.\n\n"
        f"Login URL:\n{login_url}\n\n"
        f"\n"
        f"Regards,\nIdara Al Khair HR Team\n\n"
        f"This is an automated email. Please do not reply to this email."
    )

    results = {"sent": [], "failed": []}

    recipients = []
    if employee.personal_email:
        recipients.append(employee.personal_email)
    elif employee.org_email:
        recipients.append(employee.org_email)

    if not recipients:
        logger.warning(
            f"No email address found for employee {employee.employee_id}. "
            f"Welcome email skipped."
        )
        return results

    # One SMTP connection reused for every recipient — sending each recipient
    # on its own connection (open + TLS handshake + auth) roughly doubles the
    # latency per extra recipient, and under Gmail SMTP from inside Docker
    # that's enough to trip Gunicorn's default 30s worker timeout on a
    # 2-recipient send, killing the whole request mid-response.
    from django.core.mail import get_connection

    connection = get_connection(fail_silently=False)
    try:
        connection.open()
    except Exception as e:
        logger.error(
            f"Could not open SMTP connection for employee {employee.employee_id}: {str(e)}"
        )
        results["failed"] = list(recipients)
        return results

    for recipient in recipients:
        try:
            send_mail(
                subject=subject,
                message=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient],
                fail_silently=False,
                connection=connection,
            )
            results["sent"].append(recipient)
            logger.info(
                f"Welcome email sent to {recipient} for employee {employee.employee_id}"
            )
        except Exception as e:
            logger.error(
                f"Failed to send welcome email to {recipient} for employee "
                f"{employee.employee_id}: {str(e)}"
            )
            results["failed"].append(recipient)

    connection.close()

    return results


def send_password_reset_otp_email(employee, otp):
    """
    Sends the one-time password (OTP) an employee needs to complete the
    "first login with default password" reset flow (see
    authentication.api.login / verify-otp / complete-password-reset).

    - Sends individually to personal_email and org_email so one failing
      address never blocks the other (same pattern as send_welcome_employee_email).
    - NEVER raises: failures are logged and reported in the result dict —
      the caller decides what to do if delivery fails.
    - Returns {"sent": [...], "failed": [...]}.
    """
    subject = "Your One-Time Password (OTP) to Reset Your Password"

    body = (
        f"Hello {employee.full_name},\n\n"
        f"You're logging in for the first time with your default password. "
        f"To continue, enter this one-time code:\n\n"
        f"OTP: {otp}\n\n"
        f"This code expires in 5 minutes and can only be used once.\n\n"
        f"If you did not attempt to log in, please contact your administrator.\n\n"
        f"Regards,\nIdara Al Khair HR Team\n\n"
        f"This is an automated email. Please do not reply to this email."
    )

    results = {"sent": [], "failed": []}

    recipients = []
    if employee.personal_email:
        recipients.append(employee.personal_email)
    elif employee.org_email:
        recipients.append(employee.org_email)

    if not recipients:
        logger.warning(
            f"No email address found for employee {employee.employee_id}. "
            f"Password reset OTP email skipped."
        )
        return results

    for recipient in recipients:
        try:
            send_mail(
                subject=subject,
                message=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient],
                fail_silently=False,
            )
            results["sent"].append(recipient)
            logger.info(
                f"Password reset OTP email sent to {recipient} for employee {employee.employee_id}"
            )
        except Exception as e:
            logger.error(
                f"Failed to send password reset OTP email to {recipient} for employee "
                f"{employee.employee_id}: {str(e)}"
            )
            results["failed"].append(recipient)

    return results
