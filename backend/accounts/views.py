from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.utils.decorators import method_decorator
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .errors import auth_error
from .serializers import AuthErrorSerializer, CurrentUserSerializer, LoginSerializer, SessionSerializer


@ensure_csrf_cookie
def csrf_cookie(request):
    response = JsonResponse({"message": "CSRF preparado."})
    response["Cache-Control"] = "no-store"
    return response


def session_response(user, refresh):
    response = Response({"access": str(refresh.access_token), "user": CurrentUserSerializer(user).data})
    response["Cache-Control"] = "no-store"
    return response


def clear_refresh(response):
    response.delete_cookie("refresh_token", path="/api/auth/", samesite="Lax")
    # Keep identical scope and transport attributes when expiring the cookie.
    response.cookies["refresh_token"]["httponly"] = True
    response.cookies["refresh_token"]["secure"] = settings.AUTH_COOKIE_SECURE
    response["Cache-Control"] = "no-store"
    return response


@method_decorator(csrf_protect, name="dispatch")
class CookieAuthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]


class LoginView(CookieAuthView):
    @extend_schema(request=LoginSerializer, responses={200: SessionSerializer, 401: AuthErrorSerializer}, tags=["Auth"])
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(request=request, **serializer.validated_data)
        if user is None:
            return auth_error("invalid_credentials", "Usuario o contraseña incorrectos.")
        # If this browser already has a session, invalidate its previous refresh.
        previous = request.COOKIES.get("refresh_token")
        if previous:
            try:
                RefreshToken(previous).blacklist()
            except TokenError:
                pass
        refresh = RefreshToken.for_user(user)
        response = session_response(user, refresh)
        response.set_cookie(
            "refresh_token", str(refresh),
            max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
            path="/api/auth/", httponly=True, secure=settings.AUTH_COOKIE_SECURE, samesite="Lax",
        )
        return response


class RefreshView(CookieAuthView):
    @extend_schema(request=None, responses={200: SessionSerializer, 401: AuthErrorSerializer}, tags=["Auth"])
    def post(self, request):
        try:
            refresh = RefreshToken(request.COOKIES.get("refresh_token", ""))
            user = get_user_model().objects.get(pk=refresh["user_id"], is_active=True)
        except (TokenError, get_user_model().DoesNotExist, KeyError, ValueError, TypeError):
            return clear_refresh(auth_error("refresh_invalid", "La sesión venció o fue invalidada."))
        # No rotation: the refresh and its original expiration stay unchanged.
        return session_response(user, refresh)


class LogoutView(CookieAuthView):
    @extend_schema(request=None, responses={204: None}, tags=["Auth"])
    def post(self, request):
        try:
            RefreshToken(request.COOKIES.get("refresh_token", "")).blacklist()
        except TokenError:
            pass
        return clear_refresh(Response(status=204))


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=CurrentUserSerializer, tags=["Auth"])
    def get(self, request):
        response = Response(CurrentUserSerializer(request.user).data)
        response["Cache-Control"] = "no-store"
        return response
