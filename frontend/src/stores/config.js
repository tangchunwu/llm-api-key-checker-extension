import { defineStore } from 'pinia';
import { ref, reactive, watch } from 'vue';
import { PROVIDERS, REGIONS } from '@/api';
import { useUiStore } from './ui';
import storage from '@/utils/storage';

const CONFIG_STORAGE_KEY = 'checker-config-v2';
const DEFAULT_MAX_CONCURRENCY = 20;

/**
 * @description config Store 用于管理应用程序的全局配置，包括提供商、区域、输入 Key 等。
 */
export const useConfigStore = defineStore('config', () => {
    // --- 状态 (State) ---
    /** @type {object} 所有支持的 API 提供商数据。*/
    const providers = PROVIDERS;
    /** @type {object} 所有支持的检测区域数据。*/
    const regions = REGIONS;
    /** @type {Ref<string>} 当前选中的 API 提供商 Key。*/
    const currentProvider = ref('openai');
    /** @type {Ref<string>} 当前选中的检测区域 Key。*/
    const currentRegion = ref('wnam');
    /** @type {object} 各个提供商的详细配置，如 baseUrl, model, enableStream。*/
    const providerConfigs = reactive({});
    /** @type {Ref<string>} 用户在输入框中输入的 API Keys 文本。*/
    const tokensInput = ref('');
    /** @type {Ref<number>} 余额低于此值时被标记为“低额”。*/
    const threshold = ref(1);
    /** @type {Ref<number>} 并发检测请求的数量。*/
    const concurrency = ref(10);
    /** @type {Ref<number>} 全局并发上限。*/
    const globalConcurrency = ref(10);
    /** @type {object} 当前提供商并发上限。*/
    const providerConcurrency = reactive({});
    /** @type {Ref<string>} 用于 API 请求验证的提示词内容。*/
    const validationPrompt = ref('You just need to reply Hi.');
    /** @type {Ref<number>} 用于 API 请求验证的 max_tokens (例如 /v1/chat/completions)。*/
    const validationMaxTokens = ref(1);
    /** @type {Ref<number>} 用于 API 请求验证的 max_output_tokens (例如 /v1/responses)。*/
    const validationMaxOutputTokens = ref(16);
    /** @type {Ref<string>} 模型包含关键词（逗号分隔）。*/
    const modelIncludeKeywords = ref('');
    /** @type {Ref<string>} 模型排除关键词（逗号分隔）。*/
    const modelExcludeKeywords = ref('');
    /** @type {Ref<Array<object>>} 配置集列表。*/
    const profiles = ref([]);
    const isReady = ref(false);

    // --- 动作 (Actions) ---
    /**
     * @description 初始化 providerConfigs，为每个提供商设置默认配置。
     */
    function initializeProviderConfigs() {
        for (const key in providers) {
            providerConfigs[key] = {
                baseUrl: providers[key].defaultBase,
                model: providers[key].defaultModel,
                enableStream: false,
            };
            providerConcurrency[key] = Math.min(5, DEFAULT_MAX_CONCURRENCY);
        }
    }

    /**
     * @description 选择当前 API 提供商。
     * @param {string} key - 提供商的唯一标识 Key。
     */
    function selectProvider(key) {
        currentProvider.value = key;
        const uiStore = useUiStore();
        uiStore.providerDropdownOpen = false;
        // 清除结果的逻辑现在由 checker store 处理
    }

    /**
     * @description 选择当前检测区域。
     * @param {string} key - 区域的唯一标识 Key。
     */
    function selectRegion(key) {
        currentRegion.value = key;
        const uiStore = useUiStore();
        uiStore.showToast(`检测区域已切换至: ${regions[key]}`, "info");
    }

    /**
     * @description 清空输入框中的所有 API Keys。
     */
    function clearTokens() {
        tokensInput.value = '';
        const uiStore = useUiStore();
        uiStore.showToast("输入内容已清除", "info", 2000);
    }

    function getEffectiveConcurrency(providerKey = currentProvider.value) {
        const providerLimit = Number(providerConcurrency[providerKey]) || 1;
        const globalLimit = Number(globalConcurrency.value) || 1;
        return Math.max(1, Math.min(providerLimit, globalLimit, DEFAULT_MAX_CONCURRENCY));
    }

    function toSnapshot() {
        return {
            currentProvider: currentProvider.value,
            currentRegion: currentRegion.value,
            providerConfigs: JSON.parse(JSON.stringify(providerConfigs)),
            providerConcurrency: JSON.parse(JSON.stringify(providerConcurrency)),
            tokensInput: tokensInput.value,
            threshold: threshold.value,
            concurrency: concurrency.value,
            globalConcurrency: globalConcurrency.value,
            validationPrompt: validationPrompt.value,
            validationMaxTokens: validationMaxTokens.value,
            validationMaxOutputTokens: validationMaxOutputTokens.value,
            modelIncludeKeywords: modelIncludeKeywords.value,
            modelExcludeKeywords: modelExcludeKeywords.value
        };
    }

    function applySnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return;
        if (snapshot.currentProvider && providers[snapshot.currentProvider]) {
            currentProvider.value = snapshot.currentProvider;
        }
        if (snapshot.currentRegion && regions[snapshot.currentRegion]) {
            currentRegion.value = snapshot.currentRegion;
        }

        const incomingProviderConfigs = snapshot.providerConfigs || {};
        for (const key in providers) {
            const incoming = incomingProviderConfigs[key] || {};
            providerConfigs[key] = {
                baseUrl: incoming.baseUrl || providers[key].defaultBase,
                model: incoming.model || providers[key].defaultModel,
                enableStream: !!incoming.enableStream,
            };
        }

        const incomingProviderConcurrency = snapshot.providerConcurrency || {};
        for (const key in providers) {
            providerConcurrency[key] = Math.max(
                1,
                Math.min(DEFAULT_MAX_CONCURRENCY, Number(incomingProviderConcurrency[key]) || providerConcurrency[key] || 5)
            );
        }

        tokensInput.value = typeof snapshot.tokensInput === 'string' ? snapshot.tokensInput : '';
        threshold.value = Number(snapshot.threshold) >= 0 ? Number(snapshot.threshold) : 1;
        concurrency.value = Math.max(1, Math.min(DEFAULT_MAX_CONCURRENCY, Number(snapshot.concurrency) || 10));
        globalConcurrency.value = Math.max(1, Math.min(DEFAULT_MAX_CONCURRENCY, Number(snapshot.globalConcurrency) || concurrency.value));
        validationPrompt.value = typeof snapshot.validationPrompt === 'string' ? snapshot.validationPrompt : validationPrompt.value;
        validationMaxTokens.value = Math.max(1, Number(snapshot.validationMaxTokens) || 1);
        validationMaxOutputTokens.value = Math.max(1, Number(snapshot.validationMaxOutputTokens) || 16);
        modelIncludeKeywords.value = typeof snapshot.modelIncludeKeywords === 'string' ? snapshot.modelIncludeKeywords : '';
        modelExcludeKeywords.value = typeof snapshot.modelExcludeKeywords === 'string' ? snapshot.modelExcludeKeywords : '';
    }

    async function saveConfig() {
        if (!isReady.value) return;
        await storage.set({
            [CONFIG_STORAGE_KEY]: {
                ...toSnapshot(),
                profiles: profiles.value
            }
        });
    }

    async function loadConfig() {
        try {
            const data = await storage.get(CONFIG_STORAGE_KEY);
            const stored = data[CONFIG_STORAGE_KEY];
            if (stored && typeof stored === 'object') {
                applySnapshot(stored);
                if (Array.isArray(stored.profiles) && stored.profiles.length > 0) {
                    profiles.value = stored.profiles;
                }
            }
        } catch (e) {
            console.error('Failed to load checker config:', e);
        } finally {
            isReady.value = true;
        }
    }

    function saveProfile(profileName) {
        const name = String(profileName || '').trim();
        if (!name) return { ok: false, message: '配置集名称不能为空' };
        const profile = {
            id: String(Date.now()),
            name,
            createdAt: Date.now(),
            snapshot: toSnapshot()
        };
        profiles.value = [profile, ...profiles.value].slice(0, 30);
        return { ok: true, profile };
    }

    function loadProfile(profileId) {
        const profile = profiles.value.find((p) => p.id === profileId);
        if (!profile || !profile.snapshot) return false;
        applySnapshot(profile.snapshot);
        return true;
    }

    function deleteProfile(profileId) {
        profiles.value = profiles.value.filter((p) => p.id !== profileId);
    }

    // 初始化提供商配置
    initializeProviderConfigs();
    loadConfig();

    watch(
        [
            currentProvider,
            currentRegion,
            tokensInput,
            threshold,
            concurrency,
            globalConcurrency,
            validationPrompt,
            validationMaxTokens,
            validationMaxOutputTokens,
            modelIncludeKeywords,
            modelExcludeKeywords,
            profiles,
        ],
        () => {
            saveConfig();
        },
        { deep: true }
    );

    watch(
        [() => providerConfigs, () => providerConcurrency],
        () => {
            saveConfig();
        },
        { deep: true }
    );

    return {
        providers,
        regions,
        currentProvider,
        currentRegion,
        providerConfigs,
        tokensInput,
        threshold,
        concurrency,
        globalConcurrency,
        providerConcurrency,
        validationPrompt,
        validationMaxTokens,
        validationMaxOutputTokens,
        modelIncludeKeywords,
        modelExcludeKeywords,
        profiles,
        isReady,
        initializeProviderConfigs,
        selectProvider,
        selectRegion,
        clearTokens,
        getEffectiveConcurrency,
        saveProfile,
        loadProfile,
        deleteProfile
    };
});
