from rest_framework import serializers

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field

from .models import Activity, Enrollment, Participant


class LocalDateTimeField(serializers.DateTimeField):
    def to_representation(self, value):
        if value is None:
            return None
        return timezone.localtime(value).isoformat()


class ActivitySerializer(serializers.ModelSerializer):
    starts_at = LocalDateTimeField()
    available_slots = serializers.SerializerMethodField(
        help_text="Cupos disponibles según las inscripciones persistidas."
    )

    class Meta:
        model = Activity
        fields = ("id", "title", "starts_at", "capacity", "available_slots")

    def get_available_slots(self, activity) -> int:
        enrolled_count = getattr(activity, "enrolled_count", None)
        if enrolled_count is None:
            enrolled_count = Enrollment.objects.filter(activity=activity).count()
        return activity.capacity - enrolled_count


ActivitySerializerV1 = ActivitySerializer


class AvailabilityV2Serializer(serializers.Serializer):
    capacity = serializers.IntegerField(help_text="Lugar total de la actividad.")
    available_slots = serializers.IntegerField(
        help_text="Cupos disponibles según las inscripciones persistidas."
    )


class ActivityV2Serializer(serializers.ModelSerializer):
    starts_at = LocalDateTimeField()
    availability = serializers.SerializerMethodField(
        help_text="Disponibilidad de cupos anidada en el contrato v2."
    )

    class Meta:
        model = Activity
        fields = ("id", "title", "category", "starts_at", "availability")

    @extend_schema_field(AvailabilityV2Serializer)
    def get_availability(self, activity) -> dict:
        enrolled_count = getattr(activity, "enrolled_count", None)
        if enrolled_count is None:
            enrolled_count = Enrollment.objects.filter(activity=activity).count()
        return AvailabilityV2Serializer(
            {
                "capacity": activity.capacity,
                "available_slots": activity.capacity - enrolled_count,
            }
        ).data


class ActivityCreateV2Serializer(serializers.ModelSerializer):
    starts_at = LocalDateTimeField()
    category = serializers.CharField(max_length=80)

    class Meta:
        model = Activity
        fields = ("title", "category", "starts_at", "capacity")


class EnrollmentSerializer(serializers.ModelSerializer):
    activity_id = serializers.UUIDField(source="activity.id", read_only=True)
    enrolled_at = LocalDateTimeField()

    class Meta:
        model = Enrollment
        fields = ("activity_id", "enrolled_at")


class ErrorSerializer(serializers.Serializer):
    code = serializers.CharField()
    message = serializers.CharField()


class ParticipantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Participant
        fields = ("id", "name")
