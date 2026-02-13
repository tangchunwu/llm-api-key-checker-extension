<script setup>
import { computed, ref } from 'vue';
import { useUiStore } from '@/stores/ui';
import { useConfigStore } from '@/stores/config';
import { useHistoryStore } from '@/stores/history';

const uiStore = useUiStore();
const configStore = useConfigStore();
const historyStore = useHistoryStore();

const selectedProvider = ref('all');
const searchTerm = ref('');

const providerOptions = computed(() => {
    const entries = Object.entries(configStore.providers || {}).map(([key, value]) => ({
        key,
        name: value?.name || key
    }));
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return entries;
});

const filteredRecords = computed(() => {
    const keyword = searchTerm.value.trim().toLowerCase();
    return (historyStore.history || []).filter((record) => {
        const providerMatched = selectedProvider.value === 'all' || record.provider === selectedProvider.value;
        if (!providerMatched) return false;

        if (!keyword) return true;

        const modelText = (record.availableModels || []).join(' ').toLowerCase();
        const keysText = (record.validKeys || []).join(' ').toLowerCase();
        const haystack = `${record.providerName || ''} ${record.modelUrl || ''} ${modelText} ${keysText}`.toLowerCase();
        return haystack.includes(keyword);
    });
});

const rows = computed(() => {
    const list = [];
    for (const record of filteredRecords.value) {
        const validKeys = (record.validKeys && record.validKeys.length > 0) ? record.validKeys : [];
        const modelText = (record.availableModels && record.availableModels.length > 0)
            ? record.availableModels.join(', ')
            : '-';

        // 仅展示“可用状态”的记录（有有效 Key）
        if (validKeys.length === 0) continue;

        for (const key of validKeys) {
            list.push({
                id: `${record.id}-${key}`,
                recordId: record.id,
                providerName: record.providerName || record.provider || '-',
                modelText,
                modelUrl: record.modelUrl || '-',
                key,
                timestamp: record.timestamp
            });
        }
    }
    return list;
});

const formatTime = (timestamp) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const copyText = async (text, successText) => {
    if (!text || text === '-') {
        uiStore.showToast('没有可复制的内容', 'warning');
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
        uiStore.showToast(successText, 'success');
    } catch {
        uiStore.showToast('复制失败', 'error');
    }
};

const copyKey = async (key) => {
    await copyText(key, 'Key 已复制');
};

const copyModelUrl = async (url) => {
    await copyText(url, '模型 URL 已复制');
};

const copyModel = async (modelText) => {
    await copyText(modelText, '可用模型已复制');
};

const deleteRecord = (recordId) => {
    historyStore.deleteRecord(recordId);
};

const refreshList = () => {
    uiStore.showToast('列表已刷新', 'success', 1500);
};

const close = () => {
    uiStore.closeModal();
};

const clearAll = async () => {
    const confirmed = await uiStore.showConfirmation('确定要清空全部识别记录吗？');
    if (!confirmed) return;
    historyStore.clearHistory();
    uiStore.showToast('记录已清空', 'success');
};
</script>

