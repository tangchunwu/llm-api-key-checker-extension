import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import storage from '../utils/storage';

const HISTORY_STORAGE_KEY = 'api-check-history';
const MAX_HISTORY_ITEMS = 50;

function toArray(value) {
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') {
                if (Array.isArray(value.history)) return value.history;
                if (Array.isArray(value.records)) return value.records;
        }
        return [];
}

function normalizeRecord(record, index = 0) {
        const now = Date.now();
        const validKeys = Array.isArray(record?.validKeys) ? record.validKeys.filter(Boolean) : [];
        const availableModels = Array.isArray(record?.availableModels) ? record.availableModels.filter(Boolean) : [];
        const stats = (record?.stats && typeof record.stats === 'object') ? record.stats : {};

        return {
                id: Number(record?.id) || (now + index),
                timestamp: Number(record?.timestamp) || now,
                provider: record?.provider || 'unknown',
                providerName: record?.providerName || record?.provider || '未知提供商',
                tokensInput: typeof record?.tokensInput === 'string' ? record.tokensInput : '',
                stats: {
                        valid: Number(stats.valid) || validKeys.length,
                        lowBalance: Number(stats.lowBalance) || 0,
                        zeroBalance: Number(stats.zeroBalance) || 0,
                        noQuota: Number(stats.noQuota) || 0,
                        rateLimit: Number(stats.rateLimit) || 0,
                        invalid: Number(stats.invalid) || 0,
                        duplicate: Number(stats.duplicate) || 0
                },
                validKeys,
                availableModels,
                modelUrl: typeof record?.modelUrl === 'string' ? record.modelUrl : ''
        };
}

function normalizeHistory(value) {
        const list = toArray(value);
        return list.map((item, idx) => normalizeRecord(item, idx)).slice(0, MAX_HISTORY_ITEMS);
}

export const useHistoryStore = defineStore('history', () => {
        // --- State ---
        const history = ref([]);
        const isReady = ref(false);

        // --- Init ---
        // 异步加载历史记录
        async function init() {
                try {
                        const data = await storage.get(HISTORY_STORAGE_KEY);
                        const stored = data[HISTORY_STORAGE_KEY];
                        history.value = normalizeHistory(stored);
                } catch (e) {
                        console.error("Failed to load history:", e);
                        history.value = [];
                } finally {
                        isReady.value = true;
                }
        }

        // 调用初始化
        init();

        // --- Persistence ---
        // 监听 history 变化并保存
        watch(history, async (newVal) => {
                // 确保只在加载完成后保存，避免覆盖为空
                if (!isReady.value) return;

                try {
                        await storage.set({ [HISTORY_STORAGE_KEY]: normalizeHistory(newVal) });
                } catch (e) {
                        console.error("Failed to save history:", e);
                }
        }, { deep: true });

        // --- Actions ---

        /**
         * @description 添加一条新的历史记录
         * @param {object} record - 历史记录对象
         */
        function addRecord(record) {
                if (!Array.isArray(history.value)) {
                        history.value = normalizeHistory(history.value);
                }
                // 添加到头部
                history.value.unshift(normalizeRecord(record));

                // 限制数量
                if (history.value.length > MAX_HISTORY_ITEMS) {
                        history.value = history.value.slice(0, MAX_HISTORY_ITEMS);
                }
        }

        /**
         * @description 删除指定 ID 的记录
         * @param {number} id - 记录 ID (通常是时间戳)
         */
        function deleteRecord(id) {
                history.value = normalizeHistory(history.value).filter(item => item.id !== id);
        }

        /**
         * @description 清空所有历史记录
         */
        function clearHistory() {
                history.value = [];
        }

        function replaceHistory(list) {
                history.value = normalizeHistory(list);
        }

        return {
                history,
                isReady,
                addRecord,
                deleteRecord,
                clearHistory,
                replaceHistory
        };
});
