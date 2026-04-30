// Builds a hosted-viewer URL with the agent document encoded in the hash.
// Used as a fallback for MCP clients that don't render MCP UI resources
// inline (notably Claude Code, which collapses the tool call and treats the
// JSON as text). The encoding here MUST stay byte-compatible with the
// renderer's `decodeViewerHashPayload` in packages/renderer/src/share.ts —
// the viewer at knorq-ai.github.io/agent-format/ inflates this with fflate.
//
// Node's `zlib.deflateRawSync` produces raw DEFLATE which fflate's
// `inflateSync` decodes; the b64 fallback keeps payloads under control when
// compression overhead beats the raw JSON.
import * as zlib from 'node:zlib'

export const DEFAULT_VIEWER_URL = 'https://knorq-ai.github.io/agent-format/'

// Cap on the encoded URL we'll embed in the tool result text. Above this we
// drop the URL and emit a short note instead. 100 KB is comfortable for
// chat clients to render without truncating, while still fitting hundreds
// of pages of typical .agent dashboard JSON.
export const MAX_VIEWER_URL_BYTES = 100_000

const COMPRESSED_PREFIX = 'c1:'
const BASE64_PREFIX = 'b64:'

export interface BuildViewerUrlOptions {
    base?: string
}

export function buildViewerUrl(data: unknown, options: BuildViewerUrlOptions = {}): string {
    const base = options.base ?? DEFAULT_VIEWER_URL
    const json = JSON.stringify(data)
    return `${base}#${encodeViewerHashPayload(json)}`
}

export function encodeViewerHashPayload(json: string): string {
    if (json.length === 0) {
        // The viewer's decoder rejects empty payloads — refuse to mint a
        // URL we know the receiver will reject.
        throw new Error('Cannot encode an empty viewer payload.')
    }
    const utf8 = Buffer.from(json, 'utf8')
    const compressed = zlib.deflateRawSync(utf8, { level: 9 })
    if (compressed.length >= utf8.length) {
        return `${BASE64_PREFIX}${toBase64Url(utf8)}`
    }
    return `${COMPRESSED_PREFIX}${toBase64Url(compressed)}`
}

function toBase64Url(bytes: Buffer): string {
    return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export type ViewerMode = 'auto' | 'always' | 'never'

export function readViewerMode(env: NodeJS.ProcessEnv = process.env): ViewerMode {
    const raw = (env.AGENT_FORMAT_VIEWER ?? '').trim().toLowerCase()
    if (raw === 'always' || raw === 'never' || raw === 'auto') return raw
    return 'auto'
}

// Hardcoded set of clients we know can't render MCP UI resources inline.
// Match against the `clientInfo.name` reported during MCP initialize.
const NON_UI_CLIENT_PATTERNS: RegExp[] = [
    /^claude-code$/i,
    /^claude\.code$/i,
    /\bclaude-code\b/i,
]

// Reads AGENT_FORMAT_VIEWER_CLIENTS — comma-separated list of client name
// substrings (case-insensitive) that extend the built-in non-UI client set.
// Use this when a new client appears that ignores MCP UI resources before
// we publish a release that recognizes it. Empty entries are dropped.
export function readClientAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
    const raw = env.AGENT_FORMAT_VIEWER_CLIENTS
    if (!raw) return []
    return raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0)
}

export function clientNeedsViewerUrl(
    clientName: string | undefined,
    allowlist: string[] = [],
): boolean {
    if (!clientName) return false
    if (NON_UI_CLIENT_PATTERNS.some((re) => re.test(clientName))) return true
    if (allowlist.length === 0) return false
    const lower = clientName.toLowerCase()
    return allowlist.some((entry) => lower.includes(entry))
}

export function shouldEmitViewerUrl(
    mode: ViewerMode,
    clientName: string | undefined,
    allowlist: string[] = [],
): boolean {
    if (mode === 'always') return true
    if (mode === 'never') return false
    return clientNeedsViewerUrl(clientName, allowlist)
}
