import { toPathId } from './repo';

/*
 * Pentaho reports (.prpt), rendered by the reporting plugin, without its viewer page.
 *
 *   POST /api/repos/{id}/parameter   form body: parameter values + renderMode
 *     renderMode=PARAMETER  the parameters: labels, values, how to draw them, which are selected,
 *                           errors, and whether the report can run (is-prompt-needed)
 *     renderMode=XML        the same after paginating, plus page-count and accepted-page
 *   GET  /api/repos/{id}/report?…&output-target=…&accepted-page=N&renderMode=REPORT
 *     the rendered report (one HTML page, a PDF, a spreadsheet…), referencing its images and CSS
 *     through /pentaho/getImage, so it renders in a frame as is. Downloads use the same request:
 *     the answer is named after the report ("Inventory List.xlsx"). renderMode=DOWNLOAD is not for
 *     exports: on 11.1 it answers a 109-byte placeholder named "defaultnull".
 *
 * Values are sent as repeated form fields (a multi-select sends one per value). The server answers
 * with the corrected selection: after a change upstream, dependent lists come back with new values
 * and their stale selection dropped, which is how cascading parameters work.
 *
 * The plugin's own viewer runs reports as background jobs (/plugin/reporting/api/jobs) to show
 * progress; the console uses the synchronous endpoints, which every server has.
 */

export type ReportValues = Record<string, string[]>;

export interface ReportChoice {
  label: string;
  value: string;
  selected: boolean;
}

export type RenderType = 'dropdown' | 'list' | 'radio' | 'checkbox' | 'togglebutton' | 'textbox' | 'multi-line' | 'datepicker';

export interface ReportParameter {
  name: string;
  label: string;
  /** Java type: java.lang.String, java.lang.Integer, java.util.Date, [Ljava.lang.String; … */
  type: string;
  renderType: RenderType;
  multi: boolean;
  mandatory: boolean;
  /** Only listed values are allowed. */
  strict: boolean;
  list: boolean;
  choices: ReportChoice[];
  /** Horizontal or vertical layout for buttons, radios and checkboxes. */
  horizontal: boolean;
  /** Rows for a list box. */
  visibleItems?: number;
  /** Other parameters depend on this one, so a change reloads the prompt. */
  hasDependents: boolean;
}

export interface ReportPrompt {
  /** Values are missing or invalid; the report can't run yet. */
  promptNeeded: boolean;
  /** Run as soon as the values are valid (no "View report" button). */
  autoSubmit: boolean;
  /** From renderMode=XML: total pages of paginated output, and the page the server rendered. */
  pageCount?: number;
  acceptedPage?: number;
  /** Parameters people fill in, in report order. */
  parameters: ReportParameter[];
  /** Output formats ("HTML (Paginated)", "PDF"…) the report allows. */
  formats: ReportChoice[];
  /** Error messages by parameter name; '' holds report-wide errors. */
  errors: Record<string, string[]>;
}

export const PAGED_HTML = 'table/html;page-mode=page';

const RENDER_TYPES: RenderType[] = ['dropdown', 'list', 'radio', 'checkbox', 'togglebutton', 'textbox', 'multi-line', 'datepicker'];

