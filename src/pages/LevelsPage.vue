<template>
  <div id="levelsPage" class="sql-page-shell levels-page">
    <section class="levels-heading">
      <div>
        <span class="sql-section-label">Quest Map</span>
        <h1 class="sql-display-title">关卡地图</h1>
      </div>
      <p class="sql-section-copy">
        主线关卡以查询能力路线展开，自定义关卡变成业务副本。你可以按顺序推进，也可以直接进入感兴趣的数据场景。
      </p>
    </section>

    <section class="levels-layout">
      <div class="main-map sql-panel">
        <div class="map-toolbar">
          <div>
            <div class="panel-kicker">Main Route</div>
            <h2>主线必修</h2>
          </div>
          <span class="route-progress">已通关 {{ completedMainCount }} / {{ mainLevels.length }}</span>
        </div>

        <div ref="routeMapScrollRef" class="route-map-scroll">
          <div
            ref="routeMapStageRef"
            class="route-map-stage"
            :style="{ height: `${routeMapHeight}px` }"
          >
            <svg
              class="route-path-svg"
              :viewBox="`0 0 720 ${routeMapHeight}`"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                v-for="stage in mapStages"
                :key="`${stage.key}-route`"
                class="sector-route-line"
                :class="`path-${stage.key}`"
                :d="stage.routePath"
              />
              <path
                v-for="bridge in bridgeRoutePaths"
                :key="bridge.key"
                class="stage-bridge-line"
                :class="`bridge-${bridge.key}`"
                :d="bridge.path"
              />
            </svg>

            <section
              v-for="stage in mapStages"
              :key="stage.key"
              class="map-sector"
              :class="`sector-${stage.key}`"
              :style="getSectorStyle(stage)"
            >
              <header class="sector-header">
                <span>{{ stage.title }}</span>
                <small>{{ stage.subtitle }}</small>
              </header>
              <button
                v-for="level in stage.levels"
                :key="level.key"
                class="mountain-node"
                :class="{ 'is-done': isCompleted(level.key), 'is-current': isCurrent(level.key) }"
                :style="getMountainStyle(level)"
                type="button"
                :aria-label="`${stage.title}：${level.shortTitle}`"
                @click="goToLevel(level.key)"
              >
                <span class="mountain-index">{{ level.index + 1 }}</span>
                <span class="mountain-peak" aria-hidden="true">
                  <span class="mountain-ridge"></span>
                  <span class="status-emblem" :class="getStatusClass(level.key)">
                    <span v-if="isCompleted(level.key)" class="flag-icon"></span>
                    <span v-else class="blade-icon"><i></i><i></i></span>
                  </span>
                </span>
                <strong class="mountain-label">{{ level.shortTitle }}</strong>
              </button>
            </section>
          </div>
        </div>
      </div>

      <aside class="mission-panel sql-panel">
        <div class="panel-kicker">Selected Mission</div>
        <h2>{{ selectedLevel.title }}</h2>
        <p>
          当前路线会记录你的通关位置。完成 SQL 校验后，学习页会自动解锁下一关的继续入口。
        </p>
        <div class="mission-actions">
          <a-button type="primary" @click="goToLevel(selectedLevel.key)">进入挑战</a-button>
          <a-button @click="goToLevel(currentLevelKey)">回到当前</a-button>
        </div>

        <div class="custom-heading">
          <div>
            <div class="panel-kicker">Scenario Dungeons</div>
            <h3>业务副本</h3>
          </div>
          <span>{{ customLevels.length }} 个</span>
        </div>

        <div class="custom-list">
          <button
            v-for="level in customLevels"
            :key="level.key"
            class="custom-card"
            type="button"
            @click="goToLevel(level.key)"
          >
            <span class="custom-title">
              <strong>{{ level.title }}</strong>
              <span class="difficulty-meter" :aria-label="getDifficultyText(level.difficulty)">
                <i
                  v-for="item in 3"
                  :key="item"
                  :class="{ 'is-active': item <= getDifficultyValue(level.difficulty) }"
                ></i>
              </span>
            </span>
            <small>{{ getScenarioCopy(level.title) }}</small>
          </button>
        </div>
      </aside>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import mainLevels from "../levels/mainLevels";
