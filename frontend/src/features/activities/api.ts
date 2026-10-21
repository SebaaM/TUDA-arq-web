import type {
  Activity,
  CreateActivityPayload,
  Enrollment,
} from "@source/features/activities/types";
import { request } from "@source/lib/http";

export function getActivities(): Promise<Activity[]> {
  return request<Activity[]>("/api/v2/activities/");
}

export function getMyEnrollments(): Promise<Enrollment[]> {
  return request<Enrollment[]>("/api/v2/me/enrollments/", {}, true);
}

export function enroll(activityId: string): Promise<Enrollment> {
  return request<Enrollment>(
    `/api/v2/me/enrollments/${activityId}/`,
    { method: "PUT" },
    true,
  );
}

export function cancelEnrollment(activityId: string): Promise<void> {
  return request<void>(
    `/api/v2/me/enrollments/${activityId}/`,
    { method: "DELETE" },
    true,
  );
}

export function getActivity(activityId: string): Promise<Activity> {
  return request<Activity>(`/api/v2/activities/${activityId}/`);
}

export function createActivity(
  payload: CreateActivityPayload,
): Promise<Activity> {
  return request<Activity>(
    "/api/v2/activities/",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    true,
  );
}
