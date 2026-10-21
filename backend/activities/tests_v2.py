from datetime import datetime
from uuid import UUID

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from .models import Activity, Enrollment, Participant
from .test_helpers import bearer_for


def v2_url(name, *args):
    return reverse(f"activities:{name}", args=args)


class V2ActivityContractTests(TestCase):
    def setUp(self):
        self.activity = Activity.objects.create(
            id=UUID("1b470ddf-3e84-4b77-9aae-091d21e52bd6"),
            title="Taller de HTTP",
            category="Tecnología",
            starts_at=timezone.make_aware(datetime(2026, 4, 10, 18, 0)),
            capacity=20,
        )

    def test_v2_detail_nests_availability(self):
        response = self.client.get(v2_url("api-activity-detail-v2", self.activity.id))

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(
            set(body.keys()),
            {"id", "title", "category", "starts_at", "availability"},
        )
        self.assertNotIn("capacity", body)
        self.assertNotIn("available_slots", body)
        self.assertEqual(body["id"], str(self.activity.id))
        self.assertEqual(body["title"], "Taller de HTTP")
        self.assertEqual(body["category"], "Tecnología")
        self.assertEqual(body["starts_at"], "2026-04-10T18:00:00-03:00")
        self.assertEqual(body["availability"], {"capacity": 20, "available_slots": 20})

    def test_v2_list_uses_nested_availability(self):
        response = self.client.get(v2_url("api-activity-list-v2"))

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIsInstance(body, list)
        first = body[0]
        self.assertEqual(
            set(first.keys()),
            {"id", "title", "category", "starts_at", "availability"},
        )
        self.assertEqual(
            set(first["availability"].keys()), {"capacity", "available_slots"}
        )

    def test_v2_unknown_activity_uses_stable_error(self):
        response = self.client.get(
            v2_url("api-activity-detail-v2", "00000000-0000-0000-0000-000000000000")
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.json(),
            {
                "code": "activity_not_found",
                "message": "La actividad no existe.",
            },
        )