<template>
    <div class="modal-content key-management-modal">
        <div class="km-sidebar">
            <h3>设置选项</h3>
            <button class="menu-item">基本设置</button>
            <button class="menu-item">模型列表</button>
            <button class="menu-item active">密钥管理</button>
            <button class="menu-item">导入/导出</button>
            <button class="menu-item">关于</button>
        </div>

        <div class="km-main">
            <div class="km-header">
                <div>
                    <h2>密钥管理</h2>
                    <p>管理识别记录中的可用模型、模型 URL 和有效 Key</p>
                </div>
                <div class="header-actions">
                    <button class="btn secondary" @click="refreshList">刷新列表</button>
                    <button class="btn secondary" @click="close">关闭</button>
                </div>
            </div>

            <div class="filters">
                <div class="filter-item">
                    <label for="providerFilter">选择账号</label>
                    <select id="providerFilter" v-model="selectedProvider">
                        <option value="all">全部账号</option>
                        <option v-for="item in providerOptions" :key="item.key" :value="item.key">
                            {{ item.name }}
                        </option>
                    </select>
                </div>
                <div class="filter-item">
                    <label for="searchInput">搜索记录</label>
                    <input id="searchInput" v-model="searchTerm" type="search" placeholder="搜索 Key / URL / 模型..." />
                </div>
            </div>

            <div class="table-wrap">
                <table v-if="rows.length > 0" class="km-table">
                    <thead>
                        <tr>
                            <th>账号</th>
                            <th>可用模型</th>
                            <th>模型 URL</th>
                            <th>Key</th>
                            <th>时间</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in rows" :key="row.id">
                            <td>{{ row.providerName }}</td>
                            <td :title="row.modelText">{{ row.modelText }}</td>
                            <td :title="row.modelUrl">{{ row.modelUrl }}</td>
                            <td :title="row.key">{{ row.key }}</td>
                            <td>{{ formatTime(row.timestamp) }}</td>
                            <td>
                                <div class="row-actions">
                                    <button class="btn-text" @click="copyModelUrl(row.modelUrl)">复制 URL</button>
                                    <button class="btn-text" @click="copyKey(row.key)">复制 Key</button>
                                    <button class="btn-text" @click="copyModel(row.modelText)">复制模型</button>
                                    <button class="btn-text danger" @click="deleteRecord(row.recordId)">删除记录</button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div v-else class="empty-state">
                    <p>暂无可用记录</p>
                    <span>请先检测出可用 Key 后再管理。</span>
                </div>
            </div>

            <div class="km-footer">
                <button class="btn danger-outline" :disabled="historyStore.history.length === 0" @click="clearAll">
                    清空全部记录
                </button>
                <span>总记录: {{ historyStore.history.length }}</span>
            </div>
        </div>
    </div>
</template>

<style scoped>
.key-management-modal {
    width: min(1400px, 96vw);
    max-width: none;
    height: min(86vh, 900px);
    padding: 0;
    display: grid;
    grid-template-columns: 280px 1fr;
    overflow: hidden;
}

.km-sidebar {
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-color-light);
    padding: 22px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.km-sidebar h3 {
    margin: 0 0 10px;
    font-size: 28px;
    color: var(--text-primary);
    font-family: var(--font-serif);
}

.menu-item {
    border: none;
    background: transparent;
    text-align: left;
    padding: 12px 14px;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-weight: 600;
    cursor: default;
}

.menu-item.active {
    background: var(--bg-selected);
    color: var(--accent-primary);
}

.km-main {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.km-header {
    padding: 22px 24px 12px;
    border-bottom: 1px solid var(--border-color-light);
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
}

.km-header h2 {
    margin: 0 0 6px;
    font-size: 36px;
    font-family: var(--font-serif);
}

.km-header p {
    margin: 0;
    color: var(--text-secondary);
}

.header-actions {
    display: flex;
    gap: 10px;
}

.filters {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 14px;
    padding: 16px 24px;
}

.filter-item label {
    margin-bottom: 8px;
}

select {
    width: 100%;
    height: 48px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    background: var(--bg-surface);
    color: var(--text-primary);
    padding: 0 12px;
}

.table-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0 24px 16px;
}

.km-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 13px;
}

.km-table th,
.km-table td {
    border-bottom: 1px solid var(--border-color-light);
    text-align: left;
    padding: 10px 8px;
    vertical-align: middle;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    font-family: var(--font-mono);
}

.km-table th {
    background: var(--bg-secondary);
    font-family: var(--font-sans);
    color: var(--text-secondary);
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 1;
}

.row-actions {
    display: flex;
    gap: 6px;
}

.btn-text {
    border: 1px solid var(--border-color);
    background: var(--bg-surface);
    color: var(--text-primary);
    padding: 5px 8px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    white-space: nowrap;
}

.btn-text:hover {
    background: var(--bg-tertiary);
}

.btn-text.danger {
    color: var(--accent-error);
}

.empty-state {
    height: 100%;
    min-height: 220px;
    border: 1px dashed var(--border-color);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 6px;
    color: var(--text-secondary);
}

.km-footer {
    border-top: 1px solid var(--border-color-light);
    padding: 12px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--text-secondary);
}

@media (max-width: 1024px) {
    .key-management-modal {
        grid-template-columns: 1fr;
        height: 92vh;
    }

    .km-sidebar {
        display: none;
    }

    .filters {
        grid-template-columns: 1fr;
    }
}
</style>
