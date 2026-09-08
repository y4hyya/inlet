export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4h7a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M2 12h11" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
