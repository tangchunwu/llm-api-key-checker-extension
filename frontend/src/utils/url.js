export function normalizeBaseUrl(url) {
        if (!url) return "";
        let normalized = url.trim();
        if (normalized.endsWith("/")) {
                normalized = normalized.slice(0, -1);
        }
        return normalized;
}
