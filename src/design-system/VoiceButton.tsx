import React from "react";
import { Mic, MicOff } from "lucide-react";

export type VoiceButtonState = "idle" | "listening" | "muted";

export interface VoiceButtonProps {
  state: "idle" | "listening" | "muted";
  onToggle: () => void;
  label?: boolean;
  className?: string;
}

const ARIA_LABEL: Record<VoiceButtonState, string> = {
  idle: "Start talking",
  listening: "Listening — tap to stop",
  muted: "Unmute microphone",
};

const CAPTION: Record<VoiceButtonState, string> = {
  idle: "Idle",
  listening: "Listening",
  muted: "Muted",
};

export function VoiceButton({
  state,
  onToggle,
  label = false,
  className,
}: VoiceButtonProps): React.JSX.Element {
  const buttonClassName = [
    "ds-voice",
    `ds-voice--${state}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const Icon = state === "muted" ? MicOff : Mic;

  return (
    <button
      type="button"
      className={buttonClassName}
      onClick={onToggle}
      aria-pressed={state === "listening"}
      aria-label={ARIA_LABEL[state]}
    >
      {state === "listening" ? (
        <span className="ds-voice__ring" aria-hidden="true" />
      ) : null}
      <span className="ds-voice__icon" aria-hidden="true">
        <Icon aria-hidden />
      </span>
      {label ? (
        <span className="ds-voice__label">{CAPTION[state]}</span>
      ) : null}
    </button>
  );
}
