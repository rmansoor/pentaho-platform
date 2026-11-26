import { z } from 'zod';
import { ApiError, getJson, getText, PLUGIN_ROOT, send, sendOk } from './http';

/*
 * Scheduler plugin REST API (v1): /pentaho/plugin/scheduler-plugin/api/scheduler/...
 *
 * The server logs every v1 call as deprecated in favour of /api/v2/scheduler, but no 11.1 build
 * ships v2 yet (404), so this client targets v1 and keeps the mapping here in one place.
 *
 * Live 11.1 shapes: GET /getJobs -> {job: Job | Job[]}, numbers and dates as strings,
 * jobParams as {jobParams: [{name, value}]}, state NORMAL | PAUSED | COMPLETE | ERROR | BLOCKED.
 * POST /pauseJob, /resumeJob, /triggerNow take {"jobId"} and answer text/plain.
 */

const BASE = `${PLUGIN_ROOT}/scheduler-plugin/api/scheduler`;

export type JobState = 'active' | 'paused' | 'complete' | 'error' | 'blocked' | 'unknown';

export interface ScheduledJob {
  id: string;
  name: string;
  owner: string;
  state: JobState;
  /** The report or transformation the schedule runs. */
  inputFile?: string;
  nextRun: Date | null;
  lastRun: Date | null;
  /** Plain-language recurrence ("Every day at 6:00 AM"). */
  recurrence: string;
  /** Folder the output is written to, from the stream provider parameter. */
  outputFolder?: string;
  /** Set for system jobs that run an action class instead of a file (e.g. the content cleaner). */
  actionClass?: string;
  /** Job parameters by name (string values). */
  params: Record<string, string>;
  /** Raw trigger fields, for editing. */
  trigger: {
    type: string;
    uiPassParam?: string;
    cronString?: string;
    timeZone?: string;
    startTime?: Date | null;
    endTime?: Date | null;
    repeatInterval?: number;
  };
}

