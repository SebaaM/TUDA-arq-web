from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field


class ParticipantSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=1024)


class CurrentUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    is_staff = serializers.BooleanField()
    participant = serializers.SerializerMethodField()

    @staticmethod
    @extend_schema_field(ParticipantSummarySerializer(allow_null=True))
    def get_participant(user):
        participant = getattr(user, "participant", None)
        return {"id": str(participant.id), "name": participant.name} if participant else None


class SessionSerializer(serializers.Serializer):
    access = serializers.CharField()
    user = CurrentUserSerializer()


class AuthErrorSerializer(serializers.Serializer):
    code = serializers.CharField()
    message = serializers.CharField()


class AuthMessageSerializer(serializers.Serializer):
    message = serializers.CharField()
