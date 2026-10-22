import { useId } from "react";
import { ArrowRight, CornerDownLeft, Info } from "lucide-react";
import { Badge } from "@source/components/ui/badge";
import { Card, CardContent, CardHeader } from "@source/components/ui/card";
import {
  actors,
  type Actor,
  type AuthFlow,
} from "@source/features/auth-guide/content";

const positions: Record<Actor, number> = {
  browser: 160,
  django: 500,
  database: 840,
};
const actorLabels = Object.fromEntries(
  actors.map((actor) => [actor.id, actor.label]),
);

export function SequenceDiagram({
  flow,
  number,
}: {
  flow: AuthFlow;
  number: number;
}) {
  const markerId = useId();
  const height = 128 + flow.steps.length * 88;

  return (
    <Card>
      <CardHeader className="gap-3 border-b">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-mono">
            0{number}
          </Badge>
          <h3 className="text-lg font-semibold">{flow.title}</h3>
        </div>
        <p className="max-w-3xl leading-relaxed text-muted-foreground">
          {flow.description}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <figure aria-labelledby={`${flow.id}-caption`}>
          <figcaption
            id={`${flow.id}-caption`}
            className="mb-4 text-xs text-muted-foreground"
          >
            {flow.title}: leer de arriba hacia abajo. Flechas continuas: envío o
            acción; discontinuas: respuesta.
          </figcaption>
          <svg
            aria-hidden="true"
            viewBox={`0 0 1000 ${height}`}
            className="hidden w-full lg:block"
          >
            <defs>
              <marker
                id={markerId}
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
              </marker>
            </defs>
            {actors.map((actor) => (
              <g key={actor.id}>
                <line
                  x1={positions[actor.id]}
                  x2={positions[actor.id]}
                  y1="78"
                  y2={height - 24}
                  className="stroke-border"
                  strokeDasharray="4 6"
                />
                <rect
                  x={positions[actor.id] - 100}
                  y="4"
                  width="200"
                  height="66"
                  rx="10"
                  className="fill-muted/60 stroke-border"
                />
                <text
                  x={positions[actor.id]}
                  y="32"
                  textAnchor="middle"
                  className="fill-foreground text-[16px] font-semibold"
                >
                  {actor.label}
                </text>
                <text
                  x={positions[actor.id]}
                  y="53"
                  textAnchor="middle"
                  className="fill-muted-foreground text-[12px]"
                >
                  {actor.description}
                </text>
              </g>
            ))}
            {flow.steps.map((step, index) => {
              const y = 128 + index * 88;
              const from = positions[step.from];
              const to = positions[step.to];
              const self = from === to;
              const middle = self ? from + 62 : (from + to) / 2;
              const lineStart = from + (to > from ? 8 : -8);
              const lineEnd = to + (to > from ? -10 : 10);
              return (
                <g key={index}>
                  <circle cx="20" cy={y} r="12" className="fill-muted" />
                  <text
                    x="20"
                    y={y + 4}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[12px]"
                  >
                    {index + 1}
                  </text>
                  {self ? (
                    <path
                      d={`M ${from} ${y - 12} h 40 v 26 h -40`}
                      fill="none"
                      className="text-primary stroke-current"
                      strokeWidth="1.6"
                      markerEnd={`url(#${markerId})`}
                    />
                  ) : (
                    <line
                      x1={lineStart}
                      x2={lineEnd}
                      y1={y}
                      y2={y}
                      className={
                        step.response
                          ? "text-muted-foreground stroke-current"
                          : "text-primary stroke-current"
                      }
                      strokeWidth="1.6"
                      strokeDasharray={step.response ? "6 5" : undefined}
                      markerEnd={`url(#${markerId})`}
                    />
                  )}
                  <rect
                    x={self ? middle - 4 : middle - 157}
                    y={y - 30}
                    width="314"
                    height={self ? 57 : 23}
                    rx="5"
                    className="fill-card"
                  />
                  <text
                    x={middle}
                    y={y - 13}
                    textAnchor={self ? "start" : "middle"}
                    className="fill-foreground text-[14px] font-medium"
                  >
                    {step.label}
                  </text>
                  <text
                    x={middle}
                    y={y + 22}
                    textAnchor={self ? "start" : "middle"}
                    className="fill-muted-foreground text-[12px]"
                  >
                    {step.hint}
                  </text>
                </g>
              );
            })}
          </svg>
          <ol className="space-y-3 lg:sr-only">
            {flow.steps.map((step, index) => (
              <li
                key={index}
                className="flex gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:p-4"
              >
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-2">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{actorLabels[step.from]}</span>
                    {step.from === step.to ? (
                      <CornerDownLeft className="size-3" aria-hidden="true" />
                    ) : (
                      <ArrowRight className="size-3" aria-hidden="true" />
                    )}
                    <span className="sr-only">hacia</span>
                    <span>{actorLabels[step.to]}</span>
                  </p>
                  <p className="break-words text-sm font-medium">
                    {step.label}
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </figure>
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
          <Info
            className="mt-0.5 size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <p className="text-sm leading-relaxed text-muted-foreground">
            {flow.note}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
