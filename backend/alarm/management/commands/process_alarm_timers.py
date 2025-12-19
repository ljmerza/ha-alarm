from __future__ import annotations

from django.core.management.base import BaseCommand

from alarm import services


class Command(BaseCommand):
    help = "Process alarm timer expirations."

    def handle(self, *args, **options):
        snapshot = services.timer_expired()
        self.stdout.write(f"alarm_state={snapshot.current_state}")
