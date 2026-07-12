/* src/design-system/index.ts
   Barrel for the Tellus HUD design system.
   Importing from "./design-system" pulls in the token layer + component stylesheet ONCE
   (tokens before components so the cascade resolves), then re-exports every component.
   Any mount root that renders these components must carry className="ds-scope". */

import "./tokens.css";
import "./components.css";

export { Button } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";

export { IconButton } from "./IconButton";
export type {
  IconButtonProps,
  IconButtonVariant,
  IconButtonSize,
  IconButtonShape,
} from "./IconButton";

export { Panel } from "./Panel";
export type { PanelProps, PanelLevel } from "./Panel";

export { Dialog, ConfirmDialog } from "./Dialog";
export type { DialogProps, ConfirmDialogProps } from "./Dialog";

export { Field } from "./Field";
export type {
  FieldProps,
  FieldSize,
  TextFieldProps,
  TextAreaFieldProps,
  SelectFieldProps,
} from "./Field";

export { Tabs } from "./Tabs";
export type { TabsProps, TabItem } from "./Tabs";

export { Badge } from "./Badge";
export type { BadgeProps, BadgeTone } from "./Badge";

export { PresenceDot } from "./PresenceDot";
export type { PresenceDotProps, PresenceStatus, PresenceSize } from "./PresenceDot";

export { Toolbar, ActionGroup } from "./Toolbar";
export type {
  ToolbarProps,
  ActionGroupProps,
  ToolbarOrientation,
  ToolbarAlign,
} from "./Toolbar";
