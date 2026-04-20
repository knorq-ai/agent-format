// Renderer plugin surface. Plugins register variant-specific components for
// section types that expose a `variant` field (today: only family-graph).
// Kept deliberately minimal — authoring plugins should not require touching
// AgentRenderer internals.

import type { ComponentType, ReactElement } from 'react'
import type { Section, SectionType } from './types'

export interface VariantRendererProps<S extends Section = Section> {
    section: S
    /**
     * Optional: let a plugin mount header-right action buttons (PDF export,
     * format-specific toggles, etc.) via the same hook core renderers use.
     * Safe to ignore.
     */
    setHeaderActions?: (node: ReactElement | null) => void
}

export type VariantComponent = ComponentType<VariantRendererProps>

export interface RendererPlugin {
    /**
     * Package identifier, e.g. `@agent-format/jp-court`. Used for diagnostics
     * and to de-duplicate if the same plugin gets passed twice.
     */
    name: string
    /**
     * Nested map: sectionType → variantName → component. Example:
     *
     *   {
     *     'family-graph': {
     *       'jp-court': JPCourtFamilyGraphView,
     *     },
     *   }
     */
    variants?: Partial<Record<SectionType | string, Record<string, VariantComponent>>>
    /**
     * Top-level renderers for namespaced extension section types
     * (`x-<vendor>:<name>`, see spec § 7.2). Keys are section `type`
     * strings; values are the component to mount. Example:
     *
     *   {
     *     'x-acme:burndown-chart': BurndownChartView,
     *   }
     *
     * Unlike `variants`, this claims ownership of the whole section type.
     * Only matches when the incoming section's `type` equals the key
     * literally; lookup is first-plugin-wins across the supplied list.
     */
    sections?: Record<string, VariantComponent>
}

/**
 * Walk the supplied plugin list in order and return the first registered
 * top-level renderer for an extension section type, or undefined if none
 * claims it. Used by `AgentRenderer` to route `x-<vendor>:<name>` sections.
 */
export function findSectionComponent(
    plugins: ReadonlyArray<RendererPlugin>,
    sectionType: string
): VariantComponent | undefined {
    for (const plugin of plugins) {
        const component = plugin.sections?.[sectionType]
        if (component) return component
    }
    return undefined
}

/**
 * Walk the supplied plugin list in order and return the first registered
 * variant component for (sectionType, variant), or undefined if no plugin
 * claims it. First-wins so app code can override upstream plugins by placing
 * their plugin earlier in the array.
 */
export function findVariantComponent(
    plugins: ReadonlyArray<RendererPlugin>,
    sectionType: string,
    variant: string | undefined
): VariantComponent | undefined {
    if (!variant) return undefined
    for (const plugin of plugins) {
        const component = plugin.variants?.[sectionType]?.[variant]
        if (component) return component
    }
    return undefined
}
