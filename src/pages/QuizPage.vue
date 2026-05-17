<template>
  <div id="quizPage">
    <section v-if="!hasActiveQuiz && !isInitialLoading && !showResult" class="quiz-setup">
      <div class="setup-panel">
        <div class="setup-heading">
          <h1>SQL 测验</h1>
          <p>首题生成完成后即可答题，后续题目由 Node 服务逐题生成。</p>
        </div>

        <a-alert
          v-if="isMockMode"
          message="Mock 测验模式已开启"
          description="当前不会请求真实 AI，适合验证页面稳定性。"
          type="info"
          show-icon
        />
        <a-alert
          v-else-if="!isAIConfigured"
          message="请先完成 AI 配置"
          description="配置完成后才能生成测验题目。"
          type="warning"
          show-icon
        />
        <a-alert
          v-if="errorMessage"
          :message="errorMessage"
          type="error"
          show-icon
        />

        <a-form layout="vertical" class="setup-form">
          <a-form-item label="测验范围">
            <a-select v-model:value="quizRange">
              <a-select-option value="current">当前关卡：{{ currentLevel.title }}</a-select-option>
              <a-select-option value="completed-random" :disabled="completedLevels.length === 0">
                随机已通关关卡（{{ completedLevels.length }} 个）
              </a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="题目数量">
            <a-select v-model:value="questionCount">
              <a-select-option :value="3">3 题</a-select-option>
              <a-select-option :value="5">5 题</a-select-option>
              <a-select-option :value="10">10 题</a-select-option>
            </a-select>
          </a-form-item>
          <a-button
            type="primary"
            block
            size="large"
            :loading="isStartingQuiz"
            :disabled="!isAIConfigured || isStartingQuiz"
            @click="startQuiz"
          >
            开始生成测验
          </a-button>
        </a-form>
      </div>
    </section>

    <section v-if="isInitialLoading" class="quiz-loading">
      <a-result
        title="正在生成第 1 题"
        sub-title="首题生成完成后就可以开始答题，后续题目会在后台逐题生成。"
      >
        <template #icon>
          <a-spin size="large" />
        </template>
        <template #extra>
          <a-space direction="vertical" align="center">
            <a-progress :percent="generationProgress" style="width: 320px" />
            <a-button @click="cancelGeneration">取消生成</a-button>
          </a-space>
        </template>
      </a-result>
    </section>

    <section v-if="hasActiveQuiz && !currentQuizQuestion && !isInitialLoading && !showResult" class="quiz-loading">
      <a-result
        title="暂时没有可展示的题目"
        :sub-title="backgroundError || '测验服务正在恢复会话，请稍后重试。'"
      >
        <template #extra>
          <a-space>
            <a-button type="primary" @click="changeBatch">换一批</a-button>
            <a-button @click="restartQuiz">返回设置</a-button>
          </a-space>
        </template>
      </a-result>
    </section>

    <section v-if="currentQuizQuestion && !isInitialLoading && !showResult" class="quiz-content">
      <div class="quiz-status">
        <a-alert
          :message="`测验进度：${currentQuestion + 1} / ${targetQuestionTotal}`"
          :description="statusDescription"
          :type="backgroundError ? 'warning' : 'info'"
          show-icon
        />
      </div>

      <div class="quiz-workspace">
        <section class="quiz-pane quiz-pane-left">
          <div class="pane-title">题目 {{ currentQuestion + 1 }}</div>
          <a-card size="small" class="question-card">
            <pre class="plain-text question-text">{{ currentQuizQuestion.question }}</pre>
          </a-card>

          <a-collapse v-model:activeKey="collapseKeys" class="schema-panel">
            <a-collapse-panel key="schema" header="建表语句">
              <pre class="sql-preview">{{ currentQuizQuestion.schema }}</pre>
            </a-collapse-panel>
          </a-collapse>
        </section>

        <section class="quiz-pane quiz-pane-right">
          <div class="editor-header">
            <span class="pane-title">请输入你的 SQL</span>
            <span class="enter-tip">Enter 提交，Shift + Enter 换行</span>
          </div>
          <textarea
            class="sql-textarea"
            :value="userAnswer"
            :disabled="isCheckingAnswer || currentFeedback?.isCorrect"
            spellcheck="false"
            placeholder="SELECT ..."
            @input="handleAnswerInput"
            @keydown.enter.exact.prevent="checkAnswer"
          />

          <a-card
            v-if="currentFeedback"
            :class="currentFeedback.isCorrect ? 'correct' : 'wrong'"
            class="feedback-card"
            size="small"
          >
            <template #title>
              <span v-if="currentFeedback.isCorrect">回答正确</span>
              <span v-else>回答错误</span>
            </template>
            <p class="feedback-text">{{ currentFeedback.feedback }}</p>
            <div v-if="!currentFeedback.isCorrect" class="answer-block">
              <strong>参考答案：</strong>
              <pre class="sql-preview answer-preview">{{ currentQuizQuestion.answer }}</pre>
            </div>
          </a-card>
        </section>
      </div>

      <div class="quiz-actions">
        <a-space>
          <a-button
            type="primary"
            :loading="isCheckingAnswer"
            :disabled="!userAnswer.trim() || currentFeedback?.isCorrect"
            @click="checkAnswer"
          >
            提交答案
          </a-button>
          <a-button :disabled="isCheckingAnswer || currentFeedback?.isCorrect" @click="showAnswer">
            查看答案
          </a-button>
          <a-button danger :disabled="isCheckingAnswer" @click="changeBatch">换一批</a-button>
        </a-space>
        <a-space>
          <a-button @click="prevQuestion" :disabled="currentQuestion === 0 || isCheckingAnswer">上一题</a-button>
          <a-button v-if="canGoNext" type="primary" :disabled="nextButtonDisabled" @click="nextQuestion">
            {{ nextButtonText }}
          </a-button>
          <a-button
            v-if="currentQuestion === targetQuestionTotal - 1 && allQuestionsGenerated"
            type="primary"
            :disabled="isCheckingAnswer"
            @click="finishQuiz"
          >
            完成测验
          </a-button>
        </a-space>
      </div>
    </section>

    <section v-if="showResult" class="quiz-result">
      <a-result
        :title="`测验完成！正确数：${correctCount} / ${targetQuestionTotal || questions.length}`"
        :sub-title="getResultMessage()"
      >
        <template #icon>
          <div class="quest-celebration" aria-hidden="true">
            <span class="celebration-orbit"></span>
            <span class="celebration-spark spark-one"></span>
            <span class="celebration-spark spark-two"></span>
            <span class="celebration-spark spark-three"></span>
            <span class="celebration-face">
              <span class="face-grid"></span>
              <span class="face-eye eye-left"></span>
              <span class="face-eye eye-right"></span>
              <span class="face-smile"></span>
              <span class="face-route"></span>
            </span>
          </div>
        </template>
        <template #extra>
          <a-space>
            <a-button type="primary" @click="restartQuiz">重新测验</a-button>
            <a-button @click="goLearn">回到学习页</a-button>
          </a-space>
        </template>
      </a-result>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAI } from '../composables/useAI';
