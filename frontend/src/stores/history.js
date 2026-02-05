import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import storage from '../utils/storage';

const HISTORY_STORAGE_KEY = 'api-check-history';
const MAX_HISTORY_ITEMS = 50;

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
                        if (stored) {
                                // 如果是 extension 环境，storage.local 返回的已经是对象了，不需要 parse
                                // 但 storage.js 对 web 做了 JSON.parse 封装。
                                // 这里的 data[key] 已经是 correct type.
                                history.value = stored;
                        }
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
                        await storage.set({ [HISTORY_STORAGE_KEY]: newVal });
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
                // 添加到头部
                history.value.unshift(record);

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
                history.value = history.value.filter(item => item.id !== id);
        }

        /**
         * @description 清空所有历史记录
         */
        function clearHistory() {
                history.value = [];
        }

        return {
                history,
                isReady,
                addRecord,
                deleteRecord,
                clearHistory
        };
});
