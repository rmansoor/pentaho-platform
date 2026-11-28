import { describe, expect, it } from 'vitest';
import { parseJobsResponse } from '../../api/scheduler';
import {
  blockoutFormFromJob,
  blockoutProblem,
  buildBlockoutRequest,
  conflictsFor,
  describeBlockout,
  describeConflict,
  fireTimes,
  parseCron,
  specFromJob,
  specFromRecurrence,
  toBlockout,
  zonedInstant,
  type BlockoutForm,
} from './blockouts';
import type { Recurrence } from './schedule-form';

const NY = 'America/New_York';
const rec = (over: Partial<Recurrence>): Recurrence => ({
  repeat: 'daily',
  interval: 1,
  weekdays: [2, 3, 4, 5, 6],
  dayOfMonth: 1,
  cron: '',
  startDate: '2026-11-26',
  startTime: '09:00',
  endDate: '',
  timeZone: NY,
  ...over,
});
const iso = (t: number) => new Date(t).toISOString();

// The live 11.1 /blockout/blockoutjobs entry for "weekdays from 22:00 for 4 hours".
const LIVE_BLOCKOUT = parseJobsResponse({
  job: [
    {
      jobId: 'admin\tBlockoutAction\t6621d9fa',
      jobName: 'BlockoutAction',
      userName: 'admin',
      state: 'NORMAL',
      nextRun: '2026-11-26T22:00:00.000-05:00',
      jobTrigger: {
        '@type': 'complexJobTrigger',
        startTime: '2026-11-26T22:00:00.000-05:00',
        uiPassParam: 'CRON',
        cronString: '0 0 22 ? * 2-6 *',
        duration: '14400000',
        timeZone: NY,
        repeatInterval: '0',
        repeatCount: '0',
      },
      jobParams: { jobParams: [{ name: 'DURATION_PARAM', value: '14400000' }] },
    },
  ],
})[0]!;

describe('time zones', () => {
  it('finds the instant for a wall-clock time, either side of a DST change', () => {
    expect(iso(zonedInstant(2026, 11, 26, 22, 0, 0, NY))).toBe('2026-11-27T03:00:00.000Z');
    expect(iso(zonedInstant(2026, 7, 1, 22, 0, 0, NY))).toBe('2026-07-02T02:00:00.000Z');
    expect(iso(zonedInstant(2026, 7, 1, 22, 0, 0, 'Asia/Kolkata'))).toBe('2026-07-01T16:30:00.000Z');
  });
});

describe('parseCron', () => {
  it('reads lists, ranges, steps and names', () => {
    const c = parseCron('0 0/30 9-10 ? * MON-FRI')!;
    expect(c.min).toEqual([0, 30]);
    expect(c.hour).toEqual([9, 10]);
    expect([...c.dow!]).toEqual([2, 3, 4, 5, 6]);
    expect(c.dom).toBeNull();
  });
  it("gives up on syntax it doesn't evaluate", () => {
    expect(parseCron('0 0 9 L * ?')).toBeNull();
    expect(parseCron('0 0 9 ? * 6#3')).toBeNull();
    expect(parseCron('nonsense')).toBeNull();
  });
});

describe('fireTimes', () => {
  it('lists cron runs in the schedule time zone', () => {
    const spec = specFromJob(LIVE_BLOCKOUT)!;
    const from = Date.parse('2026-11-26T00:00:00Z');
    const runs = fireTimes(spec, from, from + 7.5 * 86_400_000).map(iso);
    // Thu 26, Fri 27, Mon 30, Tue 1, Wed 2 at 22:00 New York = 03:00 UTC the next day.
    expect(runs).toEqual([
      '2026-11-27T03:00:00.000Z',
      '2026-11-28T03:00:00.000Z',
      '2026-12-01T03:00:00.000Z',
      '2026-12-02T03:00:00.000Z',
      '2026-12-03T03:00:00.000Z',
    ]);
  });
  it('steps simple triggers from their start and stops at the end date', () => {
    const spec = specFromRecurrence(rec({ repeat: 'hours', interval: 6, endDate: '2026-11-27' }))!;
    const runs = fireTimes(spec, Date.parse('2026-11-26T15:00:00Z'), Date.parse('2026-12-31T00:00:00Z')).map(iso);
    expect(runs).toEqual(['2026-11-26T20:00:00.000Z', '2026-11-27T02:00:00.000Z', '2026-11-27T08:00:00.000Z', '2026-11-27T14:00:00.000Z', '2026-11-27T20:00:00.000Z', '2026-11-28T02:00:00.000Z']);
  });
});

