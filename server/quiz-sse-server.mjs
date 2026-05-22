import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const aiConfigFilePath = path.resolve(projectRoot, "local-ai-config.json");
const host = process.env.AI_QUIZ_HOST || "127.0.0.1";
const port = Number(process.env.AI_QUIZ_PORT || 5174);
const mockMode = process.env.AI_QUIZ_MOCK === "1";
const mockDelay = Math.max(100, Math.min(Number(process.env.AI_QUIZ_MOCK_DELAY || 900), 5000));

const sessions = new Map();
let SQL = null;

class ServiceError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ServiceError";
    this.statusCode = options.statusCode || 500;
    this.upstreamStatus = options.upstreamStatus;
    this.upstreamStatusText = options.upstreamStatusText;
    this.upstreamBody = options.upstreamBody;
    this.endpoint = options.endpoint;
  }
}

const jsonResponse = (res, statusCode, data) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
};

const readRequestBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
};

const readJSONBody = async (req) => {
  const body = await readRequestBody(req);
  if (!body) {
    return {};
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new ServiceError("请求体不是合法 JSON", { statusCode: 400 });
  }
};

const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");

const normalizeApiPath = (value) => {
  if (!value) {
    return "/v1/chat/completions";
  }
  return value.startsWith("/") ? value : `/${value}`;
};

const resolveAIEndpoint = (config) => {
  const baseUrl = trimTrailingSlash(config.baseUrl);
  if (config.provider === "anthropic") {
    return `${baseUrl}/v1/messages`;
  }
  if (config.provider === "custom") {
    return `${baseUrl}${normalizeApiPath(config.apiPath)}`;
  }
  return `${baseUrl}/chat/completions`;
};

const parseResponseBody = async (response) => {
  const rawText = await response.text();
  if (!rawText) {
    return { rawText: "", data: {} };
  }

  try {
    return { rawText, data: JSON.parse(rawText) };
  } catch {
    return { rawText, data: {} };
  }
};

const summarizeBody = (value, rawText = "") => {
  const source =
    typeof value === "object" && value !== null && Object.keys(value).length > 0
      ? JSON.stringify(value)
      : rawText;
  return source.length > 1200 ? `${source.slice(0, 1200)}...` : source;
};

const getUpstreamMessage = (data, status) => {
  return (
    data?.error?.message ||
    data?.message ||
    data?.error ||
    `AI 服务返回 ${status}`
  );
};

const readLocalAIConfig = () => {
  if (!fs.existsSync(aiConfigFilePath)) {
    throw new ServiceError("请先完成 AI 配置", { statusCode: 400 });
  }
  const config = JSON.parse(fs.readFileSync(aiConfigFilePath, "utf-8") || "{}");
  if (!config.provider || !config.baseUrl || !config.apiKey || !config.model) {
    throw new ServiceError("AI 配置不完整，请重新配置", { statusCode: 400 });
  }
  return config;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getSQL = async () => {
  if (!SQL) {
    const wasmBinary = fs.readFileSync(path.resolve(projectRoot, "public", "sql-wasm.wasm"));
    SQL = await initSqlJs({
      wasmBinary,
    });
  }
  return SQL;
};

const initQuizDB = async (schema) => {
  const SQLLib = await getSQL();
  const db = new SQLLib.Database();
  if (schema) {
    db.run(schema);
  }
  return db;
};

const runQuizSQL = (db, sql) => {
  return db.exec(sql);
};

const isSameResult = (result, answerResult) => {
  if (!result?.[0] || !answerResult?.[0]) {
    return false;
  }
  if (JSON.stringify(result[0].columns) !== JSON.stringify(answerResult[0].columns)) {
    return false;
  }
  return JSON.stringify(result[0].values) === JSON.stringify(answerResult[0].values);
};

const fetchWithTimeout = async (url, options, timeout) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const externalSignal = options.signal;
  const abortRequest = () => controller.abort();

  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener("abort", abortRequest, { once: true });
  }

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new ServiceError("AI 请求超时或已取消", { statusCode: 504 });
    }
    const causeMessage = error.cause?.message || error.message || "未知网络错误";
    throw new ServiceError(`AI 网络连接失败：${causeMessage}`, {
      statusCode: 502,
      endpoint: url,
    });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortRequest);
  }
};

