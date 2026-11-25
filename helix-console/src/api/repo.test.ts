import { describe, expect, it } from 'vitest';
import { parseFolderResponse, toPathId } from './repo';

describe('toPathId', () => {
  it('encodes slashes as colons and escapes colons in names', () => {
    expect(toPathId('/public/Steel Wheels')).toBe(encodeURIComponent(':public:Steel Wheels'));
    expect(toPathId('/public/a:b')).toBe(encodeURIComponent(':public:a\tb'));
    expect(toPathId('/')).toBe(encodeURIComponent(':'));
  });
});

describe('parseFolderResponse', () => {
  it('accepts the JAXB shape: string booleans, epoch strings, single child as an object', () => {
    const folder = parseFolderResponse({
      file: { name: 'Reports', path: '/public/Reports', folder: 'true', lastModifiedDate: '1787821200000' },
      children: {
        file: {
          name: 'Buyer Report.prpt',
          path: '/public/Reports/Buyer Report.prpt',
          folder: 'false',
          fileSize: '61442',
          lastModifiedDate: '1787821200000',
          owner: 'admin',
        },
      },
    });

    expect(folder.folder).toMatchObject({ folder: true, kind: 'folder', title: 'Reports' });
    expect(folder.children).toHaveLength(1);
    expect(folder.children[0]).toMatchObject({
      title: 'Buyer Report',
      kind: 'report',
      folder: false,
      size: 61442,
      owner: 'admin',
    });
    expect(folder.children[0]?.modified?.getTime()).toBe(1787821200000);
  });

  it('handles a live 11.1 folder entry: native types, fileSize -1, empty modified date, null owner', () => {
    const folder = parseFolderResponse({
      file: { name: 'public', path: '/public', title: 'Public', folder: true, fileSize: -1, createdDate: '1795643461373', lastModifiedDate: '' },
      children: [
        {
          file: { name: 'Steel Wheels', path: '/public/Steel Wheels', folder: true, fileSize: -1, createdDate: '1795643462385', lastModifiedDate: '', owner: null },
        },
      ],
    });
    expect(folder.folder.title).toBe('Public');
    expect(folder.children[0]).toMatchObject({ folder: true, size: undefined, owner: undefined });
    // Falls back to the creation date when the modified date is empty.
    expect(folder.children[0]?.modified?.getTime()).toBe(1795643462385);
  });

  it('accepts native JSON types and a missing children list', () => {
    const folder = parseFolderResponse({
      file: { name: 'Empty', path: '/public/Empty', folder: true, lastModifiedDate: 1787821200000 },
    });
    expect(folder.folder.folder).toBe(true);
    expect(folder.children).toEqual([]);
  });

  it('prefers the localized title over the file name', () => {
    const folder = parseFolderResponse({
      file: { name: 'x', path: '/x', folder: 'true' },
      children: [{ file: { name: 'sales.prpt', path: '/x/sales.prpt', title: 'Ventes', folder: 'false' } }],
    });
    expect(folder.children[0]?.title).toBe('Ventes');
  });
});
