from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from .models import Activity, Enrollment, Participant


class EvaluationSeedTests(TestCase):
    def test_seed_is_repeatable_and_preserves_existing_data(self):
        participant = Participant.objects.create(
            id="a1234567-89ab-cdef-0123-456789abcdef", name="Nombre existente",
        )
        activity = Activity.objects.create(
            title="Actividad propia", starts_at=timezone.now(), capacity=4,
        )
        enrollment = Enrollment.objects.create(activity=activity, participant=participant)
        for _ in range(2):
            call_command("seed_evaluation", stdout=StringIO())
        participant.refresh_from_db()
        self.assertEqual(participant.name, "Nombre existente")
        self.assertEqual(Enrollment.objects.get(pk=enrollment.pk).enrolled_at, enrollment.enrolled_at)
        self.assertEqual(get_user_model().objects.count(), 3)
        self.assertTrue(participant.user.check_password("Evaluacion2026!"))
        self.assertTrue(get_user_model().objects.get(username="docente").is_staff)
        self.assertFalse(participant.user.is_staff)

    def test_deleting_user_preserves_participant_and_enrollment(self):
        user = get_user_model().objects.create_user(username="legacy")
        participant = Participant.objects.create(name="Legacy", user=user)
        activity = Activity.objects.create(title="Test", starts_at=timezone.now(), capacity=1)
        Enrollment.objects.create(activity=activity, participant=participant)
        user.delete()
        participant.refresh_from_db()
        self.assertIsNone(participant.user_id)
        self.assertEqual(participant.enrollment_set.count(), 1)
