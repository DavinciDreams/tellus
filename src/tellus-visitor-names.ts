export const actorKindForVisitorId = (visitorId: string): "agent" | "player" | "world" => {
  if (visitorId === "world") return "world";
  return visitorId.startsWith("agent:") ? "agent" : "player";
};

const titleCaseToken = (token: string): string =>
  token ? `${token.slice(0, 1).toUpperCase()}${token.slice(1).toLowerCase()}` : "";

export const friendlyAgentNameFromId = (visitorId: string): string => {
  const raw = visitorId.replace(/^agent:/, "").replace(/^user-/, "");
  const words = raw
    .split(/[-_\s]+/)
    .filter((part) => /^[a-z][a-z0-9]*$/i.test(part) && !/^[0-9a-f]{6,}$/i.test(part))
    .slice(0, 3);
  if (words.length > 0) return words.map(titleCaseToken).join(" ");
  const suffix = raw.match(/[0-9a-f]{6,}/i)?.[0]?.slice(0, 6) || raw.slice(-6) || visitorId.slice(-6);
  return `Agent ${suffix}`;
};

export const friendlyVisitorName = (
  visitorId: string,
  explicitName?: string,
  selfVisitorId?: string,
): string => {
  const name = explicitName?.trim();
  if (visitorId === "local-player") return "You";
  if (selfVisitorId && visitorId === selfVisitorId && !visitorId.startsWith("agent:")) return "You";
  // "You" is local UI language, not a portable sender name. Older chat rows and anonymous sockets may
  // have put it on the wire; never let a remote visitor inherit it in this viewer.
  if (name && name.toLowerCase() !== "you") return name;
  if (visitorId === "world") return "World";
  if (visitorId.startsWith("agent:")) return friendlyAgentNameFromId(visitorId);
  return `Player ${visitorId.slice(0, 6) || "nearby"}`;
};
