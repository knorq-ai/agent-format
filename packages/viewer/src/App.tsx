import { useCallback, useEffect, useState } from 'react'
import { AgentRenderer, type AgentFile } from '@agent-format/renderer'

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
            try {
                const res = await fetch(url)
                if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
                const text = await res.text()
                loadFromJson(text)
            } catch (err) {
                setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
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
                <AgentRenderer data={state.data} />
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
