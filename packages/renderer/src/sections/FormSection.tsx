import type { FormSection, FormField } from '../types'

interface Props {
    section: FormSection
}

function FieldPreview({ field }: { field: FormField }) {
    const common = {
        id: `af-form-${field.id}`,
        placeholder: field.placeholder,
        disabled: true,
    }
    switch (field.type) {
        case 'textarea':
            return <textarea {...common} rows={3} />
        case 'select':
            return (
                <select {...common}>
                    <option value="">{field.placeholder ?? 'Select…'}</option>
                    {(field.options ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                            {opt}
                        </option>
                    ))}
                </select>
            )
        case 'checkbox':
            return <input {...common} type="checkbox" />
        case 'date':
        case 'number':
        case 'email':
        case 'url':
        case 'text':
            return <input {...common} type={field.type} />
        default:
            return <input {...common} type="text" />
    }
}

export function FormSectionView({ section }: Props) {
    const { fields, submissions } = section.data
    return (
        <div className="af-form">
            <form className="af-form-fields" onSubmit={(e) => e.preventDefault()}>
                {fields.map((field) => (
                    <div key={field.id} className="af-form-row">
                        <label htmlFor={`af-form-${field.id}`} className="af-form-label">
                            {field.label}
                            {field.required && <span className="af-form-required"> *</span>}
                        </label>
                        <FieldPreview field={field} />
                    </div>
                ))}
            </form>
            {submissions.length > 0 && (
                <div className="af-form-submissions">
                    {submissions.length} submission{submissions.length === 1 ? '' : 's'}
                </div>
            )}
        </div>
    )
}
