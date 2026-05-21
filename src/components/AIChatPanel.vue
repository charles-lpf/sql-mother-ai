<template>
  <div
    ref="panelRef"
    class="ai-chat-panel"
    :class="{ 'is-collapsed': isCollapsed, 'is-dragging': isDragging, 'is-resizing': isResizing }"
    :style="panelStyle"
  >
    <!-- 收起/展开按钮 -->
    <div
      v-if="isCollapsed"
      class="panel-toggle"
      @click="handleToggleClick"
      @pointerdown="startDrag"
    >
      <span>AI</span>
    </div>

    <div class="panel-content" v-show="!isCollapsed">
      <!-- 头部 -->
      <div class="panel-header" @pointerdown="startDrag">
        <span class="header-title">SQL 学习搭子</span>
        <div class="header-actions">
          <a-button size="small" title="设置" @click="openConfig">
            <setting-outlined />
          </a-button>
          <a-button size="small" @click="togglePanel">收起</a-button>
        </div>
      </div>

      <div v-if="!isAIConfigured" class="config-empty">
        <a-alert
          message="请先配置 AI 模型"
          description="配置完成后，AI 会自动读取当前关卡内容进行问答和测验。"
          type="warning"
          show-icon
        />
        <a-button type="primary" size="small" block @click="openConfig">
          去配置
        </a-button>
      </div>

      <!-- 测验按钮 -->
      <div class="quick-actions">
        <a-button size="small" type="primary" block @click="openQuiz">
          <book-outlined /> 开始测验
        </a-button>
      </div>

      <!-- 当前关卡信息 -->
      <div class="current-level-info">
        <span class="context-chip">当前: {{ currentLevel?.title }}</span>
        <span class="context-chip is-complete" v-if="completedLevels.length > 0">
          已通关: {{ completedLevels.length }} 关
        </span>
      </div>

      <!-- 消息列表 -->
      <div class="message-list" ref="messageListRef">
        <div
          v-for="(msg, index) in messages"
          :key="index"
          class="message-item"
          :class="msg.role"
        >
          <div class="message-avatar">
            <span v-if="msg.role === 'user'">我</span>
            <span v-else>AI</span>
          </div>
          <div class="message-content">
            <div
              v-if="msg.content"
              v-html="renderMarkdown(msg.content)"
            ></div>
            <div v-else-if="isLoading && index === messages.length - 1" class="thinking-line">
              <a-spin size="small" />
              <span>AI 正在思考...</span>
            </div>
            <span
              v-if="isLoading && index === messages.length - 1 && msg.role === 'assistant'"
              class="typing-cursor"
            ></span>
          </div>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="input-area">
        <a-textarea
          v-model:value="inputMessage"
          placeholder="输入你的问题..."
          :disabled="isLoading || !isAIConfigured"
          :auto-size="{ minRows: 2, maxRows: 4 }"
          @pressEnter="handleEnterSend"
          @keydown.enter.exact.prevent="handleEnterSend"
        />
        <a-button
          type="primary"
          :loading="isLoading"
          :disabled="!isAIConfigured"
          @click="handleSend()"
          style="margin-top: 8px"
        >
          发送
        </a-button>
      </div>
    </div>

    <div
      v-for="handle in resizeHandles"
      v-show="!isCollapsed"
      :key="handle.direction"
      :class="['resize-handle', `resize-handle-${handle.direction}`]"
      @pointerdown.stop.prevent="startResize($event, handle.direction)"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import { useGlobalStore } from '../core/globalStore';
import { storeToRefs } from 'pinia';
import { useAI } from '../composables/useAI';
import { SettingOutlined, BookOutlined } from '@ant-design/icons-vue';
import MarkdownIt from 'markdown-it';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type ResizeDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const emit = defineEmits<{
  (e: 'open-quiz'): void;
  (e: 'open-config'): void;
}>();

const globalStore = useGlobalStore();
const { aiConfig, currentLevel, completedLevels } = storeToRefs(globalStore);
const { chatStream, buildContextPrompt, isValidAIConfig } = useAI();

const md = new MarkdownIt();

const COLLAPSED_SIZE = 68;
const DEFAULT_PANEL_WIDTH = 360;
const DEFAULT_PANEL_HEIGHT = 590;
const PANEL_MARGIN = 18;