import { useGlobalStore } from '../core/globalStore';

interface Question {
  id: string;
  question: string;
  schema: string;
  answer: string;
}

interface AnswerFeedback {
  isCorrect: boolean;
  feedback: string;
}

interface LevelSummary {
  key: string;
  title: string;
  defaultSQL: string;
  answer: string;
  hint: string;
  schemaSummary: string;
}

interface QuizCache {
  sessionId: string;
  userAnswers: string[];
  answerFeedbacks: Array<AnswerFeedback | null>;
  answeredQuestionIds: string[];
  currentQuestion: number;
  targetQuestionTotal: number;
}

const router = useRouter();
const globalStore = useGlobalStore();
const {
  aiConfig,
  currentLevel,
  completedLevels,
  currentLevelKey,
  completedLevelKeys,
} = storeToRefs(globalStore);
const { isValidAIConfig } = useAI();
const QUIZ_SERVICE_URL = String(
  import.meta.env.VITE_AI_QUIZ_SERVER_URL || 'http://127.0.0.1:5174'
).replace(/\/+$/, '');
const isMockMode = import.meta.env.VITE_AI_QUIZ_MOCK === '1';

const quizRange = ref('current');
const questionCount = ref(5);
const sessionId = ref('');
const questions = shallowRef<Question[]>([]);
const currentQuestion = ref(0);
const userAnswer = ref('');
const userAnswers = ref<string[]>([]);
const answerFeedbacks = ref<Array<AnswerFeedback | null>>([]);
const answeredQuestionIds = ref<string[]>([]);
const showResult = ref(false);
const errorMessage = ref('');
const backgroundError = ref('');
const collapseKeys = ref<string[]>([]);
const targetQuestionTotal = ref(0);
const isInitialLoading = ref(false);
const isStartingQuiz = ref(false);
const isGeneratingQuestion = ref(false);
const isCheckingAnswer = ref(false);
const generatingIndex = ref<number | null>(null);
const waitingQuestionIndex = ref<number | null>(null);
const eventSource = ref<EventSource | null>(null);
const activeCacheKey = ref('');
const cacheWriteTimer = ref<number | null>(null);

