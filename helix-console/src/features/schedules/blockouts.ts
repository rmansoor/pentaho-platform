import type { ScheduledJob } from '../../api/scheduler';
import { browserTimeZone, buildTrigger, cronFor, describeForm, recurrenceFromJob, recurrenceProblem, type Recurrence } from './schedule-form';

/*
 * Blockout times: windows in which no schedule runs (a run that falls inside one is skipped).
 *
 * A blockout is a scheduler job of its own (BlockoutAction) with a recurrence and a duration in
 * milliseconds; POST /blockout/add takes the same trigger fields as a schedule plus
 * { duration, timeZone }. The server renames every blockout "BlockoutAction".
 *
 * Conflicts are worked out here rather than with POST /blockout/blockstatus: on 11.1 that answers
 * "not blocked" for a daily run inside a weekday blockout, and "partially blocked" for a single run
 * outside every window. Instead we list a schedule's runs over the next weeks, in its own time zone,
 * and count those that start inside a blockout window (inclusive at both ends, as the server checks).
 */

const DAY = 86_400_000;
export const HORIZON_DAYS = 28;
const MAX_RUNS = 500;

// ---------------------------------------------------------------------------------------------
// Time zones

interface Wall {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    };
    try {
      f = new Intl.DateTimeFormat('en-US', { ...options, timeZone });
    } catch {
      f = new Intl.DateTimeFormat('en-US', options); // unknown zone: the browser's own
    }
    formatters.set(timeZone, f);
  }
  return f;
}

function wallClock(t: number, timeZone: string): Wall {
  const parts = formatter(timeZone).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute'), s: get('second') };
}

/** Milliseconds the zone is ahead of UTC at instant t. */
function offsetAt(t: number, timeZone: string): number {
  const w = wallClock(t, timeZone);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(t / 1000) * 1000;
}

/** The instant at which the zone's clock shows this wall-clock time. */
export function zonedInstant(y: number, m: number, d: number, h: number, mi: number, s: number, timeZone: string): number {
  const wall = Date.UTC(y, m - 1, d, h, mi, s);
  const first = wall - offsetAt(wall, timeZone);
  return wall - offsetAt(first, timeZone);
}

// ---------------------------------------------------------------------------------------------
// Quartz cron (seconds minutes hours day-of-month month day-of-week [year])