const isCollapsed = ref(true);
const panelRef = ref<HTMLElement | null>(null);
const inputMessage = ref('');
const messages = ref<Message[]>([
  {
    role: 'assistant',
    content: '你好！我是 AI 助手，可以帮你解答 SQL 问题。有什么不懂的尽管问！'
  }
]);
const isLoading = ref(false);
const messageListRef = ref<HTMLElement | null>(null);
const isAIConfigured = computed(() => isValidAIConfig(aiConfig.value));
const isDragging = ref(false);
const isResizing = ref(false);
const suppressNextClick = ref(false);
const panelPosition = ref({
  x: 0,
  y: 0,
});
const panelSize = ref({
  width: DEFAULT_PANEL_WIDTH,
  height: DEFAULT_PANEL_HEIGHT,
});
const resizeHandles: Array<{ direction: ResizeDirection }> = [
  { direction: 'n' },
  { direction: 'e' },
  { direction: 's' },
  { direction: 'w' },
  { direction: 'ne' },
  { direction: 'nw' },
  { direction: 'se' },
  { direction: 'sw' },
];
const dragState = ref({
  pointerId: 0,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
});
const resizeState = ref({
  pointerId: 0,
  direction: 'se' as ResizeDirection,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
  originWidth: DEFAULT_PANEL_WIDTH,
  originHeight: DEFAULT_PANEL_HEIGHT,
});

const panelStyle = computed(() => ({
  left: `${panelPosition.value.x}px`,
  top: `${panelPosition.value.y}px`,
  width: `${isCollapsed.value ? COLLAPSED_SIZE : panelSize.value.width}px`,
  height: `${isCollapsed.value ? COLLAPSED_SIZE : panelSize.value.height}px`,
}));

const getPanelSize = () => {
  if (isCollapsed.value) {
    return {
      width: COLLAPSED_SIZE,
      height: COLLAPSED_SIZE,
    };
  }
  return {
    width: panelSize.value.width,
    height: panelSize.value.height,
  };
};

const clampValue = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), Math.max(min, max));
};

const clampPosition = (x: number, y: number) => {
  const { width, height } = getPanelSize();
  return {
    x: clampValue(x, PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN),
    y: clampValue(y, PANEL_MARGIN, window.innerHeight - height - PANEL_MARGIN),
  };
};

const setDefaultPosition = () => {
  const defaultPosition = {
    x: 28,
    y: (window.innerHeight - COLLAPSED_SIZE) / 2,
  };
  panelPosition.value = clampPosition(defaultPosition.x, defaultPosition.y);
};

const resetPanelSize = () => {
  panelSize.value = {
    width: DEFAULT_PANEL_WIDTH,
    height: DEFAULT_PANEL_HEIGHT,
  };
};

const clampPanelToViewport = () => {
  panelSize.value = {
    width: clampValue(panelSize.value.width, DEFAULT_PANEL_WIDTH, window.innerWidth - PANEL_MARGIN * 2),
    height: clampValue(panelSize.value.height, DEFAULT_PANEL_HEIGHT, window.innerHeight - PANEL_MARGIN * 2),
  };
  panelPosition.value = clampPosition(panelPosition.value.x, panelPosition.value.y);
};

// 渲染 Markdown
const renderMarkdown = (content: string) => {
  return md.render(content);
};

const openPanel = () => {
  resetPanelSize();
  isCollapsed.value = false;
  panelPosition.value = clampPosition(
    panelPosition.value.x,
    (window.innerHeight - DEFAULT_PANEL_HEIGHT) / 2
  );
  nextTick(() => {
    panelPosition.value = clampPosition(panelPosition.value.x, panelPosition.value.y);
  });
};

const closePanel = () => {
  isCollapsed.value = true;
  nextTick(() => {
    panelPosition.value = clampPosition(panelPosition.value.x, panelPosition.value.y);
  });
};

// 切换面板
const togglePanel = () => {
  if (isCollapsed.value) {
    openPanel();
    return;
  }
  closePanel();
};

const handleToggleClick = () => {
  if (suppressNextClick.value) {
    suppressNextClick.value = false;
    return;
  }
  togglePanel();
};

const startDrag = (event: PointerEvent) => {
  const target = event.target as HTMLElement;
  if (target.closest('.resize-handle, .header-actions, button, textarea, input')) {
    return;
  }
  isDragging.value = true;
  isResizing.value = false;
  suppressNextClick.value = false;
  dragState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: panelPosition.value.x,
    originY: panelPosition.value.y,
  };
  panelRef.value?.setPointerCapture?.(event.pointerId);
};

