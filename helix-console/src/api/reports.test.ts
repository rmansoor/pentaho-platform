import { describe, expect, it } from 'vitest';
import { dateValue, formatExtension, parseReportPrompt, promptBody, reportUrl, selectedValues } from './reports';

const NS = 'http://reporting.pentaho.org/namespaces/engine/parameter-attributes/core';
const attr = (name: string, value: string) => `<attribute name="${name}" namespace="${NS}" value="${value}"/>`;

// Trimmed from the live 11.1 answer for Product Sales with PROD_LINE=Motorcycles.
const LIVE = `<?xml version="1.0" encoding="UTF-8"?><parameters autoSubmitUI="true" ignore-biserver-5538="true" is-prompt-needed="true" layout="vertical">
<parameter is-list="true" is-mandatory="false" is-multi-select="false" is-strict="true" name="PROD_LINE" type="java.lang.String">${attr('role', 'user')}${attr('parameter-layout', 'horizontal')}${attr('parameter-render-type', 'togglebutton')}${attr('label', 'Line')}${attr('mandatory', 'true')}<attribute name="has-downstream-dependent-parameter" namespace="http://reporting.pentaho.org/namespaces/engine/parameter-attributes/server" value="true"/>
<values><value label="Classic Cars" null="false" selected="false" type="java.lang.String" value="Classic Cars"/><value label="Motorcycles" null="false" selected="true" type="java.lang.String" value="Motorcycles"/></values><dependencies><name>PROD_CODE</name></dependencies></parameter>
<parameter is-list="true" is-mandatory="false" is-multi-select="false" is-strict="true" name="PROD_CODE" type="java.lang.String">${attr('role', 'user')}${attr('parameter-visible-items', '6')}${attr('parameter-render-type', 'list')}${attr('label', 'Product')}${attr('mandatory', 'true')}
<values><value label="1969 Harley Davidson Ultimate Chopper" null="false" selected="false" type="java.lang.String" value="S10_4698"/></values></parameter>
<parameter is-list="true" is-mandatory="true" is-multi-select="false" is-strict="true" name="output-target" type="java.lang.String">${attr('role', 'system')}${attr('label', 'Output Type')}${attr('parameter-render-type', 'dropdown')}
<values><value label="HTML (Paginated)" null="false" selected="false" type="java.lang.String" value="table/html;page-mode=page"/><value label="HTML (Single Page)" null="false" selected="true" type="java.lang.String" value="table/html;page-mode=stream"/><value label="PDF" null="false" selected="false" type="java.lang.String" value="pageable/pdf"/></values></parameter>
<parameter is-list="false" is-mandatory="false" is-multi-select="false" is-strict="false" name="accepted-page" type="java.lang.Integer">${attr('role', 'system')}${attr('hidden', 'true')}</parameter>
<parameter is-list="true" is-mandatory="false" is-multi-select="false" is-strict="true" name="includeReportSpecification" type="java.lang.Boolean">${attr('role', 'system')}${attr('hidden', 'true')}${attr('label', 'Add Page for Report Details')}</parameter>
<error message="This prompt value is of an invalid value" parameter="PROD_CODE"/></parameters>`;

describe('parseReportPrompt', () => {
  it('reads user parameters, formats and errors from the live answer', () => {
    const prompt = parseReportPrompt(LIVE);
    expect(prompt.promptNeeded).toBe(true);
    expect(prompt.autoSubmit).toBe(true);
    expect(prompt.parameters.map((p) => p.name)).toEqual(['PROD_LINE', 'PROD_CODE']);
    expect(prompt.parameters[0]).toMatchObject({ label: 'Line', renderType: 'togglebutton', horizontal: true, mandatory: true, hasDependents: true, multi: false });
    expect(prompt.parameters[1]).toMatchObject({ label: 'Product', renderType: 'list', visibleItems: 6 });
    expect(prompt.formats.map((f) => f.label)).toEqual(['HTML (Paginated)', 'HTML (Single Page)', 'PDF']);
    expect(prompt.errors).toEqual({ PROD_CODE: ['This prompt value is of an invalid value'] });
    expect(selectedValues(prompt)).toEqual({ PROD_LINE: ['Motorcycles'], PROD_CODE: [], 'output-target': ['table/html;page-mode=stream'] });
  });

  it('reads the page count from an XML-mode answer', () => {
    const prompt = parseReportPrompt('<parameters accepted-page="3" is-prompt-needed="false" page-count="15" paginate="true"/>');
    expect(prompt).toMatchObject({ pageCount: 15, acceptedPage: 3, promptNeeded: false });
  });

  it('refuses an answer that is not a parameter document', () => {
    expect(() => parseReportPrompt('<html><body>Report validation failed.</body></html>')).toThrow('Report validation failed.');
  });
});

describe('requests', () => {
  it('sends repeated fields for multi-select values', () => {
    expect(promptBody({ line: ['Ships', 'Planes'] }, 'XML', 2)).toBe('line=Ships&line=Planes&renderMode=XML&accepted-page=2');
  });

  it('builds report URLs for viewing and downloading', () => {
    expect(reportUrl('/public/Steel Wheels/Inventory List.prpt', { line: ['Ships'] }, { format: 'table/html;page-mode=page', page: 3 })).toBe(
      '/pentaho/api/repos/%3Apublic%3ASteel%20Wheels%3AInventory%20List.prpt/report?line=Ships&output-target=table%2Fhtml%3Bpage-mode%3Dpage&accepted-page=3&renderMode=REPORT&htmlProportionalWidth=false',
    );
    // Downloads use REPORT too: DOWNLOAD answers a placeholder on 11.1.
    expect(reportUrl('/a.prpt', {}, { format: 'pageable/pdf' })).toContain('renderMode=REPORT');
    expect(formatExtension('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;page-mode=flow')).toBe('xlsx');
    expect(formatExtension('table/csv;page-mode=stream')).toBe('csv');
  });

  it('writes picked dates the way the plugin parses them', () => {
    expect(dateValue('2026-11-26')).toMatch(/^2026-11-26T00:00:00\.000[+-]\d{4}$/);
  });
});
