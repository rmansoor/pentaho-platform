import type { ScheduledJob } from '../../api/scheduler';

/*
 * The schedule wizard's state and its translation to the scheduler plugin's JobScheduleRequest.
 *
 * Encoding (matches what the server accepts from the GWT dialog):
 * - once, minutes, hours, daily -> simpleJobTrigger { uiPassParam, repeatInterval (seconds),
 *   repeatCount (-1 forever, 0 once), startHour/Min/Year/Month/Day, endTime }
 * - weekly, monthly, cron -> cronJobTrigger { uiPassParam: "CRON", cronString, start..., endTime }
 *   Weekly days are sent as Quartz numbers (SUN=1..SAT=7), never names: servers without the
 *   day-of-week fix shift named days a day earlier.
 * Start fields use java.util.Date offsets: startYear = year - 1900, startMonth = month - 1.
 * The owner goes in as the ActionAdapterQuartzJob-ActionUser parameter (EE refuses jobs without it).
 * Report parameters come from the content's own prompt (see ReportParameters) and are sent as
 * job parameters, typed like the GWT dialog types them. Email goes in as _SCH_EMAIL_* parameters.
 */

export interface JobParameter {
  name: string;
  type: string;
  stringValue: string[];
}

export interface ScheduleEmail {
  enabled: boolean;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  message: string;
  attachmentName: string;
}

const EMAIL_KEYS = {
  to: '_SCH_EMAIL_TO',
  cc: '_SCH_EMAIL_CC',
  bcc: '_SCH_EMAIL_BCC',
  subject: '_SCH_EMAIL_SUBJECT',
  message: '_SCH_EMAIL_MESSAGE',
  attachmentName: '_SCH_EMAIL_ATTACHMENT_NAME',
} as const;

export const ACTION_USER = 'ActionAdapterQuartzJob-ActionUser';

/**
 * Job parameters the console sets itself or the server adds; never sent as report parameters and
 * never fed back into the report prompt.
 */
export function isSystemParameter(name: string): boolean {
  return name.startsWith('_SCH_EMAIL') || name.startsWith('ActionAdapterQuartzJob-') || name === 'lineage-id' || name === 'uiPassParam';
}

