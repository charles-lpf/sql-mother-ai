<template>
  <a-modal
    v-model:visible="visible"
    title="SQL 小测验"
    :width="1280"
    :footer="null"
    :body-style="{ padding: 0 }"
    @cancel="handleClose"
  >
    <div class="quiz-setup" v-if="!isLoading && !quizData">
      <div class="quiz-setup-panel">
        <a-alert
          message="即将开始测验"
          description="AI 将根据当前关卡或已通关关卡生成 SQL 题目。请认真作答！"
          type="info"
          show-icon
        />
        <a-alert
          v-if="errorMessage"
          :message="errorMessage"
          type="error"
          show-icon
        />
        <a-form layout="vertical" class="quiz-setup-form">
          <a-form-item label="选择测验范围">
            <a-select v-model:value="quizRange">
              <a-select-option value="current">
                当前关卡
              </a-select-option>
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
          <a-form-item>
            <a-button
              type="primary"
              block
              size="large"
              :disabled="!isAIConfigured"
              @click="generateQuiz"
            >
              开始生成测验
            </a-button>
          </a-form-item>
        </a-form>
      </div>
    </div>

    <div class="quiz-container" v-if="isLoading">
      <a-result
        title="AI 正在逐题生成..."
        :sub-title="`正在生成第 ${generatingQuestionLabel} / ${generatingQuestionTotal} 题，请稍候`"
      >
        <template #icon>
          <a-spin size="large" />
        </template>
        <template #extra>
          <a-space direction="vertical" align="center">
            <a-progress
              :percent="generatingProgress"
              :show-info="true"
              style="width: 320px"
            />
            <a-button @click="cancelGeneration">取消生成</a-button>
          </a-space>
        </template>
      </a-result>
    </div>

    <div class="quiz-content" v-if="quizData && currentQuizQuestion && !isLoading && !showResult">
      <div class="quiz-toolbar">
        <a-alert
          :message="`测验进度: ${currentQuestion + 1} / ${targetQuestionTotal}`"
          :description="isBackgroundGenerating ? `后台正在生成题目：${generatedQuestionLength} / ${targetQuestionTotal}` : backgroundError"
          type="info"
          show-icon
        />
      </div>

      <div class="quiz-workspace">
        <section class="quiz-pane quiz-pane-left">
          <div class="pane-title">题目 {{ currentQuestion + 1 }}</div>
          <a-card size="small" class="question-card">
            <div v-html="renderMarkdown(currentQuizQuestion.question)"></div>
          </a-card>

          <a-collapse v-model:activeKey="collapseKeys" class="schema-panel">
            <a-collapse-panel key="schema" header="建表语句">
              <code-editor
                v-if="collapseKeys.includes('schema')"
                :init-value="currentQuizQuestion.schema"
                :editor-style="{ height: '360px' }"
                read-only
              />
            </a-collapse-panel>
          </a-collapse>
        </section>

        <section class="quiz-pane quiz-pane-right">
          <div class="editor-header">
            <span class="pane-title">请输入你的 SQL</span>
            <span class="enter-tip">Enter 自动提交</span>
          </div>
          <code-editor
            :init-value="userAnswer"
            :key="currentQuestion"
            :editor-style="{ height: '420px' }"
            submit-on-enter
            @change="handleCodeChange"
            @submit="checkAnswer"
          />

          <a-card
            v-if="currentFeedback"
            :class="currentFeedback.isCorrect ? 'correct' : 'wrong'"
            class="feedback-card"
            size="small"
          >
            <template #title>
              <span v-if="currentFeedback.isCorrect">回答正确！</span>
              <span v-else>回答错误</span>
            </template>
            <div v-html="renderMarkdown(currentFeedback.feedback)"></div>
            <div v-if="!currentFeedback.isCorrect" class="answer-block">
              <strong>参考答案：</strong>
              <code-editor
                v-if="currentFeedback"
                :init-value="currentQuizQuestion.answer"
                :editor-style="{ height: '140px' }"
                read-only
              />
            </div>
          </a-card>
        </section>
      </div>

      <div class="quiz-actions">
        <a-space>
          <a-button @click="checkAnswer" type="primary">
            提交答案
          </a-button>
          <a-button @click="showAnswer">
            查看答案
          </a-button>
          <a-button danger @click="changeBatch">
            换一批
          </a-button>
        </a-space>
        <a-space>
          <a-button @click="prevQuestion" :disabled="currentQuestion === 0">
            上一题
          </a-button>
          <a-button
            v-if="canGoNext"
            type="primary"
            @click="nextQuestion"
          >
            {{ nextButtonText }}
          </a-button>
          <a-button
            v-if="currentQuestion === targetQuestionTotal - 1 && allQuestionsGenerated"
            type="primary"
            @click="finishQuiz"
          >
            完成测验
          </a-button>
        </a-space>
      </div>
    </div>

    <!-- 测验结果 -->
    <div class="quiz-result" v-if="showResult">
      <a-result
        :title="`测验完成！正确数: ${correctCount} / ${quizData?.questions.length}`"
        :sub-title="getResultMessage()"
      >
        <template #icon>
          <span style="font-size: 48px">{{ getResultEmoji() }}</span>
        </template>
        <template #extra>
          <a-space direction="vertical">
            <a-button type="primary" @click="restartQuiz">
              重新测验
            </a-button>
            <a-button @click="handleClose">
              关闭
            </a-button>
          </a-space>
        </template>
      </a-result>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useGlobalStore } from '../core/globalStore';
