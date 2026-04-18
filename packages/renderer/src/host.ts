// Host integration surface for the renderer.
//
// The renderer runs in three places:
//   1. Host applications that embed it directly (the public viewer SPA)
//      — here plain window.open / anchor download is fine.
//   2. The MCP Apps iframe (Claude Desktop, Cursor, etc.) — sandboxed,
//      so window.open is blocked and we must call the host via the
//      @modelcontextprotocol/ext-apps App API.
//   3. Server-side rendering / tests — no browser APIs exist.
//
// Rather than import the ext-apps package here (keeping renderer deps
// minimal), we accept a minimal "HostBridge" interface that callers plug
// in. Code paths that use it degrade gracefully when it's absent.

export interface HostBridge {
    /**
     * Request the host to open a URL in the user's default browser.
     * Returns true on success, false if the host denied the request.
     * In MCP Apps hosts this maps to `app.openLink({url})`.
     */
    openLink?: (url: string) => Promise<boolean>

    /**
     * Request the host to save a file to the user's disk.
     * In MCP Apps hosts this maps to `app.downloadFile({...})`.
     */
    downloadFile?: (params: {
        mimeType: string
        text?: string
        blobBase64?: string
        filename: string
    }) => Promise<boolean>
}

// Fallback openLink using plain window.open. Used when no HostBridge is
// provided. In sandboxed contexts this is likely to be blocked.
export function fallbackOpenLink(url: string): Promise<boolean> {
    try {
        const w = window.open(url, '_blank', 'noopener,noreferrer')
        return Promise.resolve(Boolean(w))
    } catch {
        return Promise.resolve(false)
    }
}

// Fallback download using an <a download> anchor. Works in non-sandboxed
// browsers; typically blocked inside the MCP Apps iframe.
export function fallbackDownload(params: {
    mimeType: string
    text?: string
    blobBase64?: string
    filename: string
}): Promise<boolean> {
    try {
        let blob: Blob
        if (params.blobBase64) {
            const bin = atob(params.blobBase64)
            const bytes = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
            blob = new Blob([bytes], { type: params.mimeType })
        } else {
            blob = new Blob([params.text ?? ''], { type: params.mimeType })
        }
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = params.filename
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        setTimeout(() => {
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        }, 100)
        return Promise.resolve(true)
    } catch {
        return Promise.resolve(false)
    }
}