interface Cron {
  sec: number[];
  min: number[];
  hour: number[];
  dom: Set<number> | null;
  month: Set<number> | null;
  dow: Set<number> | null;
  year: Set<number> | null;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** Values a field allows, 'any' for * and ?, or null for syntax we don't evaluate (L, W, #). */
function parseField(text: string, lo: number, hi: number, names?: string[]): number[] | 'any' | null {
  if (text === '*' || text === '?') return 'any';
  const value = (v: string) => {
    const named = names?.indexOf(v.toUpperCase()) ?? -1;
    const n = named >= 0 ? named + lo : /^\d+$/.test(v) ? Number(v) : NaN;
    return n >= lo && n <= hi ? n : NaN;
  };
  const out = new Set<number>();
  for (const part of text.split(',')) {
    const [range = '', stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) return null;
    let a: number;
    let b: number;
    if (range === '*') [a, b] = [lo, hi];
    else if (range.includes('-')) {
      const [x = '', y = ''] = range.split('-');
      [a, b] = [value(x), value(y)];
    } else {
      a = value(range);
      b = stepText === undefined ? a : hi;
    }
    if (Number.isNaN(a) || Number.isNaN(b) || a > b) return null;
    for (let n = a; n <= b; n += step) out.add(n);
  }
  return [...out].sort((x, y) => x - y);
}

export function parseCron(expr: string): Cron | null {
  const f = expr.trim().split(/\s+/);
  if (f.length < 6 || f.length > 7) return null;
  const sec = parseField(f[0]!, 0, 59);
  const min = parseField(f[1]!, 0, 59);
  const hour = parseField(f[2]!, 0, 23);
  const dom = parseField(f[3]!, 1, 31);
  const month = parseField(f[4]!, 1, 12, MONTHS);
  const dow = parseField(f[5]!, 1, 7, DAYS);
  const year = f[6] === undefined ? 'any' : parseField(f[6], 1970, 2199);
  if (!sec || !min || !hour || !dom || !month || !dow || !year) return null;
  const all = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const set = (v: number[] | 'any') => (v === 'any' ? null : new Set(v));
  return {
    sec: sec === 'any' ? all(0, 59) : sec,
    min: min === 'any' ? all(0, 59) : min,
    hour: hour === 'any' ? all(0, 23) : hour,
    dom: set(dom),
    month: set(month),
    dow: set(dow),
    year: set(year),
  };
}

function cronTimes(cron: Cron, timeZone: string, from: number, to: number, limit: number): number[] {
  const out: number[] = [];
  const first = wallClock(from, timeZone);
  const last = wallClock(to, timeZone);
  const lastDay = Date.UTC(last.y, last.m - 1, last.d);
  for (let day = Date.UTC(first.y, first.m - 1, first.d); day <= lastDay; day += DAY) {
    const date = new Date(day);
    const [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
    if ((cron.year && !cron.year.has(y)) || (cron.month && !cron.month.has(m))) continue;
    if ((cron.dom && !cron.dom.has(d)) || (cron.dow && !cron.dow.has(date.getUTCDay() + 1))) continue;
    for (const h of cron.hour)
      for (const mi of cron.min)
        for (const s of cron.sec) {
          const t = zonedInstant(y, m, d, h, mi, s, timeZone);
          if (t < from) continue;
          if (t > to || out.length >= limit) return out;
          out.push(t);
        }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// When things run

export type RunSpec =
  | { kind: 'once'; start: number }
  | { kind: 'simple'; start: number; end: number | null; interval: number }
  | { kind: 'cron'; start: number; end: number | null; cron: Cron; timeZone: string };

const parseDay = (date: string) => date.split('-').map(Number) as [number, number, number];
const parseTime = (time: string) => time.split(':').map(Number) as [number, number];

/** The runs a recurrence describes, or null if it can't be evaluated here (or isn't complete). */
export function specFromRecurrence(rec: Recurrence): RunSpec | null {
  if (recurrenceProblem(rec)) return null;
  const tz = rec.timeZone || browserTimeZone();
  const [y, m, d] = parseDay(rec.startDate);
  const [h, mi] = parseTime(rec.startTime);
  const start = zonedInstant(y, m, d, h, mi, 0, tz);
  const end = rec.endDate && rec.repeat !== 'once' ? zonedInstant(...parseDay(rec.endDate), 23, 59, 59, tz) : null;
  switch (rec.repeat) {
    case 'once':
      return { kind: 'once', start };
    case 'minutes':
    case 'hours':
    case 'daily':
      return { kind: 'simple', start, end, interval: rec.repeat === 'daily' ? DAY : rec.interval * (rec.repeat === 'hours' ? 3_600_000 : 60_000) };
    default: {
      const cron = parseCron(cronFor(rec));
      return cron ? { kind: 'cron', start, end, cron, timeZone: tz } : null;
    }
  }
}

/** The runs of a saved job (schedule or blockout), from the trigger the server reports. */
export function specFromJob(job: ScheduledJob): RunSpec | null {
  const start = job.trigger.startTime?.getTime();
  if (start === undefined) return null;
  const end = job.trigger.endTime?.getTime() ?? null;
  if (job.trigger.cronString) {
    const cron = parseCron(job.trigger.cronString);
    return cron ? { kind: 'cron', start, end, cron, timeZone: job.trigger.timeZone || browserTimeZone() } : null;
  }
  const interval = (job.trigger.repeatInterval ?? 0) * 1000;
  if (job.trigger.uiPassParam === 'RUN_ONCE' || job.trigger.repeatCount === 0 || interval <= 0) return { kind: 'once', start };
  return { kind: 'simple', start, end, interval };
}

/** Start times between `from` and `to` (inclusive), oldest first, at most `limit`. */
export function fireTimes(spec: RunSpec, from: number, to: number, limit = MAX_RUNS): number[] {
  const lo = Math.max(from, spec.start);
  const hi = spec.kind === 'once' ? to : Math.min(to, spec.end ?? Infinity);
  if (lo > hi) return [];
  if (spec.kind === 'once') return spec.start >= from && spec.start <= to ? [spec.start] : [];
  if (spec.kind === 'cron') return cronTimes(spec.cron, spec.timeZone, lo, hi, limit);
  const out: number[] = [];
  for (let t = spec.start + Math.ceil((lo - spec.start) / spec.interval) * spec.interval; t <= hi && out.length < limit; t += spec.interval) out.push(t);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Blockouts and conflicts

export interface Blockout {
  job: ScheduledJob;
  spec: RunSpec;
  duration: number;
}

export function toBlockout(job: ScheduledJob): Blockout | null {
  const spec = specFromJob(job);
  const duration = job.trigger.duration ?? 0;
  return spec && duration > 0 ? { job, spec, duration } : null;
}

/** Whether some window of the blockout covers instant t: a window starts in [t - duration, t]. */
export function covers(blockout: Pick<Blockout, 'spec' | 'duration'>, t: number): boolean {
  return fireTimes(blockout.spec, t - blockout.duration, t, 1).length > 0;
}

export interface Conflict {
  /** Runs in the horizon. */
  runs: number;
  /** Of those, how many fall in a blockout. */
  blocked: number;
  firstBlocked: Date | null;
}

/** How many of the next weeks' runs fall in a blockout. */
export function conflictsFor(spec: RunSpec, blockouts: Array<Pick<Blockout, 'spec' | 'duration'>>, now = Date.now(), days = HORIZON_DAYS): Conflict {
  const runs = fireTimes(spec, now, now + days * DAY);
  const blocked = blockouts.length ? runs.filter((t) => blockouts.some((b) => covers(b, t))) : [];
  return { runs: runs.length, blocked: blocked.length, firstBlocked: blocked.length ? new Date(blocked[0]!) : null };
}

/** The sentence the schedule sheet shows, or null when nothing is blocked. */
export function describeConflict(c: Conflict): string | null {
  if (!c.blocked) return null;
  if (c.blocked === c.runs) {
    return c.runs === 1 ? 'This run falls in a blockout time, so it would be skipped.' : `Every run in the next ${HORIZON_DAYS / 7} weeks falls in a blockout time, so none of them would run.`;
  }
  return `${c.blocked} of the ${c.runs} runs in the next ${HORIZON_DAYS / 7} weeks fall in a blockout time and will be skipped.`;
}

// ---------------------------------------------------------------------------------------------
// The blockout form

export interface BlockoutForm {
  recurrence: Recurrence;
  /** How long it lasts. */
  hours: number;
  minutes: number;
}

export const durationOf = (form: Pick<BlockoutForm, 'hours' | 'minutes'>) => Math.round(((form.hours || 0) * 60 + (form.minutes || 0)) * 60_000);

const pad = (n: number) => String(n).padStart(2, '0');

/** Defaults for a new blockout: weeknights from 22:00 for 4 hours. */
export function newBlockoutForm(now = new Date()): BlockoutForm {
  return {
    recurrence: {
      repeat: 'weekly',
      interval: 1,
      weekdays: [2, 3, 4, 5, 6],
      dayOfMonth: now.getDate(),
      cron: '0 0 22 ? * 2-6',
      startDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      startTime: '22:00',
      endDate: '',
      timeZone: browserTimeZone(),
    },
    hours: 4,
    minutes: 0,
  };
}

export function blockoutFormFromJob(job: ScheduledJob): BlockoutForm {
  const base = newBlockoutForm();
  const total = Math.round((job.trigger.duration ?? 0) / 60_000);
  return { recurrence: recurrenceFromJob(job, base.recurrence), hours: Math.floor(total / 60), minutes: total % 60 };
}

export function blockoutProblem(form: BlockoutForm): string | null {
  const problem = recurrenceProblem(form.recurrence);
  if (problem) return problem;
  if (!(form.hours >= 0) || !(form.minutes >= 0) || form.minutes > 59) return 'Enter how long it lasts';
  const duration = durationOf(form);
  if (duration <= 0) return 'Enter how long it lasts';
  const spec = specFromRecurrence(form.recurrence);
  if (spec?.kind === 'simple' && duration >= spec.interval) return 'It lasts as long as it repeats, so nothing would ever run';
  return null;
}

/** The JSON body for POST /blockout/add and /blockout/update. */
export function buildBlockoutRequest(form: BlockoutForm) {
  return {
    jobName: 'Blockout',
    duration: durationOf(form),
    timeZone: form.recurrence.timeZone,
    ...buildTrigger(form.recurrence),
    jobParameters: [],
  };
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 60_000);
  const [d, h, m] = [Math.floor(total / 1440), Math.floor((total % 1440) / 60), total % 60];
  const part = (n: number, one: string) => (n ? `${n} ${one}${n === 1 ? '' : 's'}` : '');
  return [part(d, 'day'), part(h, 'hour'), part(m, 'minute')].filter(Boolean).join(' ') || '0 minutes';
}

/** "Weekdays at 22:00 for 4 hours, until 02:00 the next day". */
export function describeBlockout(rec: Recurrence, duration: number): string {
  const what = describeForm(rec);
  const [h, mi] = parseTime(rec.startTime);
  const endMinutes = h * 60 + mi + Math.round(duration / 60_000);
  const days = Math.floor(endMinutes / 1440);
  const until = `${pad(Math.floor((endMinutes % 1440) / 60))}:${pad(endMinutes % 60)}`;
  const minutesOrHours = rec.repeat === 'minutes' || rec.repeat === 'hours' || rec.repeat === 'cron';
  const tail = minutesOrHours ? '' : `, until ${until}${days === 1 ? ' the next day' : days > 1 ? ` ${days} days later` : ''}`;
  return `${what} for ${formatDuration(duration)}${tail}`;
}
