import { describe, expect, it } from 'vitest'
import {
    buildViewerUrl,
    decodeViewerHashPayload,
    encodeViewerHashPayload,
} from '../src/index'

describe('viewer share payloads', () => {
    it('round-trips unicode JSON through the base64url hash format', () => {
        const json = JSON.stringify({
            version: '0.1',
            name: '北国家相続関係説明図',
            icon: '🧓👩‍⚖️',
        })

        const encoded = encodeViewerHashPayload(json)

        expect(encoded.startsWith('b64:')).toBe(true)
        expect(decodeViewerHashPayload(encoded)).toBe(json)
    })

    it('keeps decoding the legacy percent-encoded hash format', () => {
        const json = JSON.stringify({ name: '山田太郎', icon: '🧾' })

        expect(decodeViewerHashPayload(encodeURIComponent(json))).toBe(json)
    })

    it('builds shorter urls than percent-encoding for unicode-heavy documents', () => {
        const data = {
            version: '0.1',
            name: '北国家相続関係説明図',
            icon: '🧓👩‍⚖️',
            sections: [],
        } as const

        const url = buildViewerUrl(data as any)
        const legacy = `https://knorq-ai.github.io/agent-format/#${encodeURIComponent(JSON.stringify(data))}`

        expect(url).toContain('#b64:')
        expect(url.length).toBeLessThan(legacy.length)
    })
})