const isDate = (v: unknown): v is Date => Object.prototype.toString.call(v) === '[object Date]';
const pad3 = (n: number) => String(n).padStart(3, '0');
/** GWT's ISO_8601 format: 2026-11-26T09:00:00.000-05:00. */
function isoWithOffset(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad3(d.getMilliseconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * The prompt's getParams() map as job parameters, typed exactly as ScheduleParamsWizardPanel does
 * (number, boolean, date, string, or the [] forms; anything else is dropped). Dates are checked by
 * tag, not instanceof, because they come from the prompt's iframe.
 */
export function toJobParameters(values: Record<string, unknown>): JobParameter[] {
  const out: JobParameter[] = [];
  const one = (v: unknown): [string, string] | null =>
    typeof v === 'number' ? ['number', String(v)]
    : typeof v === 'boolean' ? ['boolean', v ? 'true' : 'false']
    : isDate(v) ? ['date', isoWithOffset(v)]
    : typeof v === 'string' ? ['string', v]
    : null;
  for (const [name, value] of Object.entries(values)) {
    if (isSystemParameter(name)) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      let type: string | null = null;
      const list: string[] = [];
      for (const item of value) {
        const typed = one(item);
        if (typed) {
          type ??= `${typed[0]}[]`;
          list.push(typed[1]);
        }
      }
      if (type) out.push({ name, type, stringValue: list });
    } else {
      const typed = one(value);
      if (typed) out.push({ name, type: typed[0], stringValue: [typed[1]] });
    }
  }
  return out;
}

export function emailParameters(email: ScheduleEmail): JobParameter[] {
  if (!email.enabled) return [];
  return (Object.keys(EMAIL_KEYS) as Array<keyof typeof EMAIL_KEYS>).map((k) => ({
    name: EMAIL_KEYS[k],
    type: 'string',
    stringValue: [email[k].trim()],
  }));
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
/** Comma- or semicolon-separated addresses; empty is fine when `optional`. */
export function addressProblem(list: string, optional: boolean): boolean {
  const parts = list.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return !optional;
  return parts.some((p) => !EMAIL_RE.test(p));
}

export type Repeat = 'once' | 'minutes' | 'hours' | 'daily' | 'weekly' | 'monthly' | 'cron';

export interface ScheduleForm {
  name: string;
  outputFolder: string;
  repeat: Repeat;
  /** Every N minutes / hours. */
  interval: number;
  /** Quartz day numbers, 1 = Sunday … 7 = Saturday. */
  weekdays: number[];
  /** 1–31 for monthly. */
  dayOfMonth: number;
  cron: string;
  /** yyyy-mm-dd and HH:mm, in `timeZone`. */
  startDate: string;
  startTime: string;
  /** yyyy-mm-dd or '' for no end. */
  endDate: string;
  timeZone: string;
  email: ScheduleEmail;
  /** Report parameter values saved with the job being edited, to prefill the prompt. */
  savedParameters: Record<string, string[]>;
  /** Server-side parameters to carry over unchanged on edit (lineage-id). */
  keep: JobParameter[];
}

/** The "when" part of a schedule, shared with blockout times. */
export type Recurrence = Pick<ScheduleForm, 'repeat' | 'interval' | 'weekdays' | 'dayOfMonth' | 'cron' | 'startDate' | 'startTime' | 'endDate' | 'timeZone'>;

export const WEEKDAYS: { value: number; short: string; long: string }[] = [
  { value: 2, short: 'Mon', long: 'Monday' },
  { value: 3, short: 'Tue', long: 'Tuesday' },
  { value: 4, short: 'Wed', long: 'Wednesday' },
  { value: 5, short: 'Thu', long: 'Thursday' },
  { value: 6, short: 'Fri', long: 'Friday' },
  { value: 7, short: 'Sat', long: 'Saturday' },
  { value: 1, short: 'Sun', long: 'Sunday' },
];

const pad = (n: number) => String(n).padStart(2, '0');
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Defaults for a new schedule of `file`: daily at the next whole hour, from today. */
export function newScheduleForm(file: string, home: string, now = new Date(), title?: string): ScheduleForm {
  const name = title?.trim() || file.slice(file.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return {
    name,
    outputFolder: home,
    repeat: 'daily',
    interval: 1,
    weekdays: [2, 3, 4, 5, 6],
    dayOfMonth: next.getDate(),
    cron: '0 0 7 ? * 2-6',
    startDate: localDate(next),
    startTime: `${pad(next.getHours())}:00`,
    endDate: '',
    timeZone: browserTimeZone(),
    email: { enabled: false, to: '', cc: '', bcc: '', subject: name, message: '', attachmentName: name },
    savedParameters: {},
    keep: [],
  };
}

/** Why the form can't be saved yet, or null. */
export function scheduleFormProblem(form: ScheduleForm): string | null {
  if (!form.name.trim()) return 'Give the schedule a name';
  if (/[\\/\t]/.test(form.name)) return 'Names can\'t contain "/", "\\" or tabs';
  if (!form.outputFolder.startsWith('/')) return 'Choose a folder for the output';
  return recurrenceProblem(form) ?? emailProblem(form.email);
}

/** Why a recurrence isn't complete yet, or null. */
export function recurrenceProblem(form: Recurrence): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.startDate) || !/^\d{2}:\d{2}$/.test(form.startTime)) return 'Choose when it starts';
  if ((form.repeat === 'minutes' || form.repeat === 'hours') && !(form.interval >= 1)) return 'Enter how often it repeats';
  if (form.repeat === 'weekly' && form.weekdays.length === 0) return 'Choose at least one day';
  if (form.repeat === 'monthly' && !(form.dayOfMonth >= 1 && form.dayOfMonth <= 31)) return 'Choose a day of the month';
  if (form.repeat === 'cron' && form.cron.trim().split(/\s+/).length < 6) return 'A cron expression has at least six fields';
  if (form.endDate && form.endDate < form.startDate) return 'The end date is before the start date';
  return null;
}

