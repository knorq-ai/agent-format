// Pure file-resolution logic for the render_agent_file / save_agent_file MCP
// tools, extracted from server.ts so tests can import it without tripping the
// server's startup-time readFileSync of the UI bundle.
import * as crypto from 'node:crypto'
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

export interface SaveResult {
    ok: boolean
    message: string
    bytesWritten?: number
}

/**
 * Writes a validated agent document to disk. Every gate mirrors resolveAgentFile
 * because the path is LLM-chosen:
 *   - extension is exactly `.agent`
 *   - if the target exists, it's a regular file (never a symlink, never a dir) —
 *     so the model can't be tricked into overwriting /etc/passwd via a planted
 *     `foo.agent -> /etc/passwd` symlink
 *   - serialized payload ≤ MAX_AGENT_FILE_BYTES
 *
 * The caller is responsible for JSON-Schema validation of `data`; this module
 * only enforces filesystem shape and the minimal `isAgentLike` check.
 *
 * Write is atomic on POSIX: serialize → write to sibling temp file → rename.
 * rename(2) is atomic within a single filesystem, so a concurrent reader
 * either sees the old file or the new file, never a partial write.
 */
export async function saveAgentFile(
    filePath: string,
    data: unknown,
    deps: {
        lstat: typeof fs.lstat
        writeFile: typeof fs.writeFile
        rename: typeof fs.rename
        unlink: typeof fs.unlink
    } = fs
): Promise<SaveResult> {
    if (!path.isAbsolute(filePath)) {
        return { ok: false, message: 'filePath must be an absolute path' }
    }

    const resolved = path.resolve(filePath)
    const base = path.basename(resolved)

    if (path.extname(resolved).toLowerCase() !== '.agent') {
        return {
            ok: false,
            message: `Refusing to save "${base}": only files with the .agent extension are supported.`,
        }
    }

    if (!isAgentLike(data)) {
        return {
            ok: false,
            message: `Refusing to save "${base}": data is not a valid .agent document (missing or non-array \`sections\`).`,
        }
    }

    // If a file (or anything) already exists at this path, enforce that it is
    // a regular file — not a symlink, not a directory. New files (ENOENT) are
    // allowed; any other stat error propagates.
    try {
        const lst = await deps.lstat(resolved)
        if (lst.isSymbolicLink()) {
            return { ok: false, message: `Refusing to overwrite symlink "${base}".` }
        }
        if (!lst.isFile()) {
            return { ok: false, message: `"${base}" is not a regular file.` }
        }
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }

    const json = JSON.stringify(data, null, 2) + '\n'
    const bytes = Buffer.byteLength(json, 'utf8')
    if (bytes > MAX_AGENT_FILE_BYTES) {
        return {
            ok: false,
            message: `Serialized payload is ${bytes} bytes; the limit for .agent files is ${MAX_AGENT_FILE_BYTES}.`,
        }
    }

    // Write to a sibling temp file in the same directory so `rename` stays
    // intra-filesystem (rename across filesystems is not atomic and throws
    // EXDEV on some platforms). UUIDv4 suffix + exclusive-create flag closes
    // the pre-creation race in hostile directories: if an attacker planted
    // a file or symlink at the temp path, `open(..., 'wx')` throws EEXIST
    // rather than following/truncating it.
    const dir = path.dirname(resolved)
    const tmp = path.join(dir, `.${base}.tmp-${crypto.randomUUID()}`)

    try {
        await deps.writeFile(tmp, json, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
        await deps.rename(tmp, resolved)
    } catch (err) {
        // Best-effort cleanup; swallow unlink errors so the original write
        // failure is the message the caller sees.
        try {
            await deps.unlink(tmp)
        } catch {
            // intentionally empty
        }
        throw err
    }

    return {
        ok: true,
        message: `Saved ${base} (${bytes} bytes, ${(data as { sections: unknown[] }).sections.length} sections).`,
        bytesWritten: bytes,
    }
}
