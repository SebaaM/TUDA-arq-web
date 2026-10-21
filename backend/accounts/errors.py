from rest_framework.exceptions import AuthenticationFailed, NotAuthenticated
from rest_framework.response import Response
from rest_framework.views import exception_handler

from correlation.log import log_event


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None
    if isinstance(exc, NotAuthenticated):
        code, message = "authentication_required", "Se requiere una identidad de participante válida."
        log_event("participant_auth_checked", result="missing")
    elif isinstance(exc, AuthenticationFailed):
        code, message = "invalid_token", "Las credenciales no son válidas o vencieron."
    elif response.status_code == 403:
        code, message = "permission_denied", "No tenés permiso para realizar esta operación."
    elif response.status_code == 405:
        code, message = "method_not_allowed", "Método no permitido."
    else:
        code, message = "validation_error", "Los datos enviados no son válidos."
    response.data = {"code": code, "message": message}
    return response


def csrf_failure(request, reason=""):
    from django.http import JsonResponse

    return JsonResponse(
        {"code": "csrf_failed", "message": "No se pudo validar el origen de la solicitud."},
        status=403,
    )


def auth_error(code, message, status=401):
    response = Response({"code": code, "message": message}, status=status)
    if status == 401:
        response["WWW-Authenticate"] = "Bearer"
    response["Cache-Control"] = "no-store"
    return response
