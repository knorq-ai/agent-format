// Runs inside the MCP Apps UI iframe. Renders the .agent data directly
// using the @agent-format/renderer React components — NO nested iframe,
// because Claude Desktop's sandbox CSP has no frame-src allowance.

import { App } from '@modelcontextprotocol/ext-apps'
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
    AgentRenderer,
    type AgentFile,
    type HostBridge,
    type RendererPlugin,
} from '@agent-format/renderer'
import { jpCourtPlugin } from '@agent-format/jp-court'

// Plugins we bundle into the MCP UI. Today: jp-court only, so `family-graph`
// sections with `variant: "jp-court"` get the 相続関係説明図 visual
// automatically inside Claude Desktop / Cursor / VS Code Copilot — no
// per-host setup required. Declared at module scope so React gets a stable
// reference across re-renders.
const BUNDLED_PLUGINS: ReadonlyArray<RendererPlugin> = [jpCourtPlugin]

let root: Root | null = null

function ensureRoot(): Root {
    const mount = document.getElementById('viewer')!
    if (!root) {
        root = createRoot(mount)
    }
    return root
}

function showEmpty(text: string) {
    const empty = document.getElementById('empty')
    if (empty) {
        empty.textContent = text
        empty.style.display = 'flex'
    }
    const mount = document.getElementById('viewer')
    if (mount) mount.style.display = 'none'
}

const app = new App({ name: 'agent-format-renderer', version: __APP_VERSION__ })

// Bridge from renderer's generic HostBridge interface to the MCP Apps SDK.
// The sandbox blocks window.open() and anchor downloads directly; the app
// API routes these through the host (Claude Desktop / Cursor / etc.) which
// prompts the user and opens a real browser tab / saves a real file.
const hostBridge: HostBridge = {
    openLink: async (url: string) => {
        const { isError } = await app.openLink({ url })
        return !isError
    },
    downloadFile: async ({ mimeType, text, blobBase64, filename }) => {
        // Prefer text when provided (HTML/JSON/CSV). Use blob (base64) for
        // binary payloads. The SDK types resource as a discriminated union
        // so build each branch separately rather than mutating a shared object.
        const uri = `file:///${filename}`
        const resource =
            typeof text === 'string'
                ? { uri, mimeType, text }
                : typeof blobBase64 === 'string'
                    ? { uri, mimeType, blob: blobBase64 }
                    : null
        if (!resource) return false
        const { isError } = await app.downloadFile({
            contents: [{ type: 'resource', resource }],
        })
        return !isError
    },
}

// Status shown in the floating save indicator.
type SaveStatus =
    | { kind: 'idle' }
    | { kind: 'read-only'; reason: string }
    | { kind: 'saving' }
    | { kind: 'saved'; at: number }
    | { kind: 'error'; message: string }

interface RendererProps {
    initialData: AgentFile
    // Absolute path of the .agent file being rendered. Undefined when the
    // source is render_agent_inline (no file backing) — writeback is disabled
    // in that case.
    path: string | undefined
    // Whether the host advertised serverTools. False → no callServerTool, so
    // we keep edits in-memory only and surface a read-only banner.
    serverToolsSupported: boolean
}

function baselineStatus(
    path: string | undefined,
    serverToolsSupported: boolean
): SaveStatus {
    if (!path) {
        return { kind: 'read-only', reason: 'inline data — no file to save to' }
    }
    if (!serverToolsSupported) {
        return { kind: 'read-only', reason: 'host does not support server tool calls' }
    }
    return { kind: 'idle' }
}

