import { Component, useCallback, useEffect, useState, type ReactNode } from 'react'
import { AgentRenderer, type AgentFile } from '@agent-format/renderer'

// Catches any runtime error in AgentRenderer (malformed section data, etc.)
// and renders a message instead of blanking the whole viewer.
class RenderErrorBoundary extends Component<
    { children: ReactNode },
    { error: Error | null }
> {
    state = { error: null as Error | null }
    static getDerivedStateFromError(error: Error) {
        return { error }
    }
    componentDidCatch(error: Error) {
        console.error('AgentRenderer crashed:', error)
    }
    render() {
        if (this.state.error) {
            return (
                <div className="error" style={{ margin: 24 }}>
                    Failed to render this .agent file: {this.state.error.message}. The file may be
                    malformed or use fields outside the v0.1 spec.
                </div>
            )
        }
        return this.props.children
    }
}

const MAX_REMOTE_BYTES = 5 * 1024 * 1024
const REMOTE_FETCH_TIMEOUT_MS = 15_000

type LoadState =
    | { kind: 'empty' }
    | { kind: 'loading' }
    | { kind: 'ok'; data: AgentFile }
    | { kind: 'error'; message: string }

export function App() {
    const [state, setState] = useState<LoadState>({ kind: 'empty' })
    const [pasted, setPasted] = useState('')
    const [dragging, setDragging] = useState(false)

    const loadFromJson = useCallback((text: string) => {
        try {
            const parsed = JSON.parse(text) as AgentFile
            if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.sections)) {
                throw new Error('Input does not look like an agent file (missing sections array).')
            }
            setState({ kind: 'ok', data: parsed })
        } catch (err) {
            setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
        }
    }, [])

    const loadFromUrl = useCallback(
        async (url: string) => {
            setState({ kind: 'loading' })
            let parsed: URL
            try {
                parsed = new URL(url)
            } catch {
                setState({ kind: 'error', message: `Invalid URL: ${url}` })
                return
            }
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
                setState({
                    kind: 'error',
                    message: `Only http(s) URLs are allowed; got ${parsed.protocol}`,
                })
                return
            }

            const controller = new AbortController()
            const timer = window.setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS)
            try {
                const res = await fetch(parsed.href, {
                    signal: controller.signal,
                    credentials: 'omit',
                    redirect: 'follow',
                })
                if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
                const declaredLen = Number(res.headers.get('content-length') ?? 0)
                if (declaredLen > MAX_REMOTE_BYTES) {
                    throw new Error(
                        `Remote file is ${declaredLen} bytes; the limit is ${MAX_REMOTE_BYTES}.`
                    )
                }
                // Stream the body so we can enforce the byte cap even when the
                // server omits Content-Length or uses chunked transfer encoding.
                // Calling `res.text()` first would buffer the entire body before
                // the length check, making the cap a lie against hostile peers.
                const reader = res.body?.getReader()
                if (!reader) throw new Error('Response has no body.')
                const chunks: Uint8Array[] = []
                let total = 0
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    if (!value) continue
                    total += value.byteLength
                    if (total > MAX_REMOTE_BYTES) {
                        controller.abort()
                        throw new Error(
                            `Remote file exceeds ${MAX_REMOTE_BYTES} bytes; aborted.`
                        )
                    }
                    chunks.push(value)
                }
                const merged = new Uint8Array(total)
                let offset = 0
                for (const chunk of chunks) {
                    merged.set(chunk, offset)
                    offset += chunk.byteLength
                }
                loadFromJson(new TextDecoder('utf-8').decode(merged))
            } catch (err) {
                setState({
                    kind: 'error',
                    message: err instanceof Error ? err.message : String(err),
                })
            } finally {
                window.clearTimeout(timer)
            }
        },
        [loadFromJson]
    )

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const urlParam = params.get('url')
        if (urlParam) {
            loadFromUrl(urlParam)
            return
        }
        const hash = window.location.hash
        if (hash && hash.length > 1) {
            try {
                const decoded = decodeURIComponent(hash.slice(1))
                loadFromJson(decoded)
            } catch {
                // ignore; fall through to empty state
            }
        }
    }, [loadFromUrl, loadFromJson])

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault()
            setDragging(false)
            const file = e.dataTransfer.files[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
                if (typeof reader.result === 'string') loadFromJson(reader.result)
            }
            reader.onerror = () => setState({ kind: 'error', message: 'Failed to read file.' })
            reader.readAsText(file)
        },
        [loadFromJson]
    )

    if (state.kind === 'ok') {
        return (
            <div className="viewer-shell">
                <div className="toolbar">
                    <strong>{state.data.name || 'Agent file'}</strong>
                    <span style={{ color: 'var(--af-fg-muted, #6b7280)' }}>
                        · {state.data.sections.length} sections · spec v{state.data.version}
                    </span>
                    <div className="right">
                        <button
                            className="btn btn-secondary"
                            onClick={() => {
                                setState({ kind: 'empty' })
                                setPasted('')
                                window.history.replaceState(null, '', window.location.pathname)
                            }}
                        >
                            Load another
                        </button>
                    </div>
                </div>
                <RenderErrorBoundary>
                    <AgentRenderer data={state.data} showOpenInViewer={false} />
                </RenderErrorBoundary>
            </div>
        )
    }

    return (
        <div
            className="landing"
            onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
        >
            <h1>Agent File Viewer</h1>
            <p className="lead">
                Drop a <code>.agent</code> file, paste the JSON, or share a link like{' '}
                <code>?url=https://…</code>.
            </p>

            <label className={`dropzone ${dragging ? 'dragging' : ''}`}>
                <input
                    type="file"
                    accept=".agent,.json,application/json"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = () => {
                            if (typeof reader.result === 'string') loadFromJson(reader.result)
                        }
                        reader.readAsText(file)
                    }}
                />
                <p>
                    <strong>Drop a file here</strong> or click to choose
                </p>
            </label>

            <div className="paste-area">
                <textarea
                    placeholder="…or paste JSON here"
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                />
                <div className="actions">
                    <button
                        className="btn"
                        disabled={!pasted.trim()}
                        onClick={() => loadFromJson(pasted)}
                    >
                        Render
                    </button>
                </div>
            </div>

            {state.kind === 'error' && <div className="error">{state.message}</div>}
            {state.kind === 'loading' && <p style={{ marginTop: 16 }}>Loading…</p>}

            <div className="helper">
                Sharing options: <code>?url=&lt;url&gt;</code> fetches and renders a remote file.{' '}
                <code>#&lt;encoded-json&gt;</code> renders inline data from the URL hash. See the{' '}
                <a href="https://github.com/knorq-ai/agent-format">spec</a> for file format details.
            </div>
        </div>
    )
}
