import React, { useRef, useCallback } from "react";

export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md";
  className?: string;
  "aria-label": string;
}

export function Segmented(props: SegmentedProps) {
  const {
    options,
    value,
    onChange,
    size = "md",
    className,
    "aria-label": ariaLabel,
  } = props;

  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const rootClasses = [
    "ds-segmented",
    size === "sm" ? "ds-segmented--sm" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const moveSelection = useCallback(
    (fromIndex: number, direction: 1 | -1) => {
      const count = options.length;
      if (count === 0) return;
      // Walk in `direction` over enabled options, wrapping around.
      for (let step = 1; step <= count; step++) {
        const nextIndex = (fromIndex + direction * step + count * step) % count;
        const candidate = options[nextIndex];
        if (candidate && !candidate.disabled) {
          buttonRefs.current[nextIndex]?.focus();
          onChange(candidate.value);
          return;
        }
      }
    },
    [options, onChange]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const currentIndex = options.findIndex((o) => o.value === value);
      const fromIndex = currentIndex === -1 ? 0 : currentIndex;
      event.preventDefault();
      moveSelection(fromIndex, event.key === "ArrowRight" ? 1 : -1);
    },
    [options, value, moveSelection]
  );

  return (
    <div
      className={rootClasses}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {options.map((option, index) => {
        const isActive = option.value === value;
        const optionClasses = [
          "ds-segmented__option",
          isActive ? "ds-segmented__option--active" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={option.value}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={optionClasses}
            disabled={option.disabled}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(option.value)}
          >
            {option.icon != null && (
              <span className="ds-segmented__icon" aria-hidden="true">
                {option.icon}
              </span>
            )}
            <span className="ds-segmented__label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