import { storeToRefs } from 'pinia';
import { useAI } from '../composables/useAI';
import { initDB, runSQL } from '../core/sqlExecutor';
import { checkResult, RESULT_STATUS_ENUM } from '../core/result';
import CodeEditor from './CodeEditor.vue';
import MarkdownIt from 'markdown-it';

interface Question {
  id: string;
  question: string;
  schema: string;
  answer: string;
  levelKey?: string;
}

interface AnswerFeedback {
  isCorrect: boolean;
  feedback: string;
}

interface QuizData {
  questions: Question[];
}

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
}>();

const globalStore = useGlobalStore();
const { aiConfig, currentLevel, completedLevels } = storeToRefs(globalStore);
const { chat, isValidAIConfig } = useAI();

const md = new MarkdownIt();

const visible = ref(false);
const isLoading = ref(false);
const quizRange = ref('current');
const questionCount = ref(5);
const collapseKeys = ref<string[]>([]);
const quizData = ref<QuizData | null>(null);
const currentQuestion = ref(0);
const userAnswer = ref('');
const userAnswers = ref<string[]>([]);
const answerFeedbacks = ref<Array<AnswerFeedback | null>>([]);
const answeredQuestionIds = ref<string[]>([]);
const showResult = ref(false);
const errorMessage = ref('');
const generatingQuestionTotal = ref(0);
const generatedQuestionCount = ref(0);
const targetQuestionTotal = ref(0);
const isBackgroundGenerating = ref(false);
const backgroundError = ref('');
const waitingQuestionIndex = ref<number | null>(null);
const generationRunId = ref(0);
const currentGenerationLevels = ref<LevelType[]>([]);
const activeGenerationController = ref<AbortController | null>(null);
const QUIZ_CACHE_KEY = 'aiQuizCache:v1';

const isAIConfigured = computed(() => isValidAIConfig(aiConfig.value));
const currentFeedback = computed(() => answerFeedbacks.value[currentQuestion.value] || null);
const currentQuizQuestion = computed(() => {
  return quizData.value?.questions[currentQuestion.value] || null;
});
const generatedQuestionLength = computed(() => quizData.value?.questions.length || 0);
const correctCount = computed(() => {
  return answerFeedbacks.value.filter((feedback) => feedback?.isCorrect).length;
});
const generatingProgress = computed(() => {
  if (!generatingQuestionTotal.value) {
    return 0;
  }
  return Math.round((generatedQuestionCount.value / generatingQuestionTotal.value) * 100);
});
const generatingQuestionLabel = computed(() => {
  if (!generatingQuestionTotal.value) {
    return 0;
  }
  return Math.min(generatedQuestionCount.value + 1, generatingQuestionTotal.value);
});
const hasNextQuestion = computed(() => {
  return currentQuestion.value + 1 < generatedQuestionLength.value;
});
const canGoNext = computed(() => {
  return currentQuestion.value < targetQuestionTotal.value - 1;
});
const allQuestionsGenerated = computed(() => {
  return generatedQuestionLength.value >= targetQuestionTotal.value;
});
const nextButtonText = computed(() => {
  if (hasNextQuestion.value) {
    return '下一题';
  }
  if (isBackgroundGenerating.value) {
    return '等待下一题...';
  }
  return '重试生成下一题';
});