class V2EnrollmentIdempotencyTests(TestCase):
    def setUp(self):
        self.activity = Activity.objects.create(
            title="Taller de HTTP",
            starts_at=timezone.make_aware(datetime(2026, 4, 10, 18, 0)),
            capacity=20,
        )
        self.participant = Participant.objects.create(name="Juan García")

    def _put(self):
        return self.client.put(
            v2_url("api-enrollment-confirm-v2", self.activity.id),
            HTTP_AUTHORIZATION=bearer_for(self.participant),
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

    def test_delete_is_idempotent(self):
        self._put()

        first = self.client.delete(
            v2_url("api-enrollment-confirm-v2", self.activity.id),
            HTTP_AUTHORIZATION=bearer_for(self.participant),
        )
        self.assertEqual(first.status_code, 204)
        self.assertEqual(Enrollment.objects.filter(activity=self.activity).count(), 0)

        second = self.client.delete(
            v2_url("api-enrollment-confirm-v2", self.activity.id),
            HTTP_AUTHORIZATION=bearer_for(self.participant),
        )
        self.assertEqual(second.status_code, 204)
        self.assertEqual(Enrollment.objects.filter(activity=self.activity).count(), 0)


class V2ActivityCreationTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        user = get_user_model().objects.create_user(username="staff", is_staff=True)
        participant = Participant.objects.create(name="Staff", user=user)
        self.client.defaults["HTTP_AUTHORIZATION"] = bearer_for(participant)

    def test_post_creates_a_v2_activity(self):
        response = self.client.post(
            v2_url("api-activity-list-v2"),
            {
                "title": "Laboratorio de React",
                "category": "Frontend",
                "starts_at": "2026-05-12T18:30:00-03:00",
                "capacity": 18,
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["title"], "Laboratorio de React")
        self.assertEqual(body["category"], "Frontend")
        self.assertEqual(body["availability"], {"capacity": 18, "available_slots": 18})
        self.assertTrue(Activity.objects.filter(id=body["id"]).exists())

    def test_post_rejects_invalid_payload(self):
        response = self.client.post(
            v2_url("api-activity-list-v2"),
            {"title": "", "category": "", "capacity": 0},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(),
            {
                "code": "activity_validation_error",
                "message": "Los datos de la actividad no son válidos.",
            },
        )


class V2ErrorConsistencyTests(TestCase):
    def setUp(self):
        self.activity = Activity.objects.create(
            title="Taller de HTTP",
            starts_at=timezone.make_aware(datetime(2026, 4, 10, 18, 0)),
            capacity=1,
        )
        self.juan = Participant.objects.create(name="Juan García")
        self.maria = Participant.objects.create(name="María López")

    def test_missing_identity_is_401_with_stable_error(self):
        response = self.client.put(
            v2_url("api-enrollment-confirm-v2", self.activity.id),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(
            response.json(),
            {
                "code": "authentication_required",
                "message": "Se requiere una identidad de participante válida.",
            },
        )

    def test_capacity_exhausted_matches_v1_error(self):
        Enrollment.objects.create(activity=self.activity, participant=self.juan)

        v2_response = self.client.put(
            v2_url("api-enrollment-confirm-v2", self.activity.id),
            HTTP_AUTHORIZATION=bearer_for(self.maria),
            content_type="application/json",
        )
        v1_response = self.client.put(
            reverse("activities:api-enrollment-confirm", args=[self.activity.id]),
            HTTP_AUTHORIZATION=bearer_for(self.maria),
            content_type="application/json",
        )

        self.assertEqual(v2_response.status_code, 409)
        self.assertEqual(v1_response.status_code, 409)
        self.assertEqual(v2_response.json(), v1_response.json())
        self.assertEqual(
            v2_response.json(),
            {
                "code": "capacity_exhausted",
                "message": "No hay lugares disponibles.",
            },
        )

    def test_unknown_activity_error_equal_across_versions(self):
        unknown = "00000000-0000-0000-0000-000000000000"

        v1_response = self.client.get(
            reverse("activities:api-activity-detail", args=[unknown])
        )
        v2_response = self.client.get(v2_url("api-activity-detail-v2", unknown))

        self.assertEqual(v1_response.status_code, 404)
        self.assertEqual(v2_response.status_code, 404)
        self.assertEqual(v1_response.json(), v2_response.json())


class CoexistenceTests(TestCase):
    def setUp(self):
        self.activity = Activity.objects.create(
            id=UUID("1b470ddf-3e84-4b77-9aae-091d21e52bd6"),
            title="Taller de HTTP",
            starts_at=timezone.make_aware(datetime(2026, 4, 10, 18, 0)),
            capacity=20,
        )
        self.participant = Participant.objects.create(name="Juan García")

    def test_same_activity_responds_with_both_contracts(self):
        v1 = self.client.get(
            reverse("activities:api-activity-detail", args=[self.activity.id])
        ).json()
        v2 = self.client.get(
            v2_url("api-activity-detail-v2", self.activity.id)
        ).json()

        self.assertEqual(v1["id"], v2["id"])
        self.assertEqual(v1["title"], v2["title"])
        self.assertIn("capacity", v1)
        self.assertIn("available_slots", v1)
        self.assertEqual(set(v1.keys()), {"id", "title", "starts_at", "capacity", "available_slots"})
        self.assertEqual(
            set(v2.keys()),
            {"id", "title", "category", "starts_at", "availability"},
        )
        self.assertEqual(v2["category"], "General")
        self.assertEqual(
            v2["availability"],
            {"capacity": v1["capacity"], "available_slots": v1["available_slots"]},
        )

    def test_put_across_versions_is_idempotent(self):
        first = self.client.put(
            reverse(
                "activities:api-enrollment-confirm",
                args=[self.activity.id],
            ),
            HTTP_AUTHORIZATION=bearer_for(self.participant),
            content_type="application/json",
        )
        self.assertEqual(first.status_code, 201)

        repeated = self.client.put(
            v2_url("api-enrollment-confirm-v2", self.activity.id),
            HTTP_AUTHORIZATION=bearer_for(self.participant),
            content_type="application/json",
        )
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(repeated.json(), first.json())
        self.assertEqual(Enrollment.objects.filter(activity=self.activity).count(), 1)

    def test_delete_across_versions_reaches_same_final_state(self):
        self.client.put(
            v2_url("api-enrollment-confirm-v2", self.activity.id),
            HTTP_AUTHORIZATION=bearer_for(self.participant),
            content_type="application/json",
        )

        first = self.client.delete(
            reverse(
                "activities:api-enrollment-confirm",
                args=[self.activity.id],
            ),
            HTTP_AUTHORIZATION=bearer_for(self.participant),
        )
        self.assertEqual(first.status_code, 204)

        second = self.client.delete(
            v2_url("api-enrollment-confirm-v2", self.activity.id),
            HTTP_AUTHORIZATION=bearer_for(self.participant),
        )
        self.assertEqual(second.status_code, 204)
        self.assertEqual(Enrollment.objects.filter(activity=self.activity).count(), 0)


class OpenAPIContractTests(TestCase):
    def test_v1_schema_exposes_only_v1_paths_and_flat_activity(self):
        schema = self.client.get("/api/v1/openapi.json").json()

        paths = schema["paths"]
        self.assertIn("/api/v1/activities/", paths)
        self.assertIn("/api/v1/activities/{activity_id}/", paths)
        self.assertNotIn("/api/v2/activities/", paths)
        self.assertFalse(any(p.startswith("/api/v2/") for p in paths))

        activity = schema["components"]["schemas"]["Activity"]
        self.assertIn("capacity", activity["properties"])
        self.assertIn("available_slots", activity["properties"])
        self.assertNotIn("availability", activity["properties"])

    def test_v2_schema_exposes_only_v2_paths_and_nested_activity(self):
        schema = self.client.get("/api/v2/openapi.json").json()

        paths = schema["paths"]
        self.assertIn("/api/v2/activities/", paths)
        self.assertIn("/api/v2/activities/{activity_id}/", paths)
        self.assertIn("/api/v2/me/enrollments/", paths)
        self.assertNotIn("/api/v1/activities/", paths)
        self.assertFalse(any(p.startswith("/api/v1/") for p in paths))

        activity = schema["components"]["schemas"]["ActivityV2"]
        self.assertIn("availability", activity["properties"])
        self.assertIn("category", activity["properties"])
        self.assertNotIn("capacity", activity["properties"])
        self.assertNotIn("available_slots", activity["properties"])

        availability = schema["components"]["schemas"]["AvailabilityV2"]
        self.assertEqual(
            set(availability["properties"].keys()), {"capacity", "available_slots"}
        )

    def test_v1_and_v2_activity_schemas_differ_structurally(self):
        v1 = self.client.get("/api/v1/openapi.json").json()
        v2 = self.client.get("/api/v2/openapi.json").json()

        v1_activity = v1["components"]["schemas"]["Activity"]
        v2_activity = v2["components"]["schemas"]["ActivityV2"]

        self.assertIn("capacity", v1_activity["properties"])
        self.assertIn("available_slots", v1_activity["properties"])
        self.assertNotIn("availability", v1_activity["properties"])
        self.assertNotIn("capacity", v2_activity["properties"])
        self.assertIn("availability", v2_activity["properties"])
        self.assertIn("category", v2_activity["properties"])

    def test_combined_schema_contains_both_versions(self):
        schema = self.client.get("/api/openapi.json").json()

        paths = schema["paths"]
        self.assertIn("/api/v1/activities/", paths)
        self.assertIn("/api/v2/activities/", paths)
