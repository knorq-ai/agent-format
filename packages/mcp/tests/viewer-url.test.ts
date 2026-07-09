// Round-trip and policy tests for the viewer-url helper. The encoding must
// stay byte-compatible with the renderer's decoder (fflate inflate), since
// the hosted viewer at knorq-ai.github.io/agent-format/ runs that decoder
// against any link this server emits.
import { describe, expect, it } from 'vitest'
import { inflateSync } from 'fflate'
import {
    DEFAULT_VIEWER_URL,
    MAX_VIEWER_URL_BYTES,
    buildViewerUrl,
    clientNeedsViewerUrl,
    encodeViewerHashPayload,
    readClientAllowlist,
    readViewerMode,
    shouldEmitViewerUrl,
} from '../src/viewer-url'

const SAMPLE_AGENT = {
    version: '0.1',
    name: 'test',
    createdAt: '2026-04-30T00:00:00Z',
    updatedAt: '2026-04-30T00:00:00Z',
    config: { proactive: false },
    sections: Array.from({ length: 12 }, (_, i) => ({
        type: 'notes',
        id: `s${i}`,
        title: `Section ${i}`,
        body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'.repeat(8),
    })),
    memory: { observations: [], preferences: {} },
}

function decodeHash(hash: string): string {
    const raw = hash.startsWith('#') ? hash.slice(1) : hash
    if (raw.startsWith('c1:')) {
        const b64 = raw.slice(3).replace(/-/g, '+').replace(/_/g, '/')
        const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')
        const bytes = Buffer.from(padded, 'base64')
        return new TextDecoder().decode(inflateSync(bytes))
    }
    if (raw.startsWith('b64:')) {
        const b64 = raw.slice(4).replace(/-/g, '+').replace(/_/g, '/')
        const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')
        return Buffer.from(padded, 'base64').toString('utf8')
    }
    throw new Error('unknown payload prefix')
}

describe('encodeViewerHashPayload', () => {
    it('emits a c1: payload that fflate can inflate back to the original JSON', () => {
        const json = JSON.stringify(SAMPLE_AGENT)
        const payload = encodeViewerHashPayload(json)
        expect(payload.startsWith('c1:')).toBe(true)
        expect(decodeHash(payload)).toBe(json)
    })

    it('falls back to b64: when compression overhead beats the raw bytes', () => {
        // A very small, near-incompressible payload — the c1: branch would be
        // longer than the raw bytes, so the encoder should pick b64:.
        const tiny = '{"a":1}'
        const payload = encodeViewerHashPayload(tiny)
        expect(payload.startsWith('b64:')).toBe(true)
        expect(decodeHash(payload)).toBe(tiny)
    })

    it('uses base64url alphabet (no +, /, or = padding)', () => {
        const payload = encodeViewerHashPayload(JSON.stringify(SAMPLE_AGENT))
        const body = payload.replace(/^c1:|^b64:/, '')
        expect(body).not.toMatch(/[+/=]/)
    })

    it('throws on empty input rather than minting a URL the viewer rejects', () => {
        expect(() => encodeViewerHashPayload('')).toThrow(/empty/i)
    })
})

describe('buildViewerUrl', () => {
    it('defaults to the hosted viewer base', () => {
        const url = buildViewerUrl(SAMPLE_AGENT)
        expect(url.startsWith(DEFAULT_VIEWER_URL + '#')).toBe(true)
    })

    it('honors a custom base url', () => {
        const url = buildViewerUrl(SAMPLE_AGENT, { base: 'https://example.test/v/' })
        expect(url.startsWith('https://example.test/v/#')).toBe(true)
        const hash = url.slice('https://example.test/v/'.length)
        expect(decodeHash(hash)).toBe(JSON.stringify(SAMPLE_AGENT))
    })
})