const getUnansweredQuestions = () => {
  const answeredSet = new Set(answeredQuestionIds.value);
  return (quizData.value?.questions || []).filter((question) => {
    return !answeredSet.has(question.id);
  });
};

const readSessionQuizCache = () => {
  return [];
  try {
    const rawValue = window.sessionStorage.getItem(QUIZ_CACHE_KEY);
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item: any) => ({
        id: String(item?.id || createQuestionId()),
        question: String(item?.question || ''),
        schema: String(item?.schema || ''),
        answer: String(item?.answer || ''),
      }))
      .filter((item: Question) => item.question && item.schema && item.answer);
  } catch (error) {
    console.warn('[AIQuiz] read cache failed', error);
    return [];
  }
};

const writeSessionQuizCache = (questions: Question[]) => {
  try {
    window.sessionStorage.setItem(
      QUIZ_CACHE_KEY,
      JSON.stringify(questions.slice(0, 10))
    );
  } catch (error) {
    console.warn('[AIQuiz] write cache failed', error);
  }
};

const clearSessionQuizCache = () => {
  window.sessionStorage.removeItem(QUIZ_CACHE_KEY);
};

const markCurrentQuestionAnswered = () => {
  const question = currentQuizQuestion.value;
  if (question && !answeredQuestionIds.value.includes(question.id)) {
    answeredQuestionIds.value.push(question.id);
  }
  syncQuizCache();
};

const syncQuizCache = () => {
  if (quizData.value) {
    writeSessionQuizCache(getUnansweredQuestions());
  }
};

const abortActiveGeneration = () => {
  activeGenerationController.value?.abort();
  activeGenerationController.value = null;
};

const cancelGeneration = () => {
  abortActiveGeneration();
  isLoading.value = false;
  isBackgroundGenerating.value = false;
  waitingQuestionIndex.value = null;
  if (!quizData.value) {
    errorMessage.value = '已取消生成';
  }
};

// 重置当前测验界面
const resetQuiz = () => {
  abortActiveGeneration();
  generationRunId.value++;
  quizData.value = null;
  currentQuestion.value = 0;
  userAnswer.value = '';
  userAnswers.value = [];
  answerFeedbacks.value = [];
  answeredQuestionIds.value = [];
  showResult.value = false;
  errorMessage.value = '';
  backgroundError.value = '';
  waitingQuestionIndex.value = null;
  targetQuestionTotal.value = 0;
  isBackgroundGenerating.value = false;
  currentGenerationLevels.value = [];
  collapseKeys.value = [];
  generatingQuestionTotal.value = 0;
  generatedQuestionCount.value = 0;
};

watch(() => props.open, (newVal) => {
  visible.value = newVal;
  if (!newVal) {
    syncQuizCache();
    resetQuiz();
  }
}, { immediate: true });

watch(visible, (newVal) => {
  emit('update:open', newVal);
});

onUnmounted(() => {
  abortActiveGeneration();
});
const renderMarkdown = (content: unknown) => {
  return md.render(String(content || ''));
};

const extractJSONText = (content: string) => {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return content.slice(start, end + 1);
  }

  return '';
};

