import { ref } from 'vue';
import { useGlobalStore } from '../core/globalStore';
import type { AIConfig } from '../core/globalStore';
import { storeToRefs } from 'pinia';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  signal?: AbortSignal;
  timeout?: number;
  maxTokens?: number;
  onChunk?: (chunk: string) => void;
}

interface AIRequestError extends Error {
  status?: number;
  upstreamStatus?: number;
  upstreamStatusText?: string;
  endpoint?: string;
  upstreamBody?: unknown;
}

const isValidAIConfig = (config: Partial<AIConfig>) => {
  return Boolean(config.provider && config.baseUrl && config.apiKey && config.model);
};

const truncateText = (value: string, maxLength = 1000) => {
  if (!value) {
    return '';
  }
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n...（已截断）` : value;
};

const buildSchemaSummary = (initSQL: string) => {
  const createStatements = initSQL.match(/create\s+table[\s\S]*?;/gi) || [];
  const insertStatements = initSQL.match(/insert\s+into[\s\S]*?;/gi) || [];
  return [
    createStatements.slice(0, 3).join('\n'),
    insertStatements.slice(0, 3).join('\n'),
  ].filter(Boolean).join('\n');
};

const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeout = 60000,
  externalSignal?: AbortSignal
) => {
  const controller = new AbortController();
  let timedOut = false;
  const abortRequest = () => controller.abort();
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener('abort', abortRequest, { once: true });
  }

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      if (!timedOut) {
        throw new Error('AI 请求已取消');
      }
      throw new Error('AI 请求超时，请稍后重试或减少题目数量');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortRequest);
  }
};

const requestAI = async (config: AIConfig, messages: Message[], options: ChatOptions = {}) => {
  const maxTokens = options.maxTokens || 2048;
  const response = await fetchWithTimeout('/api/ai-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      config,
      messages,
      timeout: options.timeout || 60000,
      maxTokens,
    }),
  }, (options.timeout || 60000) + 5000, options.signal);

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const details = [
      errData.upstreamStatus ? `上游状态: ${errData.upstreamStatus}` : '',
      errData.upstreamStatusText ? `状态说明: ${errData.upstreamStatusText}` : '',
      errData.upstreamBody ? `响应: ${String(errData.upstreamBody)}` : '',
    ].filter(Boolean);
    const error = new Error(
      [
        errData.error?.message || errData.message || `请求失败: ${response.status}`,
        ...details,
      ].join('\n')
    ) as AIRequestError;
    error.status = response.status;
    error.upstreamStatus = errData.upstreamStatus;
    error.upstreamStatusText = errData.upstreamStatusText;
    error.endpoint = errData.endpoint;
    error.upstreamBody = errData.upstreamBody;
    throw error;
  }

  const data = await response.json();
  const text = data.text || '';
  if (!text) {
    throw new Error('AI 返回内容为空');
  }
  return text;
};

const parseSSEBlock = (block: string) => {
  const lines = block.split(/\r?\n/);
  let event = 'message';
  const dataLines: string[] = [];

  lines.forEach((line) => {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
      return;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  });

  const rawData = dataLines.join('\n');
  let data: any = {};
  if (rawData) {
    try {
      data = JSON.parse(rawData);
    } catch {
      data = { text: rawData };
    }
  }
  return { event, data };
};

const createStreamError = (data: any, fallbackMessage: string) => {
  const details = [
    data.upstreamStatus ? `上游状态: ${data.upstreamStatus}` : '',
    data.upstreamStatusText ? `状态说明: ${data.upstreamStatusText}` : '',
    data.upstreamBody ? `响应: ${String(data.upstreamBody)}` : '',
  ].filter(Boolean);
  const error = new Error([
    data.message || fallbackMessage,
    ...details,
  ].join('\n')) as AIRequestError;
  error.upstreamStatus = data.upstreamStatus;
  error.upstreamStatusText = data.upstreamStatusText;
  error.endpoint = data.endpoint;
  error.upstreamBody = data.upstreamBody;
  return error;
};

const requestAIStream = async (config: AIConfig, messages: Message[], options: ChatOptions = {}) => {
  const maxTokens = options.maxTokens || 2048;
  const response = await fetchWithTimeout('/api/ai-chat-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      config,
      messages,
      timeout: options.timeout || 60000,
      maxTokens,
    }),
  }, (options.timeout || 60000) + 120000, options.signal);

  if (!response.ok || !response.body) {
    const errData = await response.json().catch(() => ({}));
    throw createStreamError(errData, `请求失败: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  const handleBlock = (block: string) => {
    if (!block.trim()) {
      return;
    }
    const { event, data } = parseSSEBlock(block);
    if (event === 'chunk') {
      const chunk = String(data.text || '');
      fullText += chunk;
      options.onChunk?.(chunk);
      return;
    }
    if (event === 'error') {
      throw createStreamError(data, 'AI 请求失败');
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\n\n/);
    buffer = blocks.pop() || '';
    blocks.forEach(handleBlock);
    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    handleBlock(buffer);
  }

  if (!fullText) {
    throw new Error('AI 返回内容为空');
  }
  return fullText;
};

export function useAI() {
  const globalStore = useGlobalStore();
  const { aiConfig } = storeToRefs(globalStore);
  
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // 调用 AI
  const chat = async (messages: Message[], options?: ChatOptions): Promise<string> => {
    if (!isValidAIConfig(aiConfig.value)) {
      throw new Error('请先配置 AI API');
    }

    isLoading.value = true;
    error.value = null;

    try {
      return await requestAI(aiConfig.value, messages, options);
    } catch (err: any) {
      error.value = err.message;
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const chatStream = async (messages: Message[], options?: ChatOptions): Promise<string> => {
    if (!isValidAIConfig(aiConfig.value)) {
      throw new Error('请先配置 AI API');
    }

    isLoading.value = true;
    error.value = null;

    try {
      return await requestAIStream(aiConfig.value, messages, options);
    } catch (err: any) {
      error.value = err.message;
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const testConfig = async (config: AIConfig) => {
    if (!isValidAIConfig(config)) {
      throw new Error('请先填写完整的 AI 配置');
    }
    return requestAI(config, [
      {
        role: 'user',
        content: '请只回复“连接成功”。',
      },
    ], { timeout: 30000, maxTokens: 128 });
  };

  // 构建上下文 prompt
  const buildContextPrompt = (currentLevel: LevelType, learnedLevels: LevelType[]) => {
    let context = `【当前关卡】
关卡名称：${currentLevel.title}
默认 SQL：
${truncateText(currentLevel.defaultSQL, 500)}
参考答案 SQL：
${truncateText(currentLevel.answer, 800)}
表结构摘要：
${truncateText(buildSchemaSummary(currentLevel.initSQL), 1200)}
${currentLevel.hint ? `提示：\n${currentLevel.hint}\n` : ''}
`;

    if (learnedLevels.length > 0) {
      const recentLearnedLevels = learnedLevels.slice(-12);
      context += `\n【已通关关卡摘要（最近 ${recentLearnedLevels.length} 关）】\n`;
      recentLearnedLevels.forEach((level, index) => {
        context += `\n${index + 1}. ${level.title}
参考答案 SQL：${truncateText(level.answer, 320)}
`;
      });
    }

    return context;
  };

  return {
    chat,
    chatStream,
    buildContextPrompt,
    isValidAIConfig,
    testConfig,
    isLoading,
    error,
  };
}