function InteractiveRenderer({ initialData, path, serverToolsSupported }: RendererProps) {
    const [data, setData] = useState<AgentFile>(initialData)
    const [status, setStatus] = useState<SaveStatus>(() =>
        baselineStatus(path, serverToolsSupported)
    )

    // Reset local state when the host pushes a new tool-result (e.g. the
    // model called render_agent_file after its own save_agent_file). Without
    // this the iframe would keep showing stale local edits.
    useEffect(() => {
        setData(initialData)
    }, [initialData])

    // Recompute the baseline read-only/idle banner when the writeback path
    // changes (different file) or capability flips. Otherwise a later
    // tool-result that should become writable would still show the old
    // read-only banner, and vice versa.
    useEffect(() => {
        setStatus(baselineStatus(path, serverToolsSupported))
    }, [path, serverToolsSupported])

    const writable = !!path && serverToolsSupported
    // Monotonic counter so a stale save response can't overwrite a newer one.
    const saveSeq = useRef(0)

    // KNOWN LIMITATION: two in-flight save_agent_file calls for the same
    // path can reorder on the server side (no per-path serialization), so
    // last-rename-wins. The saveSeq guard below only prevents stale
    // responses from clobbering UI state, not stale payloads from clobbering
    // disk. Acceptable for single-user Claude Desktop where edits are
    // human-paced; revisit with an expectedRevision token when/if we see
    // concurrent writers.
    const handleChange = useCallback(
        (next: AgentFile) => {
            setData(next)
            if (!writable || !path) return
            const mySeq = ++saveSeq.current
            setStatus({ kind: 'saving' })
            app.callServerTool({
                name: 'save_agent_file',
                arguments: { path, data: next },
            })
                .then((result) => {
                    // A later edit already started while this one was in
                    // flight — let that call's response update the UI instead.
                    if (mySeq !== saveSeq.current) return
                    if (result.isError) {
                        const msg =
                            result.content?.find((c) => c.type === 'text')?.text ??
                            'save failed'
                        setStatus({ kind: 'error', message: msg })
                    } else {
                        setStatus({ kind: 'saved', at: Date.now() })
                    }
                })
                .catch((err) => {
                    if (mySeq !== saveSeq.current) return
                    setStatus({ kind: 'error', message: String(err) })
                })
        },
        [path, writable]
    )

    const onChange = writable ? handleChange : undefined

    return useMemo(
        () => (
            <>
                <SaveIndicator status={status} />
                <AgentRenderer
                    data={data}
                    host={hostBridge}
                    plugins={BUNDLED_PLUGINS}
                    onChange={onChange}
                />
            </>
        ),
        [data, onChange, status]
    )
}

function SaveIndicator({ status }: { status: SaveStatus }) {
    // Transient indicators only. `idle` renders nothing to keep the chat
    // surface quiet when nothing has been edited yet.
    if (status.kind === 'idle') return null

    const { bg, fg, label } = (() => {
        switch (status.kind) {
            case 'read-only':
                return {
                    bg: 'rgba(107, 114, 128, 0.12)',
                    fg: '#6b7280',
                    label: `Read-only — ${status.reason}`,
                }
            case 'saving':
                return { bg: 'rgba(59, 130, 246, 0.12)', fg: '#3b82f6', label: 'Saving…' }
            case 'saved':
                return {
                    bg: 'rgba(16, 185, 129, 0.12)',
                    fg: '#10b981',
                    label: 'Saved',
                }
            case 'error':
                return {
                    bg: 'rgba(239, 68, 68, 0.15)',
                    fg: '#ef4444',
                    label: `Save failed — ${status.message}`,
                }
        }
    })()

    return (
        <div
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                margin: '0 0 8px',
                padding: '4px 10px',
                fontSize: 12,
                fontFamily: '-apple-system, system-ui, "Segoe UI", sans-serif',
                background: bg,
                color: fg,
                borderRadius: 4,
                display: 'inline-block',
            }}
        >
            {label}
        </div>
    )
}

function render(
    data: unknown,
    path: string | undefined,
    serverToolsSupported: boolean
) {
    if (
        !data ||
        typeof data !== 'object' ||
        !Array.isArray((data as { sections?: unknown }).sections)
    ) {
        showEmpty('No valid .agent data received.')
        return
    }
    try {
        const empty = document.getElementById('empty')
        if (empty) empty.style.display = 'none'
        const mount = document.getElementById('viewer')!
        mount.style.display = 'block'

        ensureRoot().render(
            <StrictMode>
                <InteractiveRenderer
                    initialData={data as AgentFile}
                    path={path}
                    serverToolsSupported={serverToolsSupported}
                />
            </StrictMode>
        )
    } catch (e) {
        showEmpty('Failed to render: ' + String(e))
    }
}

// Must be set BEFORE connect() so the initial tool-result isn't missed.
// structuredContent now also carries the absolute path (from render_agent_file)
// — undefined when the source was render_agent_inline.
app.ontoolresult = (result: {
    structuredContent?: { data?: unknown; path?: unknown }
}) => {
    const sc = result?.structuredContent
    const pathValue = typeof sc?.path === 'string' ? sc.path : undefined
    // Capability is only known after connect() resolves. Re-read it on every
    // tool-result so we pick up late-initialized host info.
    const serverToolsSupported = !!app.getHostCapabilities()?.serverTools
    render(sc?.data, pathValue, serverToolsSupported)
}

app.connect()