const createQuestionId = () => {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const truncateText = (value: string, maxLength = 1800) => {
  if (!value || value.length <= maxLength) {
    return value || '';
  }
  return `${value.slice(0, maxLength)}\n...（内容已截断）`;
};

const runLater = (task: () => void) => {
  window.setTimeout(task, 0);
};

const normalizeQuestion = (value: any): Question => {
  const rawQuestion = Array.isArray(value?.questions) ? value.questions[0] : value;
  const question = {
    id: String(rawQuestion?.id || createQuestionId()),
    question: String(rawQuestion?.question || '').trim(),
    schema: String(rawQuestion?.schema || rawQuestion?.initSQL || '').trim(),
    answer: String(rawQuestion?.answer || '').trim(),
  };

  if (!question.question || !question.schema || !question.answer) {
    throw new Error('AI 返回的题目格式不完整，请重新生成');
  }

  return question;
};

const normalizeQuizData = (value: any): QuizData => {
  const questions = Array.isArray(value?.questions) ? value.questions : [value];
  const normalizedQuestions = questions
    .map((item: any) => ({
      id: String(item?.id || createQuestionId()),
      question: String(item?.question || '').trim(),
      schema: String(item?.schema || item?.initSQL || '').trim(),
      answer: String(item?.answer || '').trim(),
    }))
    .filter((item: Question) => item.question && item.schema && item.answer)
    .slice(0, questionCount.value);

  if (normalizedQuestions.length === 0) {
    throw new Error('AI 返回的题目格式不完整，请重新生成');
  }

  return {
    questions: normalizedQuestions,
  };
};

const getQuestionLevelList = (levels: LevelType[], total: number) => {
  if (levels.length === 0) {
    return [];
  }
  const shuffledLevels = [...levels].sort(() => Math.random() - 0.5);
  return Array.from({ length: total }, (_, index) => {
    return shuffledLevels[index % shuffledLevels.length];
  });
};

const requestSingleQuestion = async (
  level: LevelType,
  questionIndex: number,
  total: number,
  generatedQuestions: Question[],
  signal: AbortSignal,
  attempt = 1
) => {
  console.log('[AIQuiz] requestSingleQuestion start', {
    questionIndex: questionIndex + 1,
    attempt,
  });
  const generatedSummary = generatedQuestions
    .map((item, index) => `${index + 1}. ${item.question}`)
    .join('\n');

  const systemPrompt = `你是一个 SQL 教学助手。请只生成 1 道 SQL 练习题，这是本次测验的第 ${questionIndex + 1} / ${total} 题。

要求：
1. 题目必须基于给定关卡内容。
2. 返回内容必须是严格 JSON，不要 Markdown，不要代码块，不要解释。
3. JSON 必须只包含 question、schema、answer 三个字符串字段。
4. schema 必须包含完整 CREATE TABLE 和 INSERT INTO 测试数据。
5. answer 必须是可在 SQLite 中执行的标准 SQL。
6. 不要重复已经生成过的题目。

返回格式：
{
  "question": "题目描述",
  "schema": "CREATE TABLE ...; INSERT INTO ...;",
  "answer": "SELECT ..."
}`;

const userPrompt = `【关卡内容】
关卡名称：${level.title}
内容：
${truncateText(level.content)}
建表语句：
${truncateText(level.initSQL)}
参考答案：
${truncateText(level.answer, 800)}
${level.hint ? `提示：\n${level.hint}\n` : ''}

${generatedSummary ? `【已生成题目，避免重复】\n${generatedSummary}` : ''}`;
  console.log('[AIQuiz] prompt ready', {
    questionIndex: questionIndex + 1,
    systemPromptLength: systemPrompt.length,
    userPromptLength: userPrompt.length,
  });

  const response = await chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], {
    signal,
    timeout: 25000,
    maxTokens: 900,
  });
  console.log('[AIQuiz] chat returned', questionIndex + 1);
  const jsonText = extractJSONText(response);
  if (!jsonText) {
    throw new Error('AI 返回格式错误');
  }
  try {
    return normalizeQuestion(JSON.parse(jsonText));
  } catch (error: any) {
    throw new Error(`AI 返回 JSON 解析失败：${error.message || '格式错误'}`);
  }
};

