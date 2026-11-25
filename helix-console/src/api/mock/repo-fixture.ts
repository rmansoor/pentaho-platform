import type { RepoSource } from '../repo';
import { parseFolderResponse } from '../repo';

/*
 * A small sample repository in the JSON shape the server returns, so the fixture exercises the
 * real parser. Used by tests and by `npm run dev:mock` for working on screens without a server.
 */

type Node = { name: string; owner?: string; modified: string; size?: number; children?: Node[] };

const day = (iso: string) => String(Date.parse(`${iso}T09:00:00Z`));

const TREE: Node = {
  name: '',
  modified: day('2026-01-05'),
  children: [
    {
      name: 'home',
      modified: day('2026-01-05'),
      children: [
        {
          name: 'admin',
          owner: 'admin',
          modified: day('2026-11-20'),
          children: [
            { name: 'Q3 review.prpt', owner: 'admin', modified: day('2026-11-20'), size: 48_213 },
            { name: 'Drafts', owner: 'admin', modified: day('2026-10-02'), children: [] },
          ],
        },
        { name: 'suzy', owner: 'suzy', modified: day('2026-09-14'), children: [] },
      ],
    },
    {
      name: 'public',
      modified: day('2026-01-05'),
      children: [
        {
          name: 'Steel Wheels',
          owner: 'admin',
          modified: day('2026-08-27'),
          children: [
            {
              name: 'Dashboards',
              owner: 'tiffany',
              modified: day('2026-06-09'),
              children: [
                { name: 'Territory Sales.wcdf', owner: 'tiffany', modified: day('2026-06-09'), size: 6_120 },
                { name: 'Customer Map.wcdf', owner: 'tiffany', modified: day('2026-06-03'), size: 5_870 },
              ],
            },
            {
              name: 'Data Integration',
              owner: 'pat',
              modified: day('2026-05-21'),
              children: [
                { name: 'Load orders.ktr', owner: 'pat', modified: day('2026-05-21'), size: 31_004 },
                { name: 'Nightly refresh.kjb', owner: 'pat', modified: day('2026-05-20'), size: 12_377 },
              ],
            },
            {
              name: 'Reports',
              owner: 'admin',
              modified: day('2026-08-27'),
              children: [
                { name: 'Buyer Report.prpt', owner: 'admin', modified: day('2026-08-27'), size: 61_442 },
                { name: 'Income Statement.prpt', owner: 'admin', modified: day('2026-08-14'), size: 54_118 },
                { name: 'Inventory List.prpt', owner: 'suzy', modified: day('2026-07-02'), size: 39_850 },
                { name: 'Top Customers.prpt', owner: 'suzy', modified: day('2026-07-02'), size: 42_731 },
                { name: 'Product Sales.prpti', owner: 'pat', modified: day('2026-06-18'), size: 18_904 },
                { name: 'Order Status.xanalyzer', owner: 'pat', modified: day('2026-06-11'), size: 9_216 },
              ],
            },
          ],
        },
        { name: 'Operations', owner: 'admin', modified: day('2026-03-30'), children: [] },
      ],
    },
  ],
};

function find(path: string): Node | undefined {
  const parts = path.split('/').filter(Boolean);
  let node: Node | undefined = TREE;
  for (const part of parts) node = node?.children?.find((c) => c.name === part);
  return node;
}

// Same shape as a Pentaho 11.1 server: native booleans, folders with fileSize -1 and an empty
// lastModifiedDate, dates as epoch-millisecond strings, and no owner in tree responses.
function dto(node: Node, path: string) {
  const folder = node.children !== undefined;
  return {
    name: node.name,
    path: path || '/',
    folder,
    hidden: false,
    fileSize: folder ? -1 : (node.size ?? 0),
    createdDate: node.modified,
    lastModifiedDate: folder ? '' : node.modified,
  };
}

export function createFixtureRepoSource(options: { delayMs?: number } = {}): RepoSource {
  return {
    async listFolder(path) {
      if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
      const node = find(path);
      if (!node || node.children === undefined) {
        throw new Error(`No folder at ${path}`);
      }
      const base = path === '/' ? '' : path;
      const children = node.children.map((c) => ({ file: dto(c, `${base}/${c.name}`) }));
      const json = { file: dto(node, path), children };
      return parseFolderResponse(json);
    },
  };
}
