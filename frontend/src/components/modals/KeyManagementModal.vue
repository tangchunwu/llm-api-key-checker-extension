<script setup>
import { computed, ref, watch } from 'vue';
import { useUiStore } from '@/stores/ui';
import { useConfigStore } from '@/stores/config';
import { useHistoryStore } from '@/stores/history';

const uiStore = useUiStore();
const configStore = useConfigStore();
const historyStore = useHistoryStore();

const activeSection = ref('keys');
const selectedProvider = ref('all');
const searchTerm = ref('');
const keySortOrder = ref('desc');
const selectedKeyRowIds = ref(new Set());
const importMode = ref('overwrite');
const importPreview = ref({
    fileName: '',
    records: [],
    validRows: 0,
    error: ''
});
const importFileInput = ref(null);

const sectionMeta = {
    basic: { title: '基本设置', desc: '查看当前检测配置（只读）' },
    models: { title: '模型列表', desc: '查看可用模型并一键复制' },
    keys: { title: '密钥管理', desc: '管理可用记录中的模型、URL、Key' },
    importExport: { title: '导入/导出', desc: '导出或导入识别记录' },
    about: { title: '关于', desc: '页面使用说明' }
};
const safeHistory = computed(() => Array.isArray(historyStore.history) ? historyStore.history : []);

const providerOptions = computed(() => {
    const entries = Object.entries(configStore.providers || {}).map(([key, value]) => ({
        key,
        name: value?.name || key
    }));
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return entries;
});

const currentProviderName = computed(() => {
    return configStore.providers?.[configStore.currentProvider]?.name || configStore.currentProvider;
});

const currentProviderConfig = computed(() => {
    return configStore.providerConfigs?.[configStore.currentProvider] || {};
});

const filteredRecords = computed(() => {
    const keyword = searchTerm.value.trim().toLowerCase();
    return safeHistory.value.filter((record) => {
        const providerMatched = selectedProvider.value === 'all' || record.provider === selectedProvider.value;
        if (!providerMatched) return false;

        if (!keyword) return true;

        const modelText = (record.availableModels || []).join(' ').toLowerCase();
        const keysText = (record.validKeys || []).join(' ').toLowerCase();
        const haystack = `${record.providerName || ''} ${record.modelUrl || ''} ${modelText} ${keysText}`.toLowerCase();
        return haystack.includes(keyword);
    });
});

