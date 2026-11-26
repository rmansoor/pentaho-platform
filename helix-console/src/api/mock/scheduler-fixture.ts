import { parseJobsResponse, type SchedulerSource, type SchedulerStatus } from '../scheduler';

/*
 * Sample schedules in the live 11.1 /getJobs shape (strings for numbers and dates, jobParams as
 * name/value pairs), so the fixture exercises the real parser.
 */

interface FixtureJob {
  id: string;
  name: string;
  owner: string;
  state: 'NORMAL' | 'PAUSED' | 'COMPLETE' | 'ERROR';
  input: string;
  trigger: Record<string, string>;
  nextRun?: string;
  lastRun?: string;
  output?: string;
}

const SAMPLE: FixtureJob[] = [
  {
    id: 'admin\tInventory daily\t1',
    name: 'Inventory daily',
    owner: 'admin',
    state: 'NORMAL',
    input: '/public/Steel Wheels/Reports/Inventory List.prpt',
    trigger: { '@type': 'simpleJobTrigger', uiPassParam: 'DAILY', repeatInterval: '86400', repeatCount: '-1', startTime: '2026-11-26T06:00:00.000-05:00' },
    nextRun: '2026-11-26T06:00:00.000-05:00',
    lastRun: '2026-11-25T06:00:00.000-05:00',
  },
  {
    id: 'suzy\tTop customers weekly\t2',
    name: 'Top customers weekly',
    owner: 'suzy',
    state: 'PAUSED',
    input: '/public/Steel Wheels/Reports/Top Customers.prpt',
    trigger: { '@type': 'complexJobTrigger', uiPassParam: 'WEEKLY', cronDescription: 'at 07:00 on Monday', startTime: '2026-11-24T07:00:00.000-05:00' },
    nextRun: '2026-11-30T07:00:00.000-05:00',
  },
  {
    id: 'pat\tOrders refresh\t3',
    name: 'Orders refresh',
    owner: 'pat',
    state: 'NORMAL',
    input: '/public/Steel Wheels/Data Integration/Load orders.ktr',
    trigger: { '@type': 'simpleJobTrigger', uiPassParam: 'HOURS', repeatInterval: '7200', repeatCount: '-1', startTime: '2026-11-25T00:00:00.000-05:00' },
    nextRun: '2026-11-25T20:00:00.000-05:00',
    lastRun: '2026-11-25T18:00:00.000-05:00',
  },
];

export interface SchedulerFixtureOptions {
  jobs?: FixtureJob[];
  status?: SchedulerStatus;
}

export function createFixtureSchedulerSource(
  options: SchedulerFixtureOptions = {},
): SchedulerSource & { runs: string[]; requests: Record<string, unknown>[] } {
  const jobs: FixtureJob[] = structuredClone(options.jobs ?? SAMPLE);
  let status: SchedulerStatus = options.status ?? 'running';
  const runs: string[] = [];
  const requests: Record<string, unknown>[] = [];
  let next = 100;
  const toFixture = (r: Record<string, unknown>, id: string): FixtureJob => {
    const simple = r.simpleJobTrigger as Record<string, unknown> | undefined;
    const cron = r.cronJobTrigger as Record<string, unknown> | undefined;
    const t = (simple ?? cron)!;
    const start = new Date(Number(t.startYear) + 1900, Number(t.startMonth), Number(t.startDay), Number(t.startHour), Number(t.startMin));
    const trigger: Record<string, string> = simple
      ? { '@type': 'simpleJobTrigger', uiPassParam: String(simple.uiPassParam), repeatInterval: String(simple.repeatInterval), repeatCount: String(simple.repeatCount), startTime: start.toISOString() }
      : { '@type': 'complexJobTrigger', uiPassParam: 'CRON', cronString: `${String(cron!.cronString)} *`, startTime: start.toISOString() };
    if (r.timeZone) trigger.timeZone = String(r.timeZone);
    return { id, name: String(r.jobName), owner: 'admin', state: 'NORMAL', input: String(r.inputFile), trigger, nextRun: start.toISOString(), output: String(r.outputFile) };
  };
  const find = (id: string) => {
    const job = jobs.find((j) => j.id === id);
    if (!job) throw new Error(`No job ${id}`);
    return job;
  };

  return {
    runs,
    requests,
    async createJob(request) {
      const r = request as Record<string, unknown>;
      requests.push(r);
      const id = `admin\t${String(r.jobName)}\t${next++}`;
      jobs.push(toFixture(r, id));
      return id;
    },
    async updateJob(request) {
      const r = request as Record<string, unknown>;
      requests.push(r);
      const index = jobs.findIndex((j) => j.id === r.jobId);
      if (index < 0) throw new Error(`No job ${String(r.jobId)}`);
      const id = `admin\t${String(r.jobName)}\t${next++}`;
      jobs[index] = toFixture(r, id);
      return id;
    },
    async listJobs() {
      return parseJobsResponse({
        job: jobs.map((j) => ({
          jobId: j.id,
          jobName: j.name,
          userName: j.owner,
          state: j.state,
          nextRun: j.nextRun,
          lastRun: j.lastRun,
          jobTrigger: j.trigger,
          jobParams: {
            jobParams: [
              { name: 'ActionAdapterQuartzJob-StreamProvider-InputFile', value: j.input },
              { name: 'ActionAdapterQuartzJob-ActionUser', value: j.owner },
              ...(j.output ? [{ name: 'ActionAdapterQuartzJob-StreamProvider', value: `input file = ${j.input}:outputFile = ${j.output}/${j.name}.*` }] : []),
            ],
          },
        })),
      });
    },
    async pauseJob(id) {
      find(id).state = 'PAUSED';
    },
    async resumeJob(id) {
      find(id).state = 'NORMAL';
    },
    async runNow(id) {
      find(id);
      runs.push(id);
    },
    async removeJob(id) {
      jobs.splice(jobs.indexOf(find(id)), 1);
    },
    async status() {
      return status;
    },
    async setStatus(running) {
      status = running ? 'running' : 'paused';
    },
  };
}
