from pathlib import Path
from datetime import timedelta
import environ


BASE_DIR = Path(__file__).resolve().parent.parent
env = environ.Env(DJANGO_DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR.parent / ".env")

TRACE_LOG_DIR = BASE_DIR / "logs"
TRACE_LOG_DIR.mkdir(exist_ok=True)
TRACE_LOG_FILE = TRACE_LOG_DIR / "trace.log"

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env("DJANGO_DEBUG")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "correlation",
    "activities",
    "accounts",
    "rest_framework_simplejwt.token_blacklist",
]

MIDDLEWARE = [
    "correlation.middleware.CorrelationMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB"),
        "USER": env("POSTGRES_USER"),
        "PASSWORD": env("POSTGRES_PASSWORD"),
        "HOST": env("POSTGRES_HOST"),
        "PORT": env("POSTGRES_PORT", default="5432"),
    }
}

AUTH_PASSWORD_VALIDATORS = []

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "trace": {
            "format": "%(message)s",
        },
    },
    "handlers": {
        "trace_console": {
            "class": "logging.StreamHandler",
            "formatter": "trace",
        },
        "trace_file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": str(TRACE_LOG_FILE),
            "formatter": "trace",
            "encoding": "utf-8",
            "maxBytes": 1_000_000,
            "backupCount": 3,
        },
    },
    "loggers": {
        "tuda.trace": {
            "handlers": ["trace_console", "trace_file"],
            "level": "INFO",
            "propagate": False,
        },
    },
}

LANGUAGE_CODE = "es-ar"
TIME_ZONE = "America/Argentina/Ushuaia"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "EXCEPTION_HANDLER": "accounts.errors.api_exception_handler",
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "TUDA Activities API",
    "DESCRIPTION": (
        "API para consultar actividades, participantes e inscripciones. "
        "Las operaciones bajo /me requieren JWT Bearer. Crear actividades requiere staff."
    ),
    "VERSION": "v1",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env.int("JWT_ACCESS_MINUTES", default=5)),
    "REFRESH_TOKEN_LIFETIME": timedelta(hours=env.int("JWT_REFRESH_HOURS", default=24)),
    "ROTATE_REFRESH_TOKENS": False,
    "BLACKLIST_AFTER_ROTATION": False,
    "SIGNING_KEY": env("JWT_SIGNING_KEY", default=SECRET_KEY),
}
AUTH_COOKIE_SECURE = env.bool("AUTH_COOKIE_SECURE", default=False)
CSRF_COOKIE_SECURE = AUTH_COOKIE_SECURE
CSRF_TRUSTED_ORIGINS = env.list("DJANGO_CSRF_TRUSTED_ORIGINS", default=[])
CSRF_FAILURE_VIEW = "accounts.errors.csrf_failure"