const startResize = (event: PointerEvent, direction: ResizeDirection) => {
  if (isCollapsed.value) {
    return;
  }
  isResizing.value = true;
  isDragging.value = false;
  suppressNextClick.value = true;
  resizeState.value = {
    pointerId: event.pointerId,
    direction,
    startX: event.clientX,
    startY: event.clientY,
    originX: panelPosition.value.x,
    originY: panelPosition.value.y,
    originWidth: panelSize.value.width,
    originHeight: panelSize.value.height,
  };
  panelRef.value?.setPointerCapture?.(event.pointerId);
};

const applyResize = (event: PointerEvent) => {
  const state = resizeState.value;
  const dx = event.clientX - state.startX;
  const dy = event.clientY - state.startY;
  const direction = state.direction;
  let nextX = state.originX;
  let nextY = state.originY;
  let nextWidth = state.originWidth;
  let nextHeight = state.originHeight;

  if (direction.includes('e')) {
    nextWidth = clampValue(
      state.originWidth + dx,
      DEFAULT_PANEL_WIDTH,
      window.innerWidth - state.originX - PANEL_MARGIN
    );
  }

  if (direction.includes('w')) {
    nextWidth = clampValue(
      state.originWidth - dx,
      DEFAULT_PANEL_WIDTH,
      state.originX + state.originWidth - PANEL_MARGIN
    );
    nextX = state.originX + state.originWidth - nextWidth;
  }

  if (direction.includes('s')) {
    nextHeight = clampValue(
      state.originHeight + dy,
      DEFAULT_PANEL_HEIGHT,
      window.innerHeight - state.originY - PANEL_MARGIN
    );
  }

  if (direction.includes('n')) {
    nextHeight = clampValue(
      state.originHeight - dy,
      DEFAULT_PANEL_HEIGHT,
      state.originY + state.originHeight - PANEL_MARGIN
    );
    nextY = state.originY + state.originHeight - nextHeight;
  }

  panelSize.value = {
    width: nextWidth,
    height: nextHeight,
  };
  panelPosition.value = {
    x: nextX,
    y: nextY,
  };
};

const onPointerMove = (event: PointerEvent) => {
  if (isResizing.value && event.pointerId === resizeState.value.pointerId) {
    applyResize(event);
    return;
  }
  if (!isDragging.value || event.pointerId !== dragState.value.pointerId) {
    return;
  }
  const dx = event.clientX - dragState.value.startX;
  const dy = event.clientY - dragState.value.startY;
  if (Math.abs(dx) + Math.abs(dy) > 4) {
    suppressNextClick.value = true;
  }
  panelPosition.value = clampPosition(
    dragState.value.originX + dx,
    dragState.value.originY + dy
  );
};

const stopDrag = (event: PointerEvent) => {
  if (isResizing.value && event.pointerId === resizeState.value.pointerId) {
    isResizing.value = false;
    panelRef.value?.releasePointerCapture?.(event.pointerId);
    window.setTimeout(() => {
      suppressNextClick.value = false;
    }, 0);
    return;
  }
  if (!isDragging.value || event.pointerId !== dragState.value.pointerId) {
    return;
  }
  const shouldToggleCollapsed = isCollapsed.value && !suppressNextClick.value;
  isDragging.value = false;
  panelRef.value?.releasePointerCapture?.(event.pointerId);
  if (shouldToggleCollapsed) {
    suppressNextClick.value = true;
    togglePanel();
  }
  if (suppressNextClick.value) {
    window.setTimeout(() => {
      suppressNextClick.value = false;
    }, 0);
  }
};

// 打开测验
const openQuiz = () => {
  emit('open-quiz');
};

const openConfig = () => {
  emit('open-config');
};

const clearInput = (event?: Event) => {
  inputMessage.value = '';
  const target = event?.target as HTMLTextAreaElement | null;
  if (target?.tagName === 'TEXTAREA') {
    target.value = '';
  }
};

const handleEnterSend = (event: KeyboardEvent) => {
  if (event.shiftKey) {
    return;
  }
  event.preventDefault();
  handleSend(event);
};

