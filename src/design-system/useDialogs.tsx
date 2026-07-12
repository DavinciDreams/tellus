/* src/design-system/useDialogs.tsx
   Promise-based imperative dialogs, so code can `await askConfirm(...)` /
   `await askPrompt(...)` instead of the native window.confirm / window.prompt
   that break the HUD's immersion. Renders styled in-HUD ConfirmDialog / Dialog.

   Usage:
     const { askConfirm, askPrompt, dialogs } = useDialogs();
     // ...somewhere in the returned JSX:  {dialogs}
     const ok = await askConfirm({ title: "Delete world?", message: "…", danger: true });
     const name = await askPrompt({ title: "World name", defaultValue: current });

   The `dialogs` node is wrapped in its own `.ds-scope`, so it works even when the
   host tree is not itself scoped (custom properties inherit down the DOM tree, and
   a modal <dialog> keeps inheriting from its DOM parent while in the top layer). */

import React, { useCallback, useRef, useState } from "react";
import { Button } from "./Button";
import { ConfirmDialog, Dialog } from "./Dialog";
import { Field } from "./Field";

export interface AskConfirmOptions {
  title?: React.ReactNode;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface AskPromptOptions {
  title?: React.ReactNode;
  label?: React.ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  maxLength?: number;
}

export interface UseDialogs {
  askConfirm: (opts: AskConfirmOptions) => Promise<boolean>;
  askPrompt: (opts: AskPromptOptions) => Promise<string | null>;
  dialogs: React.JSX.Element;
}

interface ConfirmState extends AskConfirmOptions {
  open: boolean;
}
interface PromptState extends AskPromptOptions {
  open: boolean;
  value: string;
}

export function useDialogs(): UseDialogs {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const confirmResolve = useRef<((v: boolean) => void) | null>(null);
  const promptResolve = useRef<((v: string | null) => void) | null>(null);

  const askConfirm = useCallback(
    (opts: AskConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        confirmResolve.current = resolve;
        setConfirmState({ ...opts, open: true });
      }),
    [],
  );

  const askPrompt = useCallback(
    (opts: AskPromptOptions) =>
      new Promise<string | null>((resolve) => {
        promptResolve.current = resolve;
        setPromptState({ ...opts, open: true, value: opts.defaultValue ?? "" });
      }),
    [],
  );

  const settleConfirm = useCallback((result: boolean) => {
    const resolve = confirmResolve.current;
    confirmResolve.current = null;
    setConfirmState((s) => (s ? { ...s, open: false } : s));
    resolve?.(result);
  }, []);

  const settlePrompt = useCallback((result: string | null) => {
    const resolve = promptResolve.current;
    promptResolve.current = null;
    setPromptState((s) => (s ? { ...s, open: false } : s));
    resolve?.(result);
  }, []);

  const dialogs = (
    <div className="ds-scope">
      <ConfirmDialog
        open={confirmState?.open ?? false}
        title={confirmState?.title ?? "Are you sure?"}
        message={confirmState?.message ?? ""}
        confirmLabel={confirmState?.confirmLabel}
        cancelLabel={confirmState?.cancelLabel}
        danger={confirmState?.danger}
        onConfirm={() => settleConfirm(true)}
        onCancel={() => settleConfirm(false)}
      />
      <Dialog
        open={promptState?.open ?? false}
        onClose={() => settlePrompt(null)}
        title={promptState?.title ?? "Enter a value"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => settlePrompt(null)}>
              {promptState?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant="primary"
              onClick={() => settlePrompt(promptState?.value ?? "")}
            >
              {promptState?.confirmLabel ?? "Save"}
            </Button>
          </>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            settlePrompt(promptState?.value ?? "");
          }}
        >
          <Field
            id="ds-usedialogs-prompt"
            label={promptState?.label ?? "Value"}
            value={promptState?.value ?? ""}
            placeholder={promptState?.placeholder}
            maxLength={promptState?.maxLength}
            onChange={(event) => {
              const v = event.currentTarget.value;
              setPromptState((s) => (s ? { ...s, value: v } : s));
            }}
          />
        </form>
      </Dialog>
    </div>
  );

  return { askConfirm, askPrompt, dialogs };
}
