from uuid import UUID

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from activities.management.commands.seed_activities import ACTIVITIES
from activities.models import Activity, Participant


EVALUATION_PASSWORD = "Evaluacion2026!"
EVALUATION_USERS = [
    ("juan", "a1234567-89ab-cdef-0123-456789abcdef", "Juan García", False),
    ("maria", "b2345678-90ab-cdef-0123-456789abcdef", "María López", False),
    ("docente", "c3456789-01ab-cdef-0123-456789abcdef", "Docente", True),
]


class Command(BaseCommand):
    help = "Crea datos locales de evaluación y restablece sus contraseñas; no borra inscripciones."

    @transaction.atomic
    def handle(self, *args, **options):
        for activity in ACTIVITIES:
            Activity.objects.get_or_create(
                id=activity["id"],
                defaults={key: value for key, value in activity.items() if key != "id"},
            )

        User = get_user_model()
        for username, participant_id, name, is_staff in EVALUATION_USERS:
            user, _ = User.objects.get_or_create(username=username)
            participant, _ = Participant.objects.get_or_create(
                id=UUID(participant_id), defaults={"name": name},
            )
            if participant.user_id not in (None, user.pk):
                raise CommandError(f"El participante de {username} ya tiene otra cuenta.")
            if Participant.objects.filter(user=user).exclude(pk=participant.pk).exists():
                raise CommandError(f"La cuenta {username} ya pertenece a otro participante.")
            user.set_password(EVALUATION_PASSWORD)
            user.is_staff = is_staff
            user.is_active = True
            user.save()
            participant.user = user
            participant.save(update_fields=["user"])

        self.stdout.write(self.style.SUCCESS(
            "Evaluación preparada: juan, maria y docente. Credenciales locales en README."
        ))
