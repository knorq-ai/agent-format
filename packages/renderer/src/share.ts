import type { AgentFile } from './types'

const VIEWER_URL = 'https://knorq-ai.github.io/agent-format/'
const INLINE_HASH_PREFIX = 'b64:'
const BASE64_CHUNK_SIZE = 0x8000

export function buildViewerUrl(data: AgentFile): string {
    const json = JSON.stringify(data)
    return `${VIEWER_URL}#${encodeViewerHashPayload(json)}`
}

export function encodeViewerHashPayload(json: string): string {
    const bytes = new TextEncoder().encode(json)
    return `${INLINE_HASH_PREFIX}${bytesToBase64Url(bytes)}`
}

export function decodeViewerHashPayload(hash: string): string {
    const raw = hash.startsWith('#') ? hash.slice(1) : hash
    if (!raw) throw new Error('Missing inline viewer payload.')

    if (raw.startsWith(INLINE_HASH_PREFIX)) {
        const encoded = raw.slice(INLINE_HASH_PREFIX.length)
        if (!encoded) throw new Error('Missing base64 payload.')
        const bytes = base64UrlToBytes(encoded)
        return new TextDecoder().decode(bytes)
    }

    try {
        return decodeURIComponent(raw)
    } catch (error) {
        throw new Error(
            `Invalid inline viewer payload: ${error instanceof Error ? error.message : String(error)}`
        )
    }
}

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
        const chunk = bytes.subarray(i, i + BASE64_CHUNK_SIZE)
        binary += String.fromCharCode(...chunk)
    }
    return toBase64(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(input: string): Uint8Array {
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const binary = fromBase64(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}

function toBase64(binary: string): string {
    if (typeof globalThis.btoa === 'function') return globalThis.btoa(binary)
    throw new Error('Base64 encoding is unavailable in this environment.')
}

function fromBase64(base64: string): string {
    if (typeof globalThis.atob === 'function') return globalThis.atob(base64)
    throw new Error('Base64 decoding is unavailable in this environment.')
}

