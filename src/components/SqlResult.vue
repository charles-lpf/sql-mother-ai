<template>
  <section id="sqlResult" class="sql-result-card" :class="{ 'is-error': errorMsg, 'is-success': isSuccess }">
    <div class="sql-result-head">
      <div>
        <div class="result-kicker">Execution Result</div>
        <h3>执行结果</h3>
      </div>
      <span class="result-badge">{{ statusText }}</span>
    </div>
    <div class="sql-result-body">
      <div v-if="errorMsg" class="error-block">
        <strong>语句错误</strong>
        <span>{{ errorMsg }}</span>
      </div>
      <template v-else>
        <div class="result-summary">
          <strong>{{ isSuccess ? "本关 SQL 已通过校验" : "结果已生成" }}</strong>
          <span>{{ result?.[0]?.values?.length || 0 }} 行结果，继续检查输出是否符合题意。</span>
        </div>
        <sql-result-table :result="result" />
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, toRefs } from "vue";
import { QueryExecResult } from "sql.js";
import SqlResultTable from "./SqlResultTable.vue";
import { RESULT_STATUS_INFO_MAP } from "../core/result";
import { RESULT_STATUS_ENUM } from "../core/result";

interface Props {
  result: QueryExecResult[];
  answerResult: QueryExecResult[];
  resultStatus: number;
  errorMsg?: string;
  // eslint-disable-next-line vue/require-default-prop
  level?: LevelType;
}

const props = withDefaults(defineProps<Props>(), {
  result: () => [],
  answerResult: () => [],
  resultStatus: RESULT_STATUS_ENUM.DEFAULT,
  errorMsg: () => "",
});

// e.g. [{"columns":["a","b"],"values":[[0,"hello"],[1,"world"]]}]
const { result } = toRefs(props);
const isSuccess = computed(() => props.resultStatus === RESULT_STATUS_ENUM.SUCCEED);
const hasResult = computed(() => Boolean(props.result?.[0]?.values));
const statusText = computed(() => {
  if (props.errorMsg) {
    return "语句错误";
  }
  if (props.resultStatus === RESULT_STATUS_ENUM.DEFAULT && hasResult.value) {
    return "已执行";
  }
  return RESULT_STATUS_INFO_MAP[props.resultStatus as keyof typeof RESULT_STATUS_INFO_MAP] || "已执行";
});
</script>

<style scoped>
.sql-result-card {
  max-height: 430px;
  overflow: auto;
  border: 1px solid var(--sql-line);
  border-radius: var(--sql-radius-lg);
  background: var(--sql-surface);
  box-shadow: var(--sql-tight-shadow);
}

.sql-result-card.is-success {
  border-color: rgba(14, 111, 89, 0.36);
}

.sql-result-card.is-error {
  border-color: rgba(184, 77, 61, 0.32);
}

.sql-result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--sql-line);
}

.result-kicker {
  color: var(--sql-muted);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sql-result-head h3 {
  margin: 4px 0 0;
  font-size: 22px;
  font-weight: 900;
}

.result-badge {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 13px;
  border-radius: 999px;
  color: var(--sql-green);
  background: rgba(14, 111, 89, 0.1);
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}

.sql-result-body {
  padding: 18px 20px 20px;
}

.result-summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.result-summary strong {
  font-size: 16px;
}

.result-summary span {
  color: var(--sql-muted);
  font-size: 13px;
}

.error-block {
  display: grid;
  gap: 8px;
  padding: 16px;
  border-radius: 16px;
  color: var(--sql-red);
  background: rgba(184, 77, 61, 0.08);
}
</style>
