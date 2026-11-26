import { describe, expect, it } from 'vitest';
import {
  buildScheduleRequest,
  describeForm,
  formFromJob,
  newScheduleForm,
  scheduleFormProblem,
  weekdaysToCron,
  type ScheduleForm,
} from './schedule-form';
import type { ScheduledJob } from '../../api/scheduler';

const base = (over: Partial<ScheduleForm> = {}): ScheduleForm => ({
  ...newScheduleForm('/public/Reports/Sales.prpt', '/home/admin', new Date(2026, 10, 25, 9, 30)),
  timeZone: 'America/New_York',
  ...over,
});

describe('buildScheduleRequest', () => {
  it('daily: simpleJobTrigger with java.util.Date start offsets and the owner parameter', () => {
    const body = buildScheduleRequest(base({ startDate: '2026-11-26', startTime: '06:15' }), '/public/Reports/Sales.prpt', 'admin');
    expect(body).toEqual({
      jobName: 'Sales',
      inputFile: '/public/Reports/Sales.prpt',
      outputFile: '/home/admin',
      timeZone: 'America/New_York',
      simpleJobTrigger: {
        uiPassParam: 'DAILY',
        repeatInterval: 86400,
        repeatCount: -1,
        startHour: 6,
        startMin: 15,
        startYear: 126,
        startMonth: 10,
        startDay: 26,
        endTime: null,
      },
      jobParameters: [{ name: 'ActionAdapterQuartzJob-ActionUser', type: 'string', stringValue: ['admin'] }],
    });
  });

  it('once and every N hours', () => {
    const once = buildScheduleRequest(base({ repeat: 'once', endDate: '2026-12-31' }), '/f.prpt', 'admin');
    expect(once.simpleJobTrigger).toMatchObject({ uiPassParam: 'RUN_ONCE', repeatInterval: 0, repeatCount: 0, endTime: null });
    const hours = buildScheduleRequest(base({ repeat: 'hours', interval: 3, endDate: '2026-12-31' }), '/f.prpt', 'admin');
    expect(hours.simpleJobTrigger).toMatchObject({ uiPassParam: 'HOURS', repeatInterval: 10800, repeatCount: -1, endTime: '2026-12-31T23:59:59' });
  });

  it('weekly uses numeric Quartz days (immune to the named-day bug), monthly uses day of month', () => {
    const weekly = buildScheduleRequest(base({ repeat: 'weekly', weekdays: [6, 2, 3, 4, 5], startTime: '07:00' }), '/f.prpt', 'admin');
    expect(weekly.cronJobTrigger).toMatchObject({ uiPassParam: 'CRON', cronString: '0 0 7 ? * 2-6' });
    const someDays = buildScheduleRequest(base({ repeat: 'weekly', weekdays: [2, 4, 1], startTime: '18:30' }), '/f.prpt', 'admin');
    expect(someDays.cronJobTrigger?.cronString).toBe('0 30 18 ? * 1,2,4');
    const monthly = buildScheduleRequest(base({ repeat: 'monthly', dayOfMonth: 15, startTime: '08:05' }), '/f.prpt', 'admin');
    expect(monthly.cronJobTrigger?.cronString).toBe('0 5 8 15 * ?');
  });

  it('adds the jobId for updates', () => {
    expect(buildScheduleRequest(base(), '/f.prpt', 'admin', 'admin\tSales\t1')).toHaveProperty('jobId', 'admin\tSales\t1');
  });
});

describe('form helpers', () => {
  it('compresses contiguous weekdays into a range', () => {
    expect(weekdaysToCron([2, 3, 4, 5, 6])).toBe('2-6');
    expect(weekdaysToCron([1, 7])).toBe('1,7');
    expect(weekdaysToCron([3, 4])).toBe('3,4');
  });

  it('explains what is missing', () => {
    expect(scheduleFormProblem(base({ name: ' ' }))).toBe('Give the schedule a name');
    expect(scheduleFormProblem(base({ repeat: 'weekly', weekdays: [] }))).toBe('Choose at least one day');
    expect(scheduleFormProblem(base({ outputFolder: 'home' }))).toBe('Choose a folder for the output');
    expect(scheduleFormProblem(base({ endDate: '2020-01-01' }))).toBe('The end date is before the start date');
    expect(scheduleFormProblem(base())).toBeNull();
  });

  it('describes the schedule in words', () => {
    expect(describeForm(base({ repeat: 'weekly', weekdays: [2, 3, 4, 5, 6], startTime: '07:00' }))).toBe('Weekdays at 07:00');
    expect(describeForm(base({ repeat: 'minutes', interval: 15 }))).toBe('Every 15 minutes');
  });

  it('uses the display title for a new schedule when given', () => {
    expect(newScheduleForm('/r/Top Customers (report).prpt', '/h', new Date(), 'Top Customers').name).toBe('Top Customers');
    expect(newScheduleForm('/r/Top Customers (report).prpt', '/h').name).toBe('Top Customers (report)');
  });

  it('shows an existing start time as wall-clock time in the schedule time zone', () => {
    const job: ScheduledJob = {
      id: 'x', name: 'n', owner: 'a', state: 'active', inputFile: '/f.prpt', nextRun: null, lastRun: null, recurrence: '',
      trigger: { type: 'simpleJobTrigger', repeatInterval: 86400, timeZone: 'Europe/London', startTime: new Date('2026-11-26T06:30:00Z') },
    };
    expect(formFromJob(job, '/h')).toMatchObject({ repeat: 'daily', startDate: '2026-11-26', startTime: '06:30', timeZone: 'Europe/London' });
    const tokyo = { ...job, trigger: { ...job.trigger, timeZone: 'Asia/Tokyo' } };
    expect(formFromJob(tokyo, '/h')).toMatchObject({ startDate: '2026-11-26', startTime: '15:30' });
  });

  it('reads an existing job back into the form', () => {
    const job = (trigger: ScheduledJob['trigger']): ScheduledJob => ({
      id: 'x',
      name: 'Weekday sales',
      owner: 'admin',
      state: 'active',
      inputFile: '/public/Reports/Sales.prpt',
      outputFolder: '/home/admin/out',
      nextRun: null,
      lastRun: null,
      recurrence: '',
      trigger,
    });
    const weekly = formFromJob(job({ type: 'complexJobTrigger', cronString: '0 0 7 ? * 2-6 *', timeZone: 'Europe/London' }), '/home/admin');
    expect(weekly).toMatchObject({ repeat: 'weekly', weekdays: [2, 3, 4, 5, 6], startTime: '07:00', outputFolder: '/home/admin/out', timeZone: 'Europe/London' });
    expect(formFromJob(job({ type: 'simpleJobTrigger', repeatInterval: 7200 }), '/h')).toMatchObject({ repeat: 'hours', interval: 2 });
    expect(formFromJob(job({ type: 'complexJobTrigger', cronString: '0 5 8 15 * ? *' }), '/h')).toMatchObject({ repeat: 'monthly', dayOfMonth: 15, startTime: '08:05' });
    expect(formFromJob(job({ type: 'complexJobTrigger', cronString: '0 0/5 * * * ?' }), '/h')).toMatchObject({ repeat: 'cron', cron: '0 0/5 * * * ?' });
  });
});
