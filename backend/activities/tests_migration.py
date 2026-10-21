from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone


class ParticipantMigrationTests(TransactionTestCase):
    def test_existing_uuid_and_enrollment_survive_user_link_migration(self):
        executor = MigrationExecutor(connection)
        executor.migrate([("activities", "0003_activity_category")])
        try:
            old_apps = executor.loader.project_state([("activities", "0003_activity_category")]).apps
            participant = old_apps.get_model("activities", "Participant").objects.create(name="Existente")
            activity = old_apps.get_model("activities", "Activity").objects.create(title="Existente", starts_at=timezone.now(), capacity=3)
            enrollment = old_apps.get_model("activities", "Enrollment").objects.create(activity=activity, participant=participant)
            executor = MigrationExecutor(connection)
            executor.migrate([("activities", "0004_participant_user")])
            from .models import Enrollment, Participant
            current = Participant.objects.get(pk=participant.pk)
            self.assertIsNone(current.user_id)
            self.assertEqual(Enrollment.objects.get(pk=enrollment.pk).enrolled_at, enrollment.enrolled_at)
        finally:
            MigrationExecutor(connection).migrate([("activities", "0004_participant_user")])
