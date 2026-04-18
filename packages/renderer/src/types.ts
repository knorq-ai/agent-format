// Agent File Format types (v0.1)
// Matches the public spec at https://github.com/knorq-ai/agent-format

export type SectionType =
    | 'kanban'
    | 'checklist'
    | 'notes'
    | 'timeline'
    | 'table'
    | 'log'
    | 'metrics'
    | 'diagram'
    | 'report'
    | 'form'
    | 'links'
    | 'references'
    | 'inheritance-diagram'

export interface SectionBase {
    id: string
    type: SectionType
    label: string
    icon?: string
    order: number
}

// --- Kanban ---

export interface KanbanColumn {
    id: string
    name: string
    category: string
    wipLimit?: number
    order: number
    isCollapsed?: boolean
}

export interface KanbanItemComment {
    id: string
    author: string
    text: string
    createdAt: string
}

export interface KanbanItem {
    id: string
    title: string
    description?: string
    type: string
    status: string
    priority: string
    assignee?: string
    labelIds: string[]
    blockedBy: string[]
    estimate?: number
    startDate?: string
    dueDate?: string
    milestoneId?: string
    cycleId?: string
    comments?: KanbanItemComment[]
    createdAt: string
    updatedAt: string
}

export interface KanbanLabel {
    id: string
    name: string
    color: string
}

export interface KanbanTeamMember {
    id: string
    name: string
    role?: string
}

export interface KanbanData {
    columns: KanbanColumn[]
    items: KanbanItem[]
    labels: KanbanLabel[]
    team?: KanbanTeamMember[]
}

export interface KanbanSection extends SectionBase {
    type: 'kanban'
    data: KanbanData
}

// --- Checklist ---

export interface ChecklistItem {
    id: string
    text: string
    checked: boolean
}

export interface ChecklistGroup {
    id: string
    title: string
    items: ChecklistItem[]
}

export interface ChecklistSection extends SectionBase {
    type: 'checklist'
    data: { groups: ChecklistGroup[] }
}

// --- Notes ---

export interface NoteBlock {
    id: string
    content: string
}

export interface NotesSection extends SectionBase {
    type: 'notes'
    data: { blocks: NoteBlock[] }
}

// --- Timeline ---

export interface TimelineItem {
    id: string
    title: string
    description?: string
    startDate?: string
    endDate?: string
    status: string
}

export interface TimelineMilestone {
    id: string
    name: string
    description?: string
    targetDate?: string
    status: string
}

export interface TimelineSection extends SectionBase {
    type: 'timeline'
    data: { items: TimelineItem[]; milestones: TimelineMilestone[] }
}

// --- Table ---

export type TableColumnType = 'text' | 'number' | 'date' | 'select' | 'status'

export interface TableColumn {
    key: string
    label: string
    type: TableColumnType
    options?: string[]
}

export interface TableSection extends SectionBase {
    type: 'table'
    data: {
        columns: TableColumn[]
        rows: Record<string, unknown>[]
    }
}

// --- Log ---

export interface LogEntry {
    id: string
    type: string
    title: string
    description?: string
    severity?: string
    status: string
    context?: string
    decision?: string
    alternatives?: string[]
    owner?: string
    createdAt: string
}

export interface LogSection extends SectionBase {
    type: 'log'
    data: { entries: LogEntry[] }
}

// --- Metrics ---

export interface MetricCard {
    id: string
    label: string
    value: string | number
    unit?: string
    trend?: 'up' | 'down' | 'flat'
    color?: string
}

export interface MetricsSection extends SectionBase {
    type: 'metrics'
    data: { cards: MetricCard[] }
}

// --- Diagram ---

export interface DiagramNode {
    id: string
    label: string
    description?: string
    children: DiagramNode[]
}

export interface DiagramSection extends SectionBase {
    type: 'diagram'
    data: { root: DiagramNode }
}

// --- Report ---

export interface ReportEntry {
    id: string
    title: string
    content: string
    createdAt: string
    updatedAt: string
}

export interface ReportSection extends SectionBase {
    type: 'report'
    data: { template: string; reports: ReportEntry[] }
}

// --- Form ---

export interface FormField {
    id: string
    label: string
    type: 'text' | 'textarea' | 'select' | 'date' | 'number' | 'email' | 'url' | 'checkbox'
    options?: string[]
    required?: boolean
    placeholder?: string
}

export interface FormSubmission {
    id: string
    values: Record<string, unknown>
    submittedAt: string
    submittedBy?: string
}

export interface FormSection extends SectionBase {
    type: 'form'
    data: { fields: FormField[]; submissions: FormSubmission[] }
}

// --- Links ---

export interface LinkItem {
    id: string
    title: string
    url: string
    description?: string
    category?: string
}

export interface LinksSection extends SectionBase {
    type: 'links'
    data: { items: LinkItem[] }
}

// --- References ---

export interface ReferenceFileItem {
    id: string
    fileId: string
    fileName: string
    filePath: string
    memo?: string
}

export interface ReferencesSection extends SectionBase {
    type: 'references'
    data: { items: ReferenceFileItem[] }
}

// --- Inheritance diagram (相続関係説明図) ---

export interface InheritanceDiagramPerson {
    id: string
    name: string
    role?: string // e.g. 被相続人, 配偶者, 長男, 代襲相続人
    birthday?: string // localized free text (元号 or 西暦)
    address?: string
    deathDate?: string
    aliases?: string[]
}

export interface InheritanceDiagramRelationship {
    type: 'spouse' | 'parent-child'
    person1Id: string // parent-child: parent; spouse: either
    person2Id: string // parent-child: child; spouse: either
    details?: string
    dissolved?: boolean
}

export interface InheritanceDiagramData {
    variant: string // 'jp-court' is the first-class conformance variant
    persons: InheritanceDiagramPerson[]
    relationships: InheritanceDiagramRelationship[]
    focusedPersonId?: string
}

export interface InheritanceDiagramSection extends SectionBase {
    type: 'inheritance-diagram'
    data: InheritanceDiagramData
}

// --- Union ---

export type Section =
    | KanbanSection
    | ChecklistSection
    | NotesSection
    | TimelineSection
    | TableSection
    | LogSection
    | MetricsSection
    | DiagramSection
    | ReportSection
    | FormSection
    | LinksSection
    | ReferencesSection
    | InheritanceDiagramSection

// --- Root ---

export type AgentTaskTrigger = 'manual' | 'daily' | 'weekly'

export interface AgentTask {
    id: string
    trigger: AgentTaskTrigger
    prompt: string
    day?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
    lastRun?: string
    label?: string
}

export interface AgentConfig {
    proactive: boolean
    customInstructions?: string
    reviewRequired?: boolean
    tasks?: AgentTask[]
}

export interface AgentMemory {
    observations: string[]
    preferences: Record<string, string>
}

export interface AgentFile {
    version: string
    name: string
    description?: string
    icon?: string
    createdAt: string
    updatedAt: string
    config: AgentConfig
    sections: Section[]
    memory: AgentMemory
}
