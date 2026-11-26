"""
Signals for authentication app.

Automatically syncs Django superusers (created via `createsuperuser` or Django admin)
to the custom `SuperAdmin` and `UserCredentials` models so they can log into both
Django Admin panel and the Next.js Frontend app.
"""
import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from .superadmin_models import SuperAdmin
from .models import UserCredentials

logger = logging.getLogger(__name__)
User = get_user_model()


@receiver(post_save, sender=User)
def sync_superuser_to_superadmin(sender, instance, **kwargs):
    """
    When a Django User with `is_superuser=True` is created or updated,
    automatically ensure a corresponding `SuperAdmin` and `UserCredentials`
    record exist so the superuser can log into the frontend UI.
    """
    if not instance.is_superuser:
        return

    try:
        email = instance.email.strip().lower() if instance.email else f"{instance.username.lower()}@admin.local"
        code = instance.username.upper()
        full_name = instance.get_full_name().strip() or instance.username

        superadmin = SuperAdmin.objects.filter(email__iexact=email).first()
        if not superadmin:
            superadmin = SuperAdmin.objects.filter(superadmin_code__iexact=code).first()

        if not superadmin:
            superadmin = SuperAdmin.objects.create(
                email=email,
                superadmin_code=code,
                full_name=full_name,
                is_active=instance.is_active,
            )
            logger.info("Auto-created SuperAdmin '%s' for Django superuser '%s'", code, instance.username)
        else:
            updated = False
            if superadmin.is_active != instance.is_active:
                superadmin.is_active = instance.is_active
                updated = True
            if updated:
                superadmin.save()

        credentials = UserCredentials.objects.filter(superadmin=superadmin, is_deleted=False).first()
        if not credentials:
            credentials = UserCredentials.objects.create(
                superadmin=superadmin,
                password_hash=instance.password,
            )
            logger.info("Auto-created UserCredentials for SuperAdmin '%s'", code)
        else:
            if credentials.password_hash != instance.password:
                credentials.password_hash = instance.password
                credentials.save(update_fields=['password_hash'])

    except Exception as exc:
        logger.error("Failed to auto-sync superuser '%s' to SuperAdmin: %s", instance.username, exc)


def sync_all_existing_superusers():
    """
    Sync all existing superusers in auth_user into SuperAdmin and UserCredentials.
    Runs post-migrate to catch any superusers created previously via createsuperuser.
    """
    from django.db import connection
    try:
        if 'auth_user' not in connection.introspection.table_names():
            return
        for user in User.objects.filter(is_superuser=True):
            sync_superuser_to_superadmin(sender=User, instance=user)
    except Exception as exc:
        logger.debug("Could not sync existing superusers (e.g. before migrations): %s", exc)
