import { defineStore } from "pinia";
import { allLevels, getLevelByKey } from "../levels";

export type AIProvider = "openai-compatible" | "anthropic" | "custom";

export interface AIConfig {
  provider: AIProvider;
  customProviderName: string;
  baseUrl: string;
  apiPath: string;
  apiKey: string;
  model: string;
}

export const defaultAIConfig: AIConfig = {
  provider: "openai-compatible",
  customProviderName: "",
  baseUrl: "",
  apiPath: "",
  apiKey: "",
  model: "",
};

/**
 * 全局状态存储
 *
 * @author yupi
 */
export const useGlobalStore = defineStore("global", {
  state: () => ({
    // 兼容旧版本持久化字段，不再作为通关判断来源
    studyHistoryList: [] as string[],
    // 当前关卡key
    currentLevelKey: allLevels[0].key,
    // 已通关关卡 key 列表（SQL 结果匹配答案后写入）
    completedLevelKeys: [] as string[],
    // AI 配置
    aiConfig: { ...defaultAIConfig } as AIConfig,
  }),
  getters: {
    // 获取当前关卡对象
    currentLevel: (state) => {
      return getLevelByKey(state.currentLevelKey);
    },
    // 获取已通关关卡列表
    completedLevels: (state) => {
      return state.completedLevelKeys.map((key) => getLevelByKey(key));
    },
    hasValidAIConfig: (state) => {
      return Boolean(
        state.aiConfig.provider &&
          state.aiConfig.baseUrl &&
          state.aiConfig.apiKey &&
          state.aiConfig.model
      );
    },
  },
  // 持久化
  persist: {
    key: "global",
    storage: window.localStorage,
    beforeRestore: (context) => {
      console.log("load globalStore data start");
    },
    afterRestore: (context) => {
      console.log("load globalStore data end");
      const state = context.store.$state as {
        studyHistoryList?: string[];
        completedLevelKeys?: string[];
        aiConfig?: Partial<AIConfig>;
      };
      if (!state.completedLevelKeys && state.studyHistoryList) {
        state.completedLevelKeys = [];
      }
      state.aiConfig = {
        ...defaultAIConfig,
        ...state.aiConfig,
        provider: state.aiConfig?.provider || defaultAIConfig.provider,
      };
    },
  },
  actions: {
    // 设置当前关卡
    setCurrentLevel(levelKey: string) {
      this.currentLevelKey = levelKey;
    },
    // 标记关卡通关
    markLevelCompleted(levelKey: string) {
      if (!this.completedLevelKeys.includes(levelKey)) {
        this.completedLevelKeys.push(levelKey);
      }
    },
    // 更新 AI 配置
    setAIConfig(config: AIConfig) {
      this.aiConfig = {
        ...defaultAIConfig,
        ...config,
      };
    },
    // 清除 AI 配置，但保留学习进度等其他本地状态
    clearAIConfig() {
      this.aiConfig = { ...defaultAIConfig };
    },
    // 重置
    reset() {
      this.$reset();
    },
  },
});
