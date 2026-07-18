import React from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { Info, CheckCircle2, AlertTriangle, XCircle, X } from "lucide-react";

export type InlineAlertTone = "info" | "success" | "warn" | "danger" | "neutral";

export interface InlineAlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: InlineAlertTone;
  title?: ReactNode;
  icon?: ReactNode;
  onDismiss?: () => void;
  children: ReactNode;
}

const TONE_ICON: Record<InlineAlertTone, ReactNode> = {
  info: <Info aria-hidden="true" size={18} />,
  success: <CheckCircle2 aria-hidden="true" size={18} />,
  warn: <AlertTriangle aria-hidden="true" size={18} />,
  danger: <XCircle aria-hidden="true" size={18} />,
  neutral: <Info aria-hidden="true" size={18} />,
};

export function InlineAlert({
  tone = "neutral",
  title,
  icon,
  onDismiss,
  children,
  className,
  ...rest
}: InlineAlertProps) {
  const classes = ["ds-alert", `ds-alert--${tone}`, className]
    .filter(Boolean)
    .join(" ");

  const role = tone === "warn" || tone === "danger" ? "alert" : "status";

  return (
    <div className={classes} role={role} {...rest}>
      <span className="ds-alert__icon" aria-hidden="true">
        {icon !== undefined ? icon : TONE_ICON[tone]}
      </span>

      <div className="ds-alert__content">
        {title !== undefined ? (
          <div className="ds-alert__title">{title}</div>
        ) : null}
        <div className="ds-alert__body">{children}</div>
      </div>

      {onDismiss !== undefined ? (
        <button
          type="button"
          className="ds-alert__dismiss"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <X aria-hidden="true" size={16} />
        </button>
      ) : null}
    </div>
  );
}