function emailProblem(email: ScheduleEmail): string | null {
  if (!email.enabled) return null;
  if (addressProblem(email.to, false)) return 'Enter valid email addresses to send to';
  if (addressProblem(email.cc, true) || addressProblem(email.bcc, true)) return 'Check the Cc and Bcc addresses';
  if (!email.attachmentName.trim()) return 'Name the attachment';
  return null;
}

/** "2-6" for Mon–Fri, "2,4,6" otherwise; days sorted Sunday-first as Quartz expects. */
export function weekdaysToCron(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const contiguous = sorted.length > 2 && sorted.every((d, i) => i === 0 || d === sorted[i - 1]! + 1);
  return contiguous ? `${sorted[0]}-${sorted.at(-1)}` : sorted.join(',');
}

/** The Quartz cron expression for weekly, monthly and cron recurrences. */
export function cronFor(form: Recurrence): string {
  const [h, m] = form.startTime.split(':').map(Number) as [number, number];
  if (form.repeat === 'weekly') return `0 ${m} ${h} ? * ${weekdaysToCron(form.weekdays)}`;
  if (form.repeat === 'monthly') return `0 ${m} ${h} ${form.dayOfMonth} * ?`;
  return form.cron.trim();
}

const SECONDS: Partial<Record<Repeat, number>> = { minutes: 60, hours: 3600, daily: 86400 };
const UI_PASS: Partial<Record<Repeat, string>> = { once: 'RUN_ONCE', minutes: 'MINUTES', hours: 'HOURS', daily: 'DAILY' };

/** The JSON body for POST /job (and /job/update with `jobId`). `reportParameters` come from the prompt. */
export function buildScheduleRequest(form: ScheduleForm, inputFile: string, owner: string, jobId?: string, reportParameters: JobParameter[] = []) {
  return {
    ...(jobId ? { jobId } : {}),
    jobName: form.name.trim(),
    inputFile,
    outputFile: form.outputFolder,
    timeZone: form.timeZone,
    ...buildTrigger(form),
    jobParameters: [
      ...reportParameters.filter((p) => !isSystemParameter(p.name)),
      ...emailParameters(form.email),
      ...form.keep,
      { name: ACTION_USER, type: 'string', stringValue: [owner] },
    ],
  };
}

/** The trigger half of a JobScheduleRequest: { simpleJobTrigger } or { cronJobTrigger }. */
export function buildTrigger(form: Recurrence) {
  const [year, month, day] = form.startDate.split('-').map(Number) as [number, number, number];
  const [hour, minute] = form.startTime.split(':').map(Number) as [number, number];
  const start = { startHour: hour, startMin: minute, startYear: year - 1900, startMonth: month - 1, startDay: day };
  const endTime = form.endDate && form.repeat !== 'once' ? `${form.endDate}T23:59:59` : null;

  return form.repeat in UI_PASS
      ? {
          simpleJobTrigger: {
            uiPassParam: UI_PASS[form.repeat],
            repeatInterval: form.repeat === 'once' ? 0 : (SECONDS[form.repeat] ?? 0) * (form.repeat === 'daily' ? 1 : form.interval),
            repeatCount: form.repeat === 'once' ? 0 : -1,
            ...start,
            endTime,
          },
        }
    : { cronJobTrigger: { uiPassParam: 'CRON', cronString: cronFor(form), ...start, endTime } };
}

/** Plain-language summary of what the form will do. */
export function describeForm(form: Recurrence): string {
  const at = form.startTime;
  switch (form.repeat) {
    case 'once':
      return `Once, on ${form.startDate} at ${at}`;
    case 'minutes':
      return form.interval === 1 ? 'Every minute' : `Every ${form.interval} minutes`;
    case 'hours':
      return form.interval === 1 ? 'Every hour' : `Every ${form.interval} hours`;
    case 'daily':
      return `Every day at ${at}`;
    case 'weekly': {
      const names = WEEKDAYS.filter((d) => form.weekdays.includes(d.value)).map((d) => d.short);
      const weekdaysOnly = weekdaysToCron(form.weekdays) === '2-6';
      return `${weekdaysOnly ? 'Weekdays' : names.join(', ') || 'No days'} at ${at}`;
    }
    case 'monthly':
      return `Monthly on day ${form.dayOfMonth} at ${at}`;
    case 'cron':
      return `Cron: ${form.cron.trim()}`;
  }
}