import customLevels from "../levels/customLevels";
import { useGlobalStore } from "../core/globalStore";

const router = useRouter();
const globalStore = useGlobalStore();
const { completedLevelKeys, currentLevelKey } = storeToRefs(globalStore);
const routeMapStageRef = ref<HTMLElement | null>(null);
const routeMapScrollRef = ref<HTMLElement | null>(null);

const selectedLevel = computed(() => {
  return mainLevels.find((level) => level.key === currentLevelKey.value) || mainLevels[0];
});

const completedMainCount = computed(() => {
  return mainLevels.filter((level) => completedLevelKeys.value.includes(level.key)).length;
});

const stageBlueprints = [
  {
    key: "basic",
    title: "基础语法",
    subtitle: "入门高地",
    x: 28,
    y: 48,
    width: 664,
    height: 640,
    points: [
      { x: 38, y: 114 },
      { x: 196, y: 82 },
      { x: 356, y: 116 },
      { x: 512, y: 84 },
      { x: 78, y: 252 },
      { x: 236, y: 224 },
      { x: 396, y: 254 },
      { x: 516, y: 226 },
      { x: 38, y: 396 },
      { x: 194, y: 368 },
      { x: 354, y: 402 },
      { x: 510, y: 372 },
      { x: 274, y: 514 },
    ],
  },
  {
    key: "function",
    title: "函数",
    subtitle: "工具山脊",
    x: 28,
    y: 740,
    width: 664,
    height: 300,
    points: [
      { x: 88, y: 128 },
      { x: 294, y: 88 },
      { x: 504, y: 128 },
    ],
  },
  {
    key: "aggregate",
    title: "分组聚合",
    subtitle: "统计台地",
    x: 28,
    y: 1092,
    width: 664,
    height: 300,
    points: [
      { x: 92, y: 124 },
      { x: 300, y: 88 },
      { x: 506, y: 124 },
    ],
  },
  {
    key: "advanced",
    title: "查询进阶",
    subtitle: "深水峡湾",
    x: 28,
    y: 1444,
    width: 664,
    height: 720,
    points: [
      { x: 54, y: 108 },
      { x: 260, y: 80 },
      { x: 474, y: 108 },
      { x: 82, y: 260 },
      { x: 292, y: 234 },
      { x: 500, y: 260 },
      { x: 54, y: 420 },
      { x: 260, y: 392 },
      { x: 474, y: 420 },
      { x: 166, y: 560 },
      { x: 390, y: 560 },
    ],
  },
];

const routeMapHeight = computed(() => {
  const lastStage = stageBlueprints[stageBlueprints.length - 1];
  return lastStage.y + lastStage.height + 64;
});

const buildSmoothPath = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) {
    return "";
  }
  return points.reduce((path, point, index, list) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }
    const prev = list[index - 1];
    const midX = (prev.x + point.x) / 2;
    return `${path} C ${midX} ${prev.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
};

const getShortLevelTitle = (title: string) => {
  const parts = title.split(" - ");
  if (parts.length <= 1) {
    return title;
  }
  return parts.slice(1).join(" - ");
};

const mapStages = computed(() => {
  return stageBlueprints.map((stage) => {
    const stageLevels = mainLevels
      .map((level, index) => ({
        ...level,
        index,
        shortTitle: getShortLevelTitle(level.title),
      }))
      .filter((level) => level.title.startsWith(stage.title))
      .map((level, index) => ({
        ...level,
        x: stage.points[index]?.x || 80 + (index % 4) * 140,
        y: stage.points[index]?.y || 120 + Math.floor(index / 4) * 130,
      }));
    const routePoints = stageLevels.map((level) => ({
      x: stage.x + level.x + 64,
      y: stage.y + level.y + 34,
    }));
    return {
      ...stage,
      levels: stageLevels,
      routePath: buildSmoothPath(routePoints),
    };
  });
});

const getAbsoluteLevelPoint = (levelIndex: number) => {
  for (const stage of mapStages.value) {
    const level = stage.levels.find((item) => item.index === levelIndex);
    if (level) {
      return {
        x: stage.x + level.x + 64,
        y: stage.y + level.y + 34,
      };
    }
  }
  return null;
};

const buildBridgePath = (from: { x: number; y: number }, to: { x: number; y: number }) => {
  const midY = (from.y + to.y) / 2;
  return `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;
};

