import { useEffect, useState } from "react";
import { Button } from "@source/components/ui/button";
import {
  enroll,
  cancelEnrollment,
  getMyEnrollments,
} from "@source/features/activities/api";
import type { Activity, Enrollment } from "@source/features/activities/types";
import { useAuth } from "@source/features/auth/useAuth";

export function EnrollmentPanel({
  activities,
  selectedActivity,
  onChanged,
}: {
  activities: Activity[];
  selectedActivity?: Activity;
  onChanged: () => void;
}) {
  const { user, status } = useAuth();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getMyEnrollments()
      .then((items) => {
        if (active) setEnrollments(items);
      })
      .catch((failure: unknown) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "No se pudieron cargar tus inscripciones.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  async function change(activityId: string, cancel: boolean) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (cancel) await cancelEnrollment(activityId);
      else await enroll(activityId);
      onChanged();
      setEnrollments(await getMyEnrollments());
      setNotice(cancel ? "Inscripción cancelada." : "Inscripción confirmada.");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "No se pudo actualizar la inscripción.",
      );
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking") return <p role="status">Comprobando sesión…</p>;
  if (!user)
    return (
      <p className="text-sm text-muted-foreground">
        Iniciá sesión desde la barra superior para ver tus inscripciones y
        participar.
      </p>
    );
  const enrolled =
    selectedActivity &&
    enrollments.some((item) => item.activity_id === selectedActivity.id);

  return (
    <section
      className="grid gap-3"
      aria-label={
        selectedActivity ? "Inscripción a la actividad" : "Mis inscripciones"
      }
    >
      {!selectedActivity && (
        <h2 className="text-xl font-semibold">Mis inscripciones</h2>
      )}
      {loading && <p role="status">Cargando inscripciones…</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {selectedActivity ? (
        <Button
          disabled={
            busy ||
            loading ||
            (!enrolled && selectedActivity.availability.available_slots <= 0)
          }
          variant={enrolled ? "outline" : "default"}
          onClick={() => void change(selectedActivity.id, Boolean(enrolled))}
        >
          {busy
            ? "Actualizando…"
            : enrolled
              ? "Cancelar inscripción"
              : "Inscribirme"}
        </Button>
      ) : (
        !loading &&
        (enrollments.length ? (
          <ul className="grid gap-3">
            {enrollments.map((item) => (
              <li
                key={item.activity_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <span>
                  {activities.find(
                    (activity) => activity.id === item.activity_id,
                  )?.title ?? "Actividad inscrita"}
                </span>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void change(item.activity_id, true)}
                >
                  Cancelar inscripción
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Todavía no tenés inscripciones.
          </p>
        ))
      )}
    </section>
  );
}
