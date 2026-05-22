<template>
  <a-modal
    :visible="visible"
    title="AI 配置"
    :width="500"
    @ok="handleSave"
    @cancel="handleCancel"
    :confirm-loading="saving"
  >
    <template #footer>
      <div class="modal-footer">
        <a-button
          class="switch-model-button"
          :loading="switching"
          @click="handleSwitchModel"
        >
          切换模型
        </a-button>
        <div class="modal-footer-actions">
          <a-button @click="handleCancel">Cancel</a-button>
          <a-button type="primary" :loading="saving" @click="handleSave">
            OK
          </a-button>
        </div>
      </div>
    </template>

    <a-form :model="formState" layout="vertical">
      <a-form-item label="接口类型" required>
        <a-select v-model:value="formState.provider">
          <a-select-option value="openai-compatible">
            OpenAI 兼容接口
          </a-select-option>
          <a-select-option value="anthropic">
            Anthropic 接口
          </a-select-option>
          <a-select-option value="custom">
            自定义 Provider
          </a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item v-if="formState.provider === 'custom'" label="Provider 名称">
        <a-input
          v-model:value="formState.customProviderName"
          placeholder="例如: 本地 Ollama / 公司网关"
        />
      </a-form-item>
      <a-form-item label="Base URL" required>
        <a-input
          v-model:value="formState.baseUrl"
          :placeholder="baseUrlPlaceholder"
        />
      </a-form-item>
      <a-form-item v-if="formState.provider === 'custom'" label="接口路径" required>
        <a-input
          v-model:value="formState.apiPath"
          placeholder="例如: /v1/chat/completions"
        />
      </a-form-item>
      <a-form-item label="模型名称" required>
        <a-input
          v-model:value="formState.model"
          :placeholder="modelPlaceholder"
        />
      </a-form-item>
      <a-form-item label="API Key" required>
        <a-input-password
          v-model:value="formState.apiKey"
          placeholder="请输入 API Key"
        />
      </a-form-item>
      <a-form-item>
        <a-button block :loading="testing" @click="handleTestConnection">
          测试连通性
        </a-button>
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { defaultAIConfig, useGlobalStore } from '../core/globalStore';
import type { AIConfig } from '../core/globalStore';
import { storeToRefs } from 'pinia';
import { message } from 'ant-design-vue';
import { useAI } from '../composables/useAI';

interface Props {
  open: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'saved'): void;
}>();

const globalStore = useGlobalStore();
const { aiConfig } = storeToRefs(globalStore);
const { testConfig, isValidAIConfig } = useAI();

const visible = ref(props.open);
const saving = ref(false);
const testing = ref(false);
const switching = ref(false);

const formState = ref<AIConfig>({ ...defaultAIConfig });

const baseUrlPlaceholder = computed(() => {
  if (formState.value.provider === 'anthropic') {
    return '例如: https://api.anthropic.com';
  }
  if (formState.value.provider === 'custom') {
    return '例如: http://localhost:11434 或 https://gateway.example.com';
  }
  return '例如: https://api.deepseek.com';
});

const modelPlaceholder = computed(() => {
  if (formState.value.provider === 'anthropic') {
    return '例如: claude-3-5-haiku-latest';
  }
  if (formState.value.provider === 'custom') {
    return '例如: qwen2.5-coder / llama3.1 / 自定义模型名';
  }
  return '例如: deepseek-chat';
});

watch(() => props.open, (newVal) => {
  visible.value = newVal;
  if (newVal) {
    formState.value = {
      ...defaultAIConfig,
      ...aiConfig.value,
    };
  }
}, { immediate: true });

watch(visible, (newVal) => {
  emit('update:open', newVal);
});

watch(
  () => formState.value.provider,
  (provider) => {
    if (provider === 'custom' && !formState.value.apiPath) {
      formState.value.apiPath = '/v1/chat/completions';
      return;
    }
    if (provider !== 'custom') {
      formState.value.apiPath = '';
    }
  }
);

const getSanitizedConfig = (): AIConfig => {
  return {
    provider: formState.value.provider,
    customProviderName: formState.value.customProviderName.trim(),
    baseUrl: formState.value.baseUrl.trim(),
    apiPath: formState.value.provider === 'custom'
      ? formState.value.apiPath.trim() || '/v1/chat/completions'
      : '',
    apiKey: formState.value.apiKey.trim(),
    model: formState.value.model.trim().toLowerCase(),
  };
};

const handleTestConnection = async () => {
  const config = getSanitizedConfig();
  if (!isValidAIConfig(config)) {
    message.warning('请填写完整的配置信息后再测试');
    return;
  }

  testing.value = true;
  try {
    await testConfig(config);
    message.success('AI 接口连通性测试成功');
  } catch (error: any) {
    message.error(error.message || 'AI 接口连通性测试失败');
  } finally {
    testing.value = false;
  }
};

const handleSave = async () => {
  const config = getSanitizedConfig();
  if (isValidAIConfig(config)) {
    saving.value = true;

    try {
      const response = await fetch('/api/ai-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || '保存 AI 配置失败');
      }

      globalStore.setAIConfig(config);
      message.success('AI 配置已保存');
      emit('saved');
      visible.value = false;
    } catch (error: any) {
      message.error(error.message || '保存 AI 配置失败，请确认正在使用 npm run dev 启动项目');
    } finally {
      saving.value = false;
    }
  } else {
    message.warning('请填写完整的配置信息');
  }
};

const resetFormState = () => {
  formState.value = { ...defaultAIConfig };
};

const handleSwitchModel = async () => {
  switching.value = true;
  try {
    const response = await fetch('/api/ai-config', {
      method: 'DELETE',
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || '清除 AI 配置失败');
    }

    globalStore.clearAIConfig();
    resetFormState();
    message.success('已清除配置，请重新绑定 AI 模型');
  } catch (error: any) {
    message.error(error.message || '清除 AI 配置失败，请确认正在使用 npm run dev 启动项目');
  } finally {
    switching.value = false;
  }
};

const handleCancel = () => {
  visible.value = false;
};
</script>

<style scoped>
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.modal-footer-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.switch-model-button {
  color: #0f766e;
  border-color: rgba(15, 118, 110, 0.35);
}
</style>