const bridgeRoutePaths = computed(() => {
  return [
    { key: "13-14", from: 12, to: 13 },
    { key: "16-17", from: 15, to: 16 },
    { key: "19-20", from: 18, to: 19 },
  ].flatMap((bridge) => {
    const from = getAbsoluteLevelPoint(bridge.from);
    const to = getAbsoluteLevelPoint(bridge.to);
    if (!from || !to) {
      return [];
    }
    return {
      key: bridge.key,
      path: buildBridgePath(from, to),
    };
  });
});

let routeAnimationFrame = 0;
let routeDashOffset = 0;
let lastRouteTick = 0;
let isRouteMapVisible = false;
let routeObserver: IntersectionObserver | null = null;
let scrollFrame = 0;
let scrollIdleTimer = 0;
let reducedMotionQuery: MediaQueryList | null = null;

const prefersReducedMotion = () => {
  return reducedMotionQuery?.matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

const stopRouteAnimation = () => {
  if (routeAnimationFrame) {
    window.cancelAnimationFrame(routeAnimationFrame);
    routeAnimationFrame = 0;
  }
  routeMapStageRef.value?.classList.remove("is-route-animating");
};

const animateRouteDash = (timestamp: number) => {
  if (!isRouteMapVisible || document.hidden || prefersReducedMotion()) {
    stopRouteAnimation();
    return;
  }

  if (timestamp - lastRouteTick > 50) {
    routeDashOffset = (routeDashOffset - 1.6) % 280;
    routeMapStageRef.value?.style.setProperty("--route-dash-offset", `${routeDashOffset}px`);
    lastRouteTick = timestamp;
  }

  routeAnimationFrame = window.requestAnimationFrame(animateRouteDash);
};

const startRouteAnimation = () => {
  if (routeAnimationFrame || !isRouteMapVisible || document.hidden || prefersReducedMotion()) {
    return;
  }
  routeMapStageRef.value?.classList.add("is-route-animating");
  lastRouteTick = 0;
  routeAnimationFrame = window.requestAnimationFrame(animateRouteDash);
};

const handleVisibilityChange = () => {
  if (document.hidden) {
    stopRouteAnimation();
    return;
  }
  startRouteAnimation();
};

const handleReducedMotionChange = () => {
  if (prefersReducedMotion()) {
    stopRouteAnimation();
    routeMapStageRef.value?.style.setProperty("--route-dash-offset", "0px");
    return;
  }
  startRouteAnimation();
};

const handleMapScroll = () => {
  if (scrollFrame) {
    return;
  }

  scrollFrame = window.requestAnimationFrame(() => {
    scrollFrame = 0;
    const stageEl = routeMapStageRef.value;
    stageEl?.classList.add("is-map-scrolling");
    stopRouteAnimation();
    window.clearTimeout(scrollIdleTimer);
    scrollIdleTimer = window.setTimeout(() => {
      stageEl?.classList.remove("is-map-scrolling");
      startRouteAnimation();
    }, 140);
  });
};

const goToLevel = (levelKey: string) => {
  router.push(`/learn/${levelKey}`);
};

const isCompleted = (levelKey: string) => completedLevelKeys.value.includes(levelKey);
const isCurrent = (levelKey: string) => currentLevelKey.value === levelKey;

const getSectorStyle = (stage: { x: number; y: number; width: number; height: number }) => {
  return {
    left: `${stage.x}px`,
    top: `${stage.y}px`,
    width: `${stage.width}px`,
    height: `${stage.height}px`,
  };
};

const getMountainStyle = (level: { x: number; y: number }) => {
  return {
    left: `${level.x}px`,
    top: `${level.y}px`,
  };
};

const getStatusClass = (levelKey: string) => {
  if (isCompleted(levelKey)) {
    return "is-flag";
  }
  if (isCurrent(levelKey)) {
    return "is-current-mark";
  }
  return "is-blade";
};

const getDifficultyText = (difficulty?: number) => {
  switch (difficulty) {
    case 1:
      return "简单";
    case 2:
      return "中等";
    case 3:
      return "进阶";
    default:
      return "中等";
  }
};
const getDifficultyValue = (difficulty?: number) => difficulty || 2;

const getScenarioCopy = (title: string) => {
  if (title.includes("投资") || title.includes("华尔街")) return "交易流水、收益统计、风险筛选。";
  if (title.includes("快递") || title.includes("达人")) return "配送时效、异常订单、城市排名。";
  if (title.includes("白衣") || title.includes("医院")) return "挂号记录、科室容量、等待时间。";
  if (title.includes("淘宝") || title.includes("淘金")) return "用户行为、订单转化、商品表现。";
  if (title.includes("电影") || title.includes("票房")) return "影片表现、档期对比、票房走势。";
  if (title.includes("美食")) return "门店经营、菜品销量、会员消费。";
  return "把 SQL 放进真实业务数据里练。";
};

onMounted(() => {
  reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotionQuery.addEventListener("change", handleReducedMotionChange);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  routeMapScrollRef.value?.addEventListener("scroll", handleMapScroll, { passive: true });

  routeObserver = new IntersectionObserver(
    ([entry]) => {
      isRouteMapVisible = Boolean(entry?.isIntersecting);
      if (isRouteMapVisible) {
        startRouteAnimation();
      } else {
        stopRouteAnimation();
      }
    },
    { threshold: 0.08 }
  );

  if (routeMapStageRef.value) {
    routeObserver.observe(routeMapStageRef.value);
  }
});

onUnmounted(() => {
  stopRouteAnimation();
  if (scrollFrame) {
    window.cancelAnimationFrame(scrollFrame);
  }
  window.clearTimeout(scrollIdleTimer);
  routeObserver?.disconnect();
  routeObserver = null;
  reducedMotionQuery?.removeEventListener("change", handleReducedMotionChange);
  reducedMotionQuery = null;
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  routeMapScrollRef.value?.removeEventListener("scroll", handleMapScroll);
});
</script>

<style scoped>
.levels-page {
  padding-top: 18px;
}

.levels-heading {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(420px, 1.1fr);
  gap: 48px;
  align-items: end;
  margin-bottom: 30px;
}

.levels-layout {
  display: grid;
  grid-template-columns: minmax(720px, 1.45fr) minmax(340px, 0.75fr);
  gap: 22px;
  align-items: start;
}

.main-map {
  position: relative;
  min-height: 760px;
  padding: 24px;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(255, 250, 240, 0.9), rgba(250, 242, 223, 0.82)),
    repeating-linear-gradient(0deg, transparent 0 38px, rgba(22, 35, 31, 0.04) 38px 39px),
    repeating-linear-gradient(90deg, transparent 0 38px, rgba(22, 35, 31, 0.04) 38px 39px);
}

