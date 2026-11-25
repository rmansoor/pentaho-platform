import type { ReactNode } from 'react';
import { Card } from '@helix/ui';
import { FolderTree } from './FolderTree';

export interface FilesLayoutProps {
  /** Breadcrumb or other line above the title. */
  eyebrow: ReactNode;
  title: string;
  /** Folder path, or TRASH_NODE when the trash is open. */
  treePath: string;
  onOpenFolder: (path: string) => void;
  onOpenTrash: () => void;
  toolbar: ReactNode;
  children: ReactNode;
  busy?: boolean;
}

/** Shared frame for Files and Trash: header, folder tree card, and the table card. */
export function FilesLayout({ eyebrow, title, treePath, onOpenFolder, onOpenTrash, toolbar, children, busy }: FilesLayoutProps) {
  return (
    <div className="flex flex-col gap-5 pt-1">
      <header className="min-w-0">
        {eyebrow}
        <h1 className="m-0 mt-0.5 truncate text-[28px] font-extrabold tracking-[-0.02em]">{title}</h1>
      </header>

      <div className="flex flex-wrap items-start gap-5">
        <Card className="max-w-full flex-[1_1_220px] p-3 md:max-w-[260px]">
          <FolderTree currentPath={treePath} onSelect={onOpenFolder} onOpenTrash={onOpenTrash} />
        </Card>

        <Card className="min-w-0 flex-[999_1_460px] overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-divider px-[18px] py-3.5">{toolbar}</div>
          <div className="overflow-x-auto" aria-busy={busy}>
            {children}
          </div>
        </Card>
      </div>
    </div>
  );
}

/** "3 selected" / "12 items" in the toolbar. */
export function SelectionCount({ selected, total }: { selected: number; total?: number }) {
  return (
    <span className="font-bold" aria-live="polite">
      {selected > 0 ? `${selected} selected` : total === undefined ? '' : `${total} ${total === 1 ? 'item' : 'items'}`}
    </span>
  );
}
