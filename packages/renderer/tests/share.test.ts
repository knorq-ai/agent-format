import { describe, expect, it } from 'vitest'
import {
    buildViewerUrl,
    decodeViewerHashPayload,
    encodeViewerHashPayload,
} from '../src/index'

describe('viewer share payloads', () => {
    it('round-trips unicode JSON through the compressed hash format', () => {
        const json = JSON.stringify({
            version: '0.1',
            name: '北国家相続関係説明図',
            icon: '🧓👩‍⚖️',
            // Repetitive content so deflate actually wins vs. raw base64.
            notes: Array.from({ length: 20 }, () => '相続人について').join('\n'),
        })

        const encoded = encodeViewerHashPayload(json)

        expect(encoded.startsWith('c1:')).toBe(true)
        expect(decodeViewerHashPayload(encoded)).toBe(json)
    })

    it('falls back to base64 when compression would bloat a tiny payload', () => {
        const json = JSON.stringify({ a: 1 })

        const encoded = encodeViewerHashPayload(json)

        expect(encoded.startsWith('b64:')).toBe(true)
        expect(decodeViewerHashPayload(encoded)).toBe(json)
    })

    it('keeps decoding the legacy base64 hash format', () => {
        const json = JSON.stringify({ name: '山田太郎', icon: '🧾' })
        const bytes = new TextEncoder().encode(json)
        let binary = ''
        for (const byte of bytes) binary += String.fromCharCode(byte)
        const legacy = `b64:${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`

        expect(decodeViewerHashPayload(legacy)).toBe(json)
    })

    it('keeps decoding the legacy percent-encoded hash format', () => {
        const json = JSON.stringify({ name: '山田太郎', icon: '🧾' })

        expect(decodeViewerHashPayload(encodeURIComponent(json))).toBe(json)
    })

    it('builds dramatically shorter urls for repetitive documents', () => {
        const data = {
            version: '0.1',
            name: '北田家 相続関係説明図',
            icon: '👥',
            sections: Array.from({ length: 12 }, (_, i) => ({
                type: 'notes',
                id: `section-${i}`,
                title: `相続関係のメモ ${i + 1}`,
                body: '被相続人 北田宗太郎 の相続関係について、次のとおり確認した。',
            })),
        } as const

        const url = buildViewerUrl(data as any)
        const legacy = `https://knorq-ai.github.io/agent-format/#${encodeURIComponent(JSON.stringify(data))}`

        expect(url).toContain('#c1:')
        // Should be at least 40% shorter than percent-encoded Japanese JSON.
        expect(url.length).toBeLessThan(legacy.length * 0.6)
    })

    it('errors on an empty hash', () => {
        expect(() => decodeViewerHashPayload('')).toThrow(/Missing inline viewer payload/)
        expect(() => decodeViewerHashPayload('#')).toThrow(/Missing inline viewer payload/)
    })

    it('errors on a compressed prefix with no payload', () => {
        expect(() => decodeViewerHashPayload('c1:')).toThrow(/Missing compressed payload/)
    })
})
