import { Card } from '@helix/ui';

export interface AreaPlaceholderProps {
  title: string;
  description: string;
}

/** Holds an area's place in the shell until its feature module lands. */
export function AreaPlaceholder({ title, description }: AreaPlaceholderProps) {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.02em]">{title}</h1>
      <Card className="p-6">
        <p className="m-0 max-w-[60ch] leading-relaxed text-fg-soft">{description}</p>
      </Card>
    </div>
  );
}