.main-map::before {
  content: "";
  position: absolute;
  inset: 92px 24px 24px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 20% 12%, rgba(14, 111, 89, 0.08), transparent 28%),
    radial-gradient(circle at 80% 44%, rgba(213, 139, 36, 0.08), transparent 30%),
    radial-gradient(circle at 50% 78%, rgba(53, 111, 163, 0.08), transparent 34%);
  pointer-events: none;
}

.map-toolbar,
.custom-heading {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.panel-kicker {
  color: var(--sql-muted);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.map-toolbar h2,
.mission-panel h2,
.custom-heading h3 {
  margin: 4px 0 0;
  font-size: 24px;
  font-weight: 900;
}

.route-progress,
.custom-heading span {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  color: var(--sql-green);
  background: rgba(14, 111, 89, 0.1);
  font-size: 13px;
  font-weight: 900;
}

.route-map-scroll {
  position: relative;
  z-index: 1;
  max-height: 700px;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 4px 4px 12px;
  scrollbar-gutter: stable;
  contain: layout paint style;
}

.route-map-stage {
  --route-dash-offset: 0px;
  position: relative;
  width: 720px;
  max-width: 100%;
  contain: layout style;
  backface-visibility: hidden;
  transform: translateZ(0);
  isolation: isolate;
}

.route-map-stage::before {
  content: "";
  position: absolute;
  inset: 0 8px;
  z-index: 0;
  border: 1px solid rgba(33, 54, 48, 0.1);
  border-radius: 38px;
  background:
    radial-gradient(circle at 18% 10%, rgba(14, 111, 89, 0.15), transparent 24%),
    radial-gradient(circle at 75% 36%, rgba(67, 132, 80, 0.12), transparent 24%),
    radial-gradient(circle at 24% 58%, rgba(213, 139, 36, 0.13), transparent 25%),
    radial-gradient(circle at 78% 82%, rgba(53, 111, 163, 0.14), transparent 30%),
    linear-gradient(
      180deg,
      rgba(14, 111, 89, 0.12) 0%,
      rgba(14, 111, 89, 0.08) 28%,
      rgba(67, 132, 80, 0.1) 43%,
      rgba(213, 139, 36, 0.1) 62%,
      rgba(53, 111, 163, 0.12) 100%
    ),
    repeating-linear-gradient(0deg, transparent 0 31px, rgba(22, 35, 31, 0.035) 31px 32px),
    repeating-linear-gradient(90deg, transparent 0 31px, rgba(22, 35, 31, 0.035) 31px 32px);
  mask-image: linear-gradient(to bottom, transparent, #000 4%, #000 96%, transparent);
  pointer-events: none;
}

.route-path-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  contain: paint;
  pointer-events: none;
  z-index: 1;
}

.sector-route-line,
.stage-bridge-line {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sector-route-line {
  stroke-width: 3;
  stroke-dasharray: 8 10;
  stroke-dashoffset: var(--route-dash-offset);
  vector-effect: non-scaling-stroke;
  opacity: 0.76;
  transition: opacity 180ms ease;
}

.stage-bridge-line {
  stroke: rgba(14, 111, 89, 0.34);
  stroke-width: 5;
  stroke-dasharray: 13 12;
  stroke-dashoffset: var(--route-dash-offset);
  vector-effect: non-scaling-stroke;
  opacity: 0.9;
  transition: opacity 180ms ease;
}

.route-map-stage.is-map-scrolling .sector-route-line,
.route-map-stage.is-map-scrolling .stage-bridge-line {
  opacity: 0.48;
}

.route-map-stage.is-route-animating:not(.is-map-scrolling) .sector-route-line,
.route-map-stage.is-route-animating:not(.is-map-scrolling) .stage-bridge-line {
  will-change: stroke-dashoffset;
}

.bridge-13-14 {
  stroke: rgba(67, 132, 80, 0.36);
}

.bridge-16-17 {
  stroke: rgba(213, 139, 36, 0.36);
}

.bridge-19-20 {
  stroke: rgba(53, 111, 163, 0.34);
}

.path-basic {
  stroke: rgba(14, 111, 89, 0.42);
}

.path-function {
  stroke: rgba(67, 132, 80, 0.42);
}

.path-aggregate {
  stroke: rgba(213, 139, 36, 0.44);
}

.path-advanced {
  stroke: rgba(53, 111, 163, 0.42);
}

.map-sector {
  position: absolute;
  z-index: 2;
  border: 1px solid transparent;
  border-radius: 34px;
  background: transparent;
  box-shadow: none;
  contain: layout style;
  overflow: visible;
}

.map-sector::before {
  content: "";
  position: absolute;
  inset: 18px 20px;
  border-radius: 30px;
  background:
    radial-gradient(circle at 16% 22%, color-mix(in srgb, var(--sector-color) 16%, transparent), transparent 36%),
    radial-gradient(circle at 78% 70%, color-mix(in srgb, var(--sector-next) 12%, transparent), transparent 38%);
  opacity: 0.7;
  pointer-events: none;
}

.map-sector::after {
  content: "";
  position: absolute;
  display: none;
}

.sector-basic {
  --sector-color: #0e6f59;
  --sector-next: #438450;
  --sector-soft: rgba(14, 111, 89, 0.08);
}

.sector-function {
  --sector-color: #438450;
  --sector-next: #d58b24;
  --sector-soft: rgba(67, 132, 80, 0.08);
}

.sector-aggregate {
  --sector-color: #d58b24;
  --sector-next: #356fa3;
  --sector-soft: rgba(213, 139, 36, 0.1);
}

.sector-advanced {
  --sector-color: #356fa3;
  --sector-next: #0e6f59;
  --sector-soft: rgba(53, 111, 163, 0.09);
}

.sector-header {
  position: absolute;
  top: 20px;
  left: 24px;
  right: 24px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  color: color-mix(in srgb, var(--sector-color) 78%, var(--sql-ink));
  font-weight: 900;
  letter-spacing: 0.04em;
  pointer-events: none;
}

.sector-header span {
  font-size: 18px;
}

.sector-header small {
  color: var(--sql-muted);
  font-size: 12px;
  font-weight: 900;
}

.mountain-node {
  position: absolute;
  z-index: 3;
  width: 136px;
  min-height: 112px;
  padding: 0;
  border: 0;
  cursor: pointer;
  text-align: center;
  background: transparent;
  backface-visibility: hidden;
  transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.mountain-node:hover,
.mountain-node.is-current {
  transform: translateY(-5px);
  will-change: transform;
}

.mountain-node:focus-visible {
  outline: 3px solid rgba(14, 111, 89, 0.22);
  outline-offset: 5px;
  border-radius: 18px;
}

.mountain-index {
  position: absolute;
  top: 26px;
  left: 50%;
  z-index: 4;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  color: var(--sql-paper-strong);
  background: var(--sql-green);
  box-shadow: 0 6px 14px rgba(14, 111, 89, 0.22);
  font-size: 12px;
  font-weight: 900;
  transform: translateX(-50%);
}

.mountain-peak {
  position: relative;
  display: block;
  width: 92px;
  height: 66px;
  margin: 0 auto 8px;
  transform: translateZ(0);
  transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.mountain-peak::before,
.mountain-peak::after {
  content: "";
  position: absolute;
  bottom: 0;
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
}

.mountain-peak::before {
  left: 7px;
  width: 78px;
  height: 58px;
  border-radius: 18px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--sector-color) 72%, #fffaf0), color-mix(in srgb, var(--sector-color) 34%, #fffaf0));
  box-shadow: 0 12px 18px rgba(34, 38, 31, 0.12);
}

.mountain-peak::after {
  left: 46px;
  width: 40px;
  height: 42px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--sector-next) 42%, #fffaf0);
  box-shadow: 0 10px 16px rgba(34, 38, 31, 0.08);
  opacity: 0.86;
}

.mountain-ridge {
  position: absolute;
  left: 36px;
  top: 15px;
  z-index: 2;
  width: 19px;
  height: 20px;
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
  background: rgba(255, 250, 240, 0.78);
}

.mountain-label {
  display: block;
  min-height: 34px;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--sector-color) 18%, transparent);
  border-radius: 14px;
  color: var(--sql-ink);
  background: rgba(255, 250, 240, 0.78);
  box-shadow: 0 10px 20px rgba(34, 38, 31, 0.06);
  font-size: 12px;
  font-weight: 900;
  line-height: 1.35;
}

.mountain-node:hover .mountain-label,
.mountain-node.is-current .mountain-label {
  border-color: color-mix(in srgb, var(--sector-color) 34%, transparent);
  box-shadow: 0 14px 26px rgba(34, 38, 31, 0.12);
}

.mountain-node.is-current .mountain-peak {
  transform: translateZ(0) scale(1.04);
}

.status-emblem {
  position: absolute;
  top: -8px;
  right: 10px;
  z-index: 5;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(14, 111, 89, 0.1);
  box-shadow: inset 0 0 0 1px rgba(255, 250, 240, 0.58);
}

.status-emblem.is-flag {
  background: rgba(246, 212, 145, 0.42);
  box-shadow:
    inset 0 0 0 1px rgba(213, 139, 36, 0.16),
    0 8px 16px rgba(213, 139, 36, 0.14);
}

.status-emblem.is-current-mark {
  background: rgba(14, 111, 89, 0.14);
  box-shadow:
    inset 0 0 0 1px rgba(14, 111, 89, 0.16),
    0 0 0 5px rgba(14, 111, 89, 0.08);
}

.flag-icon {
  position: relative;
  width: 18px;
  height: 22px;
  border-left: 3px solid var(--sql-green);
}

.flag-icon::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 1px;
  width: 15px;
  height: 12px;
  border-radius: 3px 8px 8px 3px;
  background: var(--sql-amber);
  clip-path: polygon(0 0, 100% 12%, 76% 50%, 100% 88%, 0 100%);
}

