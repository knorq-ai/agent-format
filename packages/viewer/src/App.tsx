import { Component, useCallback, useEffect, useState, type ReactNode } from 'react'
import { AgentRenderer, type AgentFile } from '@agent-format/renderer'
import { jpCourtPlugin } from '@agent-format/jp-court'
import { validateAgentDoc } from './validator'

// Plugins registered in the deployed viewer. Registering jp-court here so
// `family-graph` sections with `variant: "jp-court"` get the Japanese-legal
// visual template out of the box. This is declared once at module scope so
// React never sees a new array identity on re-render.
const VIEWER_PLUGINS = [jpCourtPlugin]

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

type ValidationIssue = { instancePath: string; message: string }
type LoadState =
    | { kind: 'empty' }
    | { kind: 'loading' }
    | { kind: 'ok'; data: AgentFile }
    | { kind: 'error'; message: string; issues?: ValidationIssue[] }

export function App() {
    const [state, setState] = useState<LoadState>({ kind: 'empty' })
    const [pasted, setPasted] = useState('')
    const [dragging, setDragging] = useState(false)
    const [editMode, setEditMode] = useState(false)

    const loadFromJson = useCallback((text: string) => {
        let parsed: unknown
        try {
            parsed = JSON.parse(text)
        } catch (err) {
            setState({
                kind: 'error',
                message: `Not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
            })
            return
        }
        const result = validateAgentDoc(parsed)
        if (!result.ok) {
            const head =
                result.stage === 'schema'
                    ? 'Schema validation failed — this does not conform to the .agent v0.1 schema.'
                    : 'Semantic validation failed — the file parses but breaks referential / uniqueness rules.'
            const total = result.errors.length
            const shown = result.errors.slice(0, 20)
            const message =
                total > shown.length
                    ? `${head} (showing first ${shown.length} of ${total} issues)`
                    : head
            setState({ kind: 'error', message, issues: shown })
            return
        }
        setEditMode(false)
        setState({ kind: 'ok', data: parsed as AgentFile })
    }, [])

    const updateRenderedDoc = useCallback((next: AgentFile) => {
        setState({ kind: 'ok', data: next })
    }, [])

    const downloadJson = useCallback((data: AgentFile) => {
        const json = JSON.stringify(data, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const stem = data.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
        a.href = url
        a.download = `${stem || 'agent-file'}.agent.json`
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        window.setTimeout(() => {
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        }, 100)
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
                    <strong>agent-format</strong>
                    <span style={{ color: 'var(--af-fg-muted, #6b7280)' }}>
                        · {state.data.sections.length} sections · spec v{state.data.version}
                    </span>
                    <div className="right">
                        <button
                            className={`btn btn-secondary${editMode ? ' is-active' : ''}`}
                            onClick={() => setEditMode((v) => !v)}
                        >
                            {editMode ? '編集モード終了' : '編集モード'}
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={() => downloadJson(state.data)}
                        >
                            JSON を保存
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={() => {
                                setState({ kind: 'empty' })
                                setPasted('')
                                setEditMode(false)
                                window.history.replaceState(null, '', window.location.pathname)
                            }}
                        >
                            別のファイルを開く
                        </button>
                    </div>
                </div>
                <RenderErrorBoundary>
                    <AgentRenderer
                        data={state.data}
                        plugins={VIEWER_PLUGINS}
                        showDocumentHeader={false}
                        showOpenInViewer={false}
                        onChange={editMode ? updateRenderedDoc : undefined}
                    />
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

            {state.kind === 'error' && (
                <div className="error">
                    <div>{state.message}</div>
                    {state.issues && state.issues.length > 0 && (
                        <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                            {state.issues.map((iss, i) => (
                                <li key={i}>
                                    <code>{iss.instancePath || '/'}</code>: {iss.message}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
            {state.kind === 'loading' && <p style={{ marginTop: 16 }}>Loading…</p>}

            <div className="helper">
                Sharing options: <code>?url=&lt;url&gt;</code> fetches and renders a remote file.{' '}
                <code>#&lt;encoded-json&gt;</code> renders inline data from the URL hash. See the{' '}
                <a href="https://github.com/knorq-ai/agent-format">spec</a> for file format details.
            </div>
        </div>
    )
}
