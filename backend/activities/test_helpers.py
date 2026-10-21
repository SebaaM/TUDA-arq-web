from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken


def bearer_for(participant):
    if participant.user_id is None:
        participant.user = get_user_model().objects.create_user(username=str(participant.pk))
        participant.save(update_fields=["user"])
    return f"Bearer {AccessToken.for_user(participant.user)}"
