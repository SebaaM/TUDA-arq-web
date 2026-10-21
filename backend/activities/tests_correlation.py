import json
import uuid
from datetime import datetime

from django.conf import settings
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from correlation.log import logger as trace_logger

from .models import Activity, Enrollment, Participant
from .test_helpers import bearer_for

CORRELATION_HEADER = "X-Correlation-ID"
STABLE_KEYS = {
    "timestamp",
    "level",
    "event",
    "correlation_id",
    "method",
    "path",
    "result",
}


def _v1_put_url(activity_id):
    return reverse("activities:api-enrollment-confirm", args=[activity_id])


def _v2_put_url(activity_id):
    return reverse("activities:api-enrollment-confirm-v2", args=[activity_id])


def _events(context):
    return [json.loads(record.getMessage()) for record in context.records]


class CorrelationHeaderContractTests(TestCase):
    def setUp(self):
        self.activity = Activity.objects.create(
            title="Taller de HTTP",
            starts_at=timezone.make_aware(datetime(2026, 4, 10, 18, 0)),
            capacity=20,
        )

    def _get(self, **headers):
        return self.client.get(
            reverse("activities:api-activity-list"),
            **headers,
        )

    def test_request_with_header_is_preserved_exactly(self):
        response = self.client.get(
            reverse("activities:api-activity-detail", args=[self.activity.id]),
            HTTP_X_CORRELATION_ID="demo-42",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response[CORRELATION_HEADER], "demo-42")

    def test_request_without_header_generates_a_uuid(self):
        response = self._get()

        value = response[CORRELATION_HEADER]
        self.assertIsInstance(uuid.UUID(value), uuid.UUID)

    def test_response_always_includes_effective_correlation_id(self):
        response = self._get()
        self.assertIn(CORRELATION_HEADER, response)

        with_header = self._get(HTTP_X_CORRELATION_ID="cliente-a")
        self.assertEqual(with_header[CORRELATION_HEADER], "cliente-a")

    def test_generated_correlation_id_is_echoed_in_logs(self):
        with self.assertLogs(trace_logger.name, level="INFO") as logs:
            response = self._get()

        response_id = response[CORRELATION_HEADER]
        events = _events(logs)
        self.assertEqual(
            {e["correlation_id"] for e in events},
            {response_id},
        )

    def test_log_events_follow_stable_schema(self):
        with self.assertLogs(trace_logger.name, level="INFO") as logs:
            self._get(HTTP_X_CORRELATION_ID="schema-1")

        events = _events(logs)
        self.assertTrue(events)
        for event in events:
            self.assertEqual(set(event.keys()) >= STABLE_KEYS, True)
            self.assertEqual(event["correlation_id"], "schema-1")
            self.assertEqual(event["method"], "GET")
            self.assertEqual(event["path"], "/api/v1/activities/")
            self.assertIn("level", event)
            self.assertIn("timestamp", event)