describe('clientNeedsViewerUrl', () => {
    it('matches claude-code', () => {
        expect(clientNeedsViewerUrl('claude-code')).toBe(true)
        expect(clientNeedsViewerUrl('Claude-Code')).toBe(true)
    })

    it('does not match Cowork / Desktop / cursor / unknown', () => {
        expect(clientNeedsViewerUrl(undefined)).toBe(false)
        expect(clientNeedsViewerUrl('claude-ai')).toBe(false)
        expect(clientNeedsViewerUrl('claude-cowork')).toBe(false)
        expect(clientNeedsViewerUrl('cursor-vscode')).toBe(false)
    })

    it('honors a runtime allowlist (case-insensitive substring match)', () => {
        expect(clientNeedsViewerUrl('cursor-vscode', ['cursor'])).toBe(true)
        expect(clientNeedsViewerUrl('Some-Goose-Build', ['goose'])).toBe(true)
        expect(clientNeedsViewerUrl('claude-ai', ['cursor', 'goose'])).toBe(false)
    })
})

describe('readClientAllowlist', () => {
    it('parses a comma-separated list, lowercases, drops blanks', () => {
        expect(readClientAllowlist({ AGENT_FORMAT_VIEWER_CLIENTS: 'Cursor, GOOSE,, ' })).toEqual([
            'cursor',
            'goose',
        ])
    })

    it('returns [] when the env var is missing or empty', () => {
        expect(readClientAllowlist({})).toEqual([])
        expect(readClientAllowlist({ AGENT_FORMAT_VIEWER_CLIENTS: '' })).toEqual([])
    })
})

describe('readViewerMode', () => {
    it('defaults to auto when unset or unrecognized', () => {
        expect(readViewerMode({})).toBe('auto')
        expect(readViewerMode({ AGENT_FORMAT_VIEWER: 'wat' })).toBe('auto')
    })

    it('parses explicit values', () => {
        expect(readViewerMode({ AGENT_FORMAT_VIEWER: 'always' })).toBe('always')
        expect(readViewerMode({ AGENT_FORMAT_VIEWER: 'NEVER' })).toBe('never')
        expect(readViewerMode({ AGENT_FORMAT_VIEWER: ' auto ' })).toBe('auto')
    })
})

describe('shouldEmitViewerUrl', () => {
    it('auto follows client detection', () => {
        expect(shouldEmitViewerUrl('auto', 'claude-code')).toBe(true)
        expect(shouldEmitViewerUrl('auto', 'claude-ai')).toBe(false)
        expect(shouldEmitViewerUrl('auto', undefined)).toBe(false)
    })

    it('always overrides detection', () => {
        expect(shouldEmitViewerUrl('always', 'claude-ai')).toBe(true)
        expect(shouldEmitViewerUrl('always', undefined)).toBe(true)
    })

    it('never suppresses even known matches and allowlisted ones', () => {
        expect(shouldEmitViewerUrl('never', 'claude-code')).toBe(false)
        expect(shouldEmitViewerUrl('never', 'cursor-vscode', ['cursor'])).toBe(false)
    })

    it('auto picks up allowlisted clients', () => {
        expect(shouldEmitViewerUrl('auto', 'cursor-vscode', ['cursor'])).toBe(true)
    })
})

describe('size cap', () => {
    it('produces a URL under MAX_VIEWER_URL_BYTES for a typical document', () => {
        const url = buildViewerUrl(SAMPLE_AGENT)
        expect(Buffer.byteLength(url, 'utf8')).toBeLessThan(MAX_VIEWER_URL_BYTES)
    })

    it('exceeds MAX_VIEWER_URL_BYTES for a deliberately huge incompressible payload', () => {
        // Random bytes don't deflate, so the b64: branch produces ~4/3 the
        // raw size — confirming the cap actually triggers the fallback path
        // in server.ts on pathological inputs.
        const noise = Array.from({ length: 200_000 }, () =>
            String.fromCharCode(33 + Math.floor(Math.random() * 90)),
        ).join('')
        const big = { ...SAMPLE_AGENT, name: noise }
        const url = buildViewerUrl(big)
        expect(Buffer.byteLength(url, 'utf8')).toBeGreaterThan(MAX_VIEWER_URL_BYTES)
    })
})