const loose = z.union([z.string(), z.number()]).nullish();
const asNumber = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? undefined : Number(v));
const asDate = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(typeof v === 'number' || /^\d+$/.test(String(v)) ? Number(v) : String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

const triggerSchema = z
  .object({
    '@type': z.string().nullish(),
    uiPassParam: z.string().nullish(),
    cronString: z.string().nullish(),
    cronDescription: z.string().nullish(),
    repeatInterval: loose,
    repeatCount: loose,
    startTime: loose,
    endTime: loose,
    timeZone: z.string().nullish(),
  })
  .passthrough();

const paramSchema = z.object({ name: z.string(), value: z.unknown() });

const jobSchema = z.object({
  jobId: z.string(),
  jobName: z.string().nullish(),
  userName: z.string().nullish(),
  state: z.string().nullish(),
  nextRun: loose,
  lastRun: loose,
  jobTrigger: triggerSchema.nullish(),
  jobParams: z
    .object({ jobParams: z.union([paramSchema, z.array(paramSchema)]).nullish() })
    .nullish(),
});

const jobsSchema = z.object({
  job: z
    .union([jobSchema, z.array(jobSchema)])
    .nullish()
    .transform((v) => (v == null ? [] : Array.isArray(v) ? v : [v])),
});

const STATE: Record<string, JobState> = {
  NORMAL: 'active',
  PAUSED: 'paused',
  COMPLETE: 'complete',
  ERROR: 'error',
  BLOCKED: 'blocked',
};

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const UNIT: Record<number, [string, string]> = {
  1: ['second', 'seconds'],
  60: ['minute', 'minutes'],
  3600: ['hour', 'hours'],
  86400: ['day', 'days'],
  604800: ['week', 'weeks'],
};

/** A schedule's recurrence in plain words, from the fields the server sends. */
export function describeRecurrence(trigger: z.output<typeof triggerSchema> | null | undefined): string {
  if (!trigger) return '—';
  const start = asDate(trigger.startTime);
  const at = start ? ` at ${timeFormat.format(start)}` : '';
  const type = trigger['@type'] ?? '';
  const count = asNumber(trigger.repeatCount);
  const interval = asNumber(trigger.repeatInterval) ?? 0;

  if (trigger.uiPassParam === 'RUN_ONCE' || (type === 'simpleJobTrigger' && count === 0)) {
    return start ? `Once, ${dateFormat.format(start)}` : 'Once';
  }
  if (type === 'simpleJobTrigger' && interval > 0) {
    // Largest unit that divides the interval evenly: 86400 -> "day", 7200 -> "2 hours".
    const size = [604800, 86400, 3600, 60, 1].find((s) => interval % s === 0) ?? 1;
    const n = interval / size;
    const [one, many] = UNIT[size]!;
    const every = n === 1 ? `Every ${one}` : `Every ${n} ${many}`;
    return size >= 86400 ? `${every}${at}` : every;
  }
  if (trigger.cronDescription) {
    const text = trigger.cronDescription.trim();
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  if (trigger.cronString) return `Cron: ${trigger.cronString}`;
  return '—';
}

/** "input file = /a/b.prpt:outputFile = /home/admin/Name.*" -> "/home/admin". */
export function outputFolderOf(streamProvider: string | undefined): string | undefined {
  const match = streamProvider ? /outputFile\s*=\s*(.+)$/.exec(streamProvider) : null;
  if (!match) return undefined;
  const out = match[1]!.trim();
  return out.slice(0, out.lastIndexOf('/')) || '/';
}

/** Parses GET /getJobs. Exported for tests. */
export function parseJobsResponse(json: unknown): ScheduledJob[] {
  return jobsSchema.parse(json).job.map((job) => {
    const raw = job.jobParams?.jobParams;
    const params = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
    const param = (name: string) => {
      const value = params.find((p) => p.name === name)?.value;
      return typeof value === 'string' ? value : Array.isArray(value) ? String(value[0] ?? '') : undefined;
    };
    return {
      id: job.jobId,
      name: job.jobName || job.jobId.split('\t')[1] || job.jobId,
      owner: job.userName || param('ActionAdapterQuartzJob-ActionUser') || '',
      state: STATE[job.state ?? ''] ?? 'unknown',
      inputFile: param('ActionAdapterQuartzJob-StreamProvider-InputFile') || undefined,
      nextRun: asDate(job.nextRun),
      lastRun: asDate(job.lastRun),
      recurrence: describeRecurrence(job.jobTrigger),
      outputFolder: outputFolderOf(param('ActionAdapterQuartzJob-StreamProvider')),
      actionClass: param('ActionAdapterQuartzJob-ActionClass') || undefined,
      params: Object.fromEntries(
        params.flatMap((p) => {
          const v = Array.isArray(p.value) ? p.value[0] : p.value;
          return typeof v === 'string' || typeof v === 'number' ? [[p.name, String(v)]] : [];
        }),
      ),
      trigger: {
        type: job.jobTrigger?.['@type'] ?? '',
        uiPassParam: job.jobTrigger?.uiPassParam ?? undefined,
        cronString: job.jobTrigger?.cronString ?? undefined,
        timeZone: job.jobTrigger?.timeZone ?? undefined,
        startTime: asDate(job.jobTrigger?.startTime),
        endTime: asDate(job.jobTrigger?.endTime),
        repeatInterval: asNumber(job.jobTrigger?.repeatInterval),
      },
    };
  });
}

export type SchedulerStatus = 'running' | 'paused' | 'stopped' | 'unknown';

export interface SchedulerSource {
  listJobs(signal?: AbortSignal): Promise<ScheduledJob[]>;
  pauseJob(id: string): Promise<void>;
  resumeJob(id: string): Promise<void>;
  runNow(id: string): Promise<void>;
  removeJob(id: string): Promise<void>;
  status(signal?: AbortSignal): Promise<SchedulerStatus>;
  /** Pause or start the whole scheduler (administrators). */
  setStatus(running: boolean): Promise<void>;
  /** POST /job; returns the new job id. */
  createJob(request: object): Promise<string>;
  /** POST /job/update; the request carries the jobId. Returns the (possibly new) job id. */
  updateJob(request: object): Promise<string>;
}

async function postJob(path: string, request: object): Promise<string> {
  const response = await send('POST', path, { body: JSON.stringify(request), contentType: 'application/json', accept: 'text/plain' });
  if (!response.ok) throw new ApiError(response.status, path, `The server refused the schedule (${response.status}).`);
  return (await response.text()).trim();
}

const jobBody = (id: string) => ({ body: JSON.stringify({ jobId: id }), contentType: 'application/json', accept: 'text/plain' });

export const httpSchedulerSource: SchedulerSource = {
  async listJobs(signal) {
    return parseJobsResponse(await getJson(`${BASE}/getJobs`, z.unknown(), signal));
  },
  pauseJob: (id) => sendOk('POST', `${BASE}/pauseJob`, jobBody(id)),
  resumeJob: (id) => sendOk('POST', `${BASE}/resumeJob`, jobBody(id)),
  runNow: (id) => sendOk('POST', `${BASE}/triggerNow`, jobBody(id)),
  removeJob: (id) => sendOk('DELETE', `${BASE}/removeJob`, jobBody(id)),
  async status(signal) {
    const text = (await getText(`${BASE}/state`, signal, 'text/plain')).trim().toUpperCase();
    return text === 'RUNNING' ? 'running' : text === 'PAUSED' ? 'paused' : text === 'STOPPED' ? 'stopped' : 'unknown';
  },
  setStatus: (running) => sendOk('POST', `${BASE}/${running ? 'start' : 'pause'}`, { accept: 'text/plain' }),
  createJob: (request) => postJob(`${BASE}/job`, request),
  updateJob: (request) => postJob(`${BASE}/job/update`, request),
};

/** Action class of the generated-content cleaner (GeneratedContentCleaner). */
export const CONTENT_CLEANER = 'org.pentaho.platform.admin.GeneratedContentCleaner';
const DAY_MS = 86_400_000;

/**
 * The scheduled (repeating) content cleaner, if any. Found from the job list rather than
 * GET /getContentCleanerJob, which returns the first cleaner job it finds, including finished
 * one-off "delete now" runs.
 */
export function findScheduledCleaner(jobs: ScheduledJob[]): { job: ScheduledJob; olderThanDays: number } | null {
  const job = jobs.find(
    (j) => j.actionClass === CONTENT_CLEANER && j.state !== 'complete' && (j.trigger.type !== 'simpleJobTrigger' || (j.trigger.repeatInterval ?? 0) > 0),
  );
  if (!job) return null;
  return { job, olderThanDays: Math.round(Number(job.params.age ?? 0) / DAY_MS) };
}

/** Request for a cleaner job: once now, or daily at a time. Same fields the GWT settings panel sends. */
export function contentCleanerRequest(olderThanDays: number, owner: string, daily?: { hour: number; minute: number; start: Date }) {
  const age = String(Math.round(olderThanDays * DAY_MS));
  const jobParameters = [
    { name: 'age', type: 'string', stringValue: [age] },
    { name: 'ActionAdapterQuartzJob-ActionUser', type: 'string', stringValue: [owner] },
  ];
  if (!daily) {
    return {
      jobName: 'Content Cleaner',
      actionClass: CONTENT_CLEANER,
      jobParameters,
      simpleJobTrigger: { endTime: null, repeatCount: 0, repeatInterval: 0, uiPassParam: 'RUN_ONCE' },
    };
  }
  return {
    jobName: 'GeneratedContentCleaner',
    actionClass: CONTENT_CLEANER,
    jobParameters,
    simpleJobTrigger: {
      endTime: null,
      repeatCount: -1,
      repeatInterval: 86400,
      uiPassParam: 'DAILY',
      startHour: daily.hour,
      startMin: daily.minute,
      startYear: daily.start.getFullYear() - 1900,
      startMonth: daily.start.getMonth(),
      startDay: daily.start.getDate(),
    },
  };
}
