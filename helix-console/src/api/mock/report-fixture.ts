/*
 * A stand-in for the reporting plugin's POST /api/repos/{id}/parameter, answering in the live XML
 * shape so the fixture exercises the real parser:
 *  - Inventory List: a multi-select toggle "line"; 5 pages per selected line; runs automatically.
 *  - Top Customers: "market" -> dependent, mandatory "country" list, and a number "top";
 *    waits for "View report".
 *  - Anything else: no parameters, one page.
 */

const FORMATS: [string, string][] = [
  ['HTML (Paginated)', 'table/html;page-mode=page'],
  ['HTML (Single Page)', 'table/html;page-mode=stream'],
  ['PDF', 'pageable/pdf'],
  ['Excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;page-mode=flow'],
  ['Comma Separated Value', 'table/csv;page-mode=stream'],
];

const COUNTRIES: Record<string, string[]> = { EMEA: ['France', 'Germany', 'Spain'], NA: ['Canada', 'USA'] };
const LINES = ['Classic Cars', 'Motorcycles', 'Ships'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

interface Param {
  name: string;
  label: string;
  type?: string;
  render: string;
  multi?: boolean;
  mandatory?: boolean;
  horizontal?: boolean;
  dependents?: boolean;
  choices: string[];
  selected: string[];
}

function param(p: Param): string {
  const a = (name: string, value: string) => `<attribute name="${name}" namespace="core" value="${esc(value)}"/>`;
  return (
    `<parameter is-list="${p.choices.length > 0}" is-mandatory="false" is-multi-select="${!!p.multi}" is-strict="${p.choices.length > 0}" name="${p.name}" type="${p.type ?? 'java.lang.String'}">` +
    a('role', 'user') +
    a('label', p.label) +
    a('parameter-render-type', p.render) +
    (p.mandatory ? a('mandatory', 'true') : '') +
    (p.horizontal ? a('parameter-layout', 'horizontal') : '') +
    (p.dependents ? `<attribute name="has-downstream-dependent-parameter" namespace="server" value="true"/>` : '') +
    `<values>${(p.choices.length ? p.choices : p.selected)
      .map((c) => `<value label="${esc(c)}" null="false" selected="${p.selected.includes(c)}" type="java.lang.String" value="${esc(c)}"/>`)
      .join('')}</values></parameter>`
  );
}

export function fixtureReportPrompt(file: string, body: string): string {
  const form = new URLSearchParams(body);
  const given = (name: string) => (form.has(name) ? form.getAll(name) : undefined);
  const format = given('output-target')?.[0] ?? FORMATS[0]![1];
  const xmlMode = form.get('renderMode') === 'XML';
  const params: Param[] = [];
  const errors: string[] = [];
  let pages = 1;
  let autoSubmit = true;

  if (file.endsWith('/Inventory List.prpt')) {
    const line = (given('line') ?? LINES).filter((l) => LINES.includes(l));
    params.push({ name: 'line', label: 'Line', render: 'togglebutton', multi: true, horizontal: true, choices: LINES, selected: line, type: '[Ljava.lang.String;' });
    pages = Math.max(1, line.length * 5);
  } else if (file.endsWith('/Top Customers.prpt')) {
    autoSubmit = false;
    const market = given('market')?.[0] ?? 'EMEA';
    const countries = COUNTRIES[market] ?? [];
    const asked = given('country');
    const country = asked ? asked.filter((c) => countries.includes(c)) : [countries[0]!];
    const top = given('top')?.[0] ?? '10';
    params.push({ name: 'market', label: 'Market', render: 'dropdown', dependents: true, choices: Object.keys(COUNTRIES), selected: [market] });
    params.push({ name: 'country', label: 'Country', render: 'list', mandatory: true, choices: countries, selected: country });
    params.push({ name: 'top', label: 'How many', render: 'textbox', type: 'java.lang.Integer', choices: [], selected: [top] });
    if (!country.length) errors.push('<error message="This prompt value is of an invalid value" parameter="country"/>');
    if (!/^\d+$/.test(top)) errors.push('<error message="Enter a whole number" parameter="top"/>');
  }

  const promptNeeded = errors.length > 0;
  const paged = format === FORMATS[0]![1];
  const page = Number(form.get('accepted-page') ?? 0);
  const root =
    `<parameters autoSubmitUI="true" is-prompt-needed="${promptNeeded}" layout="vertical"` +
    (xmlMode && !promptNeeded ? ` paginate="${paged}" page-count="${paged ? pages : 1}" accepted-page="${Math.min(page, pages - 1)}"` : '') +
    '>';
  const formats = `<parameter is-list="true" is-mandatory="true" is-multi-select="false" name="output-target" type="java.lang.String"><attribute name="role" namespace="core" value="system"/><values>${FORMATS.map(
    ([label, value]) => `<value label="${label}" selected="${value === format}" value="${esc(value)}"/>`,
  ).join('')}</values></parameter>`;
  const auto = `<parameter name="autoSubmit" type="java.lang.Boolean"><attribute name="role" namespace="core" value="system"/><attribute name="hidden" namespace="core" value="true"/><values><value label="${autoSubmit}" selected="true" value="${autoSubmit}"/></values></parameter>`;
  return `<?xml version="1.0" encoding="UTF-8"?>${root}${params.map(param).join('')}${formats}${auto}${errors.join('')}</parameters>`;
}
