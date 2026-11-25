import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { httpSchedulerSource, type SchedulerSource } from './scheduler';

const SchedulerSourceContext = createContext<SchedulerSource>(httpSchedulerSource);

export function SchedulerSourceProvider({ source, children }: { source: SchedulerSource; children: ReactNode }) {
  return <SchedulerSourceContext.Provider value={source}>{children}</SchedulerSourceContext.Provider>;
}

export const schedulerKeys = {
  all: ['scheduler'] as const,
  jobs: ['scheduler', 'jobs'] as const,
  status: ['scheduler', 'status'] as const,
};

export function useSchedulerSource(): SchedulerSource {
  return useContext(SchedulerSourceContext);
}

export function useJobs() {
  const source = useSchedulerSource();
  // Next-run times move as jobs fire, so keep the list fresh while it is on screen.
  return useQuery({ queryKey: schedulerKeys.jobs, queryFn: ({ signal }) => source.listJobs(signal), refetchInterval: 60_000 });
}

export function useSchedulerStatus() {
  const source = useSchedulerSource();
  return useQuery({ queryKey: schedulerKeys.status, queryFn: ({ signal }) => source.status(signal) });
}
