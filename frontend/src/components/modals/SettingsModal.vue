<template>
    <div class="model-selector-content">
        <div class="model-selector-header">
            <h3 id="regionSelectorTitle">检测设置</h3>
            <button class="model-selector-close" @click="uiStore.closeModal()">&times;</button>
        </div>
        <div class="model-selector-body">
            <div class="settings-section">
                <h4 class="settings-title">配置集 (Profiles)</h4>
                <div class="profile-create">
                    <input v-model="profileName" type="text" placeholder="输入配置集名称，如：OpenAI-生产环境">
                    <button class="profile-btn" @click="handleSaveProfile">保存当前配置</button>
                </div>
                <div class="profile-list" v-if="configStore.profiles.length > 0">
                    <div class="profile-item" v-for="profile in configStore.profiles" :key="profile.id">
                        <span class="profile-name">{{ profile.name }}</span>
                        <div class="profile-actions">
                            <button class="profile-btn" @click="handleLoadProfile(profile.id)">加载</button>
                            <button class="profile-btn danger" @click="handleDeleteProfile(profile.id)">删除</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="settings-section">
                <h4 class="settings-title">检测区域</h4>
                <ul class="model-list region-list">
                    <li v-for="(label, key) in configStore.regions" :key="key"
                        :class="{ selected: key === configStore.currentRegion }" @click="configStore.selectRegion(key)">
                        {{ label }}
                    </li>
                </ul>
            </div>
            <div class="settings-section">
                <h4 class="settings-title">高级配置</h4>
                <div class="advanced-settings-grid">
                    <div class="config-item">
                        <label for="threshold">最低余额阈值</label>
                        <input id="threshold" type="number" v-model.number="configStore.threshold" min="0" step="0.1">
                    </div>
                    <div class="config-item">
                        <div class="label-with-hint">
                            <label for="global-concurrency">全局并发上限</label>
                            <span class="config-hint">{{ configStore.globalConcurrency }} / 20</span>
                        </div>
                        <div class="range-input-wrapper">
                            <input id="global-concurrency" type="range" v-model.number="configStore.globalConcurrency" min="1" max="20" class="range-slider">
                        </div>
                    </div>

                    <div class="config-item">
                        <div class="label-with-hint">
                            <label for="concurrency">并发请求数</label>
                            <span class="config-hint">{{ currentProviderConcurrency }} / 20</span>
                        </div>
                        <div class="range-input-wrapper">
                            <input id="concurrency-range" type="range" v-model.number="currentProviderConcurrency" min="1" max="20" class="range-slider">
                        </div>
                    </div>

                    <div class="config-item">
                        <label for="max-tokens">max_tokens</label>
                        <input id="max-tokens" type="number" v-model.number="configStore.validationMaxTokens" min="1">
                    </div>
                    
                    <div class="config-item">
                        <label for="max-output-tokens">max_output_tokens</label>
                        <input id="max-output-tokens" type="number" v-model.number="configStore.validationMaxOutputTokens" min="1">
                    </div>

                    <div class="config-item prompt-item">
                        <label for="prompt">验证提示词 (Prompt)</label>
                        <input id="prompt" type="text" v-model="configStore.validationPrompt">
                    </div>

                    <div class="config-item prompt-item">
                        <label for="model-include">模型包含关键词（逗号分隔）</label>
                        <input id="model-include" type="text" v-model="configStore.modelIncludeKeywords" placeholder="例如：gpt, claude, deepseek">
                    </div>

                    <div class="config-item prompt-item">
                        <label for="model-exclude">模型排除关键词（逗号分隔）</label>
                        <input id="model-exclude" type="text" v-model="configStore.modelExcludeKeywords" placeholder="例如：vision, audio">
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useUiStore } from '@/stores/ui';
import { useConfigStore } from '@/stores/config';
const uiStore = useUiStore();
const configStore = useConfigStore();

const profileName = ref('');
const currentProviderConcurrency = computed({
    get: () => configStore.providerConcurrency[configStore.currentProvider] || configStore.concurrency,
    set: (value) => {
        configStore.providerConcurrency[configStore.currentProvider] = Math.max(1, Math.min(20, Number(value) || 1));
    }
});

const handleSaveProfile = () => {
    const result = configStore.saveProfile(profileName.value);
    if (!result.ok) {
        uiStore.showToast(result.message, 'warning');
        return;
    }
    profileName.value = '';
    uiStore.showToast(`配置集已保存: ${result.profile.name}`, 'success');
};

const handleLoadProfile = (profileId) => {
    const ok = configStore.loadProfile(profileId);
    if (ok) {
        uiStore.showToast('配置集已加载', 'success');
    }
};

const handleDeleteProfile = async (profileId) => {
    const confirmed = await uiStore.showConfirmation('确定删除这个配置集吗？');
    if (!confirmed) return;
    configStore.deleteProfile(profileId);
    uiStore.showToast('配置集已删除', 'success');
};
</script>

<style scoped>
    /* 设置部分 */
    .settings-section {
        margin-bottom: 24px;
    }

    .settings-section:last-child {
        margin-bottom: 8px;
    }

    /* 设置标题 */
    .settings-title {
        font-size: 1rem;
        font-weight: 600;
        font-family: var(--font-serif);
        color: var(--text-primary);
        margin-bottom: 16px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border-color-light);
    }

    /* 区域列表 */
    .region-list {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        list-style: none;
    }

    .region-list li {
        font-family: var(--font-sans);
        font-size: 0.9rem;
        padding: 10px 14px;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        text-align: center;
        cursor: pointer;
        transition: all 0.2s ease;
        background-color: var(--bg-surface);
    }

    .region-list li:hover {
        border-color: var(--accent-primary);
        color: var(--accent-primary);
    }

    .region-list li.selected {
        border-color: var(--accent-primary);
        background-color: var(--bg-selected);
        color: var(--accent-primary);
        font-weight: 600;
    }

    /* 高级设置网格布局 */
    .advanced-settings-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        padding: 0 8px;
    }

    .prompt-item {
        grid-column: 1 / -1;
    }

    .config-item {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    /* 带有提示的标签 */
    .label-with-hint {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .config-item label {
        font-size: 0.9rem;
        margin-bottom: 0;
        font-weight: 500;
        color: var(--text-secondary);
    }

    .config-hint {
        font-size: 0.8rem;
        color: var(--text-tertiary);
    }

    .config-item input {
        height: 40px;
    }

    /* 媒体查询：小屏幕设备 */
    @media (max-width: 768px) {
        .advanced-settings-grid {
            grid-template-columns: 1fr;
        }
    }

    @media (max-width: 480px) {
        .region-list {
            grid-template-columns: 1fr;
        }
    }
    .range-input-wrapper {
        display: flex;
        align-items: center;
        height: 40px;
    }

    .range-slider {
        width: 100%;
        cursor: pointer;
        padding: 0;
        margin: 0;
    }

    .profile-create {
        display: flex;
        gap: 8px;
        margin-bottom: 10px;
    }

    .profile-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .profile-item {
        border: 1px solid var(--border-color-light);
        border-radius: var(--radius-sm);
        padding: 8px 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
    }

    .profile-name {
        font-size: 13px;
        color: var(--text-primary);
        word-break: break-all;
    }

    .profile-actions {
        display: flex;
        gap: 6px;
    }

    .profile-btn {
        border: 1px solid var(--border-color);
        background: var(--bg-surface);
        color: var(--text-primary);
        border-radius: var(--radius-sm);
        height: 30px;
        padding: 0 10px;
        cursor: pointer;
    }

    .profile-btn.danger {
        color: var(--accent-error);
    }
</style>
