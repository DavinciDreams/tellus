/* src/design-system/index.ts
   Barrel for the Tellus HUD design system.
   Importing from "./design-system" pulls in the token layer + component stylesheet ONCE
   (tokens before components so the cascade resolves), then re-exports every component.
   Any mount root that renders these components must carry className="ds-scope". */

import "./tokens.css";
import "./components.css";
import "./Toggle.css";
import "./Checkbox.css";
import "./Radio.css";
import "./Slider.css";
import "./Segmented.css";
import "./Card.css";
import "./Tooltip.css";
import "./Menu.css";
import "./Toast.css";
import "./Progress.css";
import "./Skeleton.css";
import "./EmptyState.css";
import "./RadialMenu.css";
import "./Dock.css";
import "./PresenceRoster.css";
import "./Avatar.css";
import "./AgentCard.css";
import "./GenerationCard.css";
import "./PortalCard.css";
import "./AssetTile.css";
import "./ChatThread.css";
import "./Sheet.css";
import "./Popover.css";
import "./InlineAlert.css";

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

export { useDialogs } from "./useDialogs";
export type { UseDialogs, AskConfirmOptions, AskPromptOptions } from "./useDialogs";

/* ── Wave 2: core component vocabulary ── */
export { Toggle } from "./Toggle";
export type { ToggleProps } from "./Toggle";

export { Checkbox } from "./Checkbox";
export type { CheckboxProps } from "./Checkbox";

export { RadioGroup, Radio } from "./Radio";
export type { RadioGroupProps, RadioProps } from "./Radio";

export { Slider } from "./Slider";
export type { SliderProps } from "./Slider";

export { Segmented } from "./Segmented";
export type { SegmentedProps, SegmentedOption } from "./Segmented";

export { Card } from "./Card";
export type { CardProps } from "./Card";

export { Tooltip } from "./Tooltip";
export type { TooltipProps, TooltipPlacement } from "./Tooltip";

export { Menu, MenuItem, MenuSeparator } from "./Menu";
export type { MenuProps, MenuItemProps, MenuSeparatorProps, MenuAlign } from "./Menu";

export { useToasts } from "./Toast";
export type { UseToasts, ToastOptions, ToastTone } from "./Toast";

export { Progress, Spinner } from "./Progress";
export type { ProgressProps, SpinnerProps, ProgressTone } from "./Progress";

export { Skeleton } from "./Skeleton";
export type { SkeletonProps, SkeletonVariant } from "./Skeleton";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

/* ── Wave 3: the world layer (Tellus's differentiators) ── */
export { RadialMenu } from "./RadialMenu";
export type { RadialMenuProps, RadialMenuItem } from "./RadialMenu";

export { Dock } from "./Dock";
export type { DockProps, DockItem } from "./Dock";

export { PresenceRoster } from "./PresenceRoster";
export type { PresenceRosterProps, PresenceBeing } from "./PresenceRoster";

export { Avatar } from "./Avatar";
export type { AvatarProps, AvatarKind, AvatarSize, AvatarStatus } from "./Avatar";

export { AgentCard } from "./AgentCard";
export type { AgentCardProps, AgentCardStatus } from "./AgentCard";

export { GenerationCard } from "./GenerationCard";
export type { GenerationCardProps, GenerationCardStatus } from "./GenerationCard";

export { PortalCard } from "./PortalCard";
export type { PortalCardProps } from "./PortalCard";

export { AssetTile } from "./AssetTile";
export type { AssetTileProps } from "./AssetTile";

export { ChatThread } from "./ChatThread";
export type { ChatThreadProps, ChatMessage, ChatMessageKind } from "./ChatThread";

export { Sheet } from "./Sheet";
export type { SheetProps, SheetSide } from "./Sheet";

export { Popover } from "./Popover";
export type { PopoverProps, PopoverAlign, PopoverPlacement } from "./Popover";

export { InlineAlert } from "./InlineAlert";
export type { InlineAlertProps, InlineAlertTone } from "./InlineAlert";
