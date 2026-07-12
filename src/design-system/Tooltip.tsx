import React, { useId, useState } from "react";

export type TooltipPlacement = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  placement?: TooltipPlacement;
  className?: string;
}

export function Tooltip({
  content,
  children,
  placement = "top",
  className,
}: TooltipProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const id = useId();

  const wrapperClassName = ["ds-tooltip", open ? "ds-tooltip--open" : "", className]
    .filter(Boolean)
    .join(" ");

  const childProps = children.props as { "aria-describedby"?: string };
  const describedBy = [childProps["aria-describedby"], id]
    .filter(Boolean)
    .join(" ");

  const trigger = React.cloneElement(children, {
    "aria-describedby": describedBy,
  } as Partial<typeof childProps>);

  return (
    <span
      className={wrapperClassName}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {trigger}
      <span
        id={id}
        role="tooltip"
        className={`ds-tooltip__bubble ds-tooltip__bubble--${placement}`}
      >
        {content}
      </span>
    </span>
  );
}
