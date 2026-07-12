import React, { useId, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

export interface ChipInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  label?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function ChipInput(props: ChipInputProps): React.JSX.Element {
  const {
    value,
    onChange,
    label,
    placeholder,
    disabled = false,
    id,
    className,
  } = props;

  const reactId = useId();
  const inputId = id ?? reactId;

  const [draft, setDraft] = useState("");

  const rootClasses = [
    "ds-chipinput",
    disabled ? "ds-chipinput--disabled" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const commit = (): void => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    if (value.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  };

  const removeAt = (index: number): void => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter" || e.key === ",") {
      if (draft.trim().length > 0) {
        e.preventDefault();
        commit();
      }
    } else if (e.key === "Backspace" && draft.length === 0 && value.length > 0) {
      e.preventDefault();
      removeAt(value.length - 1);
    }
  };

  return (
    <div className={rootClasses}>
      {label !== undefined && label !== null && label !== false ? (
        <label htmlFor={inputId} className="ds-chipinput__label">
          {label}
        </label>
      ) : null}
      <div className="ds-chipinput__field">
        {value.map((tag, index) => (
          <span key={`${tag}-${index}`} className="ds-chipinput__chip">
            <span className="ds-chipinput__chip-label">{tag}</span>
            <button
              type="button"
              className="ds-chipinput__chip-remove"
              aria-label={`Remove ${tag}`}
              disabled={disabled}
              onClick={() => removeAt(index)}
            >
              <X size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          type="text"
          className="ds-chipinput__input"
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
        />
      </div>
    </div>
  );
}
