// Owns KuGou CDN transport rules without involving its account or API request layer.
export const resolveKugouMediaUrl = (
    url: string,
    options: { preserveHttp?: boolean; useVercelRelay?: boolean; origin?: string } = {},
): string | undefined => {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return undefined;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)
        || !parsed.hostname.startsWith('fs.') || !parsed.hostname.endsWith('.kugou.com')) return undefined;
    // This host's HTTPS certificate fails hostname validation. Handle old cached HTTPS URLs too.
    if (!options.preserveHttp && options.useVercelRelay && parsed.host === 'fs.youthandroid2.kugou.com'
        && !parsed.username && !parsed.password) {
        const path = `/api/kugou-audio?url=${encodeURIComponent(url)}`;
        return options.origin ? new URL(path, options.origin).href : path;
    }
    return parsed.protocol === 'http:' && !options.preserveHttp ? url.replace(/^http:/, 'https:') : url;
};
