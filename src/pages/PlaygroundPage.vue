<template>
  <div id="playgroundPage" class="sql-page-shell playground-page">
    <section class="playground-heading">
      <div>
        <span class="sql-section-label">SQL Sandbox</span>
        <h1 class="sql-display-title">自由查询沙盒</h1>
      </div>
      <p class="sql-section-copy">
        离开关卡限制，像使用轻量数据库控制台一样自由实验 SQL。编辑器、结果表和执行历史会留在同一个沙盒里。
      </p>
    </section>

    <section class="playground-layout">
      <div class="sandbox-column">
        <sql-editor
          :level="allLevels[0]"
          :editor-style="{ height: 480 + 'px' }"
          :on-submit="onSubmit"
        />
        <a-card class="history-card" title="执行历史">
          <a-collapse v-if="sqlHistoryList.length > 0">
            <a-collapse-panel
              v-for="(data, index) in sqlHistoryList"
              :key="index"
              :header="data.sql"
            >
              <sql-result :result="data.result" :error-msg="data.errorMsg" />
            </a-collapse-panel>
          </a-collapse>
          <div v-else>暂无执行历史</div>
        </a-card>
      </div>
      <div class="result-column">
        <sql-result :result="result" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import SqlEditor from "../components/SqlEditor.vue";
import { ref } from "vue";
import { QueryExecResult } from "sql.js";
import SqlResult from "../components/SqlResult.vue";
import { allLevels } from "../levels";

const result = ref<QueryExecResult[]>([]);
const sqlHistoryList = ref<any>([]);

/**
 * 执行
 * @param sql
 * @param res
 * @param _
 * @param errorMsg
 */
const onSubmit = (
  sql: string,
  res: QueryExecResult[],
  _: any,
  errorMsg?: string
) => {
  result.value = res;
  sqlHistoryList.value.push({
    sql,
    result: res,
    errorMsg,
  });
};
</script>

<style scoped>
.playground-page {
  padding-top: 18px;
}

.playground-heading {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(420px, 1.1fr);
  gap: 48px;
  align-items: end;
  margin-bottom: 30px;
}

.playground-layout {
  display: grid;
  grid-template-columns: minmax(520px, 0.9fr) minmax(580px, 1.1fr);
  gap: 22px;
  align-items: start;
}

.sandbox-column,
.result-column {
  min-width: 0;
}

.history-card {
  margin-top: 16px;
  overflow: hidden;
  border-radius: var(--sql-radius-lg);
  box-shadow: var(--sql-tight-shadow);
}
</style>
