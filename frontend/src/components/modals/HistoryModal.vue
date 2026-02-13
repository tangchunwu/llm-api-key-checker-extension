<script setup>
import { computed } from 'vue';
import { useUiStore } from '@/stores/ui';
import { useConfigStore } from '@/stores/config';
import { useHistoryStore } from '@/stores/history';

const uiStore = useUiStore();
const configStore = useConfigStore();
const historyStore = useHistoryStore();

const isOpen = computed(() => uiStore.activeModal === 'history');

// 格式化时间
const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

// 加载历史配置
const loadConfig = (record) => {
    configStore.tokensInput = record.tokensInput;
    if (record.provider) {
        configStore.currentProvider = record.provider;
    }
    if (record.provider && configStore.providerConfigs[record.provider]) {
        if (record.modelUrl) {
            configStore.providerConfigs[record.provider].baseUrl = record.modelUrl;
        }
        if (record.availableModels && record.availableModels.length > 0) {
            configStore.providerConfigs[record.provider].model = record.availableModels[0];
        }
    }
    uiStore.closeModal();
    uiStore.showToast(`已加载 ${record.providerName} 的历史配置`, 'success');
};

const copyText = async (text, successMessage) => {
    if (!text) {
        uiStore.showToast('没有可复制的内容', 'warning');
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
        uiStore.showToast(successMessage, 'success');
    } catch (err) {
        uiStore.showToast('复制失败', 'error');
    }
};

const copyModelUrl = async (modelUrl) => {
    await copyText(modelUrl, '模型 URL 已复制');
};

// 复制有效 Key
const copyValidKeys = async (validKeys) => {
    if (!validKeys || validKeys.length === 0) {
        uiStore.showToast('没有有效的 Key 可复制', 'warning');
        return;
    }
    await copyText(validKeys.join('\n'), `已复制 ${validKeys.length} 个有效 Key`);
};

const deleteRecord = (id) => {
    historyStore.deleteRecord(id);
};

const clearHistory = async () => {
    const confirmed = await uiStore.showConfirmation('确定要清空所有历史记录吗？此操作无法撤销。');
    if (confirmed) {
        historyStore.clearHistory();
        uiStore.showToast('历史记录已清空', 'success');
    }
};

const close = () => {
    uiStore.closeModal();
};
</script>

<template>
    <div v-if="isOpen" class="modal-overlay" @click.self="close">
        <div class="modal-content history-modal">
            <div class="modal-header">
                <h3>检测历史记录</h3>
                <button class="close-btn" @click="close">×</button>
            </div>
            
            <div class="modal-body">
                <div v-if="historyStore.history.length === 0" class="empty-state">
                    暂无历史记录
                </div>
                
                <div v-else class="history-list">
                    <div v-for="item in historyStore.history" :key="item.id" class="history-item">
                        <div class="item-header">
                            <span class="provider-badge">{{ item.providerName }}</span>
                            <span class="time">{{ formatTime(item.timestamp) }}</span>
                        </div>
                        
                        <div class="stats-row">
                            <span class="stat valid" title="有效">
                                <span class="dot"></span> 有效: {{ item.stats.valid + item.stats.lowBalance }}
                            </span>
                            <span class="divider">|</span>
                            <span class="stat invalid" title="无效/其他">
                                <span class="dot red"></span> 无效: {{ item.stats.invalid + item.stats.noQuota + item.stats.zeroBalance + item.stats.rateLimit + item.stats.duplicate }}
                            </span>
                        </div>

                        <div class="meta-row">
                            <span class="meta-label">可用模型:</span>
                            <span class="meta-value">{{ (item.availableModels && item.availableModels.length > 0) ? item.availableModels.join(', ') : '-' }}</span>
                        </div>

                        <div class="meta-row">
                            <span class="meta-label">模型 URL:</span>
                            <span class="meta-value">{{ item.modelUrl || '-' }}</span>
                            <button
                                class="btn-text"
                                :disabled="!item.modelUrl"
                                @click="copyModelUrl(item.modelUrl)"
                            >
                                <span class="icon">📋</span> 复制 URL
                            </button>
                        </div>
                        
                        <div class="actions">
                            <button class="btn-text primary" @click="loadConfig(item)">
                                <span class="icon">↺</span> 重新加载
                            </button>
                            <button 
                                class="btn-text" 
                                :disabled="!item.validKeys || item.validKeys.length === 0"
                                @click="copyValidKeys(item.validKeys)"
                            >
                                <span class="icon">📋</span> 复制有效 ({{ item.validKeys ? item.validKeys.length : 0 }})
                            </button>
                            <button class="btn-text danger" @click="deleteRecord(item.id)">
                                <span class="icon">🗑️</span> 删除
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal-footer">
                <button class="btn danger-outline" @click="clearHistory" :disabled="historyStore.history.length === 0">
                    清空历史
                </button>
                <button class="btn secondary" @click="close">关闭</button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.history-modal {
    max-width: 550px;
    width: 95%;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
}

.modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    background: var(--bg-paper); /* Should match app background */
}

.empty-state {
    text-align: center;
    padding: 40px;
    color: var(--text-tertiary);
    font-size: 0.95rem;
}

.history-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.history-item {
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 16px;
    transition: all 0.2s ease;
    box-shadow: var(--shadow-subtle);
}

.history-item:hover {
    border-color: var(--border-color-focus);
    box-shadow: var(--shadow-soft);
    transform: translateY(-1px);
}

.item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.provider-badge {
    background: var(--bg-tertiary);
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    border: 1px solid transparent; /* Align with design system */
}

.time {
    font-size: 13px;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
}

.stats-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    font-size: 14px;
    padding: 8px 12px;
    background: var(--bg-input);
    border-radius: var(--radius-sm);
}

.meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    font-size: 13px;
}

.meta-label {
    color: var(--text-tertiary);
    min-width: 64px;
}

.meta-value {
    color: var(--text-primary);
    flex: 1;
    word-break: break-all;
    font-family: var(--font-mono);
}

.divider {
    color: var(--border-color);
    font-size: 12px;
}

.stat {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-secondary);
    font-weight: 500;
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent-success);
}

.dot.red {
    background: var(--accent-error);
}

.actions {
    display: flex;
    gap: 8px;
    border-top: 1px solid var(--border-color-light);
    padding-top: 12px;
    justify-content: flex-end;
    align-items: center;
    flex-wrap: wrap; /* Allow wrap on very small screens */
}

.btn-text {
    background: transparent;
    border: 1px solid transparent;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-secondary);
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
    white-space: nowrap; /* Prevent text wrapping */
    font-weight: 500;
}

.btn-text .icon {
    font-size: 1.1em;
    line-height: 1;
}

.btn-text:hover:not(:disabled) {
    background: var(--bg-tertiary);
    color: var(--text-primary);
}

.btn-text.primary {
    color: var(--accent-primary);
    background: rgba(217, 119, 87, 0.08); /* Transparent primary */
}

.btn-text.primary:hover {
    background: rgba(217, 119, 87, 0.15);
    color: var(--accent-primary-hover);
}

.btn-text.danger {
    color: var(--accent-error);
}

.btn-text.danger:hover {
    background: rgba(211, 47, 47, 0.08);
    color: var(--accent-error-hover);
}

.btn-text:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: transparent;
    color: var(--text-tertiary);
}

.modal-footer {
    padding: 16px 20px;
    border-top: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
}
</style>
