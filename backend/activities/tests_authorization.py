from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest import skipUnless

from django.contrib.auth import get_user_model
from django.db import close_old_connections, connection
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from .models import Activity, Enrollment, Participant
from .test_helpers import bearer_for


class AuthorizationTests(TestCase):
    def setUp(self):
        self.activity = Activity.objects.create(title="Test", starts_at=timezone.now(), capacity=2)
        self.a = Participant.objects.create(name="A")
        self.b = Participant.objects.create(name="B")
        self.token = bearer_for(self.a)

    def test_foreign_ids_never_select_participant_in_either_version(self):
        for version in ("v1", "v2"):
            path = f"/api/{version}/me/enrollments/{self.activity.pk}/"
            foreign_count = Enrollment.objects.filter(participant=self.b).count()
            response = self.client.put(
                f"{path}?participant_id={self.b.pk}", {"participant_id": str(self.b.pk)},
                content_type="application/json", HTTP_AUTHORIZATION=self.token,
                HTTP_X_PARTICIPANT_ID=str(self.b.pk),
            )
            self.assertIn(response.status_code, (200, 201))
            self.assertEqual(Enrollment.objects.filter(participant=self.b).count(), foreign_count)
            Enrollment.objects.get_or_create(activity=self.activity, participant=self.b)
            response = self.client.get(f"/api/{version}/me/enrollments/", HTTP_AUTHORIZATION=self.token)
            self.assertEqual(len(response.json()), 1)
            self.client.delete(path, HTTP_AUTHORIZATION=self.token, HTTP_X_PARTICIPANT_ID=str(self.b.pk))
            self.assertTrue(Enrollment.objects.filter(participant=self.b).exists())

    def test_header_alone_does_not_authenticate(self):
        for version in ("v1", "v2"):
            response = self.client.put(
                f"/api/{version}/me/enrollments/{self.activity.pk}/",
                HTTP_X_PARTICIPANT_ID=str(self.a.pk),
            )
            self.assertEqual(response.status_code, 401)
        self.assertFalse(Enrollment.objects.exists())

    def test_account_without_participant_is_forbidden(self):
        user = get_user_model().objects.create_user(username="unlinked")
        response = self.client.get("/api/v2/me/enrollments/", HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "participant_not_linked")

    def test_only_staff_can_create_activities(self):
        payload = {"title": "New", "category": "Test", "starts_at": timezone.now().isoformat(), "capacity": 3}
        url = "/api/v2/activities/"
        self.assertEqual(self.client.post(url, payload, content_type="application/json").status_code, 401)
        self.assertEqual(self.client.post(url, payload, content_type="application/json", HTTP_AUTHORIZATION=self.token).status_code, 403)
        self.a.user.is_staff = True
        self.a.user.save()
        self.assertEqual(self.client.post(url, payload, content_type="application/json", HTTP_AUTHORIZATION=self.token).status_code, 201)

    def test_expired_token_cannot_change_data(self):
        token = AccessToken.for_user(self.a.user)
        token.set_exp(lifetime=timedelta(seconds=-1))
        response = self.client.put(f"/api/v2/me/enrollments/{self.activity.pk}/", HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(response.status_code, 401)
        self.assertFalse(Enrollment.objects.exists())

    def test_openapi_declares_bearer_and_no_demo_header(self):
        schema = self.client.get("/api/openapi.json").json()
        for version in ("v1", "v2"):
            operation = schema["paths"][f"/api/{version}/me/enrollments/{{activity_id}}/"]["put"]
            self.assertEqual(operation["security"], [{"jwtAuth": []}])
            self.assertFalse(any(parameter["name"] == "X-Participant-ID" for parameter in operation.get("parameters", [])))


@skipUnless(connection.vendor == "postgresql", "La concurrencia requiere PostgreSQL real")
class ConcurrentCapacityTests(TransactionTestCase):
    def setUp(self):
        self.activity = Activity.objects.create(title="Último cupo", starts_at=timezone.now(), capacity=1)
        self.a = Participant.objects.create(name="A")
        self.b = Participant.objects.create(name="B")

    def requests_in_parallel(self, tokens):
        barrier = Barrier(2)
        path = f"/api/v2/me/enrollments/{self.activity.pk}/"

        def put(token):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return APIClient().put(path, HTTP_AUTHORIZATION=token).status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            return sorted(executor.map(put, tokens))

    def test_two_participants_cannot_take_same_last_slot(self):
        self.assertEqual(self.requests_in_parallel([bearer_for(self.a), bearer_for(self.b)]), [201, 409])
        self.assertEqual(Enrollment.objects.count(), 1)

    def test_concurrent_repeat_creates_only_one_row(self):
        token = bearer_for(self.a)
        self.assertEqual(self.requests_in_parallel([token, token]), [200, 201])
        self.assertEqual(Enrollment.objects.count(), 1)
