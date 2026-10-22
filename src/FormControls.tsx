import type { ReactNode } from 'react'

export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="info-tip-wrap">
      <button type="button" className="info-dot" aria-label={`More information: ${label}`}>i</button>
      <span className="info-tooltip" role="tooltip">
        <b>{label}</b>
        <span>{children}</span>
      </span>
    </span>
  )
}

export function InputField({
  label,
  name,
  value,
  onChange,
  step = 'any',
  min = 0,
  max,
  suffix,
  hint,
  info,
}: {
  label: string
  name: string
  value: number
  onChange: (value: number) => void
  step?: string
  min?: number
  max?: number
  suffix?: string
  hint?: string
  info?: ReactNode
}) {
  return (
    <div className="input-field">
      <span className="label-row">
        <label className="input-label" htmlFor={name}>{label}</label>
        {info && <InfoTip label={label}>{info}</InfoTip>}
      </span>
      <span className="input-wrap">
        <input
          id={name}
          name={name}
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(event) => onChange(event.currentTarget.value === '' ? 0 : Number(event.currentTarget.value))}
        />
        {suffix && <span className="input-suffix">{suffix}</span>}
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}
