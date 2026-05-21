<template>
  <div id="indexPage" class="sql-page-shell learn-page">
    <section class="learn-heading">
      <div>
        <span class="sql-section-label">Learn Workspace</span>
        <h1 class="sql-display-title">学习工作台</h1>
      </div>
      <p class="sql-section-copy">
        当前路线：{{ level.type === "main" ? "主线必修" : "业务副本" }} ·
        第 {{ levelNum + 1 }} / {{ totalLevels }} 关。阅读教程、运行 SQL、查看结果在同一张任务桌面里闭环。
      </p>
    </section>

    <section class="learn-workspace">
      <div class="reading-column">
        <question-board :level="level" :result-status="resultStatus" />
      </div>
      <div class="console-column">
        <sql-editor
          :level="level"
          :editor-style="{ height: '320px' }"
          :result-status="resultStatus"
          :on-submit="onSubmit"
        />
        <a-collapse v-model:active-key="activeKeys" class="quest-folds">
          <a-collapse-panel
            key="result"
            header="执行结果"
            class="result-collapse-panel"
          >
            <sql-result
              :level="level"
              :result="result"
              :result-status="resultStatus"
              :answer-result="answerResult"
              :error-msg="errorMsgRef"
            />
          </a-collapse-panel>
          <a-collapse-panel v-if="level.hint" key="hint" header="提示">
            <p>{{ level.hint }}</p>
          </a-collapse-panel>
          <a-collapse-panel key="ddl" header="建表语句">
            <code-editor
              :init-value="level.initSQL"
              :editor-style="{ minHeight: '320px' }"
              read-only
            />
          </a-collapse-panel>
          <a-collapse-panel key="answer" header="答案">
            <code-editor
              :init-value="level.answer"
              :editor-style="{ minHeight: '240px' }"
              read-only
            />
          </a-collapse-panel>
        </a-collapse>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import SqlEditor from "../components/SqlEditor.vue";
import QuestionBoard from "../components/QuestionBoard.vue";
import SqlResult from "../components/SqlResult.vue";
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { QueryExecResult } from "sql.js";
import { allLevels, getCurrentLevelNum, getLevelByKey } from "../levels";
import { checkResult, RESULT_STATUS_ENUM } from "../core/result";
import CodeEditor from "../components/CodeEditor.vue";
import { useGlobalStore } from "../core/globalStore";
import { storeToRefs } from "pinia";

interface IndexPageProps {
  levelKey?: string;
}

const props = defineProps<IndexPageProps>();
const router = useRouter();
const globalStore = useGlobalStore();
const { currentLevelKey } = storeToRefs(globalStore);

// 如果有传入levelKey就使用传入的，否则使用保存的进度
const level = computed(() => {
  if (props.levelKey) {
    return getLevelByKey(props.levelKey);
  }
  return getLevelByKey(currentLevelKey.value);
});
const levelNum = computed(() => getCurrentLevelNum(level.value));
const totalLevels = allLevels.length;

// 监听关卡变化时，保存进度
watch(level, (newLevel) => {
  if (props.levelKey && newLevel.key !== currentLevelKey.value) {
    globalStore.setCurrentLevel(newLevel.key);
  }
}, { immediate: true });

const result = ref<QueryExecResult[]>([]);
const answerResult = ref<QueryExecResult[]>([]);
const errorMsgRef = ref<string>();
const resultStatus = ref<number>(-1);
const defaultActiveKeys = ["result"];
const activeKeys = ref([...defaultActiveKeys]);

/**
 * 切换关卡时，重置状态
 */
watch([level], () => {
  activeKeys.value = [...defaultActiveKeys];
  resultStatus.value = -1;
  result.value = [];
  answerResult.value = [];
  errorMsgRef.value = undefined;
});

/**
 * 执行结果
 * @param sql
 * @param res
 * @param answerRes
 * @param errorMsg
 */
const onSubmit = (
  sql: string,
  res: QueryExecResult[],
  answerRes: QueryExecResult[],
  errorMsg?: string
) => {
  result.value = res;
  answerResult.value = answerRes;
  errorMsgRef.value = errorMsg;
  resultStatus.value = checkResult(res, answerRes);
  if (resultStatus.value === RESULT_STATUS_ENUM.SUCCEED) {
    globalStore.markLevelCompleted(level.value.key);
  }
};

const getPersistedCurrentLevelKey = () => {
  try {
    const raw = window.localStorage.getItem("global");
    if (!raw) {
      return "";
    }
    const parsed = JSON.parse(raw) as { currentLevelKey?: string };
    return typeof parsed.currentLevelKey === "string" ? parsed.currentLevelKey : "";
  } catch {
    return "";
  }
};

onMounted(() => {
  if (props.levelKey) {
    return;
  }
  const persistedLevelKey = getPersistedCurrentLevelKey();
  const targetLevelKey = persistedLevelKey || currentLevelKey.value;
  if (targetLevelKey) {
    router.replace(`/learn/${targetLevelKey}`);
  }
});

</script>

<style>
#indexPage.learn-page {
  padding-top: 18px;
}

.learn-heading {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(420px, 1.1fr);
  gap: 48px;
  align-items: end;
  margin-bottom: 30px;
}

.learn-workspace {
  display: grid;
  grid-template-columns: minmax(400px, 0.9fr) minmax(600px, 1.1fr);
  gap: 22px;
  align-items: start;
}

.reading-column,
.console-column {
  min-width: 0;
}

.console-column {
  display: grid;
  gap: 16px;
}

.quest-folds {
  border: 0 !important;
  background: transparent !important;
}

.quest-folds > .ant-collapse-item {
  margin-bottom: 10px;
  overflow: hidden;
  border: 1px solid var(--sql-line) !important;
  border-radius: 16px !important;
  background: rgba(255, 250, 240, 0.72);
}

.quest-folds .ant-collapse-content {
  border-top-color: var(--sql-line) !important;
  background: rgba(255, 250, 240, 0.58) !important;
}

.result-collapse-panel .ant-collapse-content-box {
  padding: 0 !important;
}
</style>