const requestAI = async ({ config, messages, timeout = 30000, maxTokens = 900, signal }) => {
  const endpoint = resolveAIEndpoint(config);
  const isAnthropic = config.provider === "anthropic";
  const body = isAnthropic
    ? {
        model: config.model,
        max_tokens: maxTokens,
        system: messages.find((message) => message.role === "system")?.content,
        messages: messages
          .filter((message) => message.role !== "system")
          .map((message) => ({
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

  console.info("[Quiz SSE] AI request", {
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
      signal,
    },
    timeout
  );

  const { rawText, data } = await parseResponseBody(response);
  if (!response.ok) {
    const upstreamBody = summarizeBody(data, rawText);
    throw new ServiceError(
      `AI 服务返回 ${response.status}: ${getUpstreamMessage(data, response.status)}`,
      {
        statusCode: response.status >= 500 ? 502 : 400,
        upstreamStatus: response.status,
        upstreamStatusText: response.statusText,
        upstreamBody,
        endpoint,
      }
    );
  }

  const text = isAnthropic ? data.content?.[0]?.text : data.choices?.[0]?.message?.content;
  if (!text) {
    throw new ServiceError("AI 返回内容为空", { statusCode: 502 });
  }
  return text;
};

const truncatePromptValue = (value, maxLength) => {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n...（已截断）` : text;
};

const extractJSONText = (content) => {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return content.slice(start, end + 1);
  }

  return "";
};

const assertLength = (name, value, maxLength) => {
  if (String(value || "").length > maxLength) {
    throw new ServiceError(`AI 返回的 ${name} 过长，请换一批或降低题目复杂度`, {
      statusCode: 502,
    });
  }
};

const normalizeQuizQuestion = (value) => {
  const rawQuestion = Array.isArray(value?.questions) ? value.questions[0] : value;
  const question = {
    id: randomUUID(),
    question: String(rawQuestion?.question || "").trim(),
    schema: String(rawQuestion?.schema || rawQuestion?.initSQL || "").trim(),
    answer: String(rawQuestion?.answer || "").trim(),
  };

  if (!question.question || !question.schema || !question.answer) {
    throw new ServiceError("AI 返回的题目格式不完整", { statusCode: 502 });
  }

  assertLength("question", question.question, 2500);
  assertLength("schema", question.schema, 8000);
  assertLength("answer", question.answer, 2500);
  return question;
};

const mockSchema = `CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  class TEXT NOT NULL,
  score INTEGER NOT NULL
);
INSERT INTO students (id, name, class, score) VALUES
  (1, 'Alice', 'A', 95),
  (2, 'Bob', 'A', 82),
  (3, 'Cindy', 'B', 91),
  (4, 'Daniel', 'B', 76);`;

const mockQuestionTemplates = [
  {
    question: "查询 students 表的全部数据，返回 id、name、class、score 四列。",
    answer: "SELECT id, name, class, score FROM students;",
  },
  {
    question: "查询成绩大于等于 90 分的学生姓名，按 id 升序返回 name。",
    answer: "SELECT name FROM students WHERE score >= 90 ORDER BY id;",
  },
  {
    question: "统计 students 表中学生总数，返回列名 total。",
    answer: "SELECT COUNT(*) AS total FROM students;",
  },
  {
    question: "按 class 分组统计平均分，返回 class 和 avg_score，并按 class 升序排列。",
    answer: "SELECT class, AVG(score) AS avg_score FROM students GROUP BY class ORDER BY class;",
  },
  {
    question: "查询分数最高的学生姓名和分数，返回 name、score。",
    answer: "SELECT name, score FROM students ORDER BY score DESC LIMIT 1;",
  },
];

const createMockQuestion = (questionIndex) => {
  const template = mockQuestionTemplates[questionIndex % mockQuestionTemplates.length];
  return {
    id: randomUUID(),
    question: `第 ${questionIndex + 1} 题：${template.question}`,
    schema: mockSchema,
    answer: template.answer,
  };
};

const buildQuizQuestionMessages = (session, questionIndex) => {
  const levelSummary = session.questionLevelSummaries[questionIndex];
  const generatedTitles = session.questions.map((item) => item.question);
  const normalizedSummary = {
    key: truncatePromptValue(levelSummary?.key, 120),
    title: truncatePromptValue(levelSummary?.title, 160),
    defaultSQL: truncatePromptValue(levelSummary?.defaultSQL, 700),
    answer: truncatePromptValue(levelSummary?.answer, 1000),
    hint: truncatePromptValue(levelSummary?.hint, 500),
    schemaSummary: truncatePromptValue(levelSummary?.schemaSummary, 3200),
  };

  const systemPrompt = `你是一个 SQL 教学测验出题助手。请生成 1 道 SQL 练习题。

要求：
1. 题目必须基于给定关卡的 SQL 考点摘要，不要依赖未提供的教程正文。
2. 返回内容必须是严格 JSON，不要 Markdown，不要代码块，不要解释。
3. JSON 只允许包含 question、schema、answer 三个字符串字段。
4. schema 必须包含完整、可执行的 SQLite CREATE TABLE 和 INSERT INTO 测试数据。
5. answer 必须是可在 SQLite 中执行的标准 SQL。
6. 不要重复已经生成过的题目。

返回格式：
{
  "question": "题目描述",
  "schema": "CREATE TABLE ...; INSERT INTO ...;",
  "answer": "SELECT ..."
}`;

  const userPrompt = `测验范围：${session.scope}
题号：${questionIndex + 1} / ${session.total}

【关卡 SQL 考点摘要】
${JSON.stringify(normalizedSummary, null, 2)}

【已生成题目，避免重复】
${generatedTitles
  .slice(0, 20)
  .map((title, index) => `${index + 1}. ${truncatePromptValue(title, 180)}`)
  .join("\n") || "暂无"}`;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
};

const emit = (session, event) => {
  session.events.push(event);
  if (session.events.length > 200) {
    session.events = session.events.slice(-120);
  }
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  session.clients.forEach((client) => {
    client.write(payload);
  });
};

const serializeSession = (session) => ({
  id: session.id,
  scope: session.scope,
  total: session.total,
  status: session.status,
  currentGeneratingIndex: session.currentGeneratingIndex,
  questions: session.questions,
  error: session.error,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
});

const generateNextQuestion = async (session) => {
  if (session.generating || session.cancelled || session.questions.length >= session.total) {
    return;
  }

  const questionIndex = session.questions.length;
  session.generating = true;
  session.status = "generating";
  session.currentGeneratingIndex = questionIndex;
  session.updatedAt = Date.now();
  session.controller = new AbortController();
  emit(session, {
    type: "generating",
    sessionId: session.id,
    questionIndex,
    total: session.total,
  });

  try {
    let question;
    if (mockMode) {
      await sleep(mockDelay);
      if (session.cancelled || session.controller.signal.aborted) {
        return;
      }
      question = createMockQuestion(questionIndex);
    } else {
      const response = await requestAI({
        config: readLocalAIConfig(),
        messages: buildQuizQuestionMessages(session, questionIndex),
        timeout: session.timeout,
        maxTokens: 900,
        signal: session.controller.signal,
      });
      const jsonText = extractJSONText(response);
      if (!jsonText) {
        throw new ServiceError("AI 返回格式错误，未找到 JSON", { statusCode: 502 });
      }
      question = normalizeQuizQuestion(JSON.parse(jsonText));
    }
    session.questions.push(question);
    session.error = null;
    session.updatedAt = Date.now();
    emit(session, {
      type: "question",
      sessionId: session.id,
      questionIndex,
      total: session.total,
      question,
    });

    if (session.questions.length >= session.total) {
      session.status = "done";
      session.currentGeneratingIndex = null;
      emit(session, {
        type: "done",
        sessionId: session.id,
        total: session.total,
      });
      return;
    }

    session.status = "ready";
    session.currentGeneratingIndex = null;
    setTimeout(() => generateNextQuestion(session), 300);
  } catch (error) {
    if (session.cancelled || error.name === "AbortError") {
      return;
    }
    session.status = "error";
    session.error = {
      message: error.message || "生成题目失败",
      upstreamStatus: error.upstreamStatus,
      upstreamBody: error.upstreamBody,
    };
    emit(session, {
      type: "error",
      sessionId: session.id,
      questionIndex,
      message: session.error.message,
      upstreamStatus: session.error.upstreamStatus,
      upstreamBody: session.error.upstreamBody,
    });
  } finally {
    session.generating = false;
    session.controller = null;
    if (session.cancelled) {
      session.status = "cancelled";
    } else if (session.status !== "error" && session.status !== "done") {
      session.status = "ready";
    }
  }
};

const createSession = (payload) => {
  const total = Math.max(1, Math.min(Number(payload.total || 1), 10));
  const summaries = Array.isArray(payload.questionLevelSummaries)
    ? payload.questionLevelSummaries.slice(0, total)
    : [];
  if (summaries.length < total && !mockMode) {
    throw new ServiceError("题目关卡摘要数量不足", { statusCode: 400 });
  }
  while (summaries.length < total) {
    summaries.push({
      key: `mock-${summaries.length + 1}`,
      title: "Mock 测验",
      defaultSQL: "",
      answer: "",
      hint: "",
      schemaSummary: mockSchema,
    });
  }

  const session = {
    id: randomUUID(),
    scope: String(payload.scope || "current"),
    total,
    timeout: Math.max(10000, Math.min(Number(payload.timeout || 30000), 60000)),
    questionLevelSummaries: summaries,
    questions: [],
    status: "created",
    error: null,
    generating: false,
    cancelled: false,
    currentGeneratingIndex: null,
    clients: new Set(),
    events: [],
    controller: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  sessions.set(session.id, session);
  emit(session, {
    type: "created",
    sessionId: session.id,
    total: session.total,
  });
  setTimeout(() => generateNextQuestion(session), 0);
  return session;
};

const checkQuizAnswer = async (session, payload) => {
  const questionIndex = Number(payload.questionIndex);
  if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= session.total) {
    throw new ServiceError("题号不合法", { statusCode: 400 });
  }
  const question = session.questions[questionIndex];
  if (!question) {
    throw new ServiceError("题目尚未生成完成，请稍后再提交", { statusCode: 409 });
  }

  const sql = String(payload.sql || "").trim();
  if (!sql) {
    throw new ServiceError("请输入 SQL 后再提交", { statusCode: 400 });
  }
  if (sql.length > 10000) {
    throw new ServiceError("SQL 内容过长，请精简后再提交", { statusCode: 400 });
  }

  let db = null;
  try {
    db = await initQuizDB(question.schema);
    const userResult = runQuizSQL(db, sql);
    const answerResult = runQuizSQL(db, question.answer);
    const isCorrect = isSameResult(userResult, answerResult);
    return {
      isCorrect,
      feedback: isCorrect ? "回答正确。" : "回答错误，请检查 SQL 的列名、排序和结果数据。",
    };
  } catch (error) {
    return {
      isCorrect: false,
      feedback: `SQL 执行出错：${error.message || "请检查语法"}`,
    };
  } finally {
    db?.close();
  }
};

const writeSSEHeaders = (res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");
};

const handleEvents = (req, res, session) => {
  writeSSEHeaders(res);
  session.clients.add(res);
  session.events.forEach((event) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    session.clients.delete(res);
  });
};

const cancelSession = (session) => {
  session.cancelled = true;
  session.status = "cancelled";
  session.controller?.abort();
  session.currentGeneratingIndex = null;
  session.updatedAt = Date.now();
  emit(session, {
    type: "cancelled",
    sessionId: session.id,
  });
};

setInterval(() => {
  const cutoff = Date.now() - 1000 * 60 * 60;
  sessions.forEach((session, sessionId) => {
    if (session.updatedAt < cutoff && session.clients.size === 0) {
      sessions.delete(sessionId);
    }
  });
}, 1000 * 60 * 10).unref();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      jsonResponse(res, 204, {});
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);

    if (req.method === "GET" && url.pathname === "/health") {
      jsonResponse(res, 200, { ok: true, mock: mockMode });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/quiz/sessions") {
      const payload = await readJSONBody(req);
      const session = createSession(payload);
      jsonResponse(res, 200, serializeSession(session));
      return;
    }

    const sessionMatch = url.pathname.match(/^\/api\/quiz\/sessions\/([^/]+)(?:\/([^/]+))?$/);
    if (sessionMatch) {
      const session = sessions.get(sessionMatch[1]);
      const action = sessionMatch[2] || "";
      if (!session) {
        throw new ServiceError("测验任务不存在或已过期", { statusCode: 404 });
      }

      if (req.method === "GET" && !action) {
        jsonResponse(res, 200, serializeSession(session));
        return;
      }

      if (req.method === "GET" && action === "events") {
        handleEvents(req, res, session);
        return;
      }

      if (req.method === "POST" && action === "next") {
        generateNextQuestion(session);
        jsonResponse(res, 200, serializeSession(session));
        return;
      }

      if (req.method === "POST" && action === "retry") {
        if (session.status === "error") {
          session.status = "ready";
          session.error = null;
        }
        generateNextQuestion(session);
        jsonResponse(res, 200, serializeSession(session));
        return;
      }

      if (req.method === "POST" && action === "cancel") {
        cancelSession(session);
        jsonResponse(res, 200, serializeSession(session));
        return;
      }

      if (req.method === "POST" && action === "answer") {
        const payload = await readJSONBody(req);
        const result = await checkQuizAnswer(session, payload);
        session.updatedAt = Date.now();
        jsonResponse(res, 200, result);
        return;
      }
    }

    jsonResponse(res, 404, { message: "Not found" });
  } catch (error) {
    console.error("[Quiz SSE] request failed", error);
    jsonResponse(res, error.statusCode || 500, {
      message: error.message || "Quiz service failed",
      upstreamStatus: error.upstreamStatus,
      upstreamStatusText: error.upstreamStatusText,
      upstreamBody: error.upstreamBody,
      endpoint: error.endpoint,
    });
  }
});

server.listen(port, host, () => {
  console.info(`[Quiz SSE] listening on http://${host}:${port}${mockMode ? " (mock)" : ""}`);
});