const isRetryableQuestionError = (error: any) => {
  if (error?.status || error?.upstreamStatus) {
    return false;
  }
  const message = String(error?.message || '');
  return message.includes('格式') || message.includes('JSON') || message.includes('返回内容为空');
};

const generateQuestionWithRetry = async (
  level: LevelType,
  questionIndex: number,
  total: number,
  generatedQuestions: Question[],
  signal: AbortSignal
) => {
  let lastError: any;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await requestSingleQuestion(
        level,
        questionIndex,
        total,
        generatedQuestions,
        signal,
        attempt
      );
    } catch (error) {
      lastError = error;
      if (signal.aborted || !isRetryableQuestionError(error) || attempt === 2) {
        throw error;
      }
      console.warn('[AIQuiz] retry question generation', {
        questionIndex: questionIndex + 1,
        attempt,
        reason: (error as Error).message,
      });
    }
  }
  throw lastError;
};

const initializeQuizSession = (questions: Question[], total: number) => {
  quizData.value = {
    questions,
  };
  userAnswers.value = questions.map(() => '');
  answerFeedbacks.value = questions.map(() => null);
  answeredQuestionIds.value = [];
  currentQuestion.value = 0;
  userAnswer.value = '';
  targetQuestionTotal.value = total;
  generatedQuestionCount.value = questions.length;
};

const appendGeneratedQuestion = (question: Question) => {
  if (!quizData.value) {
    initializeQuizSession([question], generatingQuestionTotal.value);
    isLoading.value = false;
    return;
  }
  quizData.value.questions.push(question);
  userAnswers.value.push('');
  answerFeedbacks.value.push(null);
  generatedQuestionCount.value = quizData.value.questions.length;
};

const startBackgroundGeneration = async (
  levels: LevelType[],
  total: number,
  startIndex: number,
  runId: number
) => {
  abortActiveGeneration();
  const controller = new AbortController();
  activeGenerationController.value = controller;
  isBackgroundGenerating.value = true;
  backgroundError.value = '';

  try {
    const questionLevels = getQuestionLevelList(levels, total);
    if (questionLevels.length === 0) {
      throw new Error('没有可用于生成测验的关卡');
    }

    for (let index = startIndex; index < total; index++) {
      if (generationRunId.value !== runId || controller.signal.aborted) {
        return false;
      }
      const question = await generateQuestionWithRetry(
        questionLevels[index],
        index,
        total,
        quizData.value?.questions || [],
        controller.signal
      );
      if (generationRunId.value !== runId || controller.signal.aborted) {
        return false;
      }
      appendGeneratedQuestion(question);
      syncQuizCache();
      if (waitingQuestionIndex.value === index) {
        currentQuestion.value = index;
        userAnswer.value = userAnswers.value[index] || '';
        waitingQuestionIndex.value = null;
      }
    }
    return true;
  } catch (err: any) {
    if (controller.signal.aborted || err.message === 'AI 请求已取消') {
      return false;
    }
    backgroundError.value = `后台生成中断：${err.message || '生成失败'}。点击下一题可重试。`;
    if (!quizData.value) {
      errorMessage.value = err.message || '生成测验失败';
      isLoading.value = false;
    }
    return false;
  } finally {
    if (generationRunId.value === runId) {
      isBackgroundGenerating.value = false;
    }
    if (activeGenerationController.value === controller) {
      activeGenerationController.value = null;
    }
  }
};

const ensureQuestionGenerated = async (index: number) => {
  console.log('[AIQuiz] ensureQuestionGenerated start', index);
  if (index < generatedQuestionLength.value) {
    return true;
  }
  const runId = generationRunId.value;
  const generated = await startBackgroundGeneration(
    currentGenerationLevels.value,
    targetQuestionTotal.value,
    generatedQuestionLength.value,
    runId
  );
  console.log('[AIQuiz] ensureQuestionGenerated end', {
    index,
    generated,
    generatedQuestionLength: generatedQuestionLength.value,
  });
  return generated;
};

