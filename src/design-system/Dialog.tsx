import React, { useCallback, useEffect, useId, useRef } from "react";
import type { MouseEvent, ReactNode, RefObject } from "react";
import { Button } from "./Button";
import { IconButton } from "./IconButton";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  closeOnBackdrop?: boolean;
  initialFocusRef?: RefObject<HTMLElement>;
  describedById?: string;
}

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const CloseIcon = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
    <path
      d="M4 4l8 8M12 4l-8 8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
  initialFocusRef,
  describedById,
}: DialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Sync the native dialog open/close state with the `open` prop.
  useEffect(() => {
    const node = dialogRef.current;
    if (!node) {
      return;
    }
    if (open) {
      if (!node.open) {
        node.showModal();
      }
      // Focus after the dialog has entered the top layer.
      const focusTarget = initialFocusRef?.current;
      if (focusTarget) {
        focusTarget.focus();
      } else {
        const firstFocusable = node.querySelector<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
        );
        firstFocusable?.focus();
      }
    } else if (node.open) {
      node.close();
    }
  }, [open, initialFocusRef]);

  // Native cancel (Esc) + close events route back to onClose.
  useEffect(() => {
    const node = dialogRef.current;
    if (!node) {
      return;
    }
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    const handleClose = () => {
      if (open) {
        onClose();
      }
    };
    node.addEventListener("cancel", handleCancel);
    node.addEventListener("close", handleClose);
    return () => {
      node.removeEventListener("cancel", handleCancel);
      node.removeEventListener("close", handleClose);
    };
  }, [open, onClose]);

  const handleBackdropClick = useCallback(
    (event: MouseEvent<HTMLDialogElement>) => {
      if (!closeOnBackdrop) {
        return;
      }
      if (event.target === dialogRef.current) {
        onClose();
      }
    },
    [closeOnBackdrop, onClose],
  );

  return (
    <dialog
      ref={dialogRef}
      className={`ds-dialog ds-dialog--${size}`}
      aria-labelledby={titleId}
      aria-describedby={describedById}
      onClick={handleBackdropClick}
    >
      <div className="ds-dialog__header">
        <h2 id={titleId} className="ds-dialog__title">
          {title}
        </h2>
        <IconButton
          aria-label="Close dialog"
          variant="ghost"
          size="sm"
          icon={CloseIcon}
          onClick={onClose}
        />
      </div>
      <div className="ds-dialog__body">{children}</div>
      {footer ? <div className="ds-dialog__footer">{footer}</div> : null}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element {
  const messageId = useId();

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      describedById={messageId}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p id={messageId} className="ds-dialog__message">
        {message}
      </p>
    </Dialog>
  );
}
