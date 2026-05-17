<template>
  <div id="questionBoard" class="question-board">
    <section v-if="level" id="questionCard" class="question-card-panel">
      <div class="question-card-head">
        <div>
          <div class="panel-kicker">Level {{ levelNum + 1 }} · Tutorial</div>
          <h2>{{ level.title }}</h2>
        </div>
        <span class="current-badge">{{ level.type === "main" ? "主线任务" : "业务副本" }}</span>
      </div>
      <div class="question-card-body">
      <md-viewer :value="level.content" />
      </div>
      <div class="level-nav">
        <a-button v-if="levelNum > 0" style="float: left" @click="toPrevLevel">
          上一关
        </a-button>
        <a-button
          v-if="levelNum < totalLevels - 1"
          type="primary"
          style="float: right"
          :disabled="resultStatus !== RESULT_STATUS_ENUM.SUCCEED"
          @click="toNextLevel"
        >
          下一关
        </a-button>
        <a-button
          v-if="levelNum === totalLevels - 1"
          type="primary"
          style="float: right"
          :disabled="resultStatus !== RESULT_STATUS_ENUM.SUCCEED"
          @click="doWin"
        >
          恭喜通关
        </a-button>
      </div>
    </section>
    <section v-else class="question-card-panel empty-panel">关卡加载失败</section>
  </div>
</template>

<script setup lang="ts">
import { computed, toRefs, watch } from "vue";
import { getCurrentLevelNum, getNextLevel, getPrevLevel, allLevels } from "../levels";
import { useRouter } from "vue-router";
import { RESULT_STATUS_ENUM } from "../core/result";
import MdViewer from "./MdViewer.vue";

interface Props {
  level: LevelType;
  resultStatus: number;
}

const props = withDefaults(defineProps<Props>(), {});
const { level } = toRefs(props);
const router = useRouter();

// 总关卡数
const totalLevels = computed(() => allLevels.length);

const levelNum = computed(() => {
  return getCurrentLevelNum(level.value);
});

/**
 * 切换关卡时，回到顶部
 */
watch([levelNum], () => {
  scrollTo({
    top: 0,
  });
  const questionCardDom = document.getElementById("questionCard");
  if (questionCardDom) {
    questionCardDom.scrollTop = 0;
  }
});

/**
 * 通关
 */
const doWin = () => {
  alert("恭喜通关，有收获的话，欢迎给本项目一个 star 哦~");
  window.open("https://github.com/liyupi/sql-mother");
};

/**
 * 上一关
 */
const toPrevLevel = () => {
  const toLevel = getPrevLevel(level.value);
  if (toLevel) {
    router.push(`/learn/${toLevel.key}`);
  }
};

/**
 * 下一关
 */
const toNextLevel = () => {
  const toLevel = getNextLevel(level.value);
  if (toLevel) {
    router.push(`/learn/${toLevel.key}`);
  }
};
</script>

<style>
.question-board {
  height: 100%;
}

#questionBoard #questionCard {
  max-height: calc(100vh - 100px);
  min-height: 600px;
  overflow-y: auto;
}

.question-card-panel {
  border: 1px solid var(--sql-line);
  border-radius: var(--sql-radius-lg);
  background: var(--sql-surface);
  box-shadow: var(--sql-tight-shadow);
  overflow: hidden;
}

.question-card-head {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--sql-line);
  background: rgba(255, 250, 240, 0.94);
  backdrop-filter: blur(12px);
}

.question-card-head h2 {
  margin: 4px 0 0;
  color: var(--sql-ink);
  font-size: 20px;
  font-weight: 900;
}

.panel-kicker {
  color: var(--sql-muted);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.current-badge {
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

.question-card-body {
  padding: 26px 30px 20px;
}

.level-nav {
  position: sticky;
  bottom: 0;
  min-height: 72px;
  padding: 16px 22px;
  border-top: 1px solid var(--sql-line);
  background: rgba(255, 250, 240, 0.94);
  backdrop-filter: blur(12px);
}

.level-nav::after {
  content: "";
  display: block;
  clear: both;
}

.empty-panel {
  padding: 28px;
  color: var(--sql-muted);
}
</style>