const CACHE_PREFIX = 'aiQuiz:v3:';
const LAST_CACHE_KEY = 'aiQuiz:lastCacheKey';

const isAIConfigured = computed(() => isMockMode || isValidAIConfig(aiConfig.value));
const hasActiveQuiz = computed(() => Boolean(sessionId.value || questions.value.length));
const currentQuizQuestion = computed(() => questions.value[currentQuestion.value] || null);
const currentFeedback = computed(() => answerFeedbacks.value[currentQuestion.value] || null);
const generatedQuestionLength = computed(() => questions.value.length);
const correctCount = computed(() => answerFeedbacks.value.filter((item) => item?.isCorrect).length);
const allQuestionsGenerated = computed(() => generatedQuestionLength.value >= targetQuestionTotal.value);
const canGoNext = computed(() => currentQuestion.value < targetQuestionTotal.value - 1);
const generationProgress = computed(() => {
  if (!targetQuestionTotal.value) {
    return 0;
  }
  return Math.round((generatedQuestionLength.value / targetQuestionTotal.value) * 100);
});
const statusDescription = computed(() => {
  if (backgroundError.value) {
    return backgroundError.value;
  }
  if (isGeneratingQuestion.value && generatingIndex.value !== null) {
    return `正在生成第 ${generatingIndex.value + 1} / ${targetQuestionTotal.value} 题`;
  }
  return `已生成 ${generatedQuestionLength.value} / ${targetQuestionTotal.value} 题`;
});
const nextButtonText = computed(() => {
  if (currentQuestion.value + 1 < generatedQuestionLength.value) {
    return '下一题';
  }
  if (backgroundError.value) {
    return '重试生成下一题';
  }
  return '等待下一题...';
});
const nextButtonDisabled = computed(() => {
  if (isCheckingAnswer.value) {
    return true;
  }
  if (currentQuestion.value + 1 < generatedQuestionLength.value) {
    return false;
  }
  return !backgroundError.value;
});

const quizServiceFetch = (path: string, options?: RequestInit) => {
  return fetch(`${QUIZ_SERVICE_URL}${path}`, options);
};

