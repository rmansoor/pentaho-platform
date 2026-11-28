/** The Helix double-strand mark from the Atlas style tile. Decorative: pair it with the word "Helix". */
export function HelixMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M7 2c0 5 10 5 10 10s-10 5-10 10" />
      <path d="M17 2c0 5-10 5-10 10s10 5 10 10" stroke="var(--hx-rail-mark)" />
      <path d="M9.5 5h5M9.5 19h5" />
    </svg>
  );
}
