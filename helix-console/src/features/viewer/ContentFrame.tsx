import { useEffect, useId } from 'react';
import type { MantleEvent } from '../../compat/mantle-bridge';

/**
 * The single frame that shows plugin content. Gives the frame an id and, when it goes away,
 * fires the GenericEvent "tabClosing" the GWT console fired for a closing tab, which pages such as
 * the report viewer use to release resources.
 */
export function ContentFrame({ src, title }: { src: string; title: string }) {
  const id = `helix-content-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  useEffect(
    () => () => {
      const fire = (window as unknown as { mantle_fireEvent?: (t: string, e: MantleEvent) => void }).mantle_fireEvent;
      fire?.('GenericEvent', { eventSubType: 'tabClosing', stringParam: id });
    },
    [id],
  );
  return (
    <iframe
      id={id}
      name={id}
      src={src}
      title={title}
      className="block h-full w-full border-0"
      // Plugin content is same-origin and needs scripts, forms, popups (export) and downloads.
      // With allow-scripts + allow-same-origin this does not isolate the content (it is the
      // server's own); it does stop plugin pages from navigating the console window away.
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
    />
  );
}
