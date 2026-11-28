import { useId } from 'react';
import { Plus, Sparkles, X } from 'lucide-react';
import { Button, Checkbox, cn } from '@helix/ui';
import { AGGREGATIONS, type Aggregation } from '../../api/datasets';
import { columnLabel, isNumeric, suggestModel, type ColumnRow, type ModelForm, type ModelProblems } from './dataset-form';
import { t, type MessageKey } from '../../i18n';

const controlClass = 'h-8 rounded-control border border-border bg-surface px-2 text-fg aria-[invalid=true]:border-danger-fg';

/**
 * Dimensions (what results are broken down by) and measures (what is totalled) over the kept
 * columns. `problems` are shown once `checked`.
 */
export function ModelStep({
  model,
  rows,
  fact,
  onChange,
  problems,
  checked,
}: {
  model: ModelForm;
  rows: ColumnRow[];
  /** With several tables: the fact table, where measures come from. */
  fact?: string;
  onChange: (model: ModelForm) => void;
  problems: ModelProblems;
  checked: boolean;
}) {
  const kept = rows.filter((r) => r.keep);
  const problem = (key: string) => (checked ? problems[key] : undefined);
  const setDimension = (i: number, patch: Partial<ModelForm['dimensions'][number]>) =>
    onChange({ ...model, dimensions: model.dimensions.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const setMeasure = (i: number, patch: Partial<ModelForm['measures'][number]>) =>
    onChange({ ...model, measures: model.measures.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <p className="m-0 flex-1 text-fg-soft">{t('datasets.editor.model.intro')}</p>
        <Button size="sm" onClick={() => onChange(suggestModel(rows, fact))}>
          <Sparkles size={14} aria-hidden="true" />
          {t('datasets.editor.model.suggest')}
        </Button>
      </div>

      <Section title={t('datasets.editor.model.dimensions')} hint={t('datasets.editor.model.dimensionsHint')}>
        {model.dimensions.length === 0 && <p className="m-0 text-[13px] text-fg-muted">{t('datasets.editor.model.noDimensions')}</p>}
        {model.dimensions.map((d, i) => {
          const label = d.name.trim() || String(i + 1);
          return (
            <div key={i} className="flex flex-col gap-2 rounded-card border border-border p-3">
              <div className="flex flex-wrap items-start gap-3">
                <Labelled problem={problem(`dimensions.${i}.name`)}>
                  {(props) => (
                    <input
                      {...props}
                      aria-label={t('datasets.editor.model.dimensionName', { n: i + 1 })}
                      value={d.name}
                      onChange={(e) => setDimension(i, { name: e.target.value })}
                      className={cn(controlClass, 'w-56 font-semibold')}
                    />
                  )}
                </Labelled>
                <Checkbox
                  label={t('datasets.editor.model.time')}
                  aria-label={t('datasets.editor.model.timeNamed', { dimension: label })}
                  checked={d.time}
                  onChange={(time) => setDimension(i, { time })}
                />
                <span className="flex-1" />
                <IconButton label={t('datasets.editor.model.removeDimension', { name: label })} onClick={() => onChange({ ...model, dimensions: model.dimensions.filter((_, j) => j !== i) })} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {d.levels.map((level, l) => (
                  <span key={l} className="flex items-center gap-1">
                    {l > 0 && <span aria-hidden="true" className="text-fg-muted">›</span>}
                    <select
                      aria-label={t('datasets.editor.model.level', { level: l + 1, dimension: label })}
                      aria-invalid={problem(`dimensions.${i}.levels`) ? true : undefined}
                      value={level}
                      onChange={(e) => setDimension(i, { levels: d.levels.map((x, k) => (k === l ? e.target.value : x)) })}
                      className={controlClass}
                    >
                      <option value="">{t('datasets.editor.model.chooseColumn')}</option>
                      {kept.map((r) => (
                        <option key={r.name} value={r.name}>
                          {columnLabel(r)}
                        </option>
                      ))}
                    </select>
                    {d.levels.length > 1 && (
                      <IconButton
                        label={t('datasets.editor.model.removeLevel', { level: l + 1, dimension: label })}
                        onClick={() => setDimension(i, { levels: d.levels.filter((_, k) => k !== l) })}
                      />
                    )}
                  </span>
                ))}
                <Button size="sm" variant="ghost" onClick={() => setDimension(i, { levels: [...d.levels, ''] })}>
                  <Plus size={14} aria-hidden="true" />
                  {t('datasets.editor.model.addLevel')}
                </Button>
              </div>
              {problem(`dimensions.${i}.levels`) && <span className="text-[12.5px] text-danger-fg">{t(problem(`dimensions.${i}.levels`)!)}</span>}
              {d.time && <span className="text-[12.5px] text-fg-muted">{t('datasets.editor.model.timeHint')}</span>}
            </div>
          );
        })}
        <div>
          <Button size="sm" onClick={() => onChange({ ...model, dimensions: [...model.dimensions, { name: '', levels: [''], time: false }] })}>
            <Plus size={14} aria-hidden="true" />
            {t('datasets.editor.model.addDimension')}
          </Button>
        </div>
      </Section>

      <Section title={t('datasets.editor.model.measures')} hint={t('datasets.editor.model.measuresHint')}>
        {model.measures.length === 0 ? (
          <p className="m-0 text-[13px] text-fg-muted">{t('datasets.editor.model.noMeasures')}</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full border-collapse text-left text-[13.5px]">
              <thead className="bg-divider/50 text-[12px] font-semibold text-fg-muted uppercase">
                <tr>
                  <th className="px-3 py-2">{t('datasets.editor.model.name')}</th>
                  <th className="px-3 py-2">{t('datasets.editor.model.column')}</th>
                  <th className="px-3 py-2">{t('datasets.editor.model.aggregation')}</th>
                  <th className="px-3 py-2">{t('datasets.editor.model.format')}</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {model.measures.map((m, i) => {
                  const label = m.name.trim() || String(i + 1);
                  return (
                    <tr key={i} className="border-t border-divider align-top">
                      <td className="px-3 py-1.5">
                        <Labelled problem={problem(`measures.${i}.name`)}>
                          {(props) => (
                            <input
                              {...props}
                              aria-label={t('datasets.editor.model.measureName', { n: i + 1 })}
                              value={m.name}
                              onChange={(e) => setMeasure(i, { name: e.target.value })}
                              className={cn(controlClass, 'w-full min-w-[140px]')}
                            />
                          )}
                        </Labelled>
                      </td>
                      <td className="px-3 py-1.5">
                        <Labelled problem={problem(`measures.${i}.column`)}>
                          {(props) => (
                            <select {...props} aria-label={t('datasets.editor.model.columnNamed', { name: label })} value={m.column} onChange={(e) => setMeasure(i, { column: e.target.value })} className={controlClass}>
                              <option value="">{t('datasets.editor.model.chooseColumn')}</option>
                              {kept.map((r) => (
                                <option key={r.name} value={r.name}>
                                  {columnLabel(r)}
                                </option>
                              ))}
                            </select>
                          )}
                        </Labelled>
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          aria-label={t('datasets.editor.model.aggregationNamed', { name: label })}
                          value={m.aggregation}
                          onChange={(e) => setMeasure(i, { aggregation: e.target.value as Aggregation })}
                          className={controlClass}
                        >
                          {AGGREGATIONS.map((a) => (
                            <option key={a} value={a}>
                              {t(`datasets.editor.model.aggregations.${a}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          aria-label={t('datasets.editor.model.formatNamed', { name: label })}
                          value={m.format}
                          placeholder="#,##0.00"
                          onChange={(e) => setMeasure(i, { format: e.target.value })}
                          className={cn(controlClass, 'w-28 font-mono text-[12.5px]')}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <IconButton label={t('datasets.editor.model.removeMeasure', { name: label })} onClick={() => onChange({ ...model, measures: model.measures.filter((_, j) => j !== i) })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div>
          <Button
            size="sm"
            onClick={() => {
              const first = kept.find((r) => isNumeric(r.type) && (!fact || r.table === fact));
              onChange({ ...model, measures: [...model.measures, { name: '', column: first?.name ?? '', aggregation: first ? 'SUM' : 'COUNT', format: '' }] });
            }}
          >
            <Plus size={14} aria-hidden="true" />
            {t('datasets.editor.model.addMeasure')}
          </Button>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5">
      <div>
        <h2 id={id} className="m-0 text-[15px] font-bold">
          {title}
        </h2>
        <p className="m-0 text-[12.5px] text-fg-muted">{hint}</p>
      </div>
      {children}
    </section>
  );
}

type ControlProps = { 'aria-describedby'?: string; 'aria-invalid'?: boolean };

/** A control with its problem underneath, linked for screen readers. */
function Labelled({ problem, children }: { problem?: MessageKey; children: (props: ControlProps) => React.ReactNode }) {
  const id = useId();
  return (
    <span className="flex flex-col gap-1">
      {children(problem ? { 'aria-describedby': id, 'aria-invalid': true } : {})}
      {problem && (
        <span id={id} className="text-[12px] text-danger-fg">
          {t(problem)}
        </span>
      )}
    </span>
  );
}

function IconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-8 place-items-center rounded-control text-fg-muted hover:bg-divider hover:text-fg">
      <X size={15} aria-hidden="true" />
    </button>
  );
}
