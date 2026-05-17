<template>
  <div class="code-editor">
    <div ref="editorRef" :style="editorStyle" />
  </div>
</template>

<script setup lang="ts">
import { CSSProperties, onMounted, onUnmounted, ref, toRaw, watch } from "vue";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
// eslint-disable-next-line no-undef
import IStandaloneCodeEditor = monaco.editor.IStandaloneCodeEditor;

(self as any).MonacoEnvironment = {
  getWorker(_: any, label: any) {
    return new EditorWorker();
  },
};

// @ts-ignore
interface Props {
  initValue?: string;
  readOnly?: boolean;
  submitOnEnter?: boolean;
  editorStyle?: CSSProperties;
}

const props = withDefaults(defineProps<Props>(), {
  initValue: "",
  readOnly: false,
  submitOnEnter: false,
  editorStyle: undefined,
});
const inputEditor = ref<IStandaloneCodeEditor>();
const editorRef = ref<HTMLElement>();
const isApplyingValue = ref(false);
const emit = defineEmits<{
  (e: "change", value: string): void;
  (e: "submit"): void;
}>();

onMounted(async () => {
  // 初始化代码编辑器
  if (editorRef.value) {
    inputEditor.value = monaco.editor.create(editorRef.value, {
      value: String(props.initValue || ""),
      language: "sql",
      theme: "vs-dark",
      readOnly: props.readOnly,
      formatOnPaste: true,
      automaticLayout: true,
      fontSize: 15,
      wordBasedSuggestions: false,
      suggestOnTriggerCharacters: false,
      quickSuggestions: false,
      acceptSuggestionOnEnter: "off",
      minimap: {
        enabled: false,
      },
    });
    inputEditor.value.onDidChangeModelContent(() => {
      if (inputEditor.value && !props.readOnly && !isApplyingValue.value) {
        emit("change", toRaw(inputEditor.value).getValue());
      }
    });
    if (props.submitOnEnter && !props.readOnly) {
      inputEditor.value.addCommand(monaco.KeyCode.Enter, () => {
        emit("submit");
      });
    }
  }
});

watch(
  () => props.initValue,
  (newValue) => {
    if (editorRef.value && inputEditor.value) {
      const editor = toRaw(inputEditor.value);
      const nextValue = String(newValue || "");
      if (editor.getValue() !== nextValue) {
        isApplyingValue.value = true;
        editor.setValue(nextValue);
        window.setTimeout(() => {
          isApplyingValue.value = false;
        }, 0);
      }
    }
  }
);

onUnmounted(() => {
  if (inputEditor.value) {
    toRaw(inputEditor.value).dispose();
  }
});
</script>

<style scoped>
.code-editor {
  overflow: hidden;
  border-radius: 16px;
  background: var(--sql-terminal);
}
</style>
