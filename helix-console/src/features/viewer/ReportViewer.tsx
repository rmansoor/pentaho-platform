import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Download, Play, Printer, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { Button, cn, IconButton, Menu } from '@helix/ui';
import { useRepoSource } from '../../api/repo-context';
import {
  formatExtension,
  isViewable,
  PAGED_HTML,
  parseReportPrompt,
  promptBody,
  reportUrl,
  selectedValues,
  type ReportPrompt,
  type ReportValues,
} from '../../api/reports';
import { ParameterField } from './ParameterField';
import { t } from '../../i18n';

/*
 * The console's own report viewer: the parameter panel, format, paging, print and downloads are
 * the console's; only the rendered output (an HTML page or a PDF from /report) sits in a frame.
 * See api/reports.ts for the endpoints.
 */

interface PromptState {
  prompt: ReportPrompt | null;
  values: ReportValues;
  loading: boolean;
  error: Error | null;
}

/**
 * Parameter values and the server's view of them. Every change goes to the server, which answers
 * with the corrected selection (dependent lists refreshed, stale choices dropped) and errors.
 */
function useReportPrompt(file: string) {
  const source = useRepoSource();
  const [state, setState] = useState<PromptState>({ prompt: null, values: {}, loading: true, error: null });
  const latest = useRef(0);

  const load = useCallback(
    async (values: ReportValues, initial = false) => {
      const request = ++latest.current;
      setState((s) => ({ ...s, values, loading: true }));
      try {
        const prompt = parseReportPrompt(await source.reportPrompt(file, promptBody(values, 'PARAMETER')));
        if (request !== latest.current) return;
        const server = selectedValues(prompt);
        const next: ReportValues = { ...values };
        // Lists take the server's corrected selection; typed values stay as typed.
        for (const p of prompt.parameters) if (initial || p.list || !(p.name in values)) next[p.name] = server[p.name] ?? [];
        setState({ prompt, values: next, loading: false, error: null });
      } catch (error) {
        if (request === latest.current) setState((s) => ({ ...s, loading: false, error: error as Error }));
      }
    },
    [file, source],
  );

  useEffect(() => {
    void load({}, true);
  }, [load]);

  return { ...state, change: (name: string, value: string[]) => load({ ...state.values, [name]: value }), reload: () => load(state.values) };
}

/** What is on screen: the values it ran with, the format and the page. */
interface Run {
  values: ReportValues;
  format: string;
  page: number;
  /** Bumped by Refresh so the frame reloads the same URL. */
  nonce: number;
}

