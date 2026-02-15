import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useConfigStore } from './config';
import { useResultsStore } from './results';
import { useHistoryStore } from './history';
import { checkToken, categorizeTokenError } from '../utils/local_checkers';
import { MAX_KEYS_LIMIT } from '@/constants';
import { normalizeBaseUrl } from '@/utils/url';
import pLimit from 'p-limit'; // 需要 npm install p-limit

export const useCheckerStore = defineStore('checker', () => {
    const configStore = useConfigStore();
    const resultsStore = useResultsStore();

    // --- State ---
    const isChecking = ref(false);
    const isPaused = ref(false);
    const completedCount = ref(0);
    const totalTasks = ref(0);
    const lastStatusMessage = ref(null);

    // 控制暂停/停止的标志位
    let abortController = null;

    const progress = computed(() => {
        if (totalTasks.value === 0) return 0;
        return Math.round((completedCount.value / totalTasks.value) * 100);
    });

    function _postStatus(text, type = 'info', duration = 3000) {
        lastStatusMessage.value = { text, type, duration, id: Date.now() };
    }

    async function startCheck() {
        if (configStore.tokensInput.trim() === '') {
            _postStatus("请输入至少一个 API KEY", "warning");
            return;
        }

        resultsStore.clearResults();
        completedCount.value = 0;
        const tokensRaw = configStore.tokensInput.trim().split(/[,;\n\r]+/).map(t => t.trim()).filter(Boolean);

        if (tokensRaw.length > MAX_KEYS_LIMIT) {
            _postStatus(`Key 数量超过限制`, "error");
            return;
        }

        // 去重
        const uniqueTokens = new Set();
        const keysToProcess = [];
        const duplicateResults = [];
        tokensRaw.forEach((token, index) => {
            if (uniqueTokens.has(token)) {
                duplicateResults.push({ res: { token, finalCategory: 'duplicate' }, order: index });
            } else {
                uniqueTokens.add(token);
                keysToProcess.push({ token, order: index });
            }
        });

        if (duplicateResults.length > 0) resultsStore.addResults(duplicateResults);

        if (keysToProcess.length === 0) {
            _postStatus("没有需要检测的 KEY", "info");
            return;
        }

        isChecking.value = true;
        isPaused.value = false;
        totalTasks.value = keysToProcess.length;
        abortController = new AbortController(); // 用于停止任务

        const currentProviderKey = configStore.currentProvider;
        const limit = pLimit(configStore.getEffectiveConcurrency(currentProviderKey));
        const providerConfig = configStore.providerConfigs[currentProviderKey];
        const providerMeta = configStore.providers[currentProviderKey];
        const fullConfig = {
            ...providerConfig,
            provider: currentProviderKey,
            validationPrompt: configStore.validationPrompt,
            validationMaxTokens: configStore.validationMaxTokens,
            validationMaxOutputTokens: configStore.validationMaxOutputTokens,
        };

        _postStatus(`开始检测 ${keysToProcess.length} 个 Key...`, "info");

        // 并发执行任务
        const tasks = keysToProcess.map(item => {
            return limit(async () => {
                // 检查是否停止
                if (!isChecking.value) return;

                // 简单的暂停实现：只要是暂停状态就死循环等待
                while (isPaused.value && isChecking.value) {
                    await new Promise(r => setTimeout(r, 500));
                }

                if (!isChecking.value) return;

                try {
                    const res = await checkToken(item.token, providerMeta, fullConfig);
                    const { category } = categorizeTokenError(res);
                    res.finalCategory = category;

                    if (res.isValid && providerMeta.hasBalance) {
                        if (res.balance === 0) res.finalCategory = 'zeroBalance';
                        else if (res.balance < configStore.threshold) res.finalCategory = 'lowBalance';
                        else res.finalCategory = 'valid';
                    } else if (res.isValid && !providerMeta.hasBalance) {
                        res.finalCategory = 'valid';
                    }

                    resultsStore.addResults([{ res, order: item.order }]);
                    completedCount.value++;
                } catch (e) {
                    console.error(e);
                }
            });
        });

        try {
            await Promise.all(tasks);
            if (isChecking.value) {
                finishCheck();
            }
        } catch (e) {
            console.error("Batch error", e);
        }
    }

    function stopCheck() {
        isChecking.value = false;
        isPaused.value = false;
        if (abortController) abortController.abort();
        _postStatus("检测已停止", "info");
    }

    function pauseCheck() {
        if (isChecking.value) {
            isPaused.value = true;
            _postStatus("检测已暂停", "info");
        }
    }

    function resumeCheck() {
        if (isChecking.value && isPaused.value) {
            isPaused.value = false;
            _postStatus("检测已恢复", "info");
        }
    }

    function finishCheck() {
        isChecking.value = false;

        // 保存历史记录
        try {
            const historyStore = useHistoryStore();
            const validResults = resultsStore.results.valid || [];
            const validKeys = validResults.map(item => item.token);
            const currentProvider = configStore.currentProvider;
            const providerName = configStore.providers[currentProvider]?.name || currentProvider;
            const providerConfig = configStore.providerConfigs[currentProvider] || {};
            const currentModel = providerConfig.model || '';
            const modelUrl = normalizeBaseUrl(providerConfig.baseUrl || '');

            // 统计各状态数量
            const stats = {};
            const categories = ['valid', 'lowBalance', 'zeroBalance', 'noQuota', 'rateLimit', 'invalid', 'duplicate'];
            categories.forEach(cat => {
                stats[cat] = (resultsStore.results[cat] || []).length;
            });

            historyStore.addRecord({
                id: Date.now(),
                timestamp: Date.now(),
                provider: currentProvider,
                providerName,
                tokensInput: configStore.tokensInput,
                stats,
                validKeys,
                availableModels: currentModel ? [currentModel] : [],
                modelUrl
            });
        } catch (e) {
            console.error("Failed to save history record:", e);
        }

        _postStatus("检测完成！", "success", 5000);
    }

    // 占位函数，保持接口兼容
    function initSession() { }

    return {
        initSession,
        isChecking,
        isPaused,
        completedCount,
        totalTasks,
        progress,
        lastStatusMessage,
        startCheck,
        stopCheck,
        pauseCheck,
        resumeCheck
    };
});
