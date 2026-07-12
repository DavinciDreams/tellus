import React from "react";
import type { ReactNode } from "react";
import { Button } from "./Button";

export type GenerationCardStatus = "generating" | "ready" | "failed";

export interface GenerationCardProps {
  prompt: string;
  status: GenerationCardStatus;
  variants?: ReactNode;
  onPlace?: () => void;
  onRetry?: () => void;
  onDiscard?: () => void;
  className?: string;
}

export function GenerationCard({
  prompt,
  status,
  variants,
  onPlace,
  onRetry,
  onDiscard,
  className,
}: GenerationCardProps) {
  const rootClassName = [
    "ds-gencard",
    `ds-gencard--${status}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={rootClassName}>
      <p className="ds-gencard__prompt">
        <span aria-hidden="true">“</span>
        {prompt}
        <span aria-hidden="true">”</span>
      </p>

      <div className="ds-gencard__stage">
        {status === "generating" ? (
          <>
            <div className="ds-gencard__bloom" aria-hidden="true">
              <span className="ds-gencard__bloom-ring" />
              <span className="ds-gencard__bloom-ring" />
              <span className="ds-gencard__bloom-ring" />
              <span className="ds-gencard__bloom-core" />
            </div>
            <p className="ds-gencard__status" aria-live="polite">
              Generating…
            </p>
          </>
        ) : null}

        {status === "ready" ? (
          <div className="ds-gencard__variants">
            {variants ?? (
              <p className="ds-gencard__status">Your creation is ready.</p>
            )}
          </div>
        ) : null}

        {status === "failed" ? (
          <p className="ds-gencard__error" role="alert">
            Couldn't create that — try again
          </p>
        ) : null}
      </div>

      {status === "ready" ? (
        <div className="ds-gencard__actions">
          <Button variant="primary" onClick={onPlace}>
            Place
          </Button>
          <Button variant="ghost" onClick={onDiscard}>
            Discard
          </Button>
        </div>
      ) : null}

      {status === "failed" ? (
        <div className="ds-gencard__actions">
          <Button variant="primary" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}
    </article>
  );
}