const truncateText = (value: string, maxLength: number) => {
  if (!value) {
    return '';
  }
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n...（已截断）` : value;
};

const buildSchemaSummary = (initSQL: string) => {
  const createStatements = initSQL.match(/create\s+table[\s\S]*?;/gi) || [];
  const insertStatements = initSQL.match(/insert\s+into[\s\S]*?;/gi) || [];
  return [
    createStatements.slice(0, 4).join('\n'),
    insertStatements.slice(0, 4).join('\n'),
  ].filter(Boolean).join('\n');
};

const toLevelSummary = (level: LevelType): LevelSummary => ({
  key: level.key,
  title: level.title,
  defaultSQL: truncateText(level.defaultSQL, 600),
  answer: truncateText(level.answer, 900),
  hint: truncateText(level.hint || '', 400),
  schemaSummary: truncateText(buildSchemaSummary(level.initSQL), 2600),
});

const createQuestionId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const normalizeQuestion = (question: Question): Question => ({
  id: question.id || createQuestionId(),
  question: String(question.question || ''),
  schema: String(question.schema || ''),
  answer: String(question.answer || ''),
});

const getCacheKey = () => {
  const completedKeyPart = completedLevelKeys.value.join(',');
  return `${CACHE_PREFIX}${quizRange.value}:${questionCount.value}:${currentLevelKey.value}:${completedKeyPart}`;
};

const readCache = (cacheKey: string): QuizCache | null => {
  try {
    const rawValue = window.sessionStorage.getItem(cacheKey);
    if (!rawValue) {
      return null;
    }
    const parsed = JSON.parse(rawValue);
    if (!parsed.sessionId) {
      return null;
    }
    return {
      sessionId: String(parsed.sessionId),
      userAnswers: Array.isArray(parsed.userAnswers) ? parsed.userAnswers : [],
      answerFeedbacks: Array.isArray(parsed.answerFeedbacks) ? parsed.answerFeedbacks : [],
      answeredQuestionIds: Array.isArray(parsed.answeredQuestionIds) ? parsed.answeredQuestionIds : [],
      currentQuestion: Number(parsed.currentQuestion || 0),
      targetQuestionTotal: Number(parsed.targetQuestionTotal || questionCount.value),
    };
  } catch {
    return null;
  }
};

const writeCache = () => {
  if (cacheWriteTimer.value) {
    window.clearTimeout(cacheWriteTimer.value);
  }
  cacheWriteTimer.value = window.setTimeout(() => {
    cacheWriteTimer.value = null;
    flushCache();
  }, 120);
};

const flushCache = () => {
  if (!activeCacheKey.value || !sessionId.value || showResult.value) {
    return;
  }
  const cache: QuizCache = {
    sessionId: sessionId.value,
    userAnswers: userAnswers.value.map((answer) => truncateText(answer, 5000)),
    answerFeedbacks: answerFeedbacks.value.map((item) => item ? ({
      isCorrect: item.isCorrect,
      feedback: truncateText(item.feedback, 1200),
    }) : null),
    answeredQuestionIds: answeredQuestionIds.value,
    currentQuestion: currentQuestion.value,
    targetQuestionTotal: targetQuestionTotal.value,
  };
  try {
    window.sessionStorage.setItem(activeCacheKey.value, JSON.stringify(cache));
    window.sessionStorage.setItem(LAST_CACHE_KEY, activeCacheKey.value);
  } catch (error) {
    console.warn('[QuizPage] write cache failed', error);
  }
};

const clearActiveCache = () => {
  if (activeCacheKey.value) {
    window.sessionStorage.removeItem(activeCacheKey.value);
  }
  const lastCacheKey = window.sessionStorage.getItem(LAST_CACHE_KEY);
  if (!activeCacheKey.value || lastCacheKey === activeCacheKey.value) {
    window.sessionStorage.removeItem(LAST_CACHE_KEY);
  }
};

const selectLevels = () => {
  if (quizRange.value === 'current') {
    return [currentLevel.value];
  }
  return completedLevels.value;
};

const getQuestionLevels = (levels: LevelType[], total: number) => {
  const shuffledLevels = [...levels].sort(() => Math.random() - 0.5);
  return Array.from({ length: total }, (_, index) => shuffledLevels[index % shuffledLevels.length]);
};

const ensureAnswerSlots = () => {
  const length = Math.max(targetQuestionTotal.value, questions.value.length);
  while (userAnswers.value.length < length) {
    userAnswers.value.push('');
  }
  while (answerFeedbacks.value.length < length) {
    answerFeedbacks.value.push(null);
  }
};

const restoreCache = (cacheKey: string) => {
  const cache = readCache(cacheKey);
  if (!cache) {
    return false;
  }

  resetQuizState();
  sessionId.value = cache.sessionId;
  userAnswers.value = cache.userAnswers;
  answerFeedbacks.value = cache.answerFeedbacks;
  answeredQuestionIds.value = cache.answeredQuestionIds;
  currentQuestion.value = Math.max(0, cache.currentQuestion || 0);
  targetQuestionTotal.value = cache.targetQuestionTotal || questionCount.value;
  userAnswer.value = userAnswers.value[currentQuestion.value] || '';
  activeCacheKey.value = cacheKey;
  showResult.value = false;
  isInitialLoading.value = true;
  ensureAnswerSlots();
  connectEvents(sessionId.value);
  loadServerSession(sessionId.value);
  return true;
};

const tryRestoreLastCache = () => {
  const cacheKey = window.sessionStorage.getItem(LAST_CACHE_KEY);
  if (cacheKey && cacheKey.startsWith(CACHE_PREFIX)) {
    restoreCache(cacheKey);
  }
};

const resetQuizState = () => {
  closeEvents();
  sessionId.value = '';
  questions.value = [];
  currentQuestion.value = 0;
  userAnswer.value = '';
  userAnswers.value = [];
  answerFeedbacks.value = [];
  answeredQuestionIds.value = [];
  showResult.value = false;
  errorMessage.value = '';
  backgroundError.value = '';
  collapseKeys.value = [];
  targetQuestionTotal.value = 0;
  waitingQuestionIndex.value = null;
  activeCacheKey.value = '';
  isInitialLoading.value = false;
  isStartingQuiz.value = false;
  isGeneratingQuestion.value = false;
  isCheckingAnswer.value = false;
  generatingIndex.value = null;
};

const setCurrentQuestion = (index: number) => {
  currentQuestion.value = index;
  userAnswer.value = userAnswers.value[index] || '';
  collapseKeys.value = [];
  writeCache();
};

const appendQuestion = (question: Question, index: number) => {
  const normalizedQuestion = normalizeQuestion(question);
  const nextQuestions = questions.value.slice();
  nextQuestions[index] = normalizedQuestion;
  questions.value = nextQuestions.filter(Boolean);
  ensureAnswerSlots();
  backgroundError.value = '';

  if (waitingQuestionIndex.value === index) {
    setCurrentQuestion(index);
    waitingQuestionIndex.value = null;
  }

  if (questions.value.length > 0) {
    isInitialLoading.value = false;
  }
  writeCache();
};

const applyServerSession = (session: any) => {
  sessionId.value = session.id || sessionId.value;
  targetQuestionTotal.value = Number(session.total || targetQuestionTotal.value || questionCount.value);

  if (Array.isArray(session.questions)) {
    questions.value = session.questions.map((question: Question) => normalizeQuestion(question));
    ensureAnswerSlots();
    if (questions.value.length > 0) {
      currentQuestion.value = Math.min(currentQuestion.value, questions.value.length - 1);
      userAnswer.value = userAnswers.value[currentQuestion.value] || '';
      isInitialLoading.value = false;
    }
  }

  if (session.status === 'generating') {
    isGeneratingQuestion.value = true;
    generatingIndex.value = session.currentGeneratingIndex;
  } else {
    isGeneratingQuestion.value = false;
    generatingIndex.value = null;
  }

  if (session.status === 'error' && session.error?.message) {
    isInitialLoading.value = false;
    backgroundError.value = `${session.error.message}。请手动重试生成。`;
  }

  if (session.status === 'done') {
    isGeneratingQuestion.value = false;
    generatingIndex.value = null;
  }

  writeCache();
};

const closeEvents = () => {
  eventSource.value?.close();
  eventSource.value = null;
};

const handleSSEEvent = (event: MessageEvent) => {
  let data: any;
  try {
    data = JSON.parse(event.data);
  } catch {
    return;
  }

  if (data.type === 'generating') {
    isGeneratingQuestion.value = true;
    generatingIndex.value = data.questionIndex;
    backgroundError.value = '';
    return;
  }

  if (data.type === 'question') {
    appendQuestion(data.question, data.questionIndex);
    isGeneratingQuestion.value = false;
    generatingIndex.value = null;
    return;
  }

  if (data.type === 'error') {
    isInitialLoading.value = false;
    isGeneratingQuestion.value = false;
    generatingIndex.value = null;
    backgroundError.value = `${data.message || '生成题目失败'}。请手动重试生成。`;
    if (questions.value.length === 0) {
      errorMessage.value = data.message || '生成测验失败';
    }
    return;
  }

  if (data.type === 'done' || data.type === 'cancelled') {
    isGeneratingQuestion.value = false;
    generatingIndex.value = null;
  }
};

const connectEvents = (id: string) => {
  if (!id) {
    return;
  }
  closeEvents();
  const source = new EventSource(`${QUIZ_SERVICE_URL}/api/quiz/sessions/${id}/events`);
  eventSource.value = source;
  ['created', 'generating', 'question', 'error', 'done', 'cancelled'].forEach((eventName) => {
    source.addEventListener(eventName, handleSSEEvent);
  });
  source.onerror = () => {
    if (sessionId.value && !showResult.value) {
      backgroundError.value = '测验服务连接中断，浏览器会自动重连。';
    }
  };
};

const loadServerSession = async (id: string) => {
  try {
    const response = await quizServiceFetch(`/api/quiz/sessions/${id}`);
    if (!response.ok) {
      throw new Error('测验任务已过期');
    }
    applyServerSession(await response.json());
  } catch (error: any) {
    clearActiveCache();
    resetQuizState();
    errorMessage.value = `${error.message || '恢复测验失败'}，请重新生成。`;
  }
};

const requestServerNext = async (action = 'next') => {
  if (!sessionId.value) {
    backgroundError.value = '测验任务不存在，请点击“换一批”重新生成。';
    return;
  }

  try {
    const response = await quizServiceFetch(`/api/quiz/sessions/${sessionId.value}/${action}`, {
      method: 'POST',
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || '请求生成下一题失败');
    }
    applyServerSession(await response.json());
  } catch (error: any) {
    backgroundError.value = `${error.message || '请求生成下一题失败'}。`;
  }
};

const startQuiz = async () => {
  if (!isAIConfigured.value) {
    errorMessage.value = '请先完成 AI 配置';
    return;
  }

  const levels = selectLevels();
  if (levels.length === 0) {
    errorMessage.value = '没有可用于生成测验的关卡';
    return;
  }

  const cacheKey = getCacheKey();
  if (restoreCache(cacheKey)) {
    return;
  }

  resetQuizState();
  activeCacheKey.value = cacheKey;
  targetQuestionTotal.value = questionCount.value;
  isInitialLoading.value = true;
  isStartingQuiz.value = true;

  try {
    const questionLevelSummaries = getQuestionLevels(levels, questionCount.value).map(toLevelSummary);
    const response = await quizServiceFetch('/api/quiz/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scope: quizRange.value,
        total: questionCount.value,
        questionLevelSummaries,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || '创建测验任务失败');
    }
    const session = await response.json();
    applyServerSession(session);
    connectEvents(session.id);
    writeCache();
  } catch (error: any) {
    isInitialLoading.value = false;
    errorMessage.value = `${error.message || '创建测验任务失败'}。请确认 Node 测验服务已启动。`;
  } finally {
    isStartingQuiz.value = false;
  }
};

const cancelGeneration = () => {
  if (sessionId.value) {
    quizServiceFetch(`/api/quiz/sessions/${sessionId.value}/cancel`, {
      method: 'POST',
    }).catch(() => undefined);
  }
  closeEvents();
  isInitialLoading.value = false;
  isGeneratingQuestion.value = false;
  if (questions.value.length === 0) {
    errorMessage.value = '已取消生成';
    sessionId.value = '';
  }
};

const setAnswerFeedback = (index: number, feedback: AnswerFeedback) => {
  const nextFeedbacks = answerFeedbacks.value.slice();
  nextFeedbacks[index] = feedback;
  answerFeedbacks.value = nextFeedbacks;
};

const saveCurrentAnswer = (value: string) => {
  const nextAnswers = userAnswers.value.slice();
  nextAnswers[currentQuestion.value] = value;
  userAnswers.value = nextAnswers;
  writeCache();
};

const handleAnswerInput = (event: Event) => {
  const value = (event.target as HTMLTextAreaElement).value;
  userAnswer.value = value;
  saveCurrentAnswer(value);
};

const markCurrentQuestionAnswered = () => {
  const question = currentQuizQuestion.value;
  if (question && !answeredQuestionIds.value.includes(question.id)) {
    answeredQuestionIds.value = [...answeredQuestionIds.value, question.id];
  }
  writeCache();
};

const checkAnswer = async () => {
  if (!userAnswer.value.trim() || isCheckingAnswer.value || currentFeedback.value?.isCorrect) {
    return;
  }
  if (!sessionId.value) {
    backgroundError.value = '测验任务不存在，请点击“换一批”重新生成。';
    return;
  }

  const questionIndex = currentQuestion.value;
  isCheckingAnswer.value = true;
  saveCurrentAnswer(userAnswer.value);

  try {
    const response = await quizServiceFetch(`/api/quiz/sessions/${sessionId.value}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        questionIndex,
        sql: userAnswer.value,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || '判题失败');
    }
    setAnswerFeedback(questionIndex, {
      isCorrect: Boolean(data.isCorrect),
      feedback: String(data.feedback || (data.isCorrect ? '回答正确。' : '回答错误，请检查 SQL。')),
    });
    markCurrentQuestionAnswered();
  } catch (error: any) {
    setAnswerFeedback(questionIndex, {
      isCorrect: false,
      feedback: `判题失败：${error.message || '请稍后重试'}`,
    });
    markCurrentQuestionAnswered();
  } finally {
    isCheckingAnswer.value = false;
  }
};