const keyRows = computed(() => {
    const list = [];
    for (const record of filteredRecords.value) {
        const validKeys = Array.isArray(record.validKeys) ? record.validKeys.filter(Boolean) : [];
        const models = Array.isArray(record.availableModels) ? record.availableModels.filter(Boolean) : [];
        const modelText = models.length > 0 ? models.join(', ') : '-';

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
    list.sort((a, b) => keySortOrder.value === 'desc'
        ? (b.timestamp || 0) - (a.timestamp || 0)
        : (a.timestamp || 0) - (b.timestamp || 0)
    );
    return list;
});

const selectedKeyRows = computed(() => keyRows.value.filter((row) => selectedKeyRowIds.value.has(row.id)));
const allVisibleRowsSelected = computed(() => keyRows.value.length > 0 && selectedKeyRows.value.length === keyRows.value.length);
const hasSelectedRows = computed(() => selectedKeyRows.value.length > 0);

const modelRows = computed(() => {
    const map = new Map();

    for (const record of filteredRecords.value) {
        const validKeys = Array.isArray(record.validKeys) ? record.validKeys.filter(Boolean) : [];
        if (validKeys.length === 0) continue;

        const providerName = record.providerName || record.provider || '-';
        const modelUrl = record.modelUrl || '-';
        const models = Array.isArray(record.availableModels) ? record.availableModels.filter(Boolean) : [];

        for (const model of models) {
            const id = `${providerName}__${model}__${modelUrl}`;
            const item = map.get(id) || {
                id,
                providerName,
                model,
                modelUrl,
                latestTimestamp: 0,
                count: 0
            };
            item.count += 1;
            item.latestTimestamp = Math.max(item.latestTimestamp, record.timestamp || 0);
            map.set(id, item);
        }
    }

    return Array.from(map.values()).sort((a, b) => b.latestTimestamp - a.latestTimestamp);
});

const pageTitle = computed(() => sectionMeta[activeSection.value]?.title || '密钥管理');
const pageDesc = computed(() => sectionMeta[activeSection.value]?.desc || '');

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

const copyBatchField = async (field, successPrefix) => {
    if (!hasSelectedRows.value) {
        uiStore.showToast('请先勾选记录', 'warning');
        return;
    }
    const values = [...new Set(selectedKeyRows.value.map((row) => row[field]).filter((v) => v && v !== '-'))];
    if (values.length === 0) {
        uiStore.showToast('选中项没有可复制内容', 'warning');
        return;
    }
    await copyText(values.join('\n'), `${successPrefix}已复制 (${values.length} 条)`);
};

const copySelectedKeys = async () => {
    await copyBatchField('key', 'Key ');
};

const copySelectedUrls = async () => {
    await copyBatchField('modelUrl', 'URL ');
};

const copySelectedModels = async () => {
    await copyBatchField('modelText', '模型 ');
};

const deleteRecord = (recordId) => {
    historyStore.deleteRecord(recordId);
};

const deleteSelectedRows = async () => {
    if (!hasSelectedRows.value) {
        uiStore.showToast('请先勾选记录', 'warning');
        return;
    }
    const confirmed = await uiStore.showConfirmation(`确定删除已选记录吗？共 ${selectedKeyRows.value.length} 行。`);
    if (!confirmed) return;

    const recordIds = [...new Set(selectedKeyRows.value.map((row) => row.recordId))];
    recordIds.forEach((id) => historyStore.deleteRecord(id));
    clearSelection();
    uiStore.showToast(`已删除 ${recordIds.length} 条记录`, 'success');
};

const refreshList = () => {
    uiStore.showToast('列表已刷新', 'success', 1200);
};

const close = () => {
    uiStore.closeModal();
};

const clearAll = async () => {
    const confirmed = await uiStore.showConfirmation('确定要清空全部识别记录吗？此操作不可恢复。');
    if (!confirmed) return;
    const text = window.prompt('请输入 CLEAR 以确认清空全部记录');
    if (text !== 'CLEAR') {
        uiStore.showToast('已取消清空（输入不匹配）', 'info');
        return;
    }
    historyStore.clearHistory();
    uiStore.showToast('记录已清空', 'success');
};

const setSection = (section) => {
    activeSection.value = section;
    selectedKeyRowIds.value = new Set();
};

const toggleSelectRow = (rowId, checked) => {
    const next = new Set(selectedKeyRowIds.value);
    if (checked) next.add(rowId);
    else next.delete(rowId);
    selectedKeyRowIds.value = next;
};

const toggleSelectAllVisible = (checked) => {
    if (!checked) {
        selectedKeyRowIds.value = new Set();
        return;
    }
    selectedKeyRowIds.value = new Set(keyRows.value.map((row) => row.id));
};

const clearSelection = () => {
    selectedKeyRowIds.value = new Set();
};

const exportHistory = () => {
    if (safeHistory.value.length === 0) {
        uiStore.showToast('没有记录可导出', 'warning');
        return;
    }

    const content = JSON.stringify(safeHistory.value, null, 2);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    link.href = url;
    link.download = `llm-checker-history-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    uiStore.showToast('记录已导出', 'success');
};

const openImportDialog = () => {
    if (importFileInput.value) {
        importFileInput.value.value = '';
        importFileInput.value.click();
    }
};

const normalizeImportedRecord = (item, index) => {
    const timestamp = Number(item?.timestamp) || Date.now();
    const validKeys = Array.isArray(item?.validKeys) ? item.validKeys.filter(Boolean) : [];
    const availableModels = Array.isArray(item?.availableModels) ? item.availableModels.filter(Boolean) : [];

    return {
        id: Number(item?.id) || (Date.now() + index),
        timestamp,
        provider: item?.provider || 'unknown',
        providerName: item?.providerName || item?.provider || '未知提供商',
        tokensInput: item?.tokensInput || '',
        stats: item?.stats || {
            valid: validKeys.length,
            lowBalance: 0,
            zeroBalance: 0,
            noQuota: 0,
            rateLimit: 0,
            invalid: 0,
            duplicate: 0
        },
        validKeys,
        availableModels,
        modelUrl: item?.modelUrl || ''
    };
};

const importHistory = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        const raw = await file.text();
        const parsed = JSON.parse(raw);

        if (!Array.isArray(parsed)) {
            importPreview.value = {
                fileName: file.name,
                records: [],
                validRows: 0,
                error: '导入失败：JSON 必须是数组'
            };
            return;
        }

        const normalized = parsed.map((item, idx) => normalizeImportedRecord(item, idx));
        const validRows = normalized.reduce((acc, item) => acc + (item.validKeys?.length || 0), 0);
        importPreview.value = {
            fileName: file.name,
            records: normalized,
            validRows,
            error: ''
        };
    } catch {
        importPreview.value = {
            fileName: file?.name || '',
            records: [],
            validRows: 0,
            error: '导入失败：文件格式不正确'
        };
    }
};

const ensureUniqueIds = (existing, incoming) => {
    const used = new Set(existing.map((item) => item.id));
    return incoming.map((item, idx) => {
        let nextId = item.id;
        if (used.has(nextId)) {
            nextId = Date.now() + idx;
        }
        used.add(nextId);
        return { ...item, id: nextId };
    });
};

const applyImport = () => {
    if (!importPreview.value.records.length) {
        uiStore.showToast('没有可导入的数据', 'warning');
        return;
    }

    const mode = importMode.value;
    const current = safeHistory.value;
    let target = importPreview.value.records;

    if (mode === 'merge') {
        const mergedIncoming = ensureUniqueIds(current, importPreview.value.records);
        target = [...mergedIncoming, ...current];
    }

    if (typeof historyStore.replaceHistory === 'function') {
        historyStore.replaceHistory(target);
    } else {
        historyStore.history = target;
    }

    uiStore.showToast(`导入成功（${mode === 'merge' ? '合并' : '覆盖'}）`, 'success');
    importPreview.value = { fileName: '', records: [], validRows: 0, error: '' };
};

const goToChecker = () => {
    uiStore.closeModal();
};

watch(keyRows, (rows) => {
    const validIds = new Set(rows.map((row) => row.id));
    const next = new Set([...selectedKeyRowIds.value].filter((id) => validIds.has(id)));
    if (next.size !== selectedKeyRowIds.value.size) {
        selectedKeyRowIds.value = next;
    }
});
</script>

<template>
    <div class="modal-content key-management-modal">
        <div class="km-sidebar">
            <h3>设置选项</h3>
            <button class="menu-item" :class="{ active: activeSection === 'basic' }" @click="setSection('basic')">基本设置</button>
            <button class="menu-item" :class="{ active: activeSection === 'models' }" @click="setSection('models')">模型列表</button>
            <button class="menu-item" :class="{ active: activeSection === 'keys' }" @click="setSection('keys')">密钥管理</button>
            <button class="menu-item" :class="{ active: activeSection === 'importExport' }" @click="setSection('importExport')">导入/导出</button>
            <button class="menu-item" :class="{ active: activeSection === 'about' }" @click="setSection('about')">关于</button>
        </div>

        <div class="km-main">
            <div class="km-header">
                <div>
                    <h2>{{ pageTitle }}</h2>
                    <p>{{ pageDesc }}</p>
                </div>
                <div class="header-actions">
                    <button class="btn" @click="close">关闭</button>
                    <button class="btn" @click="refreshList">刷新列表</button>
                </div>
            </div>

            <div class="filters" v-if="activeSection === 'keys' || activeSection === 'models'">
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

            <div class="content-wrap" v-if="activeSection === 'basic'">
                <div class="card-grid">
                    <div class="card">
                        <h4>当前提供商</h4>
                        <p>{{ currentProviderName }}</p>
                    </div>
                    <div class="card">
                        <h4>模型 URL</h4>
                        <p>{{ currentProviderConfig.baseUrl || '-' }}</p>
                        <button class="btn-text" @click="copyModelUrl(currentProviderConfig.baseUrl || '-')">复制 URL</button>
                    </div>
                    <div class="card">
                        <h4>测试模型</h4>
                        <p>{{ currentProviderConfig.model || '-' }}</p>
                        <button class="btn-text" @click="copyModel(currentProviderConfig.model || '-')">复制模型</button>
                    </div>
                    <div class="card">
                        <h4>并发 / 阈值</h4>
                        <p>{{ configStore.concurrency }} / {{ configStore.threshold }}</p>
                    </div>
                </div>
            </div>

            <div class="content-wrap" v-else-if="activeSection === 'models'">
                <div class="table-wrap">
                    <table v-if="modelRows.length > 0" class="km-table">
                        <thead>
                            <tr>
                                <th>账号</th>
                                <th>模型</th>
                                <th>模型 URL</th>
                                <th>出现次数</th>
                                <th>最近时间</th>
                                <th class="op-col">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in modelRows" :key="row.id">
                                <td>{{ row.providerName }}</td>
                                <td :title="row.model">{{ row.model }}</td>
                                <td :title="row.modelUrl">{{ row.modelUrl }}</td>
                                <td>{{ row.count }}</td>
                                <td>{{ formatTime(row.latestTimestamp) }}</td>
                                <td class="op-col">
                                    <div class="row-actions">
                                        <button class="btn-text" @click="copyModel(row.model)">复制模型</button>
                                        <button class="btn-text" @click="copyModelUrl(row.modelUrl)">复制 URL</button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <div v-else class="empty-state">
                        <p>暂无可用模型记录</p>
                        <span>请先检测出可用 Key 后再查看。</span>
                    </div>
                </div>
            </div>

            <div class="content-wrap" v-else-if="activeSection === 'keys'">
                <div class="keys-toolbar" v-if="keyRows.length > 0">
                    <label class="check-all">
                        <input type="checkbox" :checked="allVisibleRowsSelected" @change="toggleSelectAllVisible($event.target.checked)" />
                        <span>全选当前结果</span>
                    </label>
                    <div class="sort-group">
                        <label for="sortOrder">时间排序</label>
                        <select id="sortOrder" v-model="keySortOrder">
                            <option value="desc">最新优先</option>
                            <option value="asc">最早优先</option>
                        </select>
                    </div>
                    <div class="batch-actions">
                        <button class="btn-text" :disabled="!hasSelectedRows" @click="copySelectedUrls">批量复制 URL</button>
                        <button class="btn-text" :disabled="!hasSelectedRows" @click="copySelectedKeys">批量复制 Key</button>
                        <button class="btn-text" :disabled="!hasSelectedRows" @click="copySelectedModels">批量复制模型</button>
                        <button class="btn-text danger" :disabled="!hasSelectedRows" @click="deleteSelectedRows">批量删除</button>
                        <button class="btn-text danger" :disabled="!hasSelectedRows" @click="clearSelection">清空勾选</button>
                        <span class="selected-count">已选: {{ selectedKeyRows.length }}</span>
                    </div>
                </div>
                <div class="table-wrap">
                    <table v-if="keyRows.length > 0" class="km-table">
                        <thead>
                            <tr>
                                <th class="check-col">选择</th>
                                <th>账号</th>
                                <th>可用模型</th>
                                <th>模型 URL</th>
                                <th>Key</th>
                                <th>时间</th>
                                <th class="op-col">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in keyRows" :key="row.id">
                                <td class="check-col">
                                    <input
                                        type="checkbox"
                                        :checked="selectedKeyRowIds.has(row.id)"
                                        @change="toggleSelectRow(row.id, $event.target.checked)"
                                    />
                                </td>
                                <td>{{ row.providerName }}</td>
                                <td :title="row.modelText">{{ row.modelText }}</td>
                                <td :title="row.modelUrl">{{ row.modelUrl }}</td>
                                <td :title="row.key">{{ row.key }}</td>
                                <td>{{ formatTime(row.timestamp) }}</td>
                                <td class="op-col">
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
                        <button class="btn" @click="goToChecker">返回检测页</button>
                    </div>
                </div>
            </div>

            <div class="content-wrap" v-else-if="activeSection === 'importExport'">
                <div class="ie-panel">
                    <div class="ie-card">
                        <h4>导出记录</h4>
                        <p>将当前识别历史导出为 JSON 文件。</p>
                        <button class="btn" @click="exportHistory">导出 JSON</button>
                    </div>
                    <div class="ie-card">
                        <h4>导入记录</h4>
                        <p>先选择文件预览，再决定覆盖或合并导入。</p>
                        <button class="btn" @click="openImportDialog">导入 JSON</button>
                        <input ref="importFileInput" type="file" accept="application/json" class="hidden-input" @change="importHistory" />
                        <div class="import-preview" v-if="importPreview.fileName">
                            <p><strong>文件:</strong> {{ importPreview.fileName }}</p>
                            <p v-if="importPreview.error" class="import-error">{{ importPreview.error }}</p>
                            <template v-else>
                                <p>记录数: {{ importPreview.records.length }}，可用 Key 行: {{ importPreview.validRows }}</p>
                                <div class="import-modes">
                                    <label><input type="radio" value="overwrite" v-model="importMode" /> 覆盖当前记录</label>
                                    <label><input type="radio" value="merge" v-model="importMode" /> 合并到当前记录</label>
                                </div>
                                <button class="btn" @click="applyImport">应用导入</button>
                            </template>
                        </div>
                    </div>
                </div>
            </div>

            <div class="content-wrap" v-else>
                <div class="about-panel">
                    <h4>功能说明</h4>
                    <p>1. 只有检测结果中的可用 Key 会进入“密钥管理”。</p>
                    <p>2. 你可以在“密钥管理”里直接复制 URL、Key、可用模型。</p>
                    <p>3. “模型列表”展示历史中出现过的可用模型并支持复制。</p>
                    <p>4. “导入/导出”用于迁移历史记录数据。</p>
                </div>
            </div>

            <div class="km-footer">
                <button class="btn danger" :disabled="safeHistory.length === 0" @click="clearAll">清空全部记录</button>
                <span>总记录: {{ safeHistory.length }}</span>
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
    font-size: 40px;
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
    cursor: pointer;
    transition: background-color 0.2s ease;
}

.menu-item:hover {
    background: var(--bg-tertiary);
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
    font-size: 52px;
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

.btn {
    border: 1px solid var(--border-color);
    background: var(--bg-surface);
    color: var(--text-primary);
    border-radius: var(--radius-sm);
    padding: 8px 12px;
    cursor: pointer;
    font-weight: 600;
}

.btn:hover {
    background: var(--bg-tertiary);
}

.btn.danger {
    color: var(--accent-error);
}

.btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

.content-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0 24px 16px;
}

.table-wrap {
    height: 100%;
    overflow: auto;
}

.keys-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0 10px;
    flex-wrap: wrap;
}

.check-all {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--text-secondary);
    font-size: 13px;
}

.sort-group {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--text-secondary);
    font-size: 13px;
}

.sort-group select {
    height: 34px;
    min-width: 120px;
}

.batch-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.selected-count {
    color: var(--text-secondary);
    font-size: 13px;
    margin-left: 4px;
}

.km-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 13px;
    min-width: 1200px;
}

.check-col {
    width: 56px;
    text-align: center;
}

.op-col {
    width: 320px;
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

.km-table td.op-col,
.km-table th.op-col {
    overflow: visible;
    text-overflow: clip;
    white-space: nowrap;
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
    flex-wrap: nowrap;
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

.btn-text:disabled {
    opacity: 0.45;
    cursor: not-allowed;
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

.card-grid {
    padding-top: 16px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}

.card {
    border: 1px solid var(--border-color-light);
    border-radius: var(--radius-md);
    padding: 14px;
    background: var(--bg-surface);
}

.card h4 {
    margin: 0 0 8px;
}

.card p {
    margin: 0 0 12px;
    color: var(--text-secondary);
    word-break: break-all;
}

.ie-panel {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    padding-top: 16px;
}

.ie-card {
    border: 1px solid var(--border-color-light);
    border-radius: var(--radius-md);
    padding: 14px;
}

.ie-card h4 {
    margin: 0 0 8px;
}

.ie-card p {
    margin: 0 0 12px;
    color: var(--text-secondary);
}

.import-preview {
    margin-top: 10px;
    border-top: 1px solid var(--border-color-light);
    padding-top: 10px;
}

.import-preview p {
    margin: 0 0 8px;
    font-size: 13px;
}

.import-error {
    color: var(--accent-error);
}

.import-modes {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 8px 0 12px;
    color: var(--text-secondary);
    font-size: 13px;
}

.hidden-input {
    display: none;
}

.about-panel {
    padding-top: 16px;
    color: var(--text-secondary);
}

.about-panel h4 {
    color: var(--text-primary);
    margin-bottom: 10px;
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

    .filters,
    .ie-panel,
    .card-grid {
        grid-template-columns: 1fr;
    }

    .keys-toolbar {
        align-items: flex-start;
    }

    .km-header h2 {
        font-size: 32px;
    }

    .km-sidebar h3 {
        font-size: 28px;
    }
}
</style>
