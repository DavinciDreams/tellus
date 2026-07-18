import React, { useState } from "react";
import type { ReactNode } from "react";
import { Send } from "lucide-react";
import { IconButton } from "./IconButton";

export type ChatMessageKind = "human" | "agent" | "you";

export interface ChatMessage {
  id: string;
  author: string;
  kind: ChatMessageKind;
  text: string;
  time?: string;
}

export interface ChatThreadProps {
  messages: ChatMessage[];
  onSend?: (text: string) => void;
  placeholder?: string;
  className?: string;
}

export function ChatThread({
  messages,
  onSend,
  placeholder = "Message the world…",
  className,
}: ChatThreadProps): React.JSX.Element {
  const [draft, setDraft] = useState("");

  const rootClass = ["ds-chat", className].filter(Boolean).join(" ");

  const submit = (): void => {
    const text = draft.trim();
    if (!text || !onSend) return;
    onSend(text);
    setDraft("");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className={rootClass}>
      <div className="ds-chat__list" role="log" aria-live="polite">
        {messages.map((message) => {
          const isYou = message.kind === "you";
          const isAgent = message.kind === "agent";
          const msgClass = [
            "ds-chat__msg",
            isYou ? "ds-chat__msg--you" : "",
            isAgent ? "ds-chat__msg--agent" : "",
            message.kind === "human" ? "ds-chat__msg--human" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const author: ReactNode = isAgent ? (
            <span className="ds-chat__author">
              <span className="ds-chat__marker" aria-hidden="true">
                ✦
              </span>
              <span className="ds-chat__name">{message.author}</span>
              <span className="ds-chat__role"> · agent</span>
            </span>
          ) : (
            <span className="ds-chat__author">
              <span className="ds-chat__name">{message.author}</span>
            </span>
          );

          return (
            <div key={message.id} className={msgClass}>
              {author}
              <p className="ds-chat__bubble">{message.text}</p>
              {message.time ? (
                <span className="ds-chat__time">{message.time}</span>
              ) : null}
            </div>
          );
        })}
      </div>

      {onSend ? (
        <div className="ds-chat__composer">
          <label className="ds-chat__label" htmlFor="ds-chat-input">
            Message
          </label>
          <input
            id="ds-chat-input"
            className="ds-chat__input"
            type="text"
            value={draft}
            placeholder={placeholder}
            aria-label="Message"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <span className="ds-chat__send">
            <IconButton
              aria-label="Send"
              icon={<Send />}
              variant="primary"
              onClick={submit}
            />
          </span>
        </div>
      ) : null}
    </div>
  );
}