/** Parses the XML from POST /api/repos/{id}/parameter. */
export function parseReportPrompt(xml: string): ReportPrompt {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const root = doc.documentElement;
  if (root.nodeName !== 'parameters') throw new Error(root.textContent?.trim().slice(0, 200) || 'Unexpected answer from the reporting plugin');

  const attr = (el: Element, name: string) => el.getAttribute(name);
  const number = (v: string | null) => (v === null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));
  const parameters: ReportParameter[] = [];
  let formats: ReportChoice[] = [];
  const systemValues: Record<string, string> = {};

  for (const p of Array.from(root.children).filter((c) => c.nodeName === 'parameter')) {
    const attrs: Record<string, string> = {};
    for (const a of Array.from(p.children).filter((c) => c.nodeName === 'attribute')) attrs[attr(a, 'name') ?? ''] = attr(a, 'value') ?? '';
    const choices: ReportChoice[] = Array.from(p.querySelectorAll(':scope > values > value')).map((v) => ({
      label: attr(v, 'label') ?? attr(v, 'value') ?? '',
      value: attr(v, 'value') ?? '',
      selected: attr(v, 'selected') === 'true',
    }));
    const name = attr(p, 'name') ?? '';
    if (name === 'output-target') {
      formats = choices;
      continue;
    }
    if (attrs.role === 'system') {
      const selected = choices.find((c) => c.selected);
      if (selected) systemValues[name] = selected.value;
      continue;
    }
    if (attrs.hidden === 'true') continue;
    const renderType = RENDER_TYPES.includes(attrs['parameter-render-type'] as RenderType) ? (attrs['parameter-render-type'] as RenderType) : 'textbox';
    parameters.push({
      name,
      label: attrs.label || name,
      type: attr(p, 'type') ?? 'java.lang.String',
      renderType,
      multi: attr(p, 'is-multi-select') === 'true',
      mandatory: attr(p, 'is-mandatory') === 'true' || attrs.mandatory === 'true',
      strict: attr(p, 'is-strict') === 'true',
      list: attr(p, 'is-list') === 'true',
      choices,
      horizontal: attrs['parameter-layout'] === 'horizontal',
      visibleItems: number(attrs['parameter-visible-items'] ?? null),
      hasDependents: attrs['has-downstream-dependent-parameter'] === 'true',
    });
  }

  const errors: Record<string, string[]> = {};
  for (const e of Array.from(root.querySelectorAll('error, global-error'))) {
    const key = e.nodeName === 'global-error' ? '' : (attr(e, 'parameter') ?? '');
    (errors[key] ??= []).push(attr(e, 'message') ?? e.textContent?.trim() ?? '');
  }

  const autoSubmitUI = attr(root, 'autoSubmitUI');
  return {
    promptNeeded: attr(root, 'is-prompt-needed') === 'true',
    // autoSubmit (set on the report) wins over autoSubmitUI (the server default).
    autoSubmit: (systemValues.autoSubmit ?? attr(root, 'autoSubmit') ?? autoSubmitUI) !== 'false',
    pageCount: number(attr(root, 'page-count')),
    acceptedPage: number(attr(root, 'accepted-page')),
    parameters,
    formats,
    errors,
  };
}

/** The values the server has selected, as the form state to edit. */
export function selectedValues(prompt: ReportPrompt): ReportValues {
  const values: ReportValues = {};
  for (const p of prompt.parameters) values[p.name] = p.choices.filter((c) => c.selected).map((c) => c.value);
  const format = prompt.formats.find((f) => f.selected);
  if (format) values['output-target'] = [format.value];
  return values;
}

function form(values: ReportValues, extra: Record<string, string>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [name, list] of Object.entries(values)) for (const v of list) body.append(name, v);
  for (const [name, v] of Object.entries(extra)) body.set(name, v);
  return body;
}

/** Form body for POST /parameter. */
export function promptBody(values: ReportValues, mode: 'PARAMETER' | 'XML', page = 0): string {
  return form(values, mode === 'XML' ? { renderMode: 'XML', 'accepted-page': String(page) } : { renderMode: 'PARAMETER' }).toString();
}

/** The URL of the rendered report: shown in a frame, or downloaded. */
export function reportUrl(file: string, values: ReportValues, options: { format: string; page?: number }): string {
  const query = form(values, {
    'output-target': options.format,
    'accepted-page': String(options.page ?? 0),
    renderMode: 'REPORT',
    htmlProportionalWidth: 'false',
  });
  return `/pentaho/api/repos/${toPathId(file)}/report?${query.toString()}`;
}

/** File extension for a download in `format` ("pdf", "xlsx"…). */
export function formatExtension(format: string): string {
  if (format.startsWith('pageable/pdf')) return 'pdf';
  if (format.includes('spreadsheetml')) return 'xlsx';
  if (format.includes('ms-excel') || format.includes('table/excel')) return 'xls';
  if (format.startsWith('table/csv')) return 'csv';
  if (format.startsWith('table/rtf')) return 'rtf';
  if (format.startsWith('pageable/text')) return 'txt';
  if (format.startsWith('mime-message')) return 'mht';
  return 'html';
}

/** Formats shown in the frame; the others download. */
export const isViewable = (format: string) => format.startsWith('table/html') || format.startsWith('pageable/pdf');

/**
 * A date picked in the form ("2026-11-26") in the shape the reporting plugin parses for
 * java.util.Date parameters: ISO 8601 with milliseconds and the browser's offset.
 */
export function dateValue(day: string, now = new Date()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const offset = -new Date(y, m - 1, d, 12).getTimezoneOffset() || -now.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${day}T00:00:00.000${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}${String(abs % 60).padStart(2, '0')}`;
}

/** The day part of a date value from the server ("2026-11-26T00:00:00.000-0500" -> "2026-11-26"). */
export const dayOf = (value: string) => value.slice(0, 10);

export const isDateType = (type: string) => /java\.(util|sql)\.(Date|Timestamp)/.test(type);
export const isNumberType = (type: string) => /java\.lang\.(Integer|Long|Short|Byte|Double|Float|Number)|java\.math\./.test(type);
