/// The Inlet mark from brand/mark.svg, the stem and the dot, sized by its height.
export function InletMark({ height = 12, className }: { height?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 181 719" height={height} width={(height * 181) / 719} aria-hidden="true" focusable="false">
      <path className="inlet-mark-stem" d="M52.79 184.6H180.79V718.6H52.79Z" fill="currentColor" />
      <path className="inlet-mark-dot" d="M0 0H128.01L180.79 113.2H52.79Z" fill="var(--inlet-accent, #f08a59)" />
    </svg>
  );
}
