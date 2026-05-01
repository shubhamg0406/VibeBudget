import type { AiProvider, AiProviderConfig } from "../types";

interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AiChatResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
  error?: { message?: string };
}

interface AiOcrResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

export class AiClientError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "AiClientError";
    this.status = status;
  }
}

const extractErrorMessage = (raw: unknown, fallback: string): string => {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (obj.error && typeof obj.error === "object") {
      return String((obj.error as Record<string, unknown>).message || fallback);
    }
    if (typeof obj.error === "string") return obj.error;
  }
  return fallback;
};

const getChatEndpoint = (provider: AiProvider): string => {
  if (provider === "gemini") {
    return "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  }
  return "https://api.deepseek.com/chat/completions";
};

export const callAiChat = async (
  config: AiProviderConfig,
  messages: AiChatMessage[],
): Promise<string> => {
  const { provider, model, apiKey } = config;
  if (!apiKey) throw new AiClientError("API key is not configured.", 400);

  const url = getChatEndpoint(provider);
  const authHeader = provider === "gemini"
    ? `Bearer ${apiKey}`
    : `Bearer ${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages,
    }),
  });

  if (response.status === 429) {
    throw new AiClientError(`${provider === "gemini" ? "Gemini" : "DeepSeek"} rate limit reached. Please retry in a moment.`, 429);
  }

  if (!response.ok) {
    const raw = await response.json().catch(() => null);
    const msg = extractErrorMessage(raw, `${provider === "gemini" ? "Gemini" : "DeepSeek"} request failed (${response.status})`);
    throw new AiClientError(msg, response.status);
  }

  const payload = await response.json() as AiChatResponse;

  if (payload.error) {
    throw new AiClientError(payload.error.message || "Provider returned an error.", 502);
  }

  const reply = payload.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new AiClientError(`${provider === "gemini" ? "Gemini" : "DeepSeek"} returned an empty response.`, 502);
  }

  return reply;
};

export const callAiOcr = async (
  config: AiProviderConfig,
  imageBase64: string,
  mimeType: string,
  prompt: string,
): Promise<string> => {
  const { provider, model, apiKey } = config;

  if (!apiKey) throw new AiClientError("API key is not configured.", 400);

  if (provider === "deepseek") {
    const url = "https://api.deepseek.com/chat/completions";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.05,
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${imageBase64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const raw = await response.json().catch(() => null);
      const msg = extractErrorMessage(raw, `DeepSeek OCR failed (${response.status})`);
      throw new AiClientError(msg, response.status);
    }

    const payload = await response.json() as AiChatResponse;
    return payload.choices?.[0]?.message?.content?.trim() || "";
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.05,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new AiClientError(text.slice(0, 500), response.status);
  }

  const data = await response.json() as AiOcrResponse;

  if (data.promptFeedback?.blockReason) {
    throw new AiClientError(`Content blocked: ${data.promptFeedback.blockReason}`);
  }

  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!responseText) {
    throw new AiClientError("Gemini returned empty response.");
  }

  return responseText;
};
