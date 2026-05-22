import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import fs from "fs";
import path from "path";

const aiConfigFilePath = path.resolve(__dirname, "local-ai-config.json");

const readRequestBody = async (req: any) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const normalizeApiPath = (value: string) => {
  if (!value) {
    return "/v1/chat/completions";
  }
  return value.startsWith("/") ? value : `/${value}`;
};

const resolveAIEndpoint = (config: any) => {
  const baseUrl = trimTrailingSlash(config.baseUrl);
  if (config.provider === "anthropic") {
    return `${baseUrl}/v1/messages`;
  }
  if (config.provider === "custom") {
    return `${baseUrl}${normalizeApiPath(config.apiPath)}`;
  }
  return `${baseUrl}/chat/completions`;
};

class AIProxyError extends Error {
  statusCode: number;
  upstreamStatus?: number;
  upstreamStatusText?: string;
  upstreamBody?: unknown;
  endpoint?: string;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      upstreamStatus?: number;
      upstreamStatusText?: string;
      upstreamBody?: unknown;
      endpoint?: string;
    } = {}
  ) {
    super(message);
    this.name = "AIProxyError";
    this.statusCode = options.statusCode || 500;
    this.upstreamStatus = options.upstreamStatus;
    this.upstreamStatusText = options.upstreamStatusText;
    this.upstreamBody = options.upstreamBody;
    this.endpoint = options.endpoint;
  }
}

const parseResponseBody = async (response: Response) => {
  const rawText = await response.text();
  if (!rawText) {
    return { rawText: "", data: {} };
  }

  try {
    return {
      rawText,
      data: JSON.parse(rawText),
    };
  } catch {
    return {
      rawText,
      data: {},
    };
  }
};

const summarizeBody = (value: unknown, rawText = "") => {
  const source =
    typeof value === "object" && value !== null && Object.keys(value).length > 0
      ? JSON.stringify(value)
      : rawText;
  return source.length > 1200 ? `${source.slice(0, 1200)}...` : source;
};

const getUpstreamMessage = (data: any, status: number) => {
  return (
    data?.error?.message ||
    data?.message ||
    data?.error ||
    `AI 服务返回 ${status}`
  );
};

const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeout: number
) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error("AI 请求超时，请稍后重试或减少题目数量");
    }
    const causeMessage = error.cause?.message || error.message || "未知网络错误";
    throw new Error(`AI 网络连接失败：${causeMessage}（${url}）`);
  } finally {
    clearTimeout(timer);
  }
};

const requestAI = async ({
  config,
  messages,
  timeout = 60000,
  maxTokens = 2048,
}: any) => {
  const endpoint = resolveAIEndpoint(config);
  const isAnthropic = config.provider === "anthropic";
  const body = isAnthropic
    ? {
        model: config.model,
        max_tokens: maxTokens,
        system: messages.find((message: any) => message.role === "system")
          ?.content,
        messages: messages
          .filter((message: any) => message.role !== "system")
          .map((message: any) => ({
            role: message.role,
            content: message.content,
          })),
      }
    : {
        model: config.model,
        messages,
        temperature: 0.2,
        max_tokens: maxTokens,
      };

  console.info("[AI Proxy] request", {
    provider: config.provider,
    model: config.model,
    endpoint,
    messageCount: messages.length,
    maxTokens,
    timeout,
  });

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: isAnthropic
        ? {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
          }
        : {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
      body: JSON.stringify(body),
    },
    timeout
  );

  const { rawText, data } = await parseResponseBody(response);
  if (!response.ok) {
    const upstreamMessage = getUpstreamMessage(data, response.status);
    const upstreamBody = summarizeBody(data, rawText);
    console.error("[AI Proxy] upstream error", {
      provider: config.provider,
      model: config.model,
      endpoint,
      status: response.status,
      statusText: response.statusText,
      body: upstreamBody,
    });
    throw new AIProxyError(
      `AI 服务返回 ${response.status}: ${upstreamMessage}`,
      {
        statusCode: response.status >= 500 ? 502 : 400,
        upstreamStatus: response.status,
        upstreamStatusText: response.statusText,
        upstreamBody,
        endpoint,
      }
    );
  }

  const text =
    isAnthropic
      ? data.content?.[0]?.text
      : data.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("AI 返回内容为空");
  }

  return text;
};