/** Date and time of `date` as seen in `timeZone` ("2026-11-26", "06:30"). */
export function partsInZone(date: Date, timeZone: string): { date: string; time: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
  } catch {
    return { date: localDate(date), time: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/** Starts editing an existing job: maps its trigger back onto the form where it can. */
export function formFromJob(job: ScheduledJob, home: string): ScheduleForm {
  const base = newScheduleForm(job.inputFile ?? '/x', home);
  return {
    ...base,
    ...recurrenceFromJob(job, base),
    name: job.name,
    outputFolder: job.outputFolder ?? home,
    email: emailFromParams(job.params, job.name),
    savedParameters: Object.fromEntries(Object.entries(job.paramLists ?? {}).filter(([name]) => !isSystemParameter(name))),
    keep: job.params['lineage-id'] ? [{ name: 'lineage-id', type: 'string', stringValue: [job.params['lineage-id']] }] : [],
  };
}

/** Maps a job's trigger back onto the recurrence fields where it can; `base` fills the rest. */
export function recurrenceFromJob(job: ScheduledJob, base: Recurrence): Recurrence {
  const timeZone = job.trigger.timeZone ?? base.timeZone;
  // Start times are instants; show them as wall-clock time in the schedule's own time zone.
  const start = job.trigger.startTime ? partsInZone(job.trigger.startTime, timeZone) : null;
  const form: Recurrence = {
    ...base,
    timeZone,
    startDate: start?.date ?? base.startDate,
    startTime: start?.time ?? base.startTime,
    endDate: job.trigger.endTime ? partsInZone(job.trigger.endTime, timeZone).date : '',
  };
  const interval = job.trigger.repeatInterval ?? 0;
  if (job.trigger.type === 'simpleJobTrigger') {
    if (job.trigger.uiPassParam === 'RUN_ONCE' || interval === 0) return { ...form, repeat: 'once' };
    if (interval % 86400 === 0) return { ...form, repeat: 'daily' };
    if (interval % 3600 === 0) return { ...form, repeat: 'hours', interval: interval / 3600 };
    return { ...form, repeat: 'minutes', interval: Math.max(1, Math.round(interval / 60)) };
  }
  const cron = job.trigger.cronString?.trim() ?? '';
  const weekly = /^0 (\d+) (\d+) \? \* ([\d,-]+)(?: \*)?$/.exec(cron);
  if (weekly) {
    const days = weekly[3]!.split(',').flatMap((part) => {
      const [a, b] = part.split('-').map(Number) as [number, number | undefined];
      return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
    });
    return { ...form, repeat: 'weekly', weekdays: days, startTime: `${pad(Number(weekly[2]))}:${pad(Number(weekly[1]))}` };
  }
  const monthly = /^0 (\d+) (\d+) (\d+) \* \?(?: \*)?$/.exec(cron);
  if (monthly) {
    return { ...form, repeat: 'monthly', dayOfMonth: Number(monthly[3]), startTime: `${pad(Number(monthly[2]))}:${pad(Number(monthly[1]))}` };
  }
  return { ...form, repeat: 'cron', cron: cron || form.cron };
}

function emailFromParams(params: Record<string, string>, name: string): ScheduleEmail {
  const get = (k: keyof typeof EMAIL_KEYS) => params[EMAIL_KEYS[k]] ?? '';
  return {
    enabled: !!get('to').trim(),
    to: get('to'),
    cc: get('cc'),
    bcc: get('bcc'),
    subject: get('subject') || name,
    message: get('message'),
    attachmentName: get('attachmentName') || name,
  };
}