const showAnswer = () => {
  if (isCheckingAnswer.value || currentFeedback.value?.isCorrect) {
    return;
  }
  setAnswerFeedback(currentQuestion.value, {
    isCorrect: false,
    feedback: '已显示参考答案，请自行对比学习。',
  });
  markCurrentQuestionAnswered();
};

const prevQuestion = () => {
  if (currentQuestion.value <= 0 || isCheckingAnswer.value) {
    return;
  }
  setCurrentQuestion(currentQuestion.value - 1);
};

const nextQuestion = () => {
  if (isCheckingAnswer.value) {
    return;
  }
  const nextIndex = currentQuestion.value + 1;
  if (nextIndex >= targetQuestionTotal.value) {
    return;
  }
  if (nextIndex < generatedQuestionLength.value) {
    setCurrentQuestion(nextIndex);
    return;
  }
  waitingQuestionIndex.value = nextIndex;
  if (!isGeneratingQuestion.value) {
    requestServerNext(backgroundError.value ? 'retry' : 'next');
  }
};

const finishQuiz = () => {
  clearActiveCache();
  closeEvents();
  showResult.value = true;
};

const restartQuiz = () => {
  clearActiveCache();
  resetQuizState();
};

const changeBatch = () => {
  cancelGeneration();
  clearActiveCache();
  resetQuizState();
  startQuiz();
};

