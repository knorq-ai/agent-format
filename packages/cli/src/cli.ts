#!/usr/bin/env node
// `agent-format` — minimal CLI validator for .agent files.
//
// This is a deliberately small, React-free, bundler-free second
// implementation of the v0.1 conformance surface. Its only job is to tell
// you whether a file validates against `schemas/agent.schema.json`. Having
// a second implementation is important for a format spec because it proves
// the schema — not the TypeScript renderer — is the normative contract.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { validateSemantics, type SemanticError } from './semantic.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const requireCjs = createRequire(import.meta.url)

// ajv / ajv-formats ship CJS defaults; reach the runtime constructor via
// createRequire so NodeNext ESM resolution doesn't fight us.
type AjvErrorsEntry = { instancePath?: string; message?: string; schemaPath?: string }
type ValidateFn = {
    (data: unknown): boolean
    errors?: AjvErrorsEntry[] | null
}
const Ajv2020: new (opts?: unknown) => {
    compile: (schema: unknown) => ValidateFn
} = requireCjs('ajv/dist/2020').default
const addFormats: (ajv: unknown) => void = requireCjs('ajv-formats').default

const SCHEMA_PATH = path.join(__dirname, 'agent.schema.json')

interface Args {
    files: string[]
    help: boolean
    version: boolean
    allErrors: boolean
    quiet: boolean
    skipSemantic: boolean
}

function parseArgs(argv: string[]): Args {
    const out: Args = {
        files: [],
        help: false,
        version: false,
        allErrors: true,
        quiet: false,
        skipSemantic: false,
    }
    for (const a of argv) {
        if (a === '-h' || a === '--help') out.help = true
        else if (a === '-v' || a === '--version') out.version = true
        else if (a === '--first-error-only') out.allErrors = false
        else if (a === '-q' || a === '--quiet') out.quiet = true
        else if (a === '--skip-semantic') out.skipSemantic = true
        else if (a.startsWith('-')) {
            console.error(`Unknown flag: ${a}`)
            process.exit(2)
        } else {
            out.files.push(a)
        }
    }
    return out
}

function usage(): string {
    return [
        'Usage: agent-format <file.agent> [file.agent ...]',
        '',
        'Validates one or more .agent files against the v0.1 JSON Schema.',
        'Exit 0 on success; exit 1 if any file fails validation; exit 2 for usage errors.',
        '',
        'Options:',
        '  -h, --help              Show this help and exit.',
        '  -v, --version           Print the CLI version and schema $id.',
        '  --first-error-only      Stop at the first validation error per file.',
        '  --skip-semantic         Skip the semantic pass (ID uniqueness, refs).',
        '  -q, --quiet             Only print paths of failing files.',
    ].join('\n')
}

function loadSchema(): { schema: unknown; id: string } {
    const raw = fs.readFileSync(SCHEMA_PATH, 'utf8')
    const schema = JSON.parse(raw) as { $id?: string }
    const id = typeof schema.$id === 'string' ? schema.$id : '(missing $id)'
    return { schema, id }
}

function pkgVersion(): string {
    const pkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
    ) as { version?: string }
    return pkg.version ?? '0.0.0'
}

function formatError(e: AjvErrorsEntry): string {
    const path = e.instancePath || '/'
    return `  ${path}: ${e.message ?? 'invalid'}`
}

function formatSemanticError(e: SemanticError): string {
    return `  ${e.instancePath || '/'}: ${e.message}`
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) {
        process.stdout.write(usage() + '\n')
        return
    }
    if (args.version) {
        const { id } = loadSchema()
        process.stdout.write(`agent-format ${pkgVersion()} — schema ${id}\n`)
        return
    }
    if (args.files.length === 0) {
        process.stderr.write(usage() + '\n')
        process.exit(2)
    }

    const { schema } = loadSchema()
    const ajv = new Ajv2020({ allErrors: args.allErrors, strict: false })
    addFormats(ajv)
    const validate = ajv.compile(schema)

    let fails = 0
    for (const file of args.files) {
        const resolved = path.resolve(file)
        if (path.extname(resolved).toLowerCase() !== '.agent') {
            fails++
            process.stderr.write(
                `✗ ${file}: wrong extension (expected .agent)\n`
            )
            continue
        }
        // Separate read from parse so filesystem errors (EISDIR from a
        // directory path, EACCES, ENOENT) don't get mislabeled as JSON
        // parse failures — that misdirection sends users hunting for a
        // syntax bug that isn't there.
        let text: string
        try {
            text = fs.readFileSync(resolved, 'utf8')
        } catch (err) {
            fails++
            process.stderr.write(
                `✗ ${file}: cannot read — ${(err as Error).message}\n`
            )
            continue
        }
        let data: unknown
        try {
            data = JSON.parse(text)
        } catch (err) {
            fails++
            process.stderr.write(
                `✗ ${file}: not valid JSON — ${(err as Error).message}\n`
            )
            continue
        }
        if (!validate(data)) {
            fails++
            process.stderr.write(`✗ ${file}\n`)
            if (!args.quiet) {
                for (const e of validate.errors ?? []) {
                    process.stderr.write(formatError(e) + '\n')
                }
            }
            continue
        }
        const semanticErrors = args.skipSemantic ? [] : validateSemantics(data)
        if (semanticErrors.length > 0) {
            fails++
            process.stderr.write(`✗ ${file} (semantic)\n`)
            if (!args.quiet) {
                for (const e of semanticErrors) {
                    process.stderr.write(formatSemanticError(e) + '\n')
                }
            }
            continue
        }
        if (!args.quiet) process.stdout.write(`✓ ${file}\n`)
    }
    process.exit(fails === 0 ? 0 : 1)
}

main().catch((err) => {
    process.stderr.write(`agent-format CLI crashed: ${String(err)}\n`)
    process.exit(2)
})
