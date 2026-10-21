from datetime import datetime
from uuid import UUID

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from .models import Activity, Enrollment, Participant
from .test_helpers import bearer_for


class ActivityContractTests(TestCase):
    def setUp(self):
        self.activity = Activity.objects.create(
            id=UUID("1b470ddf-3e84-4b77-9aae-091d21e52bd6"),
            title="Taller de HTTP",
            starts_at=timezone.make_aware(datetime(2026, 4, 10, 18, 0)),
            capacity=20,
        )
        self.participant = Participant.objects.create(name="Juan García")

    def test_get_known_activity(self):
        response = self.client.get(
            reverse("activities:api-activity-detail", args=[self.activity.id])
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["id"], str(self.activity.id))
        self.assertEqual(body["title"], "Taller de HTTP")
        self.assertEqual(body["capacity"], 20)
        self.assertEqual(body["available_slots"], 20)
        self.assertEqual(body["starts_at"], "2026-04-10T18:00:00-03:00")
        self.assertNotIn("data", body)
        self.assertNotIn("error", body)

    def test_get_list_returns_public_shape(self):
        response = self.client.get(reverse("activities:api-activity-list"))

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIsInstance(body, list)
        first = body[0]
        self.assertEqual(set(first.keys()), {"id", "title", "starts_at", "capacity", "available_slots"})

    def test_get_unknown_activity_is_stable_error(self):
        response = self.client.get(
            reverse(
                "activities:api-activity-detail",
                args=["00000000-0000-0000-0000-000000000000"],
            )
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {
            "code": "activity_not_found",
            "message": "La actividad no existe.",
        })


class EnrollmentIdempotencyTests(TestCase):
    def setUp(self):
        self.activity = Activity.objects.create(
            title="Taller de HTTP",
            starts_at=timezone.make_aware(datetime(2026, 4, 10, 18, 0)),
            capacity=20,
        )
        self.participant = Participant.objects.create(name="Juan García")

    def _put(self, activity=None, participant=None):
        return self.client.put(
            reverse(
                "activities:api-enrollment-confirm",
                args=[(activity or self.activity).id],
            ),
            HTTP_AUTHORIZATION=bearer_for((participant or self.participant)),
            content_type="application/json",
        )

    def test_first_put_creates_and_repeat_is_idempotent(self):
        first = self._put()
        self.assertEqual(first.status_code, 201)
        first_body = first.json()
        self.assertEqual(first_body["activity_id"], str(self.activity.id))
        self.assertEqual(Enrollment.objects.filter(activity=self.activity).count(), 1)

        repeated = self._put()
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(repeated.json(), first_body)
        self.assertEqual(Enrollment.objects.filter(activity=self.activity).count(), 1)

    def test_repeat_preserves_enrolled_at(self):
        first = self._put()
        first_enrolled_at = first.json()["enrolled_at"]

        repeated = self._put()

        self.assertEqual(repeated.json()["enrolled_at"], first_enrolled_at)
        enrollment = Enrollment.objects.get(activity=self.activity, participant=self.participant)
        self.assertEqual(
            timezone.localtime(enrollment.enrolled_at).isoformat(),
            first_enrolled_at,
        )

    def test_delete_is_idempotent(self):
        self._put()

        first = self.client.delete(
            reverse("activities:api-enrollment-confirm", args=[self.activity.id]),
            HTTP_AUTHORIZATION=bearer_for(self.participant),
        )
        self.assertEqual(first.status_code, 204)
        self.assertEqual(Enrollment.objects.filter(activity=self.activity).count(), 0)

        second = self.client.delete(
            reverse("activities:api-enrollment-confirm", args=[self.activity.id]),
            HTTP_AUTHORIZATION=bearer_for(self.participant),
        )
        self.assertEqual(second.status_code, 204)
        self.assertEqual(Enrollment.objects.filter(activity=self.activity).count(), 0)


class CapacityTests(TestCase):
    def setUp(self):
        self.activity = Activity.objects.create(
            title="Taller de HTTP",
            starts_at=timezone.make_aware(datetime(2026, 4, 10, 18, 0)),
            capacity=1,
        )
        self.juan = Participant.objects.create(name="Juan García")
        self.maria = Participant.objects.create(name="María López")

    def test_capacity_exhausted_uses_stable_error(self):
        Enrollment.objects.create(activity=self.activity, participant=self.juan)

        response = self.client.put(
            reverse("activities:api-enrollment-confirm", args=[self.activity.id]),
            HTTP_AUTHORIZATION=bearer_for(self.maria),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json(), {
            "code": "capacity_exhausted",
            "message": "No hay lugares disponibles.",
        })
        self.assertEqual(Enrollment.objects.filter(activity=self.activity).count(), 1)

    def test_canceling_releases_capacity(self):
        Enrollment.objects.create(activity=self.activity, participant=self.juan)
        self.client.delete(
            reverse("activities:api-enrollment-confirm", args=[self.activity.id]),
            HTTP_AUTHORIZATION=bearer_for(self.juan),
        )

        response = self.client.put(
            reverse("activities:api-enrollment-confirm", args=[self.activity.id]),
            HTTP_AUTHORIZATION=bearer_for(self.maria),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)


class AuthenticationAndMethodTests(TestCase):
    def setUp(self):
        self.activity = Activity.objects.create(
            title="Taller de HTTP",
            starts_at=timezone.make_aware(datetime(2026, 4, 10, 18, 0)),
            capacity=20,
        )
        self.participant = Participant.objects.create(name="Juan García")

    def test_missing_identity_is_401(self):
        response = self.client.put(
            reverse("activities:api-enrollment-confirm", args=[self.activity.id]),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {
            "code": "authentication_required",
            "message": "Se requiere una identidad de participante válida.",
        })

    def test_malformed_identity_is_401(self):
        response = self.client.put(
            reverse("activities:api-enrollment-confirm", args=[self.activity.id]),
            HTTP_X_PARTICIPANT_ID="not-a-uuid",
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "authentication_required")

    def test_unknown_activity_on_put_is_404(self):
        response = self.client.put(
            reverse(
                "activities:api-enrollment-confirm",
                args=["00000000-0000-0000-0000-000000000000"],
            ),
            HTTP_AUTHORIZATION=bearer_for(self.participant),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["code"], "activity_not_found")

    def test_unsupported_method_is_405_with_allow_header(self):
        response = self.client.post(
            reverse("activities:api-enrollment-confirm", args=[self.activity.id]),
            HTTP_AUTHORIZATION=bearer_for(self.participant),
        )

        self.assertEqual(response.status_code, 405)
        self.assertIn("Allow", response.headers)
        self.assertIn("PUT", response.headers["Allow"])
        self.assertIn("DELETE", response.headers["Allow"])
