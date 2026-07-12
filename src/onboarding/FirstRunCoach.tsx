/* src/onboarding/FirstRunCoach.tsx
   First-run onboarding coach for Tellus. Remediates the P0 critique finding:
   a new user is dropped into a 3D world with no idea how to move or act.

   Self-contained: renders its own `.ds-scope` overlay so it can use the design
   system without restyling the existing HUD. Gated on a localStorage flag so it
   shows exactly once. Additive — the world stays interactive around the card. */

import React, { useEffect, useState } from "react";
import { MousePointer2, MoveDiagonal, Sparkles } from "lucide-react";
import { Button, Panel } from "../design-system";
import "./first-run-coach.css";

const SEEN_KEY = "tellus.onboarding.seen.v1";

function hasSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode / storage disabled — coach simply shows again next load */
  }
}

export interface FirstRunCoachProps {
  /** Force the coach open regardless of the localStorage flag (styleguide/demo). */
  forceOpen?: boolean;
  /** Delay before the card fades in, so the world has a moment to appear. Default 900ms. */
  delayMs?: number;
  /** Called when the coach is dismissed. */
  onDismiss?: () => void;
}

export function FirstRunCoach({
  forceOpen = false,
  delayMs = 900,
  onDismiss,
}: FirstRunCoachProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      return;
    }
    if (hasSeen()) {
      return;
    }
    const timer = window.setTimeout(() => setOpen(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [forceOpen, delayMs]);

  const dismiss = React.useCallback(() => {
    if (!forceOpen) {
      markSeen();
    }
    setOpen(false);
    onDismiss?.();
  }, [forceOpen, onDismiss]);

  // Esc dismisses; move focus to the primary action when the card appears.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        dismiss();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const focusTimer = window.setTimeout(
      () => document.getElementById("frc-start")?.focus(),
      60,
    );
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.clearTimeout(focusTimer);
    };
  }, [open, dismiss]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="ds-scope frc-overlay"
      role="dialog"
      aria-modal="false"
      aria-labelledby="frc-title"
      aria-describedby="frc-desc"
    >
      <Panel level="raised" glass className="frc-card">
        <div className="frc-head">
          <span className="frc-monogram" aria-hidden="true">
            T
          </span>
          <div>
            <h2 id="frc-title" className="frc-title">
              Welcome to Tellus
            </h2>
            <p id="frc-desc" className="frc-subtitle">
              A living world you can wander, shape, and build in. Three things to get you going:
            </p>
          </div>
        </div>

        <ul className="frc-steps">
          <li className="frc-step">
            <span className="frc-step__icon" aria-hidden="true">
              <MoveDiagonal size={20} />
            </span>
            <div>
              <span className="frc-step__title">Move</span>
              <span className="frc-step__body">
                Tap or click the ground to walk · drag to look · keyboard:{" "}
                <kbd className="frc-key">WASD</kbd>
                {" "}or arrows
              </span>
            </div>
          </li>
          <li className="frc-step">
            <span className="frc-step__icon frc-step__icon--gold" aria-hidden="true">
              <Sparkles size={20} />
            </span>
            <div>
              <span className="frc-step__title">Create</span>
              <span className="frc-step__body">
                Open <b>Create</b> and describe anything &mdash; &ldquo;a mossy standing stone&rdquo;
                &mdash; and watch it appear.
              </span>
            </div>
          </li>
          <li className="frc-step">
            <span className="frc-step__icon" aria-hidden="true">
              <MousePointer2 size={20} />
            </span>
            <div>
              <span className="frc-step__title">Explore</span>
              <span className="frc-step__body">
                Use <b>Map</b> and <b>Travel</b> to hop between worlds and portals.
              </span>
            </div>
          </li>
        </ul>

        <div className="frc-actions">
          <Button variant="ghost" onClick={dismiss}>
            Skip
          </Button>
          <Button
            id="frc-start"
            variant="primary"
            leadingIcon={<Sparkles size={16} />}
            onClick={dismiss}
          >
            Start exploring
          </Button>
        </div>
      </Panel>
    </div>
  );
}
