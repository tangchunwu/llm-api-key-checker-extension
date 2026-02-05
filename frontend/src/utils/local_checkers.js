/**
 * @description 浏览器环境下的 API Key 检测逻辑。
 * 直接复用原后端逻辑，但移除了 secureProxiedFetch 的代理部分，改为直接 fetch。
 */

import { normalizeBaseUrl } from './url.js';
import providersData from '../../../config/providers.json';

// --- 辅助函数：浏览器环境下的 Fetch 封装 ---
async function directFetch(url, options) {
        try {
                const response = await fetch(url, options);
                return response;
        } catch (error) {
                throw new Error(`Network Error: ${error.message}`);
        }
}

// --- 余额检测逻辑 (Balance Checkers) ---
const BALANCE_UNAVAILABLE = { balance: -1, message: "有效但无法获取余额" };

const balanceCheckers = {
        async checkOpenRouterBalance(token, baseUrl) {
                const creditsUrl = normalizeBaseUrl(baseUrl).replace("/v1", "") + "/v1/credits";
                const creditsResponse = await directFetch(creditsUrl, { method: "GET", headers: { Authorization: "Bearer " + token } });
                if (creditsResponse.ok) {
                        const d = await creditsResponse.json();
                        const total = d.data?.total_credits || 0;
                        const usage = d.data?.total_usage || 0;
                        return {
                                balance: parseFloat((total - usage).toFixed(4)),
                                totalBalance: total,
                                usedBalance: usage,
                                rawBalanceResponse: d,
                        };
                }
                return BALANCE_UNAVAILABLE;
        },
        async checkSiliconFlowBalance(token, baseUrl) {
                const resp = await directFetch(normalizeBaseUrl(baseUrl).replace("/v1", "") + "/v1/user/info", { method: "GET", headers: { Authorization: "Bearer " + token } });
                if (resp.ok) {
                        const d = await resp.json();
                        const bal = parseFloat(d.data?.balance);
                        return {
                                balance: isNaN(bal) ? -1 : parseFloat(bal.toFixed(4)),
                                rawBalanceResponse: d,
                        };
                }
                return BALANCE_UNAVAILABLE;
        },
        async checkDeepSeekBalance(token, baseUrl) {
                const resp = await directFetch(
                        normalizeBaseUrl(baseUrl).replace("/v1", "") + "/user/balance",
                        { method: "GET", headers: { Authorization: "Bearer " + token, Accept: "application/json" } }
                );
                if (resp.ok) {
                        const d = await resp.json();
                        const info = d.balance_infos?.find((b) => b.currency === "USD") || d.balance_infos?.find((b) => b.currency === "CNY") || d.balance_infos?.[0];
                        if (info) {
                                return {
                                        balance: parseFloat(info.total_balance),
                                        currency: info.currency,
                                        grantedBalance: parseFloat(info.granted_balance || 0),
                                        toppedUpBalance: parseFloat(info.topped_up_balance || 0),
                                        rawBalanceResponse: d,
                                };
                        }
                }
                return BALANCE_UNAVAILABLE;
        },
        async checkMoonshotBalance(token, baseUrl) {
                const balanceResponse = await directFetch(normalizeBaseUrl(baseUrl) + "/users/me/balance", { method: "GET", headers: { Authorization: "Bearer " + token } });
                if (balanceResponse.ok) {
                        const data = await balanceResponse.json();
                        return {
                                balance: parseFloat(data.data?.available_balance) || -1,
                                rawBalanceResponse: data,
                        };
                }
                return BALANCE_UNAVAILABLE;
        },
        async checkNewAPIBalance(token, baseUrl) {
                const creditsUrl = normalizeBaseUrl(baseUrl).replace("/v1", "") + "/api/usage/token";
                const response = await directFetch(
                        creditsUrl,
                        { method: "GET", headers: { Authorization: "Bearer " + token } }
                );
                if (response.ok) {
                        const d = await response.json();
                        if (d.code === true && d.data) {
                                const tokenToUsdRate = 500000;
                                const availableUsd = parseFloat((d.data.total_available / tokenToUsdRate).toFixed(2));
                                const grantedUsd = parseFloat((d.data.total_granted / tokenToUsdRate).toFixed(2));
                                return {
                                        balance: availableUsd,
                                        totalGranted: grantedUsd,
                                        expiresAt: d.data.expires_at,
                                        currency: 'USD',
                                        rawBalanceResponse: d,
                                };
                        }
                }
                return BALANCE_UNAVAILABLE;
        },
};

// --- 错误处理 ---
async function handleApiError(response) {
        let rawText = '';
        try {
                rawText = await response.text();
        } catch (e) {
                rawText = response.statusText;
        }

        let rawErrorContent;
        try {
                rawErrorContent = JSON.parse(rawText);
        } catch (e) {
                rawErrorContent = rawText;
        }

        let message;
        let errorCategory = 'unknown';

        const reason = rawErrorContent?.error?.details?.[0]?.reason;
        const code = rawErrorContent?.error?.code;
        const errorType = rawErrorContent?.error?.type;
        const errorMessage = rawErrorContent?.error?.message;
        const topLevelMessage = rawErrorContent?.message;
        const detail = rawErrorContent?.detail;
        const lowerCaseContent = JSON.stringify(rawErrorContent).toLowerCase();

        if (response.status === 401 || code === 'invalid_api_key' || errorType === 'invalid_api_key') {
                message = "API Key 无效或格式错误";
                errorCategory = 'invalid_key';
        } else if (errorType === 'access_terminated' || lowerCaseContent.includes('terminated') || lowerCaseContent.includes('banned')) {
                message = "账户已被封禁或停用";
                errorCategory = 'account_banned';
        } else if (response.status === 402 || code === 'insufficient_quota' || errorType === 'insufficient_quota') {
                message = "额度不足";
                errorCategory = 'no_quota';
        } else if (response.status === 429) {
                message = "请求频繁 (Rate Limit)";
                errorCategory = 'rate_limit';
        } else if (response.status === 403 || lowerCaseContent.includes('permission') || lowerCaseContent.includes('forbidden')) {
                message = "访问被拒绝 (权限不足)";
                errorCategory = 'permission_denied';
        } else if (code === 'model_not_found' || lowerCaseContent.includes('model') && lowerCaseContent.includes('not found')) {
                message = "模型不存在或不可用";
                errorCategory = 'model_not_found';
        } else if (errorMessage) {
                message = String(errorMessage);
        } else {
                message = `HTTP ${response.status}`;
        }

        return {
                message,
                errorCategory,
                rawError: {
                        status: response.status,
                        content: rawErrorContent,
                },
        };
}