class CorrelationEnrollmentFlowTests(TestCase):
    def setUp(self):
        self.activity = Activity.objects.create(
            title="Taller de HTTP",
            starts_at=timezone.make_aware(datetime(2026, 4, 10, 18, 0)),
            capacity=20,
        )
        self.participant = Participant.objects.create(name="Juan García")

    def _put(self, url_name="activities:api-enrollment-confirm"):
        return self.client.put(
            reverse(url_name, args=[self.activity.id]),
            HTTP_AUTHORIZATION=bearer_for(self.participant),
            HTTP_X_CORRELATION_ID="demo-42",
            content_type="application/json",
        )

    def test_idempotent_flow_preserves_correlation_and_events(self):
        with self.assertLogs(trace_logger.name, level="INFO") as first_logs:
            first = self._put()
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first[CORRELATION_HEADER], "demo-42")

        first_events = {e["event"]: e for e in _events(first_logs)}
        self.assertEqual(first_events["request_received"]["correlation_id"], "demo-42")
        self.assertEqual(
            first_events["participant_auth_checked"]["result"], "ok"
        )
        self.assertEqual(first_events["activity_lookup"]["result"], "found")
        self.assertEqual(first_events["enrollment_created"]["result"], "created")
        self.assertEqual(first_events["request_completed"]["result"], "201")
        self.assertEqual(
            {e["correlation_id"] for e in _events(first_logs)},
            {"demo-42"},
        )

        with self.assertLogs(trace_logger.name, level="INFO") as second_logs:
            repeated = self._put()
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(repeated[CORRELATION_HEADER], "demo-42")
        self.assertEqual(repeated.json(), first.json())

        second_events = {e["event"]: e for e in _events(second_logs)}
        self.assertEqual(second_events["enrollment_reused"]["result"], "reused")
        self.assertEqual(second_events["request_completed"]["result"], "200")
        self.assertEqual(Enrollment.objects.filter(activity=self.activity).count(), 1)

    def test_cancel_flow_emits_enrollment_cancelled(self):
        self.client.put(
            _v1_put_url(self.activity.id),
            HTTP_AUTHORIZATION=bearer_for(self.participant),
            HTTP_X_CORRELATION_ID="demo-42",
            content_type="application/json",
        )

        with self.assertLogs(trace_logger.name, level="INFO") as logs:
            response = self.client.delete(
                _v1_put_url(self.activity.id),
                HTTP_AUTHORIZATION=bearer_for(self.participant),
                HTTP_X_CORRELATION_ID="demo-42",
            )

        self.assertEqual(response.status_code, 204)
        self.assertEqual(response[CORRELATION_HEADER], "demo-42")
        events = {e["event"]: e for e in _events(logs)}
        self.assertEqual(events["enrollment_cancelled"]["result"], "cancelled")
        self.assertEqual(events["request_completed"]["result"], "204")

    def test_capacity_409_keeps_correlation_in_response_and_logs(self):
        activity = Activity.objects.create(
            title="Taller sin cupos",
            starts_at=timezone.make_aware(datetime(2026, 4, 11, 18, 0)),
            capacity=1,
        )
        otra = Participant.objects.create(name="María López")
        Enrollment.objects.create(activity=activity, participant=self.participant)

        with self.assertLogs(trace_logger.name, level="INFO") as logs:
            response = self.client.put(
                _v1_put_url(activity.id),
                HTTP_AUTHORIZATION=bearer_for(otra),
                HTTP_X_CORRELATION_ID="cupo-409",
                content_type="application/json",
            )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response[CORRELATION_HEADER], "cupo-409")

        events = {e["event"]: e for e in _events(logs)}
        self.assertEqual(
            events["enrollment_rejected"]["result"], "capacity_exhausted"
        )
        self.assertEqual(events["request_completed"]["result"], "409")
        self.assertEqual(
            events["enrollment_rejected"]["correlation_id"], "cupo-409"
        )
        self.assertEqual(events["request_completed"]["correlation_id"], "cupo-409")

    def test_401_auth_missing_keeps_correlation(self):
        with self.assertLogs(trace_logger.name, level="INFO") as logs:
            response = self.client.put(
                _v1_put_url(self.activity.id),
                HTTP_X_CORRELATION_ID="sin-id",
                content_type="application/json",
            )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response[CORRELATION_HEADER], "sin-id")
        events = {e["event"]: e for e in _events(logs)}
        self.assertEqual(events["participant_auth_checked"]["result"], "missing")
        self.assertEqual(events["request_completed"]["result"], "401")
        self.assertEqual(
            events["participant_auth_checked"]["correlation_id"], "sin-id"
        )


class LogPersistenceContractTests(TestCase):
    def test_events_are_persisted_to_flat_file(self):
        correlation = "archivo-plano"

        self.client.get(
            reverse("activities:api-activity-list"),
            HTTP_X_CORRELATION_ID=correlation,
        )

        path = settings.TRACE_LOG_FILE
        self.assertTrue(path.exists())
        lines = path.read_text(encoding="utf-8").splitlines()

        relevant = []
        for line in lines:
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if record.get("correlation_id") == correlation:
                relevant.append(record)

        self.assertTrue(relevant)
        self.assertEqual(
            {record["event"] for record in relevant},
            {"request_received", "request_completed"},
        )
        for record in relevant:
            self.assertEqual(record["method"], "GET")
            self.assertEqual(record["path"], "/api/v1/activities/")

    def test_flat_file_never_logs_sensitive_headers(self):
        correlation = "archivo-limpio"

        self.client.get(
            reverse("activities:api-activity-list"),
            HTTP_X_CORRELATION_ID=correlation,
            HTTP_AUTHORIZATION="Bearer token-secreto",
            HTTP_COOKIE="sessionid=secreto",
        )

        lines = settings.TRACE_LOG_FILE.read_text(encoding="utf-8").splitlines()
        relevant = [l for l in lines if correlation in l]
        self.assertTrue(relevant)
        self.assertNotIn("token-secreto", "\n".join(relevant))
        self.assertNotIn("sessionid", "\n".join(relevant))


class CorrelationV2ContractTests(TestCase):
    def setUp(self):
        self.activity = Activity.objects.create(
            title="Taller de HTTP",
            starts_at=timezone.make_aware(datetime(2026, 4, 10, 18, 0)),
            capacity=20,
        )
        self.participant = Participant.objects.create(name="Juan García")

    def test_v2_flow_echoes_header_and_reuses_events(self):
        with self.assertLogs(trace_logger.name, level="INFO") as logs:
            response = self.client.put(
                _v2_put_url(self.activity.id),
                HTTP_AUTHORIZATION=bearer_for(self.participant),
                HTTP_X_CORRELATION_ID="v2-demo",
                content_type="application/json",
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response[CORRELATION_HEADER], "v2-demo")

        events = {e["event"]: e for e in _events(logs)}
        self.assertTrue(
            events["request_received"]["path"].startswith("/api/v2/me/enrollments/")
        )
        self.assertEqual(events["enrollment_created"]["correlation_id"], "v2-demo")
        self.assertEqual(events["request_completed"]["result"], "201")
