from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularJSONAPIView, SpectacularSwaggerView

from activities.api_urls import urlpatterns_v1, urlpatterns_v2


class V1SpectacularJSONAPIView(SpectacularJSONAPIView):
    patterns = urlpatterns_v1


class V2SpectacularJSONAPIView(SpectacularJSONAPIView):
    patterns = urlpatterns_v2


urlpatterns = [
    path("api/auth/", include("accounts.urls")),
    path("admin/", admin.site.urls),
    path("", include("activities.urls")),
    path(
        "api/openapi.json",
        SpectacularJSONAPIView.as_view(),
        name="api-schema",
    ),
    path(
        "api/v1/openapi.json",
        V1SpectacularJSONAPIView.as_view(),
        name="api-schema-v1",
    ),
    path(
        "api/v2/openapi.json",
        V2SpectacularJSONAPIView.as_view(),
        name="api-schema-v2",
    ),
    path(
        "api/docs",
        SpectacularSwaggerView.as_view(url_name="api-schema"),
        name="api-docs",
    ),
]