describe('conflictsFor', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  const blockout = toBlockout(LIVE_BLOCKOUT)!;

  it('counts the runs that fall inside a blockout window', () => {
    // Daily at 23:00: blocked Monday–Friday nights, free at the weekend (Sat and Sun nights).
    const daily = conflictsFor(specFromRecurrence(rec({ startTime: '23:00' }))!, [blockout], now);
    expect(daily).toMatchObject({ runs: 28, blocked: 20 });
    expect(describeConflict(daily)).toBe('20 of the 28 runs in the next 4 weeks fall in a blockout time and will be skipped.');
  });
  it('treats the window as inclusive at both ends, like the server', () => {
    expect(conflictsFor(specFromRecurrence(rec({ startTime: '02:00', startDate: '2026-11-27', repeat: 'once' }))!, [blockout], now).blocked).toBe(1);
    expect(conflictsFor(specFromRecurrence(rec({ startTime: '02:01', startDate: '2026-11-27', repeat: 'once' }))!, [blockout], now).blocked).toBe(0);
  });
  it('says when nothing would ever run', () => {
    const weekdays = conflictsFor(specFromRecurrence(rec({ repeat: 'weekly', startTime: '23:30' }))!, [blockout], now);
    expect(weekdays.blocked).toBe(weekdays.runs);
    expect(describeConflict(weekdays)).toBe('Every run in the next 4 weeks falls in a blockout time, so none of them would run.');
  });
  it('is quiet for a run outside every window', () => {
    const c = conflictsFor(specFromRecurrence(rec({ repeat: 'once', startDate: '2026-11-27', startTime: '09:00' }))!, [blockout], now);
    expect(c).toMatchObject({ runs: 1, blocked: 0 });
    expect(describeConflict(c)).toBeNull();
  });
});

describe('blockout form', () => {
  const form: BlockoutForm = { recurrence: rec({ repeat: 'weekly', startTime: '22:00' }), hours: 4, minutes: 0 };

  it('builds the add request the server takes', () => {
    expect(buildBlockoutRequest(form)).toEqual({
      jobName: 'Blockout',
      duration: 14_400_000,
      timeZone: NY,
      cronJobTrigger: { uiPassParam: 'CRON', cronString: '0 0 22 ? * 2-6', startHour: 22, startMin: 0, startYear: 126, startMonth: 10, startDay: 26, endTime: null },
      jobParameters: [],
    });
  });
  it('reads a saved blockout back', () => {
    const back = blockoutFormFromJob(LIVE_BLOCKOUT);
    expect(back).toMatchObject({ hours: 4, minutes: 0, recurrence: { repeat: 'weekly', weekdays: [2, 3, 4, 5, 6], startTime: '22:00', timeZone: NY } });
  });
  it('describes it in words', () => {
    expect(describeBlockout(form.recurrence, 14_400_000)).toBe('Weekdays at 22:00 for 4 hours, until 02:00 the next day');
    expect(describeBlockout(rec({ startTime: '12:00' }), 90 * 60_000)).toBe('Every day at 12:00 for 1 hour 30 minutes, until 13:30');
  });
  it('checks the duration', () => {
    expect(blockoutProblem({ ...form, hours: 0 })).toBe('Enter how long it lasts');
    expect(blockoutProblem({ ...form, recurrence: rec({ repeat: 'hours', interval: 2 }), hours: 2 })).toBe('It lasts as long as it repeats, so nothing would ever run');
    expect(blockoutProblem(form)).toBeNull();
  });
});
