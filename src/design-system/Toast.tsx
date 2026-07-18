/* src/design-system/Toast.tsx
   Imperative toast notifications for the Tellus HUD, mirroring the useDialogs
   pattern: a hook that returns imperative fns + a `viewport` JSX node to render.

   Usage:
     const { toast, dismiss, viewport } = useToasts();
     // ...somewhere in the returned JSX:  {viewport}
     const id = toast({ title: "Saved", message: "World persisted.", tone: "success" });
     dismiss(id); // or let it auto-dismiss

   The `viewport` node is wrapped in its own `.ds-scope`, so it works even when the
   host tree is not itself scoped (custom properties inherit down the DOM tree, so a
   fixed-position viewport keeps inheriting tokens from its DOM parent). Ids are
   generated from an incrementing ref counter — never Date.now()/Math.random(). */

import React, { useCallback, useRef, useState } from "react";

export type ToastTone = "neutral" | "success" | "warn" | "danger" | "info";

export interface ToastOptions {
  title?: React.ReactNode;
  message: React.ReactNode;
  tone?: ToastTone;
  duration?: number;
}

export interface UseToasts {
  toast: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
  viewport: React.JSX.Element;
}

interface ActiveToast {
  id: string;
  title?: React.ReactNode;
  message: React.ReactNode;
  tone: ToastTone;
}

const DEFAULT_DURATION = 4500;

/* Tone → accessible label word (never rely on color alone). */
const TONE_WORD: Record<ToastTone, string> = {
  neutral: "Note",
  success: "Success",
  warn: "Warning",
  danger: "Error",
  info: "Info",
};

interface ToastCardProps {
  toast: ActiveToast;
  onDismiss: (id: string) => void;
}

function ToastCard({ toast, onDismiss }: ToastCardProps): React.JSX.Element {
  return (
    <div className={`ds-toast ds-toast--${toast.tone}`} role="status">
      <span className="ds-toast__icon" aria-hidden="true" />
      <div className="ds-toast__body">
        {toast.title != null && (
          <div className="ds-toast__title">
            <span className="ds-visually-hidden">{TONE_WORD[toast.tone]}: </span>
            {toast.title}
          </div>
        )}
        <div className="ds-toast__msg">
          {toast.title == null && (
            <span className="ds-visually-hidden">{TONE_WORD[toast.tone]}: </span>
          )}
          {toast.message}
        </div>
      </div>
      <button
        type="button"
        className="ds-toast__close"
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path
            d="M3.5 3.5l7 7M10.5 3.5l-7 7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

export function useToasts(): UseToasts {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (opts: ToastOptions): string => {
      const id = String(++idRef.current);
      const next: ActiveToast = {
        id,
        title: opts.title,
        message: opts.message,
        tone: opts.tone ?? "neutral",
      };
      setToasts((list) => [...list, next]);

      const duration = opts.duration ?? DEFAULT_DURATION;
      const sticky = duration === 0 || duration === Infinity;
      if (!sticky) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  const viewport = (
    <div className="ds-scope">
      <div
        className="ds-toast-viewport"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </div>
  );

  return { toast, dismiss, viewport };
}
