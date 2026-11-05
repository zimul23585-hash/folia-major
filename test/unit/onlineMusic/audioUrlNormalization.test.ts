import { afterEach, describe, expect, it, vi } from 'vitest';
import { toSafePlaybackUrl, toSafeRemoteUrl } from '@/utils/appPlaybackHelpers';

// test/unit/onlineMusic/audioUrlNormalization.test.ts

afterEach(() => vi.unstubAllGlobals());

describe('online audio URL normalization', () => {
    it('uses an absolute same-origin source in the browser so currentSrc and metadata keys match', () => {
        vi.stubGlobal('window', { location: { origin: 'https://folia.example' } });
        const url = 'http://fs.youthandroid2.kugou.com/signed/song.mp3';
        const expected = `https://folia.example/api/kugou-audio?url=${encodeURIComponent(url)}`;
        expect(toSafePlaybackUrl(url, false, true)).toBe(expected);
        expect(toSafePlaybackUrl(expected, false, true)).toBe(expected);
    });

    it.each(['http:', 'https:'])('relays %s KuGou youthandroid2 audio only on Vercel, including old cached HTTPS URLs', scheme => {
        const url = `${scheme}//fs.youthandroid2.kugou.com/signed/song.mp3?key=a%2Fb`;
        expect(toSafePlaybackUrl(url, false, true)).toBe(`/api/kugou-audio?url=${encodeURIComponent(url)}`);
        expect(toSafePlaybackUrl(url, true, true)).toBe(url);
        expect(toSafePlaybackUrl(url, false, false)).toBe(url.replace(/^http:/, 'https:'));
    });

    it('does not relay NetEase, other hosts, credentials or an already-relayed URL', () => {
        for (const url of ['https://audio.example.test/song.mp3', 'https://fs.youthandroid2.kugou.com.evil.test/song.mp3',
            'https://user:pass@fs.youthandroid2.kugou.com/song.mp3', '/api/kugou-audio?url=already-encoded']) {
            expect(toSafePlaybackUrl(url, false, true)).toBe(url);
        }
        expect(toSafePlaybackUrl('http://m10.music.126.net/song.mp3', false, true))
            .toBe('https://m10.music.126.net/song.mp3');
    });

    it('relays only the first candidate of an old comma-joined source', () => {
        const first = 'http://fs.youthandroid2.kugou.com/song.mp3';
        expect(toSafePlaybackUrl(`${first},http://fs.youthandroid2.kugou.com/backup.mp3`, false, true))
            .toBe(`/api/kugou-audio?url=${encodeURIComponent(first)}`);
    });

    it('upgrades KuGou fs CDN URLs to HTTPS', () => {
        expect(toSafeRemoteUrl('http://fs.youthandroid2.kugou.com/path/song.mp3'))
            .toBe('https://fs.youthandroid2.kugou.com/path/song.mp3');
    });

    it('preserves KuGou HTTP media URLs only for Electron playback', () => {
        const url = 'http://fs.youthandroid2.kugou.com/path/song.mp3';
        expect(toSafePlaybackUrl(url, true)).toBe(url);
        expect(toSafePlaybackUrl(url, false)).toBe('https://fs.youthandroid2.kugou.com/path/song.mp3');
    });

    it('repairs a cached comma-joined KuGou URL by keeping one candidate', () => {
        expect(toSafeRemoteUrl(
            'http://fs.youthandroid2.kugou.com/primary.mp3,http://fs.youthandroid2.kugou.com/backup.mp3',
        )).toBe('https://fs.youthandroid2.kugou.com/primary.mp3');
    });

    it('keeps valid HTTPS URLs unchanged', () => {
        expect(toSafeRemoteUrl('https://audio.example.test/song.mp3'))
            .toBe('https://audio.example.test/song.mp3');
    });

    it('continues upgrading NetEase media URLs to HTTPS', () => {
        expect(toSafeRemoteUrl('http://m10.music.126.net/song.mp3'))
            .toBe('https://m10.music.126.net/song.mp3');
        expect(toSafePlaybackUrl('http://m10.music.126.net/song.mp3', true))
            .toBe('https://m10.music.126.net/song.mp3');
    });

    it('keeps only the first KuGou candidate while preserving Electron HTTP', () => {
        expect(toSafePlaybackUrl(
            'http://fs.youthandroid2.kugou.com/primary.mp3,http://fs.youthandroid2.kugou.com/backup.mp3',
            true,
        )).toBe('http://fs.youthandroid2.kugou.com/primary.mp3');
    });
});
