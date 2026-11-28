import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';

const REPORTS = '/public/Steel Wheels/Reports';
const frameSrc = async (title: string) => new URL((await screen.findByTitle(title)).getAttribute('src')!, 'http://x').searchParams;

describe('Built-in report viewer', () => {
  afterEach(() => localStorage.clear());

  it('runs the report with its default values and pages through it', async () => {
    const user = userEvent.setup();
    await renderApp(`/view?path=${REPORTS}/Inventory List.prpt`);

    const panel = await screen.findByRole('complementary', { name: 'Report parameters' });
    const line = within(panel).getByRole('group', { name: 'Line' });
    expect(within(line).getAllByRole('checkbox').map((c) => (c as HTMLInputElement).checked)).toEqual([true, true, true]);

    let params = await frameSrc('Inventory List');
    expect(params.getAll('line')).toEqual(['Classic Cars', 'Motorcycles', 'Ships']);
    expect(params.get('output-target')).toBe('table/html;page-mode=page');
    expect(params.get('accepted-page')).toBe('0');

    // 3 lines x 5 pages.
    const pager = await screen.findByRole('navigation', { name: 'Page 1 of 15' });
    await user.click(within(pager).getByRole('button', { name: 'Next page' }));
    expect((await frameSrc('Inventory List')).get('accepted-page')).toBe('1');
    await user.click(within(screen.getByRole('navigation', { name: 'Page 2 of 15' })).getByRole('button', { name: 'Last page' }));
    expect((await frameSrc('Inventory List')).get('accepted-page')).toBe('14');
    const box = within(screen.getByRole('navigation', { name: 'Page 15 of 15' })).getByRole('textbox', { name: 'Page' });
    await user.clear(box);
    await user.type(box, '3{Enter}');
    expect((await frameSrc('Inventory List')).get('accepted-page')).toBe('2');

    // Changing a value re-runs from the first page with the server's page count.
    await user.click(within(line).getByRole('checkbox', { name: 'Ships' }));
    await waitFor(async () => expect((await frameSrc('Inventory List')).getAll('line')).toEqual(['Classic Cars', 'Motorcycles']));
    expect((await frameSrc('Inventory List')).get('accepted-page')).toBe('0');
    expect(await screen.findByRole('navigation', { name: 'Page 1 of 10' })).toBeInTheDocument();
  });

  it('switches format and offers every format as a download', async () => {
    const user = userEvent.setup();
    await renderApp(`/view?path=${REPORTS}/Inventory List.prpt`);
    expect(await screen.findByTitle('Inventory List')).toHaveAttribute('sandbox');
    const viewAs = screen.getByRole('combobox', { name: 'View as' });
    expect(within(viewAs).getAllByRole('option').map((o) => o.textContent)).toEqual(['HTML (Paginated)', 'HTML (Single Page)', 'PDF']);
    await user.selectOptions(viewAs, 'PDF');
    expect((await frameSrc('Inventory List')).get('output-target')).toBe('pageable/pdf');
    // Chrome won't show a PDF in a sandboxed frame.
    expect(screen.getByTitle('Inventory List')).not.toHaveAttribute('sandbox');
    expect(screen.queryByRole('navigation', { name: /^Page/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['HTML (Paginated)', 'HTML (Single Page)', 'PDF', 'Excel', 'Comma Separated Value']);
  });

  it('refreshes dependent lists, shows errors, and waits for View report', async () => {
    const user = userEvent.setup();
    const source = createFixtureRepoSource();
    await renderApp(`/view?path=${REPORTS}/Top Customers.prpt`, source);

    const panel = await screen.findByRole('complementary', { name: 'Report parameters' });
    // This report doesn't run by itself.
    expect(screen.getByText('Choose the parameters, then select View report.')).toBeInTheDocument();
    expect(screen.queryByTitle('Top Customers')).not.toBeInTheDocument();

    const country = within(panel).getByRole('listbox', { name: /Country/ });
    expect(within(country).getAllByRole('option').map((o) => o.textContent)).toEqual(['France', 'Germany', 'Spain']);
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Market' }), 'NA');
    await waitFor(() => expect(within(country).getAllByRole('option').map((o) => o.textContent)).toEqual(['Canada', 'USA']));
    expect(within(panel).getByText('This prompt value is of an invalid value')).toBeInTheDocument();
    expect(screen.getByText("Fill in the report's parameters to see it.")).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'View report' })).toHaveAttribute('aria-disabled', 'true');

    await user.selectOptions(country, 'USA');
    await waitFor(() => expect(within(panel).queryByText('This prompt value is of an invalid value')).not.toBeInTheDocument());
    // Text commits when it loses focus, not per key.
    const before = source.reportRequests.length;
    const top = within(panel).getByRole('textbox', { name: 'How many' });
    await user.clear(top);
    await user.type(top, '25');
    expect(source.reportRequests.length).toBe(before);
    fireEvent.blur(top);
    await waitFor(() => expect(source.reportRequests.length).toBe(before + 1));

    await user.click(within(panel).getByRole('button', { name: 'View report' }));
    const params = await frameSrc('Top Customers');
    expect([params.get('market'), params.get('country'), params.get('top')]).toEqual(['NA', 'USA', '25']);
  });

  it('opens a report without parameters straight away, with the panel hidden', async () => {
    await renderApp(`/view?path=${REPORTS}/Buyer Report.prpt`);
    expect((await frameSrc('Buyer Report')).get('renderMode')).toBe('REPORT');
    expect(screen.queryByRole('complementary', { name: 'Report parameters' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show parameters' })).not.toBeInTheDocument();
  });

  it("switches to the plugin's classic viewer and remembers it", async () => {
    const user = userEvent.setup();
    await renderApp(`/view?path=${REPORTS}/Buyer Report.prpt`);
    await user.click(await screen.findByRole('button', { name: 'Classic viewer' }));
    expect(await screen.findByTitle('Buyer Report')).toHaveAttribute('src', '/pentaho/api/repos/%3Apublic%3ASteel%20Wheels%3AReports%3ABuyer%20Report.prpt/viewer');
    expect(localStorage.getItem('helix.reportViewer.classic')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Built-in viewer' }));
    expect((await frameSrc('Buyer Report')).get('renderMode')).toBe('REPORT');
  });
});
