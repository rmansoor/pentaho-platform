import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, toast } from '@helix/ui';
import { datasetKeys, describeError, useConnectionNames, useDatasetSource } from '../../api/datasets';
import { QueryError } from '../files/QueryError';
import { t } from '../../i18n';

const inputClass = 'h-10 rounded-control border border-border-strong bg-surface px-3 text-fg';

/** Administration: which database connection (and schema) uploaded dataset files are loaded into. */
export function StagingSettingsCard() {
  const api = useDatasetSource();
  const queryClient = useQueryClient();
  const state = useQuery({ queryKey: datasetKeys.staging, queryFn: ({ signal }) => api.staging(signal) });
  const connections = useConnectionNames();
  const connectionId = useId();
  const schemaId = useId();
  const [connection, setConnection] = useState('');
  const [schema, setSchema] = useState('');

  useEffect(() => {
    if (state.data) {
      setConnection(state.data.saved.connection ?? '');
      setSchema(state.data.saved.schema ?? '');
    }
  }, [state.data]);

  const save = useMutation({
    mutationFn: () => api.setStaging({ connection: connection || undefined, schema: schema.trim() || undefined }),
    onSuccess: (next) => {
      queryClient.setQueryData(datasetKeys.staging, next);
      toast(t('datasets.staging.saved', { connection: next.connection ?? '' }));
    },
    onError: (e: Error) => toast(t('datasets.staging.saveFailed', { message: describeError(e) }), { tone: 'danger' }),
  });

  const defaults = state.data?.defaults;
  const changed = state.data && (connection !== (state.data.saved.connection ?? '') || schema.trim() !== (state.data.saved.schema ?? ''));

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div>
        <h2 className="m-0 text-[17px] font-extrabold">{t('datasets.staging.title')}</h2>
        <p className="m-0 mt-1 text-fg-muted">{t('datasets.staging.intro')}</p>
      </div>
      {state.isPending ? (
        <p className="m-0 text-fg-muted">{t('datasets.staging.loading')}</p>
      ) : state.isError ? (
        <QueryError error={state.error} onRetry={() => void state.refetch()} />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label htmlFor={connectionId} className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-fg-soft">{t('datasets.staging.connection')}</span>
              <select id={connectionId} value={connection} onChange={(e) => setConnection(e.target.value)} className={`${inputClass} min-w-[240px]`}>
                <option value="">{t('datasets.staging.default', { name: defaults?.connection ?? '—' })}</option>
                {(connections.data ?? []).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={schemaId} className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-fg-soft">{t('datasets.staging.schema')}</span>
              <input
                id={schemaId}
                value={schema}
                placeholder={defaults?.schema ?? t('datasets.staging.schemaDefault')}
                onChange={(e) => setSchema(e.target.value)}
                className={`${inputClass} w-48`}
              />
            </label>
            <Button size="sm" variant="primary" aria-disabled={!changed || save.isPending} onClick={() => changed && !save.isPending && save.mutate()}>
              {save.isPending ? t('datasets.staging.saving') : t('common.save')}
            </Button>
          </div>
          <p className="m-0 text-[12.5px] text-fg-muted">
            {(connection || defaults?.connection) === 'Hibernate'
              ? t('datasets.staging.repositoryWarning')
              : t('datasets.staging.moveNote')}
          </p>
        </>
      )}
    </Card>
  );
}
