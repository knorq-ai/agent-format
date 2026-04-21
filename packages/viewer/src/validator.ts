// Full two-stage validator for the public viewer.
// Stage 1: pre-compiled Ajv validator against `schemas/agent.schema.json`
// — same schema the CLI and MCP server use. Generated at build time by
// scripts/build-validator.mjs so the browser bundle doesn't need runtime
// `new Function(...)` code generation (the viewer's CSP refuses eval).
// Stage 2: the renderer's semantic validator (ID uniqueness, kanban refs,
// table status-cell shape) — same function the CLI exercises.
//
// @ts-expect-error — generated JS has no co-located .d.ts; runtime shape
// is `(data) => boolean` plus an `.errors` array set as a side effect.
// eslint-disable-next-line import/no-unresolved
import ajvValidate from './generated/agent-validator.js'
import { validateSemantics } from '@agent-format/renderer'

type AjvValidateFn = {
    (data: unknown): boolean
    errors?: { instancePath?: string; message?: string }[] | null
}
type IssueEntry = { instancePath: string; message: string }

const validate = ajvValidate as unknown as AjvValidateFn

function toIssues(errs: unknown): IssueEntry[] {
    if (!Array.isArray(errs)) return []
    return errs.map((e) => {
        const obj = e as { instancePath?: string; message?: string }
        return {
            instancePath: obj.instancePath || '/',
            message: obj.message ?? 'invalid',
        }
    })
}

export type ValidationResult =
    | { ok: true; doc: unknown }
    | { ok: false; stage: 'schema' | 'semantic'; errors: IssueEntry[] }

export function validateAgentDoc(doc: unknown): ValidationResult {
    if (!validate(doc)) {
        return { ok: false, stage: 'schema', errors: toIssues(validate.errors) }
    }
    const semantic = validateSemantics(doc)
    if (semantic.length > 0) {
        return {
            ok: false,
            stage: 'semantic',
            errors: semantic.map((e) => ({
                instancePath: e.instancePath,
                message: e.message,
            })),
        }
    }
    return { ok: true, doc }
}
