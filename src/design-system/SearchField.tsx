import React from "react";
import type { InputHTMLAttributes } from "react";
import { Search, X } from "lucide-react";

export interface SearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  loading?: boolean;
  label?: string;
}

export function SearchField(props: SearchFieldProps): React.JSX.Element {
  const {
    value,
    onChange,
    onClear,
    loading = false,
    label,
    className,
    disabled,
    ...rest
  } = props;

  const rootClasses = [
    "ds-search",
    disabled ? "ds-search--disabled" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const showClear = !loading && value.length > 0;

  return (
    <div className={rootClasses}>
      <span className="ds-search__icon" aria-hidden="true">
        <Search size={16} strokeWidth={2} />
      </span>
      <input
        {...rest}
        type="search"
        role="searchbox"
        className="ds-search__input"
        value={value}
        disabled={disabled}
        aria-label={label ?? "Search"}
        onChange={(e) => onChange(e.target.value)}
      />
      {loading ? (
        <span className="ds-search__spinner" aria-hidden="true" />
      ) : showClear ? (
        <button
          type="button"
          className="ds-search__clear"
          aria-label="Clear search"
          disabled={disabled}
          onClick={() => {
            onClear?.();
            onChange("");
          }}
        >
          <X size={15} strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}
