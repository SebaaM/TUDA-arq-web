import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, CircleAlert, Plus, Users } from "lucide-react";

import {
  getActivities,
  getActivity,
  createActivity,
} from "@source/features/activities/api";
import type {
  Activity,
  CreateActivityPayload,
} from "@source/features/activities/types";
import { Badge } from "@source/components/ui/badge";
import { Button } from "@source/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@source/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@source/components/ui/dialog";
import { Input } from "@source/components/ui/input";
import { Label } from "@source/components/ui/label";
import { Skeleton } from "@source/components/ui/skeleton";
import { useAuth } from "@source/features/auth/useAuth";
import { EnrollmentPanel } from "@source/features/activities/EnrollmentPanel";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "full",
  timeStyle: "short",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function sortActivities(activities: Activity[]) {
  return [...activities].sort(
    (first, second) =>
      new Date(first.starts_at).getTime() -
      new Date(second.starts_at).getTime(),
  );
}

function getStatus(activity: Activity) {
  return activity.availability.available_slots > 0 ? "Disponible" : "Sin cupo";
}

type CreateActivityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (activity: Activity) => void;
};

function CreateActivityDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateActivityDialogProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [capacity, setCapacity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function reset() {
    setTitle("");
    setCategory("");
    setStartsAt("");
    setCapacity("");
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedCapacity = Number(capacity);

    if (
      !title.trim() ||
      !category.trim() ||
      !startsAt ||
      !Number.isInteger(parsedCapacity) ||
      parsedCapacity <= 0
    ) {
      setError(
        "Completá todos los campos y usá un cupo entero mayor que cero.",
      );
      return;
    }

    const payload: CreateActivityPayload = {
      title: title.trim(),
      category: category.trim(),
      starts_at: new Date(startsAt).toISOString(),
      capacity: parsedCapacity,
    };

    try {
      setIsSubmitting(true);
      setError(null);
      onCreated(await createActivity(payload));
      handleOpenChange(false);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "No se pudo crear la actividad.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear actividad</DialogTitle>
          <DialogDescription>
            Definí la información básica para publicar una nueva actividad.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-2">
            <Label htmlFor="activity-title">Nombre</Label>
            <Input
              id="activity-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="activity-category">Categoría</Label>
            <Input
              id="activity-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="activity-date">Fecha y hora</Label>
              <Input
                id="activity-date"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="activity-capacity">Cupo</Label>
              <Input
                id="activity-capacity"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                required
              />
            </div>
          </div>
          {error && (
            <p
              className="flex items-center gap-2 text-sm text-destructive"
              role="alert"
            >
              <CircleAlert className="size-4" aria-hidden="true" />
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creando…" : "Crear actividad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ActivityDetailDialogProps = {
  activityId: string;
  onChanged: () => void;
  onOpenChange: (open: boolean) => void;
};

function ActivityDetailDialog({
  activityId,
  onChanged,
  onOpenChange,
}: ActivityDetailDialogProps) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;

    getActivity(activityId)
      .then((result) => {
        if (isCurrent) setActivity(result);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "No se pudo cargar el detalle.",
          );
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [activityId]);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalle de actividad</DialogTitle>
          <DialogDescription>
            Información actualizada desde la API v2.
          </DialogDescription>
        </DialogHeader>
        {isLoading && <Skeleton className="h-32 w-full" />}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {activity && !isLoading && (
          <div className="grid gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Nombre</p>
              <p className="font-medium">{activity.title}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">Categoría</p>
                <p className="font-medium">{activity.category}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Estado</p>
                <Badge
                  variant={
                    activity.availability.available_slots > 0
                      ? "secondary"
                      : "destructive"
                  }
                >
                  {getStatus(activity)}
                </Badge>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground">Fecha</p>
              <p className="font-medium">{formatDate(activity.starts_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Cupo</p>
              <p className="font-medium">
                {activity.availability.available_slots} disponibles de{" "}
                {activity.availability.capacity}
              </p>
            </div>
          </div>
        )}
        {activity && (
          <EnrollmentPanel
            activities={[activity]}
            selectedActivity={activity}
            onChanged={onChanged}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ActivityCard({
  activity,
  onViewDetail,
}: {
  activity: Activity;
  onViewDetail: () => void;
}) {
  const hasAvailableSlots = activity.availability.available_slots > 0;

  return (
    <Card className="h-full shadow-sm transition-shadow hover:shadow-md">
      <CardHeader>
        <CardTitle>{activity.title}</CardTitle>
        <CardDescription>{activity.category}</CardDescription>
        <CardAction>
          <Badge variant={hasAvailableSlots ? "secondary" : "destructive"}>
            {getStatus(activity)}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm text-muted-foreground">
        <p className="flex gap-2">
          <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{formatDate(activity.starts_at)}</span>
        </p>
        <p className="flex gap-2">
          <Users className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {activity.availability.available_slots} cupos disponibles de{" "}
            {activity.availability.capacity}
          </span>
        </p>
      </CardContent>
      <CardFooter className="mt-auto justify-end">
        <Button variant="outline" onClick={onViewDetail}>
          Ver detalle
        </Button>
      </CardFooter>
    </Card>
  );
}

function ActivityCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent className="grid gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </CardContent>
      <CardFooter className="justify-end">
        <Skeleton className="h-8 w-24" />
      </CardFooter>
    </Card>
  );
}

export function ActivitiesPage() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(
    null,
  );
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    getActivities()
      .then((result) => setActivities(sortActivities(result)))
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudieron cargar las actividades.",
        );
      })
      .finally(() => setIsLoading(false));
  }, [revision]);

  function handleCreated(activity: Activity) {
    setActivities((currentActivities) =>
      sortActivities([...currentActivities, activity]),
    );
  }

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        <header className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
              Agenda abierta
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Próximas actividades
            </h1>
            <p className="text-muted-foreground">
              Consultá fechas, cupos y toda la información necesaria para
              participar.
            </p>
          </div>
          {user?.is_staff && (
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Crear actividad
            </Button>
          )}
        </header>

        {error && (
          <div
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        {isLoading && (
          <section
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Cargando actividades"
          >
            {[1, 2, 3].map((index) => (
              <ActivityCardSkeleton key={index} />
            ))}
          </section>
        )}

        {!isLoading && !error && activities.length === 0 && (
          <section className="rounded-xl border border-dashed bg-card p-8 text-center shadow-sm">
            <h2 className="font-medium">No hay actividades disponibles</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Las actividades publicadas aparecerán acá.
            </p>
          </section>
        )}

        {!isLoading && !error && activities.length > 0 && (
          <section
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Listado de actividades"
          >
            {activities.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                onViewDetail={() => setSelectedActivityId(activity.id)}
              />
            ))}
          </section>
        )}
        <div className="mt-10 rounded-xl border bg-card p-5">
          <EnrollmentPanel
            key={revision}
            activities={activities}
            onChanged={() => setRevision((value) => value + 1)}
          />
        </div>
      </div>

      {user?.is_staff && (
        <CreateActivityDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          onCreated={handleCreated}
        />
      )}
      {selectedActivityId && (
        <ActivityDetailDialog
          key={`${selectedActivityId}-${revision}`}
          activityId={selectedActivityId}
          onChanged={() => setRevision((value) => value + 1)}
          onOpenChange={(open) => {
            if (!open) setSelectedActivityId(null);
          }}
        />
      )}
    </main>
  );
}
