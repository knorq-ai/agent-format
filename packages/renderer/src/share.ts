import { deflateSync, inflateSync } from 'fflate'
import type { AgentFile } from './types'

const VIEWER_URL = 'https://knorq-ai.github.io/agent-format/'

// Hash payload prefixes, versioned so the viewer can decode old links while
// new links use a smaller codec.
//   c1:  raw-deflate(UTF-8 JSON) + base64url   — default since renderer 0.1.7
//   b64: UTF-8 JSON + base64url                — previous default
//   (no prefix) percent-encoded JSON           — earliest format
const COMPRESSED_PREFIX = 'c1:'
const BASE64_PREFIX = 'b64:'

export function buildViewerUrl(data: AgentFile): string {
    const json = JSON.stringify(data)
    return `${VIEWER_URL}#${encodeViewerHashPayload(json)}`
}

export function encodeViewerHashPayload(json: string): string {
    const utf8 = new TextEncoder().encode(json)
    const compressed = deflateSync(utf8, { level: 9 })
    // If deflate overhead beats the raw payload (tiny JSON), fall back to b64
    // so we don't ship a payload that's longer than necessary.
    if (compressed.length >= utf8.length) {
        return `${BASE64_PREFIX}${bytesToBase64Url(utf8)}`
    }
    return `${COMPRESSED_PREFIX}${bytesToBase64Url(compressed)}`
}

export function decodeViewerHashPayload(hash: string): string {
    const raw = hash.startsWith('#') ? hash.slice(1) : hash
    if (!raw) throw new Error('Missing inline viewer payload.')

    if (raw.startsWith(COMPRESSED_PREFIX)) {
        const encoded = raw.slice(COMPRESSED_PREFIX.length)
        if (!encoded) throw new Error('Missing compressed payload.')
        const compressed = base64UrlToBytes(encoded)
        const bytes = inflateSync(compressed)
        return new TextDecoder().decode(bytes)
    }

    if (raw.startsWith(BASE64_PREFIX)) {
        const encoded = raw.slice(BASE64_PREFIX.length)
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
    const CHUNK = 0x8000
    for (let i = 0; i < bytes.length; i += CHUNK) {
        const chunk = bytes.subarray(i, i + CHUNK)
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