// --- 请求策略 ---
const apiStrategies = {
        openai: {
                buildRequest: (token, providerConfig) => {
                        const { baseUrl, model, validationPrompt, validationMaxTokens } = providerConfig;
                        const apiUrl = normalizeBaseUrl(baseUrl) + "/chat/completions";
                        const headers = { "Content-Type": "application/json", Authorization: "Bearer " + token };
                        const body = {
                                model,
                                messages: [{ role: "user", content: validationPrompt || "Hi" }],
                                max_tokens: validationMaxTokens || 1,
                                stream: false
                        };
                        return { url: apiUrl, options: { method: "POST", headers, body: JSON.stringify(body) } };
                }
        },
        openai_responses: {
                buildRequest: (token, providerConfig) => {
                        const { baseUrl, model, validationPrompt, validationMaxOutputTokens } = providerConfig;
                        const apiUrl = normalizeBaseUrl(baseUrl) + "/responses";
                        const headers = { "Content-Type": "application/json", Authorization: "Bearer " + token };
                        const body = {
                                model,
                                input: validationPrompt || "Hi",
                                max_output_tokens: validationMaxOutputTokens || 16,
                                stream: false
                        };
                        return { url: apiUrl, options: { method: "POST", headers, body: JSON.stringify(body) } };
                }
        },
        anthropic: {
                buildRequest: (token, providerConfig) => {
                        const { baseUrl, model, validationPrompt, validationMaxTokens } = providerConfig;
                        const apiUrl = normalizeBaseUrl(baseUrl) + "/messages";
                        const headers = {
                                "x-api-key": token,
                                "anthropic-version": "2023-06-01",
                                "Content-Type": "application/json",
                                "anthropic-dangerous-direct-browser-access": "true"
                        };
                        const body = {
                                model,
                                max_tokens: validationMaxTokens || 1,
                                messages: [{ role: "user", content: validationPrompt || "Hi" }],
                                stream: false,
                        };
                        return { url: apiUrl, options: { method: "POST", headers, body: JSON.stringify(body) } };
                }
        },
        gemini: {
                buildRequest: (token, providerConfig) => {
                        const { baseUrl, model, validationPrompt, validationMaxOutputTokens } = providerConfig;
                        const apiUrl = `${normalizeBaseUrl(baseUrl)}/v1beta/models/${model}:generateContent`;
                        const headers = { "Content-Type": "application/json", "x-goog-api-key": token };
                        const body = {
                                contents: [{ parts: [{ text: validationPrompt || "Hi" }] }],
                                generationConfig: { maxOutputTokens: validationMaxOutputTokens || 16 }
                        };
                        return { url: apiUrl, options: { method: "POST", headers, body: JSON.stringify(body) } };
                }
        },
        tavily: {
                buildRequest: (token, providerConfig) => {
                        const { baseUrl } = providerConfig;
                        const apiUrl = normalizeBaseUrl(baseUrl) + "/search";
                        const headers = { "Content-Type": "application/json" };
                        const body = {
                                api_key: token,
                                query: "test",
                                search_depth: "basic",
                                max_results: 1
                        };
                        return { url: apiUrl, options: { method: "POST", headers, body: JSON.stringify(body) } };
                }
        }
};

// --- 通用检测模板 ---
async function _checkTokenTemplate(token, providerMeta, providerConfig, strategy) {
        try {
                const { url, options } = strategy.buildRequest(token, providerConfig);
                const response = await directFetch(url, options);

                if (response.ok) {
                        let result = { token, isValid: true };
                        result.rawResponse = await response.json().catch(() => ({ note: "Failed to parse JSON response." }));

                        if (providerMeta.balanceCheck && balanceCheckers[providerMeta.balanceCheck]) {
                                const balanceResult = await balanceCheckers[providerMeta.balanceCheck](token, providerConfig.baseUrl);
                                Object.assign(result, balanceResult);
                        }
                        return result;
                }

                const error = await handleApiError(response);
                return { token, isValid: false, message: error.message, rawError: error.rawError, error: true };

        } catch (error) {
                return { token, isValid: false, message: error.message || "网络错误", error: true };
        }
}

export async function checkToken(token, providerMeta, providerConfig) {
        let strategy = apiStrategies[providerMeta.apiStyle] || apiStrategies.openai;
        return await _checkTokenTemplate(token, providerMeta, providerConfig, strategy);
}

export function categorizeTokenError(res) {
        if (res.isValid) return { category: 'valid' };
        if (res.errorCategory && res.errorCategory !== 'unknown') return { category: res.errorCategory };
        return { category: 'invalid' };
}
