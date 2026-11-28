import { useId, useMemo, type ReactNode } from 'react';
import { cn } from '@helix/ui';
import { WEEKDAYS, type Recurrence, type Repeat } from './schedule-form';
import { t } from '../../i18n';

/** The "when" fields shared by the schedule and blockout sheets. */

const REPEATS: Repeat[] = ['once', 'minutes', 'hours', 'daily', 'weekly', 'monthly', 'cron'];

const supportedZones = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    return [];
  }
})();

export const inputClass = 'h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-fg';

export function RecurrenceFields({
  value,
  onChange,
  labels,
}: {
  value: Recurrence;
  onChange: (patch: Partial<Recurrence>) => void;
  labels?: { starting: string; at: string };
}) {
  const name = useId();
  const { starting, at } = labels ?? { starting: t('schedules.form.starting'), at: t('schedules.form.at') };
  const zones = useMemo(() => (supportedZones.includes(value.timeZone) ? supportedZones : [value.timeZone, ...supportedZones]), [value.timeZone]);
  return (
    <>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-[13px] font-semibold text-fg-soft">{t('schedules.form.repeat')}</legend>
            <div className="flex flex-wrap gap-1.5">
              {REPEATS.map((r) => (
                <label
                  key={r}
                  className={cn(
                    'inline-flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-[13px] font-semibold has-focus-visible:outline-2 has-focus-visible:outline-focus',
                    value.repeat === r ? 'border-accent bg-accent text-accent-ink' : 'border-border-strong bg-surface text-fg-soft hover:bg-accent-soft',
                  )}
                >
                  <input type="radio" name={`${name}-repeat`} value={r} checked={value.repeat === r} onChange={() => onChange({ repeat: r })} className="sr-only" />
                  {t(`schedules.form.repeats.${r}`)}
                </label>
              ))}
            </div>
          </fieldset>

          {(value.repeat === 'minutes' || value.repeat === 'hours') && (
            <Field label={value.repeat === 'minutes' ? t('schedules.form.everyMinutes') : t('schedules.form.everyHours')}>
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={1}
                  max={value.repeat === 'minutes' ? 59 : 23}
                  value={value.interval}
                  onChange={(e) => onChange({ interval: Number(e.target.value) })}
                  className={cn(inputClass, 'w-28')}
                />
              )}
            </Field>
          )}

          {value.repeat === 'weekly' && (
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 text-[13px] font-semibold text-fg-soft">{t('schedules.form.on')}</legend>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const on = value.weekdays.includes(d.value);
                  return (
                    <label
                      key={d.value}
                      className={cn(
                        'inline-flex size-11 cursor-pointer items-center justify-center rounded-full border text-[13px] font-semibold has-focus-visible:outline-2 has-focus-visible:outline-focus',
                        on ? 'border-accent bg-accent-soft text-accent' : 'border-border-strong text-fg-soft hover:bg-accent-soft',
                      )}
                    >
                      <input
                        type="checkbox"
                        aria-label={d.long}
                        checked={on}
                        onChange={(e) => onChange({ weekdays: e.target.checked ? [...value.weekdays, d.value] : value.weekdays.filter((x) => x !== d.value) })}
                        className="sr-only"
                      />
                      {d.short}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {value.repeat === 'monthly' && (
            <Field label={t('schedules.form.dayOfMonth')}>
              {(id) => (
                <input id={id} type="number" min={1} max={31} value={value.dayOfMonth} onChange={(e) => onChange({ dayOfMonth: Number(e.target.value) })} className={cn(inputClass, 'w-28')} />
              )}
            </Field>
          )}

          {value.repeat === 'cron' && (
            <Field label={t('schedules.form.cron')} hint={t('schedules.form.cronHint')}>
              {(id) => <input id={id} value={value.cron} onChange={(e) => onChange({ cron: e.target.value })} className={cn(inputClass, 'font-mono text-[13px]')} />}
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={value.repeat === 'once' ? t('schedules.form.date') : starting}>
              {(id) => <input id={id} type="date" value={value.startDate} onChange={(e) => onChange({ startDate: e.target.value })} className={inputClass} />}
            </Field>
            <Field label={value.repeat === 'minutes' || value.repeat === 'hours' ? t('schedules.form.from') : at}>
              {(id) => <input id={id} type="time" value={value.startTime} onChange={(e) => onChange({ startTime: e.target.value })} className={inputClass} />}
            </Field>
          </div>

          {value.repeat !== 'once' && (
            <Field label={t('schedules.form.ending')}>
              {(id) => <input id={id} type="date" value={value.endDate} min={value.startDate} onChange={(e) => onChange({ endDate: e.target.value })} className={cn(inputClass, 'w-48')} />}
            </Field>
          )}

          <Field label={t('schedules.form.timeZone')}>
            {(id) => (
              <select id={id} value={value.timeZone} onChange={(e) => onChange({ timeZone: e.target.value })} className={inputClass}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            )}
          </Field>
    </>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5" aria-describedby={hint ? hintId : undefined}>
      <label htmlFor={id} className="text-[13px] font-semibold text-fg-soft">
        {label}
      </label>
      {children(id)}
      {hint && (
        <p id={hintId} className="m-0 text-[12.5px] text-fg-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