// 发送消息
const handleSend = async (event?: Event) => {
  const target = event?.target as HTMLTextAreaElement | null;
  const userMessage = (target?.tagName === 'TEXTAREA' ? target.value : inputMessage.value).trim();
  if (!userMessage || isLoading.value) return;

  // 添加用户消息
  messages.value.push({
    role: 'user',
    content: userMessage,
  });
  clearInput(event);
  scrollToBottom();

  try {
    isLoading.value = true;
    
    // 构建上下文
    const context = buildContextPrompt(currentLevel.value, completedLevels.value);
    
    // 调用 AI
    const systemPrompt = `你是一个 SQL 学习助手。用户正在学习 SQL，当前在"${currentLevel.value?.title}"关卡。
已通关的关卡数量：${completedLevels.value.length} 个。

回答规则：
1. 优先结合当前关卡内容回答。
2. 当用户要求复习、对比或随机练习时，再引用已通关关卡。
3. 不要直接剧透答案，除非用户明确要求查看解法。
4. 如果涉及 SQL 代码，请使用 Markdown 代码块。

上下文信息：
${context}`;

    const assistantMessage: Message = {
      role: 'assistant',
      content: '',
    };
    messages.value.push(assistantMessage);
    const assistantIndex = messages.value.length - 1;
    scrollToBottom();

    await chatStream([
      { role: 'system', content: systemPrompt },
      ...messages.value
        .slice(1, assistantIndex)
        .map(m => ({ role: m.role, content: m.content })),
    ], {
      onChunk: (chunk) => {
        messages.value[assistantIndex].content += chunk;
        scrollToBottom();
      },
    });
  } catch (err: any) {
    const lastMessage = messages.value[messages.value.length - 1];
    if (lastMessage?.role === 'assistant' && !lastMessage.content) {
      lastMessage.content = `⚠️ ${err.message || '请求失败，请检查 API 配置'}`;
    } else {
      messages.value.push({
        role: 'assistant',
        content: `⚠️ ${err.message || '请求失败，请检查 API 配置'}`,
      });
    }
  } finally {
    isLoading.value = false;
    clearInput(event);
    scrollToBottom();
  }
};

// 滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
    }
  });
};

// 监听完成关卡变化，更新提示
watch(completedLevels, (newLevels) => {
  if (newLevels.length > 0 && messages.value.length === 1) {
    messages.value.push({
      role: 'assistant',
      content: `你已通关 ${newLevels.length} 个关卡，可以点击“测验”随机复习已通关内容。`
    });
  }
}, { immediate: true });

onMounted(() => {
  setDefaultPosition();
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', stopDrag);
  window.addEventListener('resize', clampPanelToViewport);
});

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', stopDrag);
  window.removeEventListener('resize', clampPanelToViewport);
});
</script>

<style scoped>
.ai-chat-panel {
  position: fixed;
  border: 1px solid rgba(14, 111, 89, 0.22);
  background: rgba(255, 250, 240, 0.94);
  border-radius: 32px;
  box-shadow:
    0 18px 50px rgba(34, 38, 31, 0.22),
    inset 0 0 0 1px rgba(255, 250, 240, 0.54);
  backdrop-filter: blur(16px);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.22s ease, height 0.22s ease, border-radius 0.22s ease, box-shadow 0.22s ease;
  user-select: none;
}

.ai-chat-panel.is-dragging {
  box-shadow: 0 26px 70px rgba(34, 38, 31, 0.3);
  transition: none;
}

.ai-chat-panel.is-resizing {
  box-shadow: 0 22px 58px rgba(34, 38, 31, 0.26);
  transition: none;
}

.ai-chat-panel.is-collapsed {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  cursor: pointer;
  box-shadow:
    0 16px 34px rgba(14, 111, 89, 0.28),
    inset 0 0 0 1px rgba(255, 250, 240, 0.24);
}

.panel-toggle {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  cursor: pointer;
  color: var(--sql-paper-strong);
  font-size: 18px;
  font-weight: 900;
  background: var(--sql-green);
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(255, 250, 240, 0.22);
  transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), background 180ms ease, box-shadow 180ms ease;
  touch-action: none;
}

.panel-toggle::after {
  content: "";
  position: absolute;
  inset: 7px;
  border: 1px dashed rgba(255, 250, 240, 0.34);
  border-radius: inherit;
  pointer-events: none;
}

.panel-toggle:hover {
  background: #0b5d4a;
  color: var(--sql-paper-strong);
  box-shadow: inset 0 0 0 1px rgba(255, 250, 240, 0.34);
  transform: translateY(-2px);
}

.panel-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: inherit;
  background: rgba(255, 250, 240, 0.96);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--sql-line);
  background: rgba(255, 250, 240, 0.8);
  border-radius: 32px 32px 0 0;
  z-index: 10;
  position: relative;
  cursor: grab;
  touch-action: none;
}

.is-dragging .panel-header {
  cursor: grabbing;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.header-title {
  font-weight: 600;
  font-size: 16px;
  color: var(--sql-ink);
}

.config-empty {
  padding: 12px 16px;
  border-bottom: 1px solid var(--sql-line);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.config-view {
  padding: 12px 16px;
  border-bottom: 1px solid var(--sql-line);
}

.config-view h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--sql-ink);
}

