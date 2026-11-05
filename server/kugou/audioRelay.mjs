// Streams the fixed media CDN through the deployment's HTTPS origin without buffering a song.
const CDN_HOST = 'fs.youthandroid2.kugou.com';
const RESPONSE_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];
const securityHeaders = () => new Headers({
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': 'sandbox',
    'X-Content-Type-Options': 'nosniff',
});
const failure = (message, status) => new Response(message, { status, headers: securityHeaders() });

export default async function relayAudio(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        const response = failure('Method not allowed', 405);
        response.headers.set('Allow', 'GET, HEAD');
        return response;
    }
    const raw = new URL(request.url).searchParams.get('url');
    if (!raw) return failure('Missing audio URL', 400);
    let target;
    try {
        target = new URL(raw);
    } catch {
        return failure('Invalid audio URL', 400);
    }
    if (!['http:', 'https:'].includes(target.protocol) || target.host !== CDN_HOST
        || target.username || target.password) return failure('Audio host not allowed', 403);
    target.protocol = 'http:';
    target.hash = '';
    // Page cookies and authorization never reach the HTTP CDN.
    const headers = new Headers({ 'Accept-Encoding': 'identity' });
    for (const name of ['range', 'if-range']) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
    }
    try {
        const upstream = await fetch(target, {
            method: request.method, headers, redirect: 'manual', signal: request.signal,
        });
        if (upstream.status >= 300 && upstream.status < 400) {
            await upstream.body?.cancel();
            return failure('Audio upstream redirected', 502);
        }
        if (!upstream.ok) {
            await upstream.body?.cancel();
            const response = failure('Audio upstream rejected the request', upstream.status);
            const range = upstream.headers.get('content-range');
            if (range) response.headers.set('Content-Range', range);
            return response;
        }
        const type = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!type.startsWith('audio/') && type !== 'application/octet-stream' && type !== 'binary/octet-stream') {
            await upstream.body?.cancel();
            return failure('Audio upstream returned non-audio content', 502);
        }
        const responseHeaders = securityHeaders();
        for (const name of RESPONSE_HEADERS) {
            const value = upstream.headers.get(name);
            if (value) responseHeaders.set(name, value);
        }
        // Fetch can decompress a response despite identity; do not retain an obsolete byte count.
        if (upstream.headers.get('content-encoding') && upstream.headers.get('content-encoding') !== 'identity') {
            responseHeaders.delete('content-length');
        }
        const noBody = request.method === 'HEAD' || upstream.status === 204 || upstream.status === 205;
        if (noBody) await upstream.body?.cancel();
        return new Response(noBody ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch {
        // Signed paths contain account/device identifiers: omit the URL and fetch error from responses/logs.
        return failure('Audio upstream unavailable', 502);
    }
}
