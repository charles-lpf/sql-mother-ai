<template>
  <div id="sqlEditor" class="sql-editor-panel">
    <div class="sql-editor-head">
      <span class="sql-terminal-dots"><i></i><i></i><i></i></span>
      <span class="editor-path">/learn/{{ level.key }}</span>
      <span class="editor-runtime">SQLite · sql.js</span>
    </div>
    <div ref="editorRef" class="sql-editor-canvas" :style="editorStyle" />
    <div class="sql-editor-actions">
      <a-space :size="12">
        <a-button type="primary" class="run-button" @click="doSubmit">
          {{ runButtonText }}
        </a-button>
        <a-button @click="doFormat">格式化</a-button>
        <a-button @click="doReset">重置</a-button>
      </a-space>
      <span class="editor-status">{{ statusText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  CSSProperties,
  computed,
  onMounted,
  onUnmounted,
  ref,
  toRaw,
  toRefs,
  watchEffect,
} from "vue";
import * as monaco from "monaco-editor";
import { format } from "sql-formatter";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { initDB, runSQL } from "../core/sqlExecutor";
import { QueryExecResult } from "sql.js";
// eslint-disable-next-line no-undef
import IStandaloneCodeEditor = monaco.editor.IStandaloneCodeEditor;
import { message } from "ant-design-vue";
import { RESULT_STATUS_ENUM } from "../core/result";

(self as any).MonacoEnvironment = {
  getWorker(_: any, label: any) {
    return new EditorWorker();
  },
};

// @ts-ignore
interface SqlEditorProps {
  level: LevelType;
  editorStyle: CSSProperties;
  resultStatus: number;
  onSubmit: (
    sql: string,
    result: QueryExecResult[],
    answerResult: QueryExecResult[],
    errorMsg?: string
  ) => void;
}

const props = withDefaults(defineProps<SqlEditorProps>(), {
  editorStyle: () => ({}),
  resultStatus: RESULT_STATUS_ENUM.DEFAULT,
});
const { level, onSubmit } = toRefs(props);
const inputEditor = ref<IStandaloneCodeEditor>();
const editorRef = ref<HTMLElement>();
const db = ref();

const runButtonText = computed(() => {
  return props.resultStatus === RESULT_STATUS_ENUM.SUCCEED ? "再次运行" : "运行校验";
});

const statusText = computed(() => {
  if (props.resultStatus === RESULT_STATUS_ENUM.SUCCEED) {
    return "执行完成 · 结果与答案一致";
  }
  if (props.resultStatus === RESULT_STATUS_ENUM.ERROR) {
    return "结果不一致 · 可以查看提示";
  }
  return "等待提交 · 结果会在下方刷新";
});

watchEffect(async () => {
  // 初始化 / 更新默认 SQL
  if (inputEditor.value) {
    toRaw(inputEditor.value).setValue(
      "-- 请在此处输入 SQL\n" + level.value.defaultSQL
    );
  }
  // 初始化 / 更新 DB
  db.value = await initDB(level.value.initSQL);
  doSubmit();
});

/**
 * SQL 格式化
 */
const doFormat = () => {
  if (!inputEditor.value) {
    return;
  }
  const inputStr = toRaw(inputEditor.value).getValue();
  // https://www.npmjs.com/package/sql-formatter
  const resultStr = format(inputStr, { language: "sqlite" });
  toRaw(inputEditor.value).setValue(resultStr);
};

/**
 * 重置
 */
const doReset = () => {
  if (inputEditor.value) {
    toRaw(inputEditor.value).setValue(level.value.defaultSQL);
    doSubmit();
  }
};

/**
 * 提交结果
 */
const doSubmit = () => {
  if (!inputEditor.value) {
    return;
  }
  const inputStr = toRaw(inputEditor.value).getValue();
  console.log("inputStr", inputStr);
  try {
    const result = runSQL(db.value, inputStr);
    const answerResult = runSQL(db.value, level.value.answer);
    // 向外层传递结果
    onSubmit?.value(inputStr, result, answerResult);
  } catch (error: any) {
    message.error("语句错误，" + error.message);
    // 向外层传递结果
    onSubmit?.value(inputStr, [], [], error.message);
  }
};

onMounted(async () => {
  // 初始化代码编辑器
  if (editorRef.value) {
    const initValue = "";
    inputEditor.value = monaco.editor.create(editorRef.value, {
      value: initValue,
      language: "sql",
      theme: "vs-dark",
      formatOnPaste: true,
      automaticLayout: true,
      fontSize: 16,
      lineHeight: 26,
      fontFamily: "Menlo, Monaco, Consolas, 'Courier New', monospace",
      minimap: {
        enabled: false,
      },
    });
    // 自动保存草稿
    // 暂不开启，刷新后恢复当前关卡的默认 SQL
    // setInterval(() => {
    //   if (inputEditor.value) {
    //     localStorage.setItem("draft", toRaw(inputEditor.value).getValue());
    //   }
    // }, 3000);
  }
});

/**
 * 释放资源
 */
onUnmounted(() => {
  if (inputEditor.value) {
    toRaw(inputEditor.value).dispose();
  }
});
</script>

<style scoped>
.sql-editor-panel {
  overflow: hidden;
  border: 1px solid rgba(136, 216, 190, 0.14);
  border-radius: 24px;
  background: var(--sql-terminal);
  box-shadow: 0 20px 50px rgba(17, 27, 24, 0.22);
}

.sql-editor-head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  min-height: 50px;
  padding: 0 18px;
  color: #d7f5e8;
  background: var(--sql-terminal-soft);
}

.editor-path {
  color: #b9d9cf;
  font-size: 13px;
}

.editor-runtime {
  color: #f4f1df;
  font-size: 14px;
}

.sql-editor-canvas {
  border-top: 1px solid rgba(255, 250, 240, 0.06);
}

.sql-editor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-top: 1px solid rgba(255, 250, 240, 0.08);
  background: rgba(17, 27, 24, 0.96);
}

.run-button {
  min-width: 116px;
}

.editor-status {
  color: #b9d9cf;
  font-size: 13px;
}
</style>
