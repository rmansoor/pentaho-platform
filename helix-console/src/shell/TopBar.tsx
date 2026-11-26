import { useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { ChevronDown, Database, FolderPlus, Menu as MenuIcon, Plus, Search, Upload } from 'lucide-react';
import { Button, IconButton, Menu } from '@helix/ui';
import { useSession } from '../api/repo-context';
import { NewFolderDialog } from '../features/files/NewFolderDialog';
import { UploadDialog } from '../features/files/UploadDialog';
import { NAV_RAIL_ID } from './NavRail';
import { useLayoutStore } from './layout-store';

export interface TopBarProps {
  onOpenDrawer: () => void;
  drawerOpen: boolean;
}

/** One top bar: menu (small screens), search entry point and the New button. */
export function TopBar({ onOpenDrawer, drawerOpen }: TopBarProps) {
  const openPalette = useLayoutStore((s) => s.setPaletteOpen);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const navigate = useNavigate();
  const session = useSession();
  const [newFolder, setNewFolder] = useState(false);
  const [uploading, setUploading] = useState(false);
  // New items go into the folder being browsed; elsewhere, into the user's home folder.
  const location = useRouterState({ select: (s) => s.location });
  const browsing = location.pathname.endsWith('/files') ? (location.search as { path?: string }).path : undefined;
  const target = browsing ?? (session.data ? `/home/${session.data.userName}` : '/public');
  return (
    <header className="flex h-topbar shrink-0 items-center gap-3 px-4 md:px-8">
      <IconButton
        variant="ghost"
        aria-label="Open menu"
        aria-controls={`${NAV_RAIL_ID}-drawer`}
        aria-expanded={drawerOpen}
        onClick={onOpenDrawer}
        className="md:hidden"
      >
        <MenuIcon size={20} aria-hidden="true" />
      </IconButton>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => openPalette(true)}
        aria-keyshortcuts={mac ? 'Meta+K' : 'Control+K'}
        className="hidden h-[42px] w-[300px] max-w-full items-center gap-2 rounded-[12px] border border-border bg-surface px-3.5 text-left text-fg-muted sm:flex"
      >
        <Search size={16} strokeWidth={2} aria-hidden="true" />
        <span className="flex-1">Search Helix</span>
        <kbd className="font-mono text-[11px]">{mac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <Menu
        items={[
          { label: 'New folder', icon: <FolderPlus size={15} aria-hidden="true" />, onSelect: () => setNewFolder(true) },
          { label: 'Upload files', icon: <Upload size={15} aria-hidden="true" />, onSelect: () => setUploading(true) },
          {
            label: 'Data source',
            icon: <Database size={15} aria-hidden="true" />,
            onSelect: () => {},
            disabled: true,
            reason: 'Coming with the next console milestone',
          },
        ]}
        trigger={(props) => (
          <Button variant="primary" icon={<Plus size={16} strokeWidth={2.4} aria-hidden="true" />} {...props}>
            New
            <ChevronDown size={14} aria-hidden="true" />
          </Button>
        )}
      />
      <UploadDialog open={uploading} folder={target} onClose={() => setUploading(false)} />
      <NewFolderDialog
        open={newFolder}
        parent={target}
        onClose={() => setNewFolder(false)}
        onCreated={(path) => void navigate({ to: '/files', search: { path } })}
      />
    </header>
  );
}
