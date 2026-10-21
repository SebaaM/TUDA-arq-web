from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from activities.models import Participant


class AuthFlowTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("juan", password="test-password")
        Participant.objects.create(user=self.user, name="Juan")
        self.client = APIClient(enforce_csrf_checks=True)
        self.client.get("/api/auth/csrf/")
        self.csrf = self.client.cookies["csrftoken"].value

    def post(self, path, data=None, **extra):
        return self.client.post(
            f"/api/auth/{path}/", data or {}, format="json",
            HTTP_X_CSRFTOKEN=self.csrf, **extra,
        )

    def login(self):
        return self.post("login", {"username": "juan", "password": "test-password"})

    def test_login_cookie_and_public_user_shape(self):
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {"access", "user"})
        self.assertEqual(response.data["user"]["participant"]["name"], "Juan")
        self.assertFalse(response.data["user"]["is_staff"])
        cookie = response.cookies["refresh_token"]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Lax")
        self.assertEqual(cookie["path"], "/api/auth/")
        self.assertEqual(cookie["max-age"], 86400)
        self.assertFalse(cookie["domain"])
        self.assertEqual(response["Cache-Control"], "no-store")
        token = AccessToken(response.data["access"])
        self.assertEqual(token["exp"] - token["iat"], 300)
        me = self.client.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data, response.data["user"])

    def test_bad_credentials_do_not_emit_token(self):
        response = self.post("login", {"username": "juan", "password": "wrong"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["code"], "invalid_credentials")
        self.assertNotIn("refresh_token", response.cookies)

    def test_csrf_is_required_for_all_cookie_post_endpoints(self):
        for path in ("login", "refresh", "logout"):
            with self.subTest(path=path):
                response = self.client.post(f"/api/auth/{path}/", {}, format="json")
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json()["code"], "csrf_failed")

    def test_foreign_origin_rejected_even_with_csrf_token(self):
        response = self.post("login", {"username": "juan", "password": "test-password"}, HTTP_ORIGIN="http://evil.example")
        self.assertEqual(response.status_code, 403)

    @override_settings(CSRF_TRUSTED_ORIGINS=["http://localhost:5173"])
    def test_development_origin_accepted(self):
        response = self.post("login", {"username": "juan", "password": "test-password"}, HTTP_ORIGIN="http://localhost:5173")
        self.assertEqual(response.status_code, 200)

    def test_refresh_has_fixed_expiration_and_no_refresh_in_json(self):
        self.login()
        original = self.client.cookies["refresh_token"].value
        response = self.post("refresh")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("refresh", response.data)
        self.assertNotIn("refresh_token", response.cookies)
        self.assertEqual(self.client.cookies["refresh_token"].value, original)

    def test_logout_invalidates_refresh_but_not_already_issued_access(self):
        access = self.login().data["access"]
        original = self.client.cookies["refresh_token"].value
        response = self.post("logout")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.content, b"")
        self.assertEqual(response.cookies["refresh_token"]["max-age"], 0)
        self.client.cookies["refresh_token"] = original
        self.assertEqual(self.post("refresh").status_code, 401)
        self.assertEqual(self.client.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {access}").status_code, 200)
        self.assertEqual(self.post("logout").status_code, 204)
        expired = AccessToken(access)
        expired.set_exp(lifetime=timedelta(seconds=-1))
        self.assertEqual(self.client.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {expired}").status_code, 401)

    def test_missing_expired_and_malformed_refresh_rejected(self):
        self.assertEqual(self.post("refresh").status_code, 401)
        expired = RefreshToken.for_user(self.user)
        expired.set_exp(lifetime=timedelta(seconds=-1))
        for value in (str(expired), "malformed"):
            self.client.cookies["refresh_token"] = value
            self.assertEqual(self.post("refresh").status_code, 401)

    def test_logout_only_invalidates_current_session(self):
        self.login()
        another = RefreshToken.for_user(self.user)
        self.post("logout")
        self.client.cookies["refresh_token"] = str(another)
        self.assertEqual(self.post("refresh").status_code, 200)

    def test_inactive_user_cannot_login_or_refresh(self):
        self.login()
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self.post("refresh").status_code, 401)
        self.assertEqual(self.login().status_code, 401)

    def test_bad_access_cannot_access_me(self):
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)
        response = self.client.get("/api/auth/me/", HTTP_AUTHORIZATION="Bearer tampered")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(set(response.data), {"code", "message"})

    @override_settings(AUTH_COOKIE_SECURE=True)
    def test_secure_cookie_flag_is_preserved_when_deleted(self):
        self.assertTrue(self.login().cookies["refresh_token"]["secure"])
        response = self.post("logout")
        self.assertTrue(response.cookies["refresh_token"]["secure"])
        self.assertEqual(response.cookies["refresh_token"]["path"], "/api/auth/")