const writeSSE = (res: any, event: string, data: unknown) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const streamTextBySSE = async (res: any, text: string) => {
  const normalizedText = String(text || "");
  const chars = Array.from(normalizedText);
  let index = 0;

  while (index < chars.length) {
    const char = chars[index];
    const nextChar = chars[index + 1] || "";
    const chunkSize = /[\n。！？；]/.test(char) ? 1 : nextChar && /[a-zA-Z0-9_]/.test(char + nextChar) ? 4 : 2;
    const chunk = chars.slice(index, index + chunkSize).join("");
    writeSSE(res, "chunk", { text: chunk });
    index += chunkSize;
    await sleep(/[，,]/.test(chunk) ? 32 : /[\n。！？；]/.test(chunk) ? 90 : 18);
  }
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue({
      // 支持 Markdown 文件加载
      include: [/\.vue$/, /\.md$/, /\.db$/],
    }),
    {
      name: "local-ai-config-api",
      configureServer(server) {
        server.middlewares.use("/api/ai-config", async (req, res) => {
          res.setHeader("Content-Type", "application/json; charset=utf-8");

          try {
            if (req.method === "GET") {
              if (!fs.existsSync(aiConfigFilePath)) {
                res.statusCode = 404;
                res.end(JSON.stringify({ message: "AI config not found" }));
                return;
              }
              res.end(fs.readFileSync(aiConfigFilePath, "utf-8"));
              return;
            }

            if (req.method === "POST") {
              const body = await readRequestBody(req);
              const config = JSON.parse(body || "{}");
              fs.writeFileSync(
                aiConfigFilePath,
                `${JSON.stringify(config, null, 2)}\n`,
                "utf-8"
              );
              res.end(JSON.stringify({ success: true }));
              return;
            }

            if (req.method === "DELETE") {
              if (fs.existsSync(aiConfigFilePath)) {
                fs.unlinkSync(aiConfigFilePath);
              }
              res.end(JSON.stringify({ success: true }));
              return;
            }

            res.statusCode = 405;
            res.end(JSON.stringify({ message: "Method not allowed" }));
          } catch (error: any) {
            console.error("[AI Config] request failed", error);
            res.statusCode = 500;
            res.end(JSON.stringify({ message: error.message || "Unknown error" }));
          }
        });

        server.middlewares.use("/api/ai-chat", async (req, res) => {
          res.setHeader("Content-Type", "application/json; charset=utf-8");

          try {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.end(JSON.stringify({ message: "Method not allowed" }));
              return;
            }

            const body = await readRequestBody(req);
            const payload = JSON.parse(body || "{}");
            const text = await requestAI(payload);
            res.end(JSON.stringify({ text }));
          } catch (error: any) {
            console.error("[AI Proxy] request failed", {
              message: error.message,
              upstreamStatus: error.upstreamStatus,
              upstreamStatusText: error.upstreamStatusText,
              endpoint: error.endpoint,
              upstreamBody: error.upstreamBody,
            });
            res.statusCode = error.statusCode || 500;
            res.end(
              JSON.stringify({
                message: error.message || "AI request failed",
                upstreamStatus: error.upstreamStatus,
                upstreamStatusText: error.upstreamStatusText,
                endpoint: error.endpoint,
                upstreamBody: error.upstreamBody,
              })
            );
          }
        });

        server.middlewares.use("/api/ai-chat-stream", async (req, res) => {
          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("Connection", "keep-alive");
          res.setHeader("X-Accel-Buffering", "no");

          try {
            if (req.method !== "POST") {
              res.statusCode = 405;
              writeSSE(res, "error", { message: "Method not allowed" });
              res.end();
              return;
            }

            writeSSE(res, "start", {});
            const body = await readRequestBody(req);
            const payload = JSON.parse(body || "{}");
            const text = await requestAI(payload);
            await streamTextBySSE(res, text);
            writeSSE(res, "done", {});
            res.end();
          } catch (error: any) {
            console.error("[AI Proxy Stream] request failed", {
              message: error.message,
              upstreamStatus: error.upstreamStatus,
              upstreamStatusText: error.upstreamStatusText,
              endpoint: error.endpoint,
              upstreamBody: error.upstreamBody,
            });
            writeSSE(res, "error", {
              message: error.message || "AI request failed",
              upstreamStatus: error.upstreamStatus,
              upstreamStatusText: error.upstreamStatusText,
              endpoint: error.endpoint,
              upstreamBody: error.upstreamBody,
            });
            res.end();
          }
        });

      },
    },
  ],
});