.flag-icon::after {
  content: "";
  position: absolute;
  left: -5px;
  bottom: 0;
  width: 13px;
  height: 3px;
  border-radius: 999px;
  background: var(--sql-green);
}

.blade-icon {
  position: relative;
  width: 22px;
  height: 22px;
}

.blade-icon i {
  position: absolute;
  left: 10px;
  top: 1px;
  width: 4px;
  height: 20px;
  border-radius: 999px;
  background: var(--sql-green);
  transform: rotate(45deg);
}

.blade-icon i::before {
  content: "";
  position: absolute;
  left: -3px;
  top: -2px;
  width: 10px;
  height: 8px;
  border-radius: 8px 8px 3px 3px;
  background: var(--sql-amber-soft);
}

.blade-icon i:nth-child(2) {
  transform: rotate(-45deg);
  opacity: 0.82;
}

.mission-panel {
  padding: 24px;
  position: sticky;
  top: 104px;
}

.mission-panel p {
  color: var(--sql-ink-soft);
  line-height: 1.8;
}

.mission-actions {
  display: flex;
  gap: 10px;
  margin: 18px 0 26px;
}

.custom-list {
  display: grid;
  gap: 12px;
  max-height: 460px;
  overflow: auto;
  padding-right: 6px;
}

.custom-card {
  display: grid;
  gap: 8px;
  padding: 15px;
  border: 1px solid var(--sql-line);
  border-radius: 16px;
  cursor: pointer;
  text-align: left;
  background: rgba(255, 250, 240, 0.72);
  transition: transform 160ms ease, border-color 160ms ease;
}

.custom-card:hover {
  transform: translateY(-2px);
  border-color: rgba(213, 139, 36, 0.36);
}

.custom-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.custom-title strong {
  color: var(--sql-ink);
}

.custom-title span {
  color: var(--sql-amber);
}

.difficulty-meter {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0;
  min-width: 50px;
}

.difficulty-meter i {
  width: 12px;
  height: 12px;
  border: 1px solid rgba(14, 111, 89, 0.22);
  border-radius: 4px;
  background: rgba(14, 111, 89, 0.08);
  transform: rotate(45deg);
}

.difficulty-meter i.is-active {
  border-color: rgba(213, 139, 36, 0.28);
  background: var(--sql-amber);
  box-shadow: 0 0 0 3px rgba(246, 212, 145, 0.18);
}

.custom-card small {
  color: var(--sql-ink-soft);
  font-size: 13px;
  line-height: 1.6;
}

@media (prefers-reduced-motion: reduce) {
  .sector-route-line,
  .stage-bridge-line,
  .mountain-node,
  .mountain-peak,
  .custom-card {
    transition-duration: 0.01ms;
  }
}
</style>
