import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, { config } from '../../../api-ts/kugou-audio';

// Checks the browser-facing audio relay's stream, range and fixed-host boundary.
const AUDIO = 'https://fs.youthandroid2.kugou.com/signed/song.mp3?key=a%2Fb';
const request = (url = AUDIO, init?: RequestInit) => new Request(
    `https://folia.example/api/kugou-audio?url=${encodeURIComponent(url)}`, init,
);

afterEach(() => vi.unstubAllGlobals());

describe('Vercel KuGou audio relay', () => {
    it('streams partial audio with range headers and never forwards browser credentials', async () => {
        const bytes = new Uint8Array([0x49, 0x44, 0x33]);
        const body = new ReadableStream({ start(controller) { controller.enqueue(bytes); } });
        const fetchMock = vi.fn().mockResolvedValue(new Response(body, {
            status: 206,
            headers: { 'Content-Type': 'application/octet-stream', 'Content-Range': 'bytes 0-2/10000000',
                'Content-Length': '3', 'Accept-Ranges': 'bytes', 'Set-Cookie': 'upstream=secret' },
        }));
        vi.stubGlobal('fetch', fetchMock);
        const response = await handler(request(AUDIO, {
            headers: { Range: 'bytes=0-2', 'If-Range': 'version-1', Cookie: 'session=secret', Authorization: 'Bearer secret' },
        }));
        expect(config.runtime).toBe('edge');
        expect(response.status).toBe(206);
        expect(response.headers.get('content-range')).toBe('bytes 0-2/10000000');
        expect(response.headers.get('accept-ranges')).toBe('bytes');
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.get('content-security-policy')).toBe('sandbox');
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(response.headers.has('set-cookie')).toBe(false);
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe(AUDIO.replace('https:', 'http:'));
        expect(init.redirect).toBe('manual');
        expect(Object.fromEntries(init.headers)).toEqual({ 'accept-encoding': 'identity', 'if-range': 'version-1', range: 'bytes=0-2' });
        // The upstream is still open: returning and reading its first chunk must not wait for the whole song.
        const reader = response.body!.getReader();
        expect((await reader.read()).value).toEqual(bytes);
        await reader.cancel();
    });

    it.each(['http://127.0.0.1/private', 'http://fs.youthandroid2.kugou.com.evil.test/song.mp3',
        'https://user:pass@fs.youthandroid2.kugou.com/song.mp3', 'http://fs.youthandroid2.kugou.com:8080/song.mp3',
        'file:///private'])('refuses %s before fetching', async url => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        expect((await handler(request(url))).status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not follow upstream redirects', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } }));
        vi.stubGlobal('fetch', fetchMock);
        expect((await handler(request())).status).toBe(502);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('supports HEAD and passes upstream errors without buffering their bodies', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200, headers: { 'Content-Length': '10000000', 'Content-Type': 'audio/mpeg' } }));
        vi.stubGlobal('fetch', fetchMock);
        const response = await handler(request(AUDIO, { method: 'HEAD' }));
        expect(response.body).toBeNull();
        expect(response.headers.get('content-length')).toBe('10000000');
        fetchMock.mockResolvedValueOnce(new Response('expired', { status: 403 }));
        expect((await handler(request())).status).toBe(403);
    });

    it('rejects invalid requests and hides signed paths on fetch failures', async () => {
        expect((await handler(new Request('https://folia.example/api/kugou-audio'))).status).toBe(400);
        expect((await handler(request('invalid'))).status).toBe(400);
        expect((await handler(request(AUDIO, { method: 'POST' }))).status).toBe(405);
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(AUDIO)));
        const response = await handler(request());
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain(AUDIO);
    });

    it.each(['text/html', 'image/svg+xml', 'application/javascript'])('never exposes executable %s from the HTTP upstream on the app origin', async type => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<script>readAccount()</script>', {
            headers: { 'Content-Type': type },
        })));
        const response = await handler(request());
        expect(response.status).toBe(502);
        expect(response.headers.get('content-security-policy')).toBe('sandbox');
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(await response.text()).not.toContain('<script>');
    });
});