export function ReportViewer({ file, title }: { file: string; title: string }) {
  const source = useRepoSource();
  const { prompt, values, loading, error, change, reload } = useReportPrompt(file);
  const [run, setRun] = useState<Run | null>(null);
  const [panel, setPanel] = useState<boolean | null>(null);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  const viewFormats = useMemo(() => (prompt?.formats ?? []).filter((f) => isViewable(f.value)), [prompt]);
  const defaultFormat = useMemo(() => {
    const chosen = prompt?.formats.find((f) => f.selected)?.value;
    return chosen && isViewable(chosen) ? chosen : (viewFormats[0]?.value ?? PAGED_HTML);
  }, [prompt, viewFormats]);
  const [format, setFormat] = useState<string | null>(null);
  const viewFormat = format ?? defaultFormat;

  const userValues = useCallback((v: ReportValues) => {
    const rest = { ...v };
    delete rest['output-target'];
    return rest;
  }, []);

  // Run automatically when the values are valid and the report allows it.
  useEffect(() => {
    if (!prompt || loading || prompt.promptNeeded || !prompt.autoSubmit) return;
    setRun((r) => ({ values: userValues(values), format: viewFormat, page: 0, nonce: r?.nonce ?? 0 }));
    // Only the server's answer should trigger a run, not every keystroke-level state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, loading]);

  // Show the panel by default when there is something to fill in.
  const showPanel = panel ?? !!prompt?.parameters.length;

  const pages = useQuery({
    queryKey: ['report-pages', file, run?.values, run?.format],
    queryFn: async () => parseReportPrompt(await source.reportPrompt(file, promptBody({ ...run!.values, 'output-target': [run!.format] }, 'XML', 0))).pageCount ?? 1,
    enabled: !!run && run.format === PAGED_HTML,
    staleTime: 60_000,
  });
  const pageCount = run?.format === PAGED_HTML ? pages.data : undefined;

  const src = run ? `${reportUrl(file, run.values, { format: run.format, page: run.page })}${run.nonce ? `&_=${run.nonce}` : ''}` : null;
  useEffect(() => setFrameLoaded(false), [src]);

  const goTo = (page: number) => run && pageCount && setRun({ ...run, page: Math.max(0, Math.min(pageCount - 1, page)) });
  const chooseFormat = (next: string) => {
    setFormat(next);
    if (run) setRun({ ...run, format: next, page: 0 });
  };
  const download = (target: string) => {
    const a = document.createElement('a');
    // The server names the file after the report; `download` keeps the browser from opening it.
    a.href = reportUrl(file, userValues(run?.values ?? values), { format: target });
    a.download = `${title}.${formatExtension(target)}`;
    document.body.append(a);
    a.click();
    a.remove();
  };
  const canRun = !!prompt && !prompt.promptNeeded && !loading;

  const message = error
    ? t('files.report.failed', { message: error.message })
    : !prompt
      ? t('files.report.loading')
      : prompt.promptNeeded
        ? t('files.report.fillIn')
        : !run
          ? prompt.autoSubmit
            ? t('files.report.running')
            : t('files.report.chooseThenRun')
          : null;

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      {showPanel && prompt && (
        <aside
          aria-label={t('files.report.parameters')}
          className="flex max-h-[45vh] shrink-0 flex-col gap-4 overflow-y-auto border-b border-divider p-4 md:max-h-none md:w-[300px] md:border-r md:border-b-0"
        >
          {prompt.errors['']?.map((e) => (
            <p key={e} role="alert" className="m-0 rounded-card bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">
              {e}
            </p>
          ))}
          {prompt.parameters.map((p) => (
            <ParameterField key={p.name} param={p} value={values[p.name] ?? []} errors={prompt.errors[p.name]} onChange={(v) => void change(p.name, v)} />
          ))}
          {!prompt.autoSubmit && (
            <Button
              variant="primary"
              size="sm"
              icon={<Play size={15} aria-hidden="true" />}
              aria-disabled={!canRun}
              onClick={() => canRun && setRun((r) => ({ values: userValues(values), format: viewFormat, page: 0, nonce: (r?.nonce ?? 0) + 1 }))}
              className="self-start"
            >
              {t('files.report.run')}
            </Button>
          )}
        </aside>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div role="toolbar" aria-label={t('files.report.toolbar')} className="flex flex-wrap items-center gap-2 border-b border-divider px-3 py-2">
          {!!prompt?.parameters.length && (
            <IconButton
              size="sm"
              variant="ghost"
              aria-pressed={showPanel}
              aria-label={showPanel ? t('files.report.hideParameters') : t('files.report.showParameters')}
              title={showPanel ? t('files.report.hideParameters') : t('files.report.showParameters')}
              onClick={() => setPanel(!showPanel)}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
            </IconButton>
          )}
          {viewFormats.length > 1 && (
            <label className="flex items-center gap-2 text-[13px] text-fg-muted">
              {t('files.report.viewAs')}
              <select value={viewFormat} onChange={(e) => chooseFormat(e.target.value)} className="h-8 rounded-control border border-border-strong bg-surface px-2 text-fg">
                {viewFormats.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {pageCount !== undefined && pageCount > 1 && run && (
            <nav aria-label={t('files.report.pageStatus', { page: run.page + 1, count: pageCount })} className="flex items-center gap-0.5">
              <IconButton size="sm" variant="ghost" aria-label={t('files.report.first')} title={t('files.report.first')} aria-disabled={run.page === 0} onClick={() => goTo(0)}>
                <ChevronFirst size={16} aria-hidden="true" />
              </IconButton>
              <IconButton size="sm" variant="ghost" aria-label={t('files.report.previous')} title={t('files.report.previous')} aria-disabled={run.page === 0} onClick={() => goTo(run.page - 1)}>
                <ChevronLeft size={16} aria-hidden="true" />
              </IconButton>
              <PageInput page={run.page} count={pageCount} onGo={goTo} />
              <IconButton size="sm" variant="ghost" aria-label={t('files.report.next')} title={t('files.report.next')} aria-disabled={run.page >= pageCount - 1} onClick={() => goTo(run.page + 1)}>
                <ChevronRight size={16} aria-hidden="true" />
              </IconButton>
              <IconButton size="sm" variant="ghost" aria-label={t('files.report.last')} title={t('files.report.last')} aria-disabled={run.page >= pageCount - 1} onClick={() => goTo(pageCount - 1)}>
                <ChevronLast size={16} aria-hidden="true" />
              </IconButton>
            </nav>
          )}
          <div className="flex-1" />
          <IconButton
            size="sm"
            variant="ghost"
            aria-label={t('common.refresh')}
            title={t('common.refresh')}
            onClick={() => {
              void reload();
              if (run) setRun({ ...run, nonce: run.nonce + 1 });
            }}
          >
            <RefreshCw size={16} aria-hidden="true" className={loading ? 'animate-spin motion-reduce:animate-none' : undefined} />
          </IconButton>
          {run?.format.startsWith('table/html') && (
            <IconButton size="sm" variant="ghost" aria-label={t('files.report.print')} title={t('files.report.print')} aria-disabled={!frameLoaded} onClick={() => frameLoaded && frame.current?.contentWindow?.print()}>
              <Printer size={16} aria-hidden="true" />
            </IconButton>
          )}
          {prompt && prompt.formats.length > 0 && (
            <Menu
              items={prompt.formats.map((f) => ({
                label: f.label,
                icon: <Download size={15} aria-hidden="true" />,
                disabled: !canRun,
                onSelect: () => download(f.value),
              }))}
              trigger={(props) => (
                <Button size="sm" icon={<Download size={15} aria-hidden="true" />} {...props}>
                  {t('files.report.download')}
                </Button>
              )}
            />
          )}
        </div>

        <div className="relative min-h-0 flex-1 bg-surface">
          {src && !error && (!prompt?.promptNeeded || loading) && (
            <iframe
              key={src}
              ref={frame}
              src={src}
              title={title}
              onLoad={() => setFrameLoaded(true)}
              className={cn('block h-full w-full border-0 transition-opacity', frameLoaded ? 'opacity-100' : 'opacity-40')}
              // HTML output is sandboxed like plugin content (it can't navigate the console away).
              // Chrome refuses to show a PDF in any sandboxed frame, so PDFs get none; the output
              // is the server's own and same-origin either way.
              sandbox={run?.format.startsWith('pageable/pdf') ? undefined : 'allow-scripts allow-same-origin allow-popups allow-downloads allow-modals'}
            />
          )}
          {(message || (src && !frameLoaded)) && (
            <p role="status" className={cn('m-0 grid place-items-center p-8 text-center text-fg-muted', src && !message ? 'absolute inset-0' : 'h-full')}>
              {message ?? t('files.report.running')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PageInput({ page, count, onGo }: { page: number; count: number; onGo: (page: number) => void }) {
  const [draft, setDraft] = useState(String(page + 1));
  useEffect(() => setDraft(String(page + 1)), [page]);
  const go = () => {
    const n = Number(draft);
    if (Number.isInteger(n) && n >= 1 && n <= count) onGo(n - 1);
    else setDraft(String(page + 1));
  };
  return (
    <label className="flex items-center gap-1.5 px-1 text-[13px] text-fg-muted">
      <span className="sr-only">{t('files.report.page')}</span>
      <input
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={go}
        onKeyDown={(e) => e.key === 'Enter' && go()}
        className="h-8 w-12 rounded-control border border-border-strong bg-surface px-1.5 text-center text-fg tabular-nums"
      />
      <span aria-hidden="true">{t('files.report.pageOf', { count })}</span>
    </label>
  );
}
