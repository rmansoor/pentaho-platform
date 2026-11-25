import { Button } from '@helix/ui';
import { ApiError, LOGIN_URL } from '../../api/http';

/** Error state for a failed load: signed out, unreachable, missing/forbidden, or anything else. */
export function QueryError({
  error,
  onRetry,
  secondary,
}: {
  error: Error;
  onRetry: () => void;
  secondary?: { label: string; onClick: () => void };
}) {
  const api = error instanceof ApiError ? error : undefined;
  const [heading, detail] = api?.signedOut
    ? ["You're signed out", 'Sign in to the Pentaho Server, then try again.']
    : api?.unreachable
      ? ["Couldn't reach the Pentaho Server", 'Check that the server is running, then try again.']
      : api && (api.status === 403 || api.status === 404)
        ? ["This folder isn't available", "It may have been moved or deleted, or you don't have access to it."]
        : ["Couldn't load this", error.message];

  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-[18px] py-12 text-center">
      <p className="m-0 font-bold">{heading}</p>
      <p className="m-0 max-w-[48ch] text-fg-muted">{detail}</p>
      <div className="flex gap-2">
        {api?.signedOut ? (
          <a
            href={LOGIN_URL}
            className="inline-flex h-9 items-center rounded-control bg-accent px-3.5 text-[13px] font-bold text-accent-ink no-underline hover:bg-accent-hover"
          >
            Sign in
          </a>
        ) : null}
        <Button size="sm" variant={api?.signedOut ? 'secondary' : 'primary'} onClick={onRetry}>
          Try again
        </Button>
        {secondary && !api?.signedOut && (
          <Button size="sm" onClick={secondary.onClick}>
            {secondary.label}
          </Button>
        )}
      </div>
    </div>
  );
}
