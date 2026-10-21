"""Prueba de integración por Nginx con datos temporales; nunca imprime JWT."""
import argparse
import json
import os
import sys
from datetime import timedelta
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener
from uuid import uuid4

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django

django.setup()

from activities.models import Activity
from rest_framework_simplejwt.tokens import AccessToken


class Client:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.cookies = CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(self.cookies))
        self.access = None

    def call(self, method, path, data=None, authenticated=False, csrf=False, extra=None):
        headers = {"Content-Type": "application/json", "Host": "localhost", **(extra or {})}
        if authenticated:
            headers["Authorization"] = f"Bearer {self.access}"
        if csrf:
            self.call("GET", "/api/auth/csrf/")
            headers["X-CSRFToken"] = next(c.value for c in self.cookies if c.name == "csrftoken")
        request = Request(self.base + path, headers=headers, method=method,
                          data=json.dumps(data).encode() if data is not None else None)
        try:
            response = self.opener.open(request, timeout=15)
        except HTTPError as error:
            response = error
        body = response.read()
        return response.status, json.loads(body) if body else None, response.headers

    def login(self, username):
        status, body, headers = self.call("POST", "/api/auth/login/", {
            "username": username, "password": "Evaluacion2026!",
        }, csrf=True)
        assert status == 200, f"Login {username}: {status}"
        assert set(body) == {"access", "user"}
        assert "HttpOnly" in headers["Set-Cookie"]
        assert headers["Cache-Control"] == "no-store"
        self.access = body["access"]
        return body["user"]


def main(base):
    staff, juan, maria = (Client(base) for _ in range(3))
    activity_id = None
    try:
        assert staff.call("GET", "/api/v2/activities/")[0] == 200
        assert juan.call("GET", "/api/v2/me/enrollments/")[0] == 401
        assert juan.call("POST", "/api/auth/login/", {})[0] == 403
        assert juan.call("POST", "/api/auth/login/", {"username": "juan", "password": "incorrecta"}, csrf=True)[0] == 401
        staff.login("docente")
        juan.login("juan")
        foreign = maria.login("maria")["participant"]["id"]
        payload = {"title": f"HTTP smoke {uuid4()}", "category": "Evaluación", "starts_at": "2026-12-01T18:00:00-03:00", "capacity": 1}
        assert juan.call("POST", "/api/v2/activities/", payload, authenticated=True)[0] == 403
        status, created, _ = staff.call("POST", "/api/v2/activities/", payload, authenticated=True)
        assert status == 201
        activity_id = created["id"]
        path = f"/api/v2/me/enrollments/{activity_id}/"
        status, first, headers = juan.call("PUT", path, authenticated=True,
            extra={"X-Participant-ID": foreign, "X-Correlation-ID": "hito2-http-smoke"})
        assert status == 201
        assert headers["X-Correlation-ID"] == "hito2-http-smoke"
        status, repeated, _ = juan.call("PUT", path.replace("v2", "v1"), authenticated=True)
        assert status == 200 and repeated == first
        assert maria.call("GET", "/api/v2/me/enrollments/", authenticated=True)[1] is not None
        assert not any(item["activity_id"] == activity_id for item in maria.call("GET", "/api/v2/me/enrollments/", authenticated=True)[1])
        assert maria.call("PUT", path, authenticated=True)[0] == 409
        assert juan.call("DELETE", path, authenticated=True)[:2] == (204, None)
        assert juan.call("DELETE", path, authenticated=True)[:2] == (204, None)
        assert maria.call("PUT", path, authenticated=True)[0] == 201
        assert juan.call("POST", "/api/auth/refresh/", csrf=True)[0] == 200
        assert juan.call("POST", "/api/auth/logout/", csrf=True)[0] == 204
        assert juan.call("POST", "/api/auth/refresh/", csrf=True)[0] == 401
        assert juan.call("GET", "/api/auth/me/", authenticated=True)[0] == 200
        expired = AccessToken(juan.access)
        expired.set_exp(lifetime=timedelta(seconds=-1))
        juan.access = str(expired)
        assert juan.call("GET", "/api/auth/me/", authenticated=True)[0] == 401
        print("OK HTTP: Nginx, CSRF, login, staff, identidad, cupo, idempotencia, refresh, logout y expiración.")
    finally:
        for client in (staff, juan, maria):
            client.call("POST", "/api/auth/logout/", csrf=True)
        if activity_id:
            Activity.objects.filter(pk=activity_id).delete()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://nginx")
    main(parser.parse_args().base_url)
