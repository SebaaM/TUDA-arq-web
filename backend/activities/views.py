from django.core.exceptions import ValidationError
from django.shortcuts import render
from django.views.decorators.http import require_GET
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated

from correlation.log import log_event

from .models import Activity, Enrollment, Participant
from .serializers import (
    ActivitySerializer,
    ActivitySerializerV1,
    ActivityCreateV2Serializer,
    ActivityV2Serializer,
    EnrollmentSerializer,
    ErrorSerializer,
)
from .services import (
    ActivityNotFoundError,
    CapacityExhaustedError,
    activity_exists,
    create_or_get_enrollment,
    delete_enrollment_if_exists,
    get_activities_with_availability,
    get_activity_or_404,
)


ACTIVITY_ID_PARAMETER = OpenApiParameter(
    name="activity_id",
    type=OpenApiTypes.UUID,
    location=OpenApiParameter.PATH,
    required=True,
    description="Identificador único de la actividad.",
)
PARTICIPANT_ID_PARAMETER = OpenApiParameter(
    name="participant_id",
    type=OpenApiTypes.UUID,
    location=OpenApiParameter.PATH,
    required=True,
    description="Identificador único del participante.",
)

METHOD_NOT_ALLOWED = OpenApiResponse(description="Método no permitido.")
NO_CONTENT = OpenApiResponse(description="Inscripción cancelada.")


def error(code: str, message: str, http_status: int) -> Response:
    return Response({"code": code, "message": message}, status=http_status)


def authentication_error() -> Response:
    return error(
        "authentication_required",
        "Se requiere una identidad de participante válida.",
        status.HTTP_401_UNAUTHORIZED,
    )


def activity_not_found_error() -> Response:
    return error(
        "activity_not_found",
        "La actividad no existe.",
        status.HTTP_404_NOT_FOUND,
    )


def capacity_exhausted_error() -> Response:
    return error(
        "capacity_exhausted",
        "No hay lugares disponibles.",
        status.HTTP_409_CONFLICT,
    )


def activity_validation_error() -> Response:
    return error(
        "activity_validation_error",
        "Los datos de la actividad no son válidos.",
        status.HTTP_400_BAD_REQUEST,
    )


def participant_not_found_error() -> Response:
    return error(
        "participant_not_found",
        "El participante no existe.",
        status.HTTP_404_NOT_FOUND,
    )


def authenticate_participant(request):
    participant = getattr(request.user, "participant", None)
    if participant is None:
        log_event("participant_auth_checked", result="missing")
        return None, error(
            "participant_not_linked", "La cuenta no tiene un participante asociado.",
            status.HTTP_403_FORBIDDEN,
        )
    log_event("participant_auth_checked", result="ok")
    return participant, None


@require_GET
def activity_list(request):
    activities = Activity.objects.all()
    return render(
        request,
        "activities/activity_list.html",
        {"activities": activities},
    )


class ActivityListView(APIView):
    serializer_class = ActivitySerializerV1

    @extend_schema(
        operation_id="listActivities",
        summary="Listar actividades",
        description="Devuelve todas las actividades ordenadas por fecha de inicio, con cupos disponibles.",
        tags=["Activities"],
        responses={
            200: ActivitySerializerV1(many=True),
            405: METHOD_NOT_ALLOWED,
        },
    )
    def get(self, request):
        activities = get_activities_with_availability()
        return Response(self.serializer_class(activities, many=True).data)


class ActivityDetailView(APIView):
    serializer_class = ActivitySerializerV1

    @extend_schema(
        operation_id="getActivity",
        summary="Obtener una actividad",
        description="Recupera una actividad concreta a partir de su UUID.",
        tags=["Activities"],
        parameters=[ACTIVITY_ID_PARAMETER],
        responses={
            200: ActivitySerializerV1(),
            404: ErrorSerializer,
            405: METHOD_NOT_ALLOWED,
        },
    )
    def get(self, request, activity_id):
        try:
            activity = get_activity_or_404(activity_id)
        except ActivityNotFoundError:
            return activity_not_found_error()

        return Response(self.serializer_class(activity).data)


class ParticipantListView(APIView):
    @extend_schema(
        operation_id="listParticipants",
        summary="Listar participantes",
        tags=["Participants"],
        responses={
            200: ActivitySerializer(many=True),
            405: METHOD_NOT_ALLOWED,
        },
    )
    def get(self, request):
        return Response(
            [{"id": str(p.id), "name": p.name} for p in Participant.objects.all()]
        )


class ParticipantDetailView(APIView):
    @extend_schema(
        operation_id="getParticipant",
        summary="Obtener un participante",
        tags=["Participants"],
        parameters=[PARTICIPANT_ID_PARAMETER],
        responses={
            200: ActivitySerializer(),
            404: ErrorSerializer,
            405: METHOD_NOT_ALLOWED,
        },
    )
    def get(self, request, participant_id):
        try:
            participant = Participant.objects.get(id=participant_id)
        except (Participant.DoesNotExist, ValidationError, ValueError):
            return participant_not_found_error()
        return Response({"id": str(participant.id), "name": participant.name})


class EnrollmentListView(APIView):
    permission_classes = [IsAuthenticated]
    @extend_schema(
        operation_id="listMyEnrollments",
        summary="Listar mis inscripciones",
        description=(
            "Lista las inscripciones del participante autenticado mediante JWT."
        ),
        tags=["Enrollments"],
        responses={
            200: EnrollmentSerializer(many=True),
            401: ErrorSerializer,
            405: METHOD_NOT_ALLOWED,
        },
    )
    def get(self, request):
        participant, auth_error = authenticate_participant(request)
        if participant is None:
            return auth_error

        enrollments = Enrollment.objects.filter(participant=participant)
        return Response(EnrollmentSerializer(enrollments, many=True).data)


