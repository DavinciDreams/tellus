import React, { useId } from "react";
import type {
  ReactNode,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
} from "react";

export type FieldSize = "sm" | "md";

interface FieldBase {
  id: string;                    // REQUIRED — associates label + control
  label: ReactNode;              // ALWAYS present (a11y). Sentence-case.
  hint?: ReactNode;
  error?: ReactNode;             // error slot
  size?: FieldSize;              // default "md"
  labelVisuallyHidden?: boolean; // still in DOM for screen readers
}

export interface TextFieldProps
  extends FieldBase,
    Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "size"> {
  as?: "input";
}
export interface TextAreaFieldProps
  extends FieldBase,
    Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  as: "textarea";
}
export interface SelectFieldProps
  extends FieldBase,
    Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "size"> {
  as: "select";
  children: ReactNode;           // <option> list
}
export type FieldProps = TextFieldProps | TextAreaFieldProps | SelectFieldProps;

export function Field(props: FieldProps): React.JSX.Element {
  const {
    id,
    label,
    hint,
    error,
    size = "md",
    labelVisuallyHidden = false,
  } = props;

  const reactId = useId();
  const hintId = `${reactId}-hint`;
  const errorId = `${reactId}-error`;

  const hasError = error !== undefined && error !== null && error !== false;
  const hasHint = hint !== undefined && hint !== null && hint !== false;

  const describedBy =
    [hasHint ? hintId : null, hasError ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const labelClassName = labelVisuallyHidden
    ? "ds-field__label ds-field__label--hidden"
    : "ds-field__label";

  let control: ReactNode;

  if (props.as === "textarea") {
    const {
      id: _id,
      label: _label,
      hint: _hint,
      error: _error,
      size: _size,
      labelVisuallyHidden: _lvh,
      as: _as,
      ...rest
    } = props;
    control = (
      <textarea
        {...rest}
        id={id}
        className="ds-field__control ds-textarea"
        aria-invalid={hasError ? true : undefined}
        aria-describedby={describedBy}
      />
    );
  } else if (props.as === "select") {
    const {
      id: _id,
      label: _label,
      hint: _hint,
      error: _error,
      size: _size,
      labelVisuallyHidden: _lvh,
      as: _as,
      children,
      ...rest
    } = props;
    control = (
      <select
        {...rest}
        id={id}
        className={
          hasError
            ? "ds-field__control ds-select ds-input--invalid"
            : "ds-field__control ds-select"
        }
        aria-invalid={hasError ? true : undefined}
        aria-describedby={describedBy}
      >
        {children}
      </select>
    );
  } else {
    const {
      id: _id,
      label: _label,
      hint: _hint,
      error: _error,
      size: _size,
      labelVisuallyHidden: _lvh,
      as: _as,
      ...rest
    } = props;
    control = (
      <input
        {...rest}
        id={id}
        className={
          hasError
            ? "ds-field__control ds-input ds-input--invalid"
            : "ds-field__control ds-input"
        }
        aria-invalid={hasError ? true : undefined}
        aria-describedby={describedBy}
      />
    );
  }

  return (
    <div className={`ds-field ds-field--${size}`}>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      {control}
      {hasHint ? (
        <span id={hintId} className="ds-field__hint">
          {hint}
        </span>
      ) : null}
      {hasError ? (
        <span id={errorId} className="ds-field__error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
