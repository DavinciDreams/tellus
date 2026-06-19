import React, { useState } from "react";
import { avatarThumbnailUrl, type AvatarCatalogEntry } from "./tellus-avatar-catalog";
import type { AssetLibraryModel } from "./tellus-types";
import { tellusAssetLibraryUrl } from "./tellus-urls-identity";

const hueForLabel = (label: string): number => {
  let hue = 0;
  for (let i = 0; i < label.length; i++) hue = (hue * 31 + label.charCodeAt(i)) % 360;
  return hue;
};

export function AvatarTile({
  entry,
  selected,
  onSelect,
}: {
  entry: AvatarCatalogEntry;
  selected: boolean;
  onSelect: (entry: AvatarCatalogEntry) => void;
}): React.ReactElement {
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumbUrl = avatarThumbnailUrl(entry);
  const hue = hueForLabel(entry.label);
  return (
    <button
      type="button"
      title={entry.label}
      aria-pressed={selected}
      onClick={() => onSelect(entry)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 4,
        padding: 4,
        borderRadius: 8,
        border: selected ? "1px solid #6fae46" : "1px solid rgba(255,255,255,0.14)",
        background: selected ? "rgba(111,174,70,0.22)" : "rgba(255,255,255,0.05)",
        color: "#dfe7d8",
        cursor: "pointer",
        minWidth: 0,
      }}
    >
      {thumbUrl && !thumbFailed ? (
        <img
          src={thumbUrl}
          alt={entry.label}
          onError={() => setThumbFailed(true)}
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            display: "block",
            objectFit: "cover",
            borderRadius: 6,
            background: "rgba(0,0,0,0.35)",
          }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            fontWeight: 700,
            color: "#0c1016",
            background: `hsl(${hue} 45% 62%)`,
          }}
        >
          {entry.label.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span
        style={{
          fontSize: 10,
          lineHeight: 1.2,
          textAlign: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {entry.label}
      </span>
    </button>
  );
}

export function AssetTile({
  model,
  onSelect,
}: {
  model: AssetLibraryModel;
  onSelect: (model: AssetLibraryModel) => void;
}): React.ReactElement {
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumbUrl =
    model.hasThumbnail && !thumbFailed
      ? tellusAssetLibraryUrl(`/api/assets/model/${encodeURIComponent(model.id)}/thumbnail`)
      : null;
  const hue = hueForLabel(model.name);
  const format = (model.file_format ?? "model").toUpperCase();
  const title =
    model.name +
    (model.hasGameOptimized ? " · game-optimized" : "") +
    (typeof model.download_count === "number" && model.download_count > 0
      ? ` · ${model.download_count} downloads`
      : "");
  return (
    <button
      type="button"
      title={title}
      onClick={() => onSelect(model)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 4,
        padding: 4,
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.05)",
        color: "#dfe7d8",
        cursor: "pointer",
      }}
    >
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt={model.name}
          loading="lazy"
          onError={() => setThumbFailed(true)}
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            objectFit: "cover",
            borderRadius: 6,
            background: "rgba(0,0,0,0.35)",
          }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            fontWeight: 700,
            color: "#0c1016",
            background: `hsl(${hue} 45% 62%)`,
          }}
        >
          {model.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span
        style={{
          fontSize: 10,
          lineHeight: 1.2,
          textAlign: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {model.name}
      </span>
      <span
        style={{
          fontSize: 9,
          lineHeight: 1,
          textAlign: "center",
          opacity: 0.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {format}
        {typeof model.download_count === "number" && model.download_count > 0
          ? ` · ${model.download_count}↓`
          : ""}
      </span>
    </button>
  );
}