// 生成测验
const generateQuiz = async () => {
  console.time('[AIQuiz] generateQuiz');
  console.log('[AIQuiz] click start');
  if (!isAIConfigured.value) {
    errorMessage.value = '请先完成 AI 配置';
    console.timeEnd('[AIQuiz] generateQuiz');
    return;
  }

  generationRunId.value++;
  abortActiveGeneration();
  const runId = generationRunId.value;
  console.log('[AIQuiz] after abort/reset request');
  errorMessage.value = '';
  backgroundError.value = '';
  waitingQuestionIndex.value = null;
  generatingQuestionTotal.value = questionCount.value;
  targetQuestionTotal.value = questionCount.value;

  try {
    let levels: LevelType[] = [];
    if (quizRange.value === 'current') {
      levels = [currentLevel.value];
    } else {
      levels = completedLevels.value;
    }

    if (levels.length === 0) {
      throw new Error('没有可用于生成测验的关卡');
    }
    currentGenerationLevels.value = levels;
    console.log('[AIQuiz] levels ready', levels.length);

    const cachedQuestions = readSessionQuizCache()
      .slice(0, questionCount.value)
      .map((question) => ({ ...question }));
    console.log('[AIQuiz] cache ready', cachedQuestions.length);

    if (cachedQuestions.length > 0) {
      initializeQuizSession(cachedQuestions, questionCount.value);
      isLoading.value = false;
    } else {
      isLoading.value = true;
      generatedQuestionCount.value = 0;
    }

    console.log('[AIQuiz] before request');
    runLater(() => {
      ensureQuestionGenerated(cachedQuestions.length)
        .then((generated) => {
          console.log('[AIQuiz] first request done', {
            generated,
            generatedQuestionLength: generatedQuestionLength.value,
          });
        })
        .catch((err: any) => {
          console.error('[AIQuiz] first request failed', err);
          errorMessage.value = err.message || '生成测验失败';
          isLoading.value = false;
        });
    });

    /**
     * 诊断阶段先不后台连续补题，避免点击后产生多个长请求。
     * 后续确认不卡后，再恢复空闲时预生成。
     */
    /*
    startBackgroundGeneration(
      levels,
      questionCount.value,
      generatedQuestionLength.value,
      runId
    );
    */
    console.log('[AIQuiz] request scheduled');
  } catch (err: any) {
    quizData.value = null;
    userAnswers.value = [];
    answerFeedbacks.value = [];
    errorMessage.value = err.message || '生成测验失败';
    isLoading.value = false;
  } finally {
    console.timeEnd('[AIQuiz] generateQuiz');
  }
};

// 构建测验上下文
const buildContextPromptForQuiz = (levels: LevelType[]) => {
  let context = '';
  levels.forEach((level, index) => {
    context += `\n【关卡 ${index + 1}: ${level.title}】
${level.content}
建表语句：
${level.initSQL}
参考答案：
${level.answer}
${level.hint ? `提示：\n${level.hint}\n` : ''}
`;
  });
  return context;
};

// 处理代码变化
const handleCodeChange = (value: string) => {
  userAnswer.value = value;
  userAnswers.value[currentQuestion.value] = value;
};

// 检查答案
const checkAnswer = async () => {
  if (!userAnswer.value.trim()) return;

  try {
    const question = currentQuizQuestion.value;
    if (!question) {
      throw new Error('当前题目不存在，请重新生成测验');
    }
    const db = await initDB(question.schema);
    
    // 执行用户答案
    const userResult = runSQL(db, userAnswer.value);
    
    // 执行正确答案
    const answerResult = runSQL(db, question.answer);
    
    const isCorrect = checkResult(userResult, answerResult) === RESULT_STATUS_ENUM.SUCCEED;
    
    if (isCorrect) {
      answerFeedbacks.value[currentQuestion.value] = {
        isCorrect: true,
        feedback: '太棒了！你的答案完全正确！'
      };
    } else {
      answerFeedbacks.value[currentQuestion.value] = {
        isCorrect: false,
        feedback: '答案不正确，请检查你的 SQL 语句。'
      };
    }
    markCurrentQuestionAnswered();
  } catch (err: any) {
    answerFeedbacks.value[currentQuestion.value] = {
      isCorrect: false,
      feedback: `执行出错：${err.message}`
    };
  }
};

