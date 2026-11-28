import { z } from 'zod';
import { ApiError, PLUGIN_ROOT, send } from './http';
import { t } from '../i18n';

/**
 * Moves a report that is already rendering in the report viewer to the background
 * (AdhocRunInBackgroundCommand in the GWT console):
 *   POST /plugin/reporting/api/jobs/{jobId}/schedule?confirm=true&folderId=…&newName=…&recalculateFinished=…
 * Returns the uuid of the background job.
 */
export async function scheduleRunningReport(jobId: string, folderId: string, name: string, recalculateFinished: string): Promise<string> {
  const query = new URLSearchParams({ confirm: 'true', folderId, newName: name, recalculateFinished });
  const path = `${PLUGIN_ROOT}/reporting/api/jobs/${encodeURIComponent(jobId)}/schedule?${query}`;
  const response = await send('POST', path, { body: '', contentType: 'application/json', accept: 'application/json' });
  if (!response.ok) throw new ApiError(response.status, path, t('common.errors.backgroundFailed', { status: response.status }));
  return z.object({ uuid: z.string() }).parse(await response.json()).uuid;
}
