from rest_framework import serializers


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=1024)


class CurrentUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    is_staff = serializers.BooleanField()
    participant = serializers.SerializerMethodField()

    @staticmethod
    def get_participant(user):
        participant = getattr(user, "participant", None)
        return {"id": str(participant.id), "name": participant.name} if participant else None


class SessionSerializer(serializers.Serializer):
    access = serializers.CharField()
    user = CurrentUserSerializer()


class AuthErrorSerializer(serializers.Serializer):
    code = serializers.CharField()
    message = serializers.CharField()