const goLearn = () => {
  router.push('/learn');
};

const getResultMessage = () => {
  const rate = correctCount.value / (targetQuestionTotal.value || questions.value.length || 1);
  if (rate >= 0.9) {
    return '掌握得很稳，可以继续挑战下一组。';
  }
  if (rate >= 0.6) {
    return '整体不错，建议复盘错题里的 SQL 写法。';
  }
  return '建议回到对应关卡再练一轮。';
};

onMounted(() => {
  tryRestoreLastCache();
});

onUnmounted(() => {
  if (cacheWriteTimer.value) {
    window.clearTimeout(cacheWriteTimer.value);
    cacheWriteTimer.value = null;
  }
  flushCache();
  closeEvents();
});
</script>

<style scoped>
#quizPage {
  width: min(var(--sql-content-width), calc(100vw - 64px));
  min-width: 1116px;
  margin: 0 auto;
  padding-top: 18px;
}

.quiz-setup {
  min-height: 620px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
}

.setup-panel {
  width: 620px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 28px;
  border: 1px solid var(--sql-line);
  border-radius: var(--sql-radius-lg);
  background: var(--sql-surface);
  box-shadow: var(--sql-tight-shadow);
}

.setup-heading {
  text-align: left;
}

.setup-heading h1 {
  margin-bottom: 8px;
  color: var(--sql-ink);
  font-family:
    "Songti SC",
    "STSong",
    "Noto Serif CJK SC",
    serif;
  font-size: 42px;
  font-weight: 900;
}

