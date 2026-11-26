import { useEffect, useId, useState } from 'react';
import { cn } from '@helix/ui';
import { dateValue, dayOf, isDateType, isNumberType, type ReportParameter } from '../../api/reports';
import { t } from '../../i18n';

/*
 * One report parameter, drawn the way the report asks (parameter-render-type): dropdown, list box,
 * radio buttons, checkboxes, toggle buttons, text, multi-line text or a date picker. Lists change
 * the value at once; text commits on Enter or when it loses focus, so typing doesn't send a
 * request per key.
 */

const control = 'w-full rounded-control border border-border-strong bg-surface px-3 text-fg';

export function ParameterField({
  param,
  value,
  errors,
  onChange,
}: {
  param: ReportParameter;
  value: string[];
  errors?: string[];
  onChange: (value: string[]) => void;
}) {
  const id = useId();
  const errorId = `${id}-errors`;
  const described = errors?.length ? errorId : undefined;
  const grouped = param.renderType === 'radio' || param.renderType === 'checkbox' || param.renderType === 'togglebutton';
  const label = (
    <>
      {param.label}
      {param.mandatory && (
        <span className="text-danger-fg" title={t('files.report.required')}>
          {' '}
          *
        </span>
      )}
    </>
  );

  const body = grouped ? (
    <fieldset className="m-0 border-0 p-0" aria-describedby={described}>
      <legend className="mb-1.5 p-0 text-[13px] font-semibold text-fg-soft">{label}</legend>
      <Choices param={param} value={value} onChange={onChange} />
    </fieldset>
  ) : (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-fg-soft">
        {label}
      </label>
      <Input id={id} param={param} value={value} onChange={onChange} describedBy={described} />
    </div>
  );

  return (
    <div className="flex flex-col gap-1">
      {body}
      {errors?.length ? (
        <ul id={errorId} className="m-0 list-none p-0 text-[12.5px] text-danger-fg">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Choices({ param, value, onChange }: { param: ReportParameter; value: string[]; onChange: (value: string[]) => void }) {
  const name = useId();
  const multi = param.multi || param.renderType === 'checkbox';
  const toggle = (v: string, on: boolean) => onChange(multi ? (on ? [...value, v] : value.filter((x) => x !== v)) : [v]);
  const chips = param.renderType === 'togglebutton';
  return (
    <div className={cn('flex gap-1.5', chips || param.horizontal ? 'flex-row flex-wrap' : 'flex-col')}>
      {param.choices.map((c) => {
        const on = value.includes(c.value);
        const input = (
          <input
            type={multi ? 'checkbox' : 'radio'}
            name={name}
            value={c.value}
            checked={on}
            onChange={(e) => toggle(c.value, e.target.checked)}
            className={chips ? 'sr-only' : 'size-4 accent-accent'}
          />
        );
        return chips ? (
          <label
            key={c.value}
            className={cn(
              'inline-flex h-8 cursor-pointer items-center rounded-full border px-3 text-[13px] font-semibold has-focus-visible:outline-2 has-focus-visible:outline-focus',
              on ? 'border-accent bg-accent text-accent-ink' : 'border-border-strong bg-surface text-fg-soft hover:bg-accent-soft',
            )}
          >
            {input}
            {c.label}
          </label>
        ) : (
          <label key={c.value} className="inline-flex cursor-pointer items-center gap-2 text-[13.5px]">
            {input}
            {c.label}
          </label>
        );
      })}
    </div>
  );
}

function Input({ id, param, value, onChange, describedBy }: { id: string; param: ReportParameter; value: string[]; onChange: (value: string[]) => void; describedBy?: string }) {
  const common = { id, 'aria-describedby': describedBy, 'aria-required': param.mandatory || undefined };

  if (param.renderType === 'dropdown' || param.renderType === 'list') {
    const listBox = param.renderType === 'list' || param.multi;
    const size = listBox ? Math.min(param.visibleItems ?? 6, Math.max(param.choices.length, 2)) : undefined;
    return (
      <select
        {...common}
        multiple={param.multi}
        size={size}
        value={param.multi ? value : (value[0] ?? '')}
        onChange={(e) => onChange(param.multi ? Array.from(e.target.selectedOptions, (o) => o.value) : e.target.value === '' ? [] : [e.target.value])}
        className={cn(control, listBox ? 'py-1' : 'h-10')}
      >
        {!param.multi && !listBox && (value.length === 0 || !param.mandatory) && <option value="">{param.mandatory ? t('files.report.choose') : t('files.report.none')}</option>}
        {param.choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    );
  }

  if (param.renderType === 'datepicker' || isDateType(param.type)) {
    return <input {...common} type="date" value={value[0] ? dayOf(value[0]) : ''} onChange={(e) => onChange(e.target.value ? [dateValue(e.target.value)] : [])} className={cn(control, 'h-10')} />;
  }

  return <TextInput common={common} multiLine={param.renderType === 'multi-line'} numeric={isNumberType(param.type)} value={value[0] ?? ''} onCommit={(v) => onChange(v === '' ? [] : [v])} />;
}

function TextInput({
  common,
  multiLine,
  numeric,
  value,
  onCommit,
}: {
  common: Record<string, unknown>;
  multiLine: boolean;
  numeric: boolean;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft.trim());
  return multiLine ? (
    <textarea {...common} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} className={cn(control, 'py-2')} />
  ) : (
    <input
      {...common}
      inputMode={numeric ? 'decimal' : undefined}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
      className={cn(control, 'h-10')}
    />
  );
}