.quick-actions {
  padding: 8px 16px;
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--sql-line);
}

.quick-actions .action-btn {
  flex: 1;
}

.current-level-info {
  padding: 8px 16px;
  border-bottom: 1px solid var(--sql-line);
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.context-chip {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(14, 111, 89, 0.2);
  border-radius: 999px;
  color: var(--sql-green);
  background: rgba(14, 111, 89, 0.08);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
  font-family: inherit;
}

.context-chip.is-complete {
  border-color: rgba(213, 139, 36, 0.28);
  color: #8a5818;
  background: rgba(246, 212, 145, 0.24);
}

.message-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
}

.message-item {
  display: flex;
  margin-bottom: 16px;
  align-items: flex-start;
}

.message-item.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: var(--sql-paper-strong);
  background: var(--sql-green);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 900;
  flex-shrink: 0;
}

.message-item.user .message-avatar {
  background: var(--sql-amber);
  color: #241d10;
}

.message-content {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(14, 111, 89, 0.08);
  word-break: break-word;
}

.message-content :deep(p) {
  margin: 0 0 10px;
  line-height: 1.7;
}

.message-content :deep(p:last-child) {
  margin-bottom: 0;
}

.message-item.assistant .message-content :deep(code) {
  padding: 2px 5px;
  color: #0f6f59;
  background: rgba(14, 111, 89, 0.08);
  border-radius: 4px;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
  font-weight: 700;
}

.message-item.assistant .message-content :deep(pre) {
  max-width: 100%;
  margin: 12px 0 4px;
  padding: 14px 16px;
  overflow-x: auto;
  color: #0f6f59;
  background: #f3f6f8;
  border: 1px solid rgba(14, 111, 89, 0.08);
  border-radius: 8px;
  box-shadow: inset 0 -10px 0 rgba(14, 111, 89, 0.08);
}

.message-item.assistant .message-content :deep(pre code) {
  display: block;
  min-width: max-content;
  padding: 0;
  color: inherit;
  background: transparent;
  border-radius: 0;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre;
}

.message-item.assistant .message-content :deep(pre::-webkit-scrollbar) {
  height: 10px;
}

.message-item.assistant .message-content :deep(pre::-webkit-scrollbar-track) {
  background: #eef2f4;
  border-radius: 999px;
}

.message-item.assistant .message-content :deep(pre::-webkit-scrollbar-thumb) {
  background: rgba(14, 111, 89, 0.28);
  border-radius: 999px;
}

.message-item.user .message-content {
  background: var(--sql-green);
  color: var(--sql-paper-strong);
  margin-right: 8px;
}

.message-item.assistant .message-content {
  margin-left: 8px;
}

.thinking-line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(24, 33, 30, 0.72);
}

.typing-cursor {
  display: inline-block;
  width: 7px;
  height: 1.1em;
  margin-left: 2px;
  vertical-align: -0.16em;
  background: var(--sql-green);
  border-radius: 999px;
  animation: cursor-blink 0.9s steps(2, start) infinite;
}

@keyframes cursor-blink {
  0%,
  45% {
    opacity: 1;
  }
  46%,
  100% {
    opacity: 0;
  }
}

.input-area {
  padding: 12px 16px;
  border-top: 1px solid var(--sql-line);
}

.input-area :deep(.ant-input) {
  border-radius: 8px;
}

.input-area :deep(.ant-btn-primary) {
  width: 100%;
}

.resize-handle {
  position: absolute;
  z-index: 20;
  background: transparent;
}

.resize-handle-n,
.resize-handle-s {
  left: 14px;
  right: 14px;
  height: 10px;
  cursor: ns-resize;
}

.resize-handle-n {
  top: 0;
}

.resize-handle-s {
  bottom: 0;
}

.resize-handle-e,
.resize-handle-w {
  top: 14px;
  bottom: 14px;
  width: 10px;
  cursor: ew-resize;
}

.resize-handle-e {
  right: 0;
}

.resize-handle-w {
  left: 0;
}

.resize-handle-ne,
.resize-handle-nw,
.resize-handle-se,
.resize-handle-sw {
  width: 16px;
  height: 16px;
}

.resize-handle-ne {
  top: 0;
  right: 0;
  cursor: nesw-resize;
}

.resize-handle-nw {
  top: 0;
  left: 0;
  cursor: nwse-resize;
}

.resize-handle-se {
  right: 0;
  bottom: 0;
  cursor: nwse-resize;
}

.resize-handle-sw {
  left: 0;
  bottom: 0;
  cursor: nesw-resize;
}
</style>
