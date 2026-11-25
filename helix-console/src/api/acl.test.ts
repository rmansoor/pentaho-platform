import { describe, expect, it } from 'vitest';
import { aclRequestBody, parseAclResponse, parseMetadataResponse } from './repo';
import { togglePermission } from '../features/files/PropertiesSheet';

describe('ACL parsing', () => {
  it('reads a live 11.1 ACL: single permission as a string, ALL as every permission', () => {
    const acl = parseAclResponse({
      aces: [
        { recipient: 'Authenticated', tenantPath: null, modifiable: true, recipientType: 1, permissions: '0' },
        { recipient: 'suzy', modifiable: true, recipientType: 0, permissions: ['0', '1'] },
        { recipient: 'Administrator', modifiable: false, recipientType: 1, permissions: '4' },
      ],
      owner: 'admin',
      ownerType: 0,
      entriesInheriting: false,
    });
    expect(acl.owner).toBe('admin');
    expect(acl.inheriting).toBe(false);
    expect(acl.entries.map((e) => [e.recipient, e.kind, [...e.permissions]])).toEqual([
      ['Authenticated', 'role', ['read']],
      ['suzy', 'user', ['read', 'write']],
      ['Administrator', 'role', ['read', 'write', 'delete', 'manage']],
    ]);
    expect(acl.entries[2]?.modifiable).toBe(false);
  });
});

describe('ACL request body', () => {
  const base = { owner: 'admin', ownerKind: 'user' as const };

  it('turns inheritance on by sending no aces (the server list setter would reset it)', () => {
    const body = JSON.parse(
      aclRequestBody({ ...base, inheriting: true, entries: [{ recipient: 'x', kind: 'user', modifiable: true, permissions: new Set(['read']) }] }),
    );
    expect(body).toEqual({ owner: 'admin', ownerType: 0, entriesInheriting: true });
  });

  it('sends explicit entries, drops display-only and empty ones, and folds all four into ALL', () => {
    const body = JSON.parse(
      aclRequestBody({
        ...base,
        inheriting: false,
        entries: [
          { recipient: 'suzy', kind: 'user', modifiable: true, permissions: new Set(['read', 'write']) },
          { recipient: 'Power User', kind: 'role', modifiable: true, permissions: new Set(['read', 'write', 'delete', 'manage']) },
          { recipient: 'bob', kind: 'user', modifiable: true, permissions: new Set() },
          { recipient: 'Administrator', kind: 'role', modifiable: false, permissions: new Set(['read']) },
        ],
      }),
    );
    expect(body.entriesInheriting).toBe(false);
    expect(body.aces).toEqual([
      { recipient: 'suzy', recipientType: 0, modifiable: true, permissions: ['0', '1'] },
      { recipient: 'Power User', recipientType: 1, modifiable: true, permissions: ['4'] },
    ]);
  });
});

describe('metadata', () => {
  it('reads the hidden and schedulable flags', () => {
    expect(
      parseMetadataResponse({
        stringKeyStringValueDto: [
          { key: '_PERM_SCHEDULABLE', value: 'false' },
          { key: '_PERM_HIDDEN', value: 'true' },
        ],
      }),
    ).toEqual({ hidden: true, schedulable: false });
    // Missing keys: visible and schedulable, as the server defaults.
    expect(parseMetadataResponse({ stringKeyStringValueDto: null })).toEqual({ hidden: false, schedulable: true });
  });
});

describe('togglePermission', () => {
  it('ticks what a permission needs and unticks what needs it', () => {
    expect([...togglePermission(new Set(), 'delete', true)]).toEqual(['read', 'write', 'delete']);
    expect([...togglePermission(new Set(['read', 'write', 'delete', 'manage']), 'write', false)]).toEqual(['read']);
    expect([...togglePermission(new Set(['read']), 'manage', true)]).toEqual(['read', 'write', 'delete', 'manage']);
  });
});
