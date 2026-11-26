import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { API_ROOT } from '../../api/http';
import { toPathId } from '../../api/repo';
import { toJobParameters, type JobParameter } from './schedule-form';

/*
 * The content's own parameter prompt (GET /api/repos/{id}/parameterUi), hosted the way the GWT
 * schedule dialog hosts it: an iframe with id "schedulerParamsFrame" and three callbacks on the
 * parent window. The prompt calls schedulerParamsLoadedCallback(path); we answer with
 * initSchedulingParams(path, complete, resize). Values are read with getParams(suppressAlerts).
 * Saved values are prefilled by passing them as query parameters, as the GWT dialog does.
 */

export interface ReportParametersHandle {
  /** The prompt's current values as job parameters, or null if the prompt isn't ready. */
  collect(): JobParameter[] | null;
}

interface PromptWindow extends Window {
  getParams?: (suppressAlerts: boolean) => Record<string, unknown>;
  initSchedulingParams?: (path: string, complete: (flag: boolean) => void, resize: () => void) => void;
}

type ParentHooks = {
  schedulerParamsLoadedCallback?: (path: string) => void;
  schedulerParamsCompleteCallback?: (flag: boolean) => void;
  schedulerParamsContentResizeCallback?: () => void;
};

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 480;
const FALLBACK_HEIGHT = 360;

export function parameterUiUrl(file: string, saved: Record<string, string[]>): string {
  const query = new URLSearchParams();
  for (const [name, values] of Object.entries(saved)) for (const v of values) query.append(name, v.trim());
  const qs = query.toString();
  // Colons stay literal, as the GWT dialog sends them; the prompt reads its path from this URL.
  return `${API_ROOT}/repos/${toPathId(file).replace(/%3A/gi, ':')}/parameterUi${qs ? `?${qs}` : ''}`;
}

export function ReportParameters({
  file,
  saved,
  onCompleteChange,
  ref,
}: {
  file: string;
  saved: Record<string, string[]>;
  onCompleteChange: (complete: boolean) => void;
  ref?: Ref<ReportParametersHandle>;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(FALLBACK_HEIGHT);
  const [loaded, setLoaded] = useState(false);
  // The URL is fixed for the life of the sheet; later edits happen inside the prompt.
  const [src] = useState(() => parameterUiUrl(file, saved));

  const promptWindow = () => frame.current?.contentWindow as PromptWindow | null | undefined;

  useImperativeHandle(ref, () => ({
    collect() {
      const win = promptWindow();
      if (!win?.getParams) return null;
      try {
        return toJobParameters(win.getParams(true) ?? {});
      } catch {
        return null;
      }
    },
  }));

  /*
   * Size the frame to the prompt panel, never to the body: report prompts have an output area
   * that fills whatever height the frame has, so measuring the body grows the frame forever.
   * Beyond MAX_HEIGHT the frame scrolls, like the fixed-size GWT dialog.
   */
  const measure = () => {
    const doc = frame.current?.contentWindow?.document;
    if (!doc?.body) return;
    const panel = doc.getElementById('toppanel');
    setHeight(panel ? Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, panel.scrollHeight + 24)) : FALLBACK_HEIGHT);
  };

  useEffect(() => {
    const host = window as unknown as ParentHooks;
    const previous: ParentHooks = { ...host };
    const resize = measure;
    const complete = (flag: boolean) => onCompleteChange(flag);
    host.schedulerParamsCompleteCallback = complete;
    host.schedulerParamsContentResizeCallback = resize;
    host.schedulerParamsLoadedCallback = (path) => {
      promptWindow()?.initSchedulingParams?.(path, complete, resize);
      resize();
    };
    return () => {
      host.schedulerParamsLoadedCallback = previous.schedulerParamsLoadedCallback;
      host.schedulerParamsCompleteCallback = previous.schedulerParamsCompleteCallback;
      host.schedulerParamsContentResizeCallback = previous.schedulerParamsContentResizeCallback;
    };
  }, [onCompleteChange]);

  // Follow the prompt panel as it renders and as values change (body changes catch it appearing).
  const onLoad = () => {
    setLoaded(true);
    const win = frame.current?.contentWindow as (Window & typeof globalThis) | null;
    const body = win?.document?.body;
    if (!win || !body) return;
    measure();
    if (typeof win.ResizeObserver !== 'function') return;
    let watched: Element | null = null;
    const observer = new win.ResizeObserver(() => {
      const panel = win.document.getElementById('toppanel');
      if (panel && panel !== watched) {
        watched = panel;
        observer.observe(panel);
      }
      measure();
    });
    observer.observe(body);
  };

  return (
    <div className="relative overflow-hidden rounded-card border border-border bg-white">
      {!loaded && <p className="absolute inset-0 m-0 grid place-items-center text-fg-muted">Loading the report's parameters…</p>}
      <iframe
        ref={frame}
        id="schedulerParamsFrame"
        title="Report parameters"
        src={src}
        onLoad={onLoad}
        style={{ height }}
        className="block w-full border-0"
      />
    </div>
  );
}