.setup-heading p {
  margin: 0;
  color: var(--sql-ink-soft);
  line-height: 1.75;
}

.quiz-loading,
.quiz-result {
  min-height: 560px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.quiz-result :deep(.ant-result) {
  min-width: 720px;
  padding: 48px 58px;
  border: 1px solid var(--sql-line);
  border-radius: 30px;
  background: var(--sql-surface);
  box-shadow: var(--sql-shadow);
}

.quiz-result :deep(.ant-result-title) {
  color: var(--sql-ink);
  font-size: 36px;
  font-weight: 900;
}

.quiz-result :deep(.ant-result-subtitle) {
  color: var(--sql-muted);
  font-size: 17px;
}

.quest-celebration {
  position: relative;
  width: 150px;
  height: 150px;
  margin: 0 auto;
}

.celebration-face {
  position: absolute;
  inset: 22px;
  border: 3px solid rgba(246, 212, 145, 0.42);
  border-radius: 30px;
  background: var(--sql-terminal);
  box-shadow:
    0 22px 42px rgba(16, 38, 31, 0.28),
    inset 0 0 0 1px rgba(255, 250, 240, 0.1);
  animation: face-bounce 2.4s ease-in-out infinite;
  overflow: hidden;
}

.face-grid {
  position: absolute;
  inset: 20px 16px 18px;
  border: 2px solid rgba(255, 250, 240, 0.72);
  border-radius: 14px;
  background:
    linear-gradient(rgba(255, 250, 240, 0.13) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 250, 240, 0.13) 1px, transparent 1px),
    rgba(255, 250, 240, 0.08);
  background-size: 24px 18px;
}

.face-eye {
  position: absolute;
  top: 50px;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--sql-amber-soft);
  box-shadow: 0 0 16px rgba(246, 212, 145, 0.4);
}

.eye-left {
  left: 42px;
}

