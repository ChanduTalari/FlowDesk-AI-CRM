import { cn } from "../lib/cn";

interface LogoProps {
  className?: string;
}

/**
 * FlowDesk mark: an F drawn as pipeline flow lines, each arm terminating
 * in a lead node. Geometric, single-weight, reads at 16px and up.
 */
export function LogoMark({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        d="M9 6v20M9 10.5h12.5M9 17.5h8"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={21.5} cy={10.5} r={3} fill="currentColor" />
      <circle cx={17} cy={17.5} r={2.4} fill="currentColor" />
    </svg>
  );
}

/** Indigo tile carrying the mark. Used in the sidebar and on login. */
export function LogoTile({ className }: LogoProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-sm",
        className,
      )}
    >
      <LogoMark className="h-5 w-5" />
    </span>
  );
}
