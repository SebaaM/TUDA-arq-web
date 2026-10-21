from django.urls import path

from .views import LoginView, LogoutView, MeView, RefreshView, csrf_cookie

urlpatterns = [
    path("csrf/", csrf_cookie, name="auth-csrf"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
]
