<template>
  <div id="app">
    <header class="app-header">
      <div class="header-inner">
        <RouterLink to="/" class="brand-link">
          <img src="./assets/sql-mother-logo-mark.svg" alt="SQL 智练场" class="logo" />
          <span class="brand-copy">
            <span class="title">SQL 智练场</span>
            <span class="subtitle">数据闯关地图</span>
          </span>
        </RouterLink>
        <a-menu
          class="quest-menu"
          :selected-keys="selectedKeys"
          mode="horizontal"
          @click="doClickMenu"
        >
          <a-menu-item key="/learn">学习</a-menu-item>
          <a-menu-item key="/levels">关卡</a-menu-item>
          <a-menu-item key="/quiz">测验</a-menu-item>
          <a-menu-item key="/playground">练习场</a-menu-item>
        </a-menu>
        <button
          type="button"
          class="progress-pill"
          title="回到当前学习关卡"
          @click="goCurrentLevel"
        >
          <span
            class="progress-ring"
            :style="{ background: `conic-gradient(var(--sql-green-bright) 0 ${progressPercent}%, rgba(29, 143, 114, 0.16) ${progressPercent}% 100%)` }"
          >
            <span>{{ progressPercent }}</span>
          </span>
          <span class="progress-copy">
            <strong>闯关进度 {{ completedCount }} / {{ totalLevelCount }}</strong>
            <span>当前：{{ currentLevelTitle }}</span>
          </span>
        </button>
      </div>
    </header>
    <div class="content">
      <router-view />
    </div>
    <a-back-top :style="{ right: '24px', bottom: '34px' }" />

    <!-- AI 配置弹窗 -->
    <AIConfigModal v-model:open="aiConfigVisible" />

    <!-- AI 聊天浮窗 -->
    <AIChatPanel
      @open-quiz="showAIQuiz"
      @open-config="showAIConfig"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AIConfigModal from "./components/AIConfigModal.vue";
import AIChatPanel from "./components/AIChatPanel.vue";
import { useGlobalStore } from "./core/globalStore";
import type { AIConfig } from "./core/globalStore";
import { message } from "ant-design-vue";
import { allLevels } from "./levels";

const route = useRoute();
const router = useRouter();
const globalStore = useGlobalStore();
const selectedKeys = computed(() => {
  if (route.path.startsWith("/learn")) {
    return ["/learn"];
  }
  return [route.path];
});
const totalLevelCount = allLevels.length;
const completedCount = computed(() => globalStore.completedLevelKeys.length);
const progressPercent = computed(() => {
  if (!totalLevelCount) {
    return 0;
  }
  return Math.min(100, Math.round((completedCount.value / totalLevelCount) * 100));
});
const currentLevelTitle = computed(() => globalStore.currentLevel?.title || "准备开始");
const isQuizMockMode = import.meta.env.VITE_AI_QUIZ_MOCK === "1";

const aiConfigVisible = ref(false);

const showAIConfig = () => {
  aiConfigVisible.value = true;
};

const showAIQuiz = () => {
  router.push({
    path: "/quiz",
  });
};

const goCurrentLevel = () => {
  router.push({
    path: `/learn/${globalStore.currentLevelKey}`,
  });
};

const loadAIConfig = async () => {
  if (isQuizMockMode) {
    aiConfigVisible.value = false;
    return;
  }

  try {
    const response = await fetch("/api/ai-config");
    if (!response.ok) {
      globalStore.clearAIConfig();
      aiConfigVisible.value = true;
      return;
    }

    const config = (await response.json()) as AIConfig;
    globalStore.setAIConfig(config);
    aiConfigVisible.value = !globalStore.hasValidAIConfig;
  } catch (error) {
    globalStore.clearAIConfig();
    aiConfigVisible.value = true;
    if (!globalStore.hasValidAIConfig) {
      message.info("请先完成 AI 配置");
    }
  }
};

onMounted(() => {
  loadAIConfig();
});

const doClickMenu = ({ key }: any) => {
  if (key) {
    router.push({
      path: key,
    });
  }
};
</script>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid rgba(33, 54, 48, 0.12);
  background: rgba(247, 243, 232, 0.86);
  backdrop-filter: blur(18px);
}

.header-inner {
  width: min(var(--sql-content-width), calc(100vw - 64px));
  min-width: 1116px;
  min-height: 76px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 30px;
}

.brand-link {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 222px;
}

.brand-copy {
  display: grid;
  gap: 1px;
  line-height: 1.2;
}

.logo {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  box-shadow: 0 12px 24px rgba(16, 38, 31, 0.2);
}

.title {
  font-size: 18px;
  font-weight: 900;
  color: #111827;
  white-space: nowrap;
}

.subtitle {
  color: var(--sql-muted);
  font-size: 12px;
  white-space: nowrap;
}

.quest-menu {
  flex: 1;
  min-width: 0;
  border-bottom: none !important;
  background: transparent !important;
  line-height: normal !important;
}

.quest-menu :deep(.ant-menu-item) {
  top: 0;
  height: 42px;
  margin: 0 3px !important;
  padding: 0 16px !important;
  border-radius: 999px;
  color: var(--sql-ink-soft);
  line-height: 42px !important;
}

.quest-menu :deep(.ant-menu-item::after) {
  display: none;
}

.quest-menu :deep(.ant-menu-item-selected),
.quest-menu :deep(.ant-menu-item-active) {
  color: var(--sql-ink) !important;
  background: rgba(255, 250, 240, 0.84) !important;
}

.progress-pill {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 260px;
  padding: 10px 14px;
  border: 1px solid rgba(29, 143, 114, 0.28);
  border-radius: 999px;
  background: rgba(255, 250, 240, 0.72);
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  appearance: none;
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.progress-pill:hover {
  border-color: rgba(29, 143, 114, 0.44);
  box-shadow: 0 10px 24px rgba(16, 38, 31, 0.1);
  transform: translateY(-1px);
}

.progress-pill:focus-visible {
  outline: 3px solid rgba(29, 143, 114, 0.22);
  outline-offset: 3px;
}

.progress-ring {
  position: relative;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 999px;
}

.progress-ring::after {
  content: "";
  position: absolute;
  inset: 5px;
  border-radius: inherit;
  background: var(--sql-paper-strong);
}

.progress-ring span {
  position: relative;
  z-index: 1;
  color: var(--sql-green);
  font-size: 11px;
  font-weight: 900;
}

.progress-copy {
  display: grid;
  gap: 2px;
  line-height: 1.2;
}

.progress-copy strong {
  font-size: 13px;
}

.progress-copy span {
  max-width: 180px;
  overflow: hidden;
  color: var(--sql-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content {
  min-height: calc(100vh - 76px);
  padding: 34px 0 96px;
}
</style>
