from typing import Optional, Tuple

from django.core.exceptions import ValidationError
from django.db.models import Count
from django.db import transaction

from correlation.log import log_event

from .models import Activity, Enrollment, Participant


class ActivityNotFoundError(Exception):
    pass


class CapacityExhaustedError(Exception):
    pass


def get_activities_with_availability():
    return Activity.objects.annotate(
        enrolled_count=Count("enrollment")
    ).order_by("starts_at")


def get_activity_or_404(activity_id) -> Activity:
    try:
        activity = Activity.objects.annotate(
            enrolled_count=Count("enrollment")
        ).get(id=activity_id)
    except (Activity.DoesNotExist, ValidationError, ValueError):
        log_event(
            "activity_lookup",
            result="not_found",
            activity_id=str(activity_id),
        )
        raise ActivityNotFoundError() from None

    log_event(
        "activity_lookup",
        result="found",
        activity_id=str(activity.id),
    )
    return activity


def activity_exists(activity_id) -> bool:
    return Activity.objects.filter(id=activity_id).exists()


@transaction.atomic
def create_or_get_enrollment(
    activity, participant
) -> Tuple[Enrollment, bool]:
    activity = Activity.objects.select_for_update().get(pk=activity.pk)
    enrollment = Enrollment.objects.filter(
        activity=activity, participant=participant
    ).first()

    if enrollment is not None:
        log_event(
            "enrollment_reused",
            result="reused",
            activity_id=str(activity.id),
            participant_id=str(participant.id),
        )
        return enrollment, False

    if Enrollment.objects.filter(activity=activity).count() >= activity.capacity:
        log_event(
            "enrollment_rejected",
            result="capacity_exhausted",
            activity_id=str(activity.id),
            participant_id=str(participant.id),
        )
        raise CapacityExhaustedError()

    enrollment = Enrollment.objects.create(activity=activity, participant=participant)
    log_event(
        "enrollment_created",
        result="created",
        activity_id=str(activity.id),
        participant_id=str(participant.id),
    )
    return enrollment, True


@transaction.atomic
def delete_enrollment_if_exists(activity_id, participant) -> None:
    Activity.objects.select_for_update().get(pk=activity_id)
    deleted_count, _ = Enrollment.objects.filter(
        activity=activity_id, participant=participant
    ).delete()
    log_event(
        "enrollment_cancelled",
        result="cancelled" if deleted_count else "not_enrolled",
        activity_id=str(activity_id),
        participant_id=str(participant.id),
    )
