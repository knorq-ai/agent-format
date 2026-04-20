// Pure file-resolution logic for the render_agent_file MCP tool, extracted
// from server.ts so tests can import it without tripping the server's
// startup-time readFileSync of the UI bundle.
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

// Refuse files larger than this from disk. .agent files are hand-authored
// structure + summaries; real-world examples are tens of kilobytes, not MB.
export const MAX_AGENT_FILE_BYTES = 5 * 1024 * 1024

export function isAgentLike(data: unknown): data is { sections: unknown[]; name?: unknown } {
    return (
        !!data &&
        typeof data === 'object' &&
        'sections' in data &&
        Array.isArray((data as { sections: unknown }).sections)
    )
}

export interface ResolveResult {
    ok: boolean
    message: string
    data?: unknown
    sectionCount?: number
}

/**
 * Reads and validates a user-supplied .agent file path. Every gate here is
 * a security boundary because the LLM chooses the path:
 *   - extension is exactly `.agent` (case-insensitive; extname, not suffix)
 *   - path is a regular file (not a directory)
 *   - path is NOT a symlink (prevents `foo.agent -> /etc/passwd` exfil)
 *   - size ≤ MAX_AGENT_FILE_BYTES
 *   - contents parse as JSON and shape-match an agent document
 */
export async function resolveAgentFile(
    filePath: string,
    deps: {
        lstat: typeof fs.lstat
        stat: typeof fs.stat
        readFile: typeof fs.readFile
    } = fs
): Promise<ResolveResult> {
    if (!path.isAbsolute(filePath)) {
        return {
            ok: false,
            message: 'filePath must be an absolute path',
        }
    }

    const resolved = path.resolve(filePath)
    const base = path.basename(resolved)

    // Strict: exact `.agent` extension, case-insensitive. `foo.agent.txt`,
    // trailing-dot `foo.agent.`, and no-extension files all fail here.
    if (path.extname(resolved).toLowerCase() !== '.agent') {
        return {
            ok: false,
            message: `Refusing to render "${base}": only files with the .agent extension are supported.`,
        }
    }

    const lst = await deps.lstat(resolved)
    if (lst.isSymbolicLink()) {
        return {
            ok: false,
            message: `Refusing to follow symlink "${base}".`,
        }
    }
    if (!lst.isFile()) {
        return { ok: false, message: `"${base}" is not a regular file.` }
    }

    const stat = await deps.stat(resolved)
    if (stat.size > MAX_AGENT_FILE_BYTES) {
        return {
            ok: false,
            message: `"${base}" is ${stat.size} bytes; the limit for .agent files is ${MAX_AGENT_FILE_BYTES}.`,
        }
    }

    const text = await deps.readFile(resolved, 'utf8')
    const data: unknown = JSON.parse(text)
    if (!isAgentLike(data)) {
        return {
            ok: false,
            message: `"${base}" is not a valid .agent document (missing or non-array \`sections\`).`,
        }
    }
    return {
        ok: true,
        message: `Loaded ${base} (${data.sections.length} sections). Rendering inline.`,
        data,
        sectionCount: data.sections.length,
    }
}
