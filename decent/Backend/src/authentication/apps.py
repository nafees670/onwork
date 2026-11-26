from django.apps import AppConfig
from django.db.models.signals import post_migrate


def _sync_superusers_post_migrate(sender, **kwargs):
    from authentication.signals import sync_all_existing_superusers
    sync_all_existing_superusers()


class AuthenticationConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'authentication'

    def ready(self):
        import authentication.signals  # noqa
        post_migrate.connect(_sync_superusers_post_migrate, sender=self)
