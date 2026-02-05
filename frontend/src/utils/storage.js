/**
 * @description 统一存储封装，兼容 Chrome Extension (chrome.storage.local) 和 Web (localStorage)。
 * 所有方法均返回 Promise。
 */

const isExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

console.log(`[Storage] Environment: ${isExtension ? 'Extension' : 'Web'}`);

export default {
        /**
         * @description 获取存储的数据
         * @param {string|string[]|null} keys - 要获取的键名。如果为 null，获取所有。
         * @returns {Promise<object>} - 返回包含键值对的对象。
         */
        get(keys) {
                return new Promise((resolve, reject) => {
                        if (isExtension) {
                                chrome.storage.local.get(keys, (items) => {
                                        if (chrome.runtime.lastError) {
                                                return reject(chrome.runtime.lastError);
                                        }
                                        resolve(items);
                                });
                        } else {
                                try {
                                        let result = {};
                                        if (keys === null) {
                                                // All
                                                for (let i = 0; i < localStorage.length; i++) {
                                                        const k = localStorage.key(i);
                                                        try {
                                                                result[k] = JSON.parse(localStorage.getItem(k));
                                                        } catch (e) {
                                                                result[k] = localStorage.getItem(k);
                                                        }
                                                }
                                        } else if (typeof keys === 'string') {
                                                const val = localStorage.getItem(keys);
                                                try {
                                                        result[keys] = val ? JSON.parse(val) : undefined;
                                                } catch (e) {
                                                        result[keys] = val;
                                                }
                                        } else if (Array.isArray(keys)) {
                                                keys.forEach(k => {
                                                        const val = localStorage.getItem(k);
                                                        try {
                                                                result[k] = val ? JSON.parse(val) : undefined;
                                                        } catch (e) {
                                                                result[k] = val;
                                                        }
                                                });
                                        }
                                        resolve(result);
                                } catch (e) {
                                        reject(e);
                                }
                        }
                });
        },

        /**
         * @description 设置数据
         * @param {object} items - 要保存的键值对对象。
         * @returns {Promise<void>}
         */
        set(items) {
                return new Promise((resolve, reject) => {
                        if (isExtension) {
                                chrome.storage.local.set(items, () => {
                                        if (chrome.runtime.lastError) {
                                                return reject(chrome.runtime.lastError);
                                        }
                                        resolve();
                                });
                        } else {
                                try {
                                        for (const [key, value] of Object.entries(items)) {
                                                localStorage.setItem(key, JSON.stringify(value));
                                        }
                                        resolve();
                                } catch (e) {
                                        reject(e);
                                }
                        }
                });
        },

        /**
         * @description 移除数据
         * @param {string|string[]} keys - 要移除的键名。
         * @returns {Promise<void>}
         */
        remove(keys) {
                return new Promise((resolve, reject) => {
                        if (isExtension) {
                                chrome.storage.local.remove(keys, () => {
                                        if (chrome.runtime.lastError) {
                                                return reject(chrome.runtime.lastError);
                                        }
                                        resolve();
                                });
                        } else {
                                try {
                                        const keyList = Array.isArray(keys) ? keys : [keys];
                                        keyList.forEach(k => localStorage.removeItem(k));
                                        resolve();
                                } catch (e) {
                                        reject(e);
                                }
                        }
                });
        }
};