class ActivityEnrollmentView(APIView):
    permission_classes = [IsAuthenticated]
    @extend_schema(
        operation_id="putMyEnrollment",
        summary="Inscribirse en una actividad",
        description="Crea la inscripción (201) o devuelve la existente (200) si se repite.",
        tags=["Enrollments"],
        parameters=[ACTIVITY_ID_PARAMETER],
        request=None,
        responses={
            200: EnrollmentSerializer,
            201: EnrollmentSerializer,
            401: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
            405: METHOD_NOT_ALLOWED,
        },
    )
    def put(self, request, activity_id):
        participant, auth_error = authenticate_participant(request)
        if participant is None:
            return auth_error

        try:
            activity = get_activity_or_404(activity_id)
        except ActivityNotFoundError:
            return activity_not_found_error()

        try:
            enrollment, created = create_or_get_enrollment(activity, participant)
        except CapacityExhaustedError:
            return capacity_exhausted_error()

        return Response(
            EnrollmentSerializer(enrollment).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @extend_schema(
        operation_id="deleteMyEnrollment",
        summary="Cancelar mi inscripción",
        description="Elimina la inscripción (204). Una repetición también responde 204.",
        tags=["Enrollments"],
        parameters=[ACTIVITY_ID_PARAMETER],
        request=None,
        responses={
            204: NO_CONTENT,
            401: ErrorSerializer,
            404: ErrorSerializer,
            405: METHOD_NOT_ALLOWED,
        },
    )
    def delete(self, request, activity_id):
        participant, auth_error = authenticate_participant(request)
        if participant is None:
            return auth_error

        if not activity_exists(activity_id):
            return activity_not_found_error()

        delete_enrollment_if_exists(activity_id, participant)

        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    get=extend_schema(
        operation_id="listActivitiesV2",
        summary="Listar actividades (contrato v2)",
        description=(
            "Devuelve todas las actividades ordenadas por fecha de inicio. "
            "La disponibilidad viaja anidada en `availability`."
        ),
        tags=["Activities"],
        responses={
            200: ActivityV2Serializer(many=True),
            405: METHOD_NOT_ALLOWED,
        },
    ),
    post=extend_schema(
        operation_id="createActivityV2",
        summary="Crear una actividad (contrato v2)",
        description="Crea una actividad con nombre, categoría, fecha y capacidad.",
        tags=["Activities"],
        request=ActivityCreateV2Serializer,
        responses={
            201: ActivityV2Serializer,
            400: ErrorSerializer,
            405: METHOD_NOT_ALLOWED,
        },
    ),
)
class ActivityListViewV2(ActivityListView):
    serializer_class = ActivityV2Serializer

    def get_permissions(self):
        return [IsAdminUser()] if self.request.method == "POST" else [AllowAny()]

    def post(self, request):
        serializer = ActivityCreateV2Serializer(data=request.data)
        if not serializer.is_valid():
            return activity_validation_error()

        activity = serializer.save()
        return Response(
            ActivityV2Serializer(activity).data,
            status=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    get=extend_schema(
        operation_id="getActivityV2",
        summary="Obtener una actividad (contrato v2)",
        description="Recupera una actividad concreta a partir de su UUID.",
        tags=["Activities"],
        parameters=[ACTIVITY_ID_PARAMETER],
        responses={
            200: ActivityV2Serializer(),
            404: ErrorSerializer,
            405: METHOD_NOT_ALLOWED,
        },
    )
)
class ActivityDetailViewV2(ActivityDetailView):
    serializer_class = ActivityV2Serializer


@extend_schema_view(
    get=extend_schema(
        operation_id="listMyEnrollmentsV2",
        summary="Listar mis inscripciones (contrato v2)",
        description=(
            "Lista las inscripciones del participante autenticado mediante JWT."
        ),
        tags=["Enrollments"],
        responses={
            200: EnrollmentSerializer(many=True),
            401: ErrorSerializer,
            405: METHOD_NOT_ALLOWED,
        },
    )
)
class EnrollmentListViewV2(EnrollmentListView):
    pass


@extend_schema_view(
    put=extend_schema(
        operation_id="putMyEnrollmentV2",
        summary="Inscribirse en una actividad (contrato v2)",
        description="Crea la inscripción (201) o devuelve la existente (200) si se repite.",
        tags=["Enrollments"],
        parameters=[ACTIVITY_ID_PARAMETER],
        request=None,
        responses={
            200: EnrollmentSerializer,
            201: EnrollmentSerializer,
            401: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
            405: METHOD_NOT_ALLOWED,
        },
    ),
    delete=extend_schema(
        operation_id="deleteMyEnrollmentV2",
        summary="Cancelar mi inscripción (contrato v2)",
        description="Elimina la inscripción (204). Una repetición también responde 204.",
        tags=["Enrollments"],
        parameters=[ACTIVITY_ID_PARAMETER],
        request=None,
        responses={
            204: NO_CONTENT,
            401: ErrorSerializer,
            404: ErrorSerializer,
            405: METHOD_NOT_ALLOWED,
        },
    ),
)
class ActivityEnrollmentViewV2(ActivityEnrollmentView):
    pass