// 显示答案
const showAnswer = () => {
  answerFeedbacks.value[currentQuestion.value] = {
    isCorrect: false,
    feedback: '已显示参考答案，请自行对比学习。'
  };
  markCurrentQuestionAnswered();
};

// 上一题
const prevQuestion = () => {
  if (currentQuestion.value > 0) {
    currentQuestion.value--;
    userAnswer.value = userAnswers.value[currentQuestion.value] || '';
  }
};

// 下一题
const nextQuestion = () => {
  const nextIndex = currentQuestion.value + 1;
  if (nextIndex >= targetQuestionTotal.value) {
    return;
  }

  if (nextIndex < generatedQuestionLength.value) {
    currentQuestion.value = nextIndex;
    userAnswer.value = userAnswers.value[nextIndex] || '';
    return;
  }

  waitingQuestionIndex.value = nextIndex;
  if (!isBackgroundGenerating.value) {
    backgroundError.value = '';
    runLater(() => {
      ensureQuestionGenerated(nextIndex).catch((err: any) => {
        backgroundError.value = err.message || '生成下一题失败';
      });
    });
  }
};

// 完成测验
const finishQuiz = () => {
  clearSessionQuizCache();
  showResult.value = true;
};

// 重新测验
const restartQuiz = () => {
  clearSessionQuizCache();
  resetQuiz();
};

const changeBatch = () => {
  clearSessionQuizCache();
  resetQuiz();
  generateQuiz();
};

// 关闭
const handleClose = () => {
  visible.value = false;
};

// 获取结果消息
const getResultMessage = () => {
  const rate = correctCount.value / (quizData.value?.questions.length || 1);
  if (rate >= 0.9) return '太厉害了！你对 SQL 掌握得很棒！';
  if (rate >= 0.6) return '不错的成绩，继续加油！';
  return '多练习几遍，你一定能掌握的！';
};

// 获取结果表情
const getResultEmoji = () => {
  const rate = correctCount.value / (quizData.value?.questions.length || 1);
  if (rate >= 0.9) return '🎉';
  if (rate >= 0.6) return '👍';
  return '💪';
};
</script>

<style scoped>
.quiz-container {
  padding: 16px 0;
}

.quiz-setup {
  min-height: 520px;
  padding: 48px 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.quiz-setup-panel {
  width: min(100%, 560px);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.quiz-setup-form {
  width: 100%;
}

.quiz-setup-form :deep(.ant-form-item) {
  margin-bottom: 20px;
}

.quiz-content {
  height: min(78vh, 760px);
  min-height: 560px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.quiz-toolbar {
  padding: 24px 24px 12px;
  flex-shrink: 0;
}

.quiz-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(420px, 0.85fr);
  gap: 16px;
  padding: 0 24px 16px;
}

.quiz-pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.quiz-pane-left,
.quiz-pane-right {
  gap: 12px;
}

.pane-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.question-card {
  flex-shrink: 0;
  max-height: 220px;
  overflow-y: auto;
}

.schema-panel {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.schema-panel :deep(.ant-collapse-content-box) {
  padding: 12px;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.enter-tip {
  color: #8c8c8c;
  font-size: 12px;
  white-space: nowrap;
}

.correct :deep(.ant-card-head) {
  background: #f6ffed;
  color: #52c41a;
}

.wrong :deep(.ant-card-head) {
  background: #fff1f0;
  color: #ff4d4f;
}

.feedback-card {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
}

.answer-block {
  margin-top: 12px;
}

.quiz-actions {
  flex-shrink: 0;
  padding: 14px 24px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  background: #fff;
}

.quiz-result {
  padding: 24px 0;
}

@media (max-width: 900px) {
  .quiz-content {
    height: 78vh;
  }

  .quiz-workspace {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .quiz-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
