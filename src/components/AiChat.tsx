import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react";
import { useFirebase } from "../contexts/FirebaseContext";

type MessageRole = "user" | "assistant";

interface ChatMessage {
  role: MessageRole;
  content: string;
}

const STARTER_PROMPTS = [
  "How am I tracking against my budget targets?",
  "What's my biggest spending category this month?",
  "Show me all transactions above $100",
  "How does this month compare to last month?",
  "Am I saving money?",
];

const getSessionKey = (uid: string) => `vibebudget-ai-chat:${uid}`;

const readStoredMessages = (uid: string): ChatMessage[] => {
  const raw = sessionStorage.getItem(getSessionKey(uid));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const role = (item as { role?: string }).role;
        const content = (item as { content?: string }).content;
        if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
          return { role, content: content.trim() } as ChatMessage;
        }
        return null;
      })
      .filter((item): item is ChatMessage => Boolean(item));
  } catch {
    return [];
  }
};

export const AiChat: React.FC = () => {
  const { user } = useFirebase();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setMessages([]);
      setInput("");
      setError(null);
      return;
    }

    setMessages(readStoredMessages(user.uid));
    setInput("");
    setError(null);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    sessionStorage.setItem(getSessionKey(user.uid), JSON.stringify(messages));
  }, [messages, user?.uid]);

  useEffect(() => {
    if (user) return;
    const keysToClear: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith("vibebudget-ai-chat:")) {
        keysToClear.push(key);
      }
    }
    keysToClear.forEach((key) => sessionStorage.removeItem(key));
  }, [user]);

  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [isOpen, messages, loading]);

  const placeholder = useMemo(() => {
    return loading ? "Thinking..." : "Ask about your budget";
  }, [loading]);

  const sendMessage = async (nextMessage?: string) => {
    const content = (nextMessage ?? input).trim();
    if (!content || !user || loading) return;

    setLoading(true);
    setError(null);

    const nextUserMessage: ChatMessage = { role: "user", content };
    const history = [...messages];
    const nextMessages = [...history, nextUserMessage];
    setMessages(nextMessages);
    setInput("");

    try {
      const idToken = await user.getIdToken(true);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages,
          uid: user.uid,
          idToken,
        }),
      });

      const rawBody = await response.text();
      const payload = (() => {
        try {
          return JSON.parse(rawBody) as { reply?: string; error?: string };
        } catch {
          return null;
        }
      })();
      if (!response.ok) {
        const detail = payload?.error || rawBody || `${response.status} ${response.statusText}`;
        throw new Error(`AI request failed (${response.status}): ${detail}`);
      }

      setMessages((current) => [...current, { role: "assistant", content: payload?.reply || "I couldn't generate a reply." }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to get AI response right now.");
      setMessages((current) => current.filter((item, index) => !(index === current.length - 1 && item.role === "user" && item.content === content)));
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-24 right-4 z-[30] inline-flex h-14 w-14 items-center justify-center rounded-full border bg-[linear-gradient(135deg,_#69f6b8_0%,_#06b77f_100%)] text-[#003121] shadow-xl transition hover:scale-[1.03] lg:bottom-8 lg:right-8"
          style={{ borderColor: "rgba(255,255,255,0.25)" }}
          aria-label="Open AI assistant"
        >
          <Sparkles size={22} />
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[80] bg-[var(--app-overlay)]/90" onClick={() => setIsOpen(false)}>
          <div
            className="absolute bottom-0 right-0 flex h-[78vh] w-full flex-col border-l border-t bg-[var(--app-panel)] shadow-2xl lg:h-screen lg:max-w-md"
            style={{ borderColor: "var(--app-border-strong)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-[var(--app-panel-strong)] p-2 text-fintech-accent">
                  <Bot size={16} />
                </div>
                <div>
                  <p className="text-sm font-semibold">Budget Assistant</p>
                  <p className="text-xs text-fintech-muted">Powered by your VibeBudget data</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg border bg-[var(--app-panel-strong)] px-2 py-1 text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
                style={{ borderColor: "var(--app-border)" }}
                aria-label="Close AI assistant"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-fintech-muted">Try one of these prompts:</p>
                  <div className="space-y-2">
                    {STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => void sendMessage(prompt)}
                        disabled={loading}
                        className="w-full rounded-xl border bg-[var(--app-panel-strong)] px-3 py-2 text-left text-xs text-[var(--app-text)] transition hover:border-fintech-accent/40 hover:text-fintech-accent disabled:cursor-not-allowed disabled:opacity-70"
                        style={{ borderColor: "var(--app-border)" }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "ml-auto bg-fintech-accent text-[#073324]"
                      : "bg-[var(--app-panel-strong)] text-[var(--app-text)]"
                  }`}
                >
                  {message.content}
                </div>
              ))}

              {loading && (
                <div className="inline-flex items-center gap-2 rounded-2xl bg-[var(--app-panel-strong)] px-3 py-2 text-sm text-fintech-muted">
                  <Loader2 size={14} className="animate-spin" />
                  Thinking...
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-fintech-danger/50 bg-[var(--app-danger-soft)] px-3 py-2 text-xs text-[#fecaca]">
                  {error}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  rows={2}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={placeholder}
                  className="max-h-28 min-h-[44px] flex-1 resize-y"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-fintech-accent text-[#073324] disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Send message"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