.eye-right {
  right: 42px;
  animation: wink 2.4s ease-in-out infinite;
}

.face-smile {
  position: absolute;
  left: 50%;
  bottom: 42px;
  width: 34px;
  height: 18px;
  border-bottom: 4px solid var(--sql-mint);
  border-radius: 0 0 999px 999px;
  transform: translateX(-50%);
}

.face-route {
  position: absolute;
  left: 34px;
  top: 28px;
  width: 60px;
  height: 42px;
  border-top: 4px solid var(--sql-amber);
  border-right: 4px solid var(--sql-amber);
  border-radius: 26px 26px 0 0;
  transform: rotate(18deg);
}

.celebration-orbit {
  position: absolute;
  inset: 8px;
  border: 2px dashed rgba(14, 111, 89, 0.26);
  border-radius: 45% 55% 52% 48%;
  animation: orbit-spin 8s linear infinite;
}

.celebration-spark {
  position: absolute;
  width: 13px;
  height: 13px;
  border-radius: 3px;
  background: var(--sql-amber-soft);
  animation: spark-pop 2.2s ease-in-out infinite;
}

.spark-one {
  left: 16px;
  top: 36px;
}

.spark-two {
  right: 18px;
  top: 28px;
  background: var(--sql-mint);
  animation-delay: 0.35s;
}

.spark-three {
  right: 24px;
  bottom: 26px;
  background: var(--sql-amber);
  animation-delay: 0.72s;
}

@keyframes face-bounce {
  0%,
  100% {
    transform: translateY(0) rotate(-1deg);
  }
  50% {
    transform: translateY(-8px) rotate(1deg);
  }
}

@keyframes wink {
  0%,
  72%,
  100% {
    transform: scaleY(1);
  }
  80%,
  88% {
    transform: scaleY(0.18);
  }
}

@keyframes orbit-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes spark-pop {
  0%,
  100% {
    opacity: 0.32;
    transform: translateY(0) rotate(0deg) scale(0.72);
  }
  45% {
    opacity: 1;
    transform: translateY(-8px) rotate(24deg) scale(1);
  }
}

.quiz-content {
  height: calc(100vh - 150px);
  min-height: 620px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.quiz-status {
  flex-shrink: 0;
  margin-bottom: 16px;
}

.quiz-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(430px, 0.9fr);
  gap: 16px;
}

.quiz-pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.pane-title {
  font-size: 16px;
  font-weight: 900;
  color: var(--sql-ink);
}

.question-card {
  flex-shrink: 0;
  max-height: 230px;
  overflow-y: auto;
  border-radius: var(--sql-radius-lg);
  box-shadow: var(--sql-tight-shadow);
}

.plain-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  line-height: 1.7;
}

.question-text {
  color: var(--sql-ink);
}

.schema-panel {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.schema-panel :deep(.ant-collapse-content-box) {
  padding: 12px;
}

.sql-preview {
  max-height: 360px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  color: #d7f5e8;
  background: var(--sql-terminal);
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.answer-preview {
  max-height: 160px;
  margin-top: 8px;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.enter-tip {
  color: var(--sql-muted);
  font-size: 12px;
  white-space: nowrap;
}

.sql-textarea {
  width: 100%;
  min-height: 280px;
  flex: 0 0 280px;
  resize: none;
  padding: 14px;
  color: #d7f5e8;
  background: var(--sql-terminal);
  border: 1px solid rgba(136, 216, 190, 0.18);
  border-radius: 18px;
  outline: none;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
  font-size: 14px;
  line-height: 1.7;
}

.sql-textarea:focus {
  border-color: var(--sql-green);
  box-shadow: 0 0 0 3px rgba(14, 111, 89, 0.14);
}

.sql-textarea:disabled {
  opacity: 0.75;
  cursor: not-allowed;
}

.feedback-card {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  border-radius: var(--sql-radius-lg);
}

.feedback-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
}

.correct :deep(.ant-card-head) {
  background: rgba(14, 111, 89, 0.09);
  color: var(--sql-green);
}

.wrong :deep(.ant-card-head) {
  background: rgba(184, 77, 61, 0.08);
  color: var(--sql-red);
}

.answer-block {
  margin-top: 12px;
}

.quiz-actions {
  flex-shrink: 0;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--sql-line);
  display: flex;
  justify-content: space-between;
  gap: 16px;
  background: rgba(247, 243, 232, 0.88);
}
</style>
