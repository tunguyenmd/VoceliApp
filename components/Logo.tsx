export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  // A heart whose lower half is a voice waveform.
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="heard-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c8643f" />
          <stop offset="1" stopColor="#d9a441" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="40" height="40" rx="12" fill="#3d405b" />
      <path
        d="M20 30.5c-.5 0-1-.2-1.4-.5C12.4 25 9 21.6 9 17.4 9 14.4 11.3 12 14.2 12c2 0 3.5 1 4.4 2.4h2.8C22.3 13 23.8 12 25.8 12c2.9 0 5.2 2.4 5.2 5.4 0 4.2-3.4 7.6-9.6 12.6-.4.3-.9.5-1.4.5z"
        fill="url(#heard-g)"
      />
      <g stroke="#fbf8f3" strokeWidth="1.6" strokeLinecap="round">
        <line x1="14.5" y1="18" x2="14.5" y2="21" />
        <line x1="17.5" y1="16.5" x2="17.5" y2="23" />
        <line x1="20.5" y1="18.5" x2="20.5" y2="25" />
        <line x1="23.5" y1="16" x2="23.5" y2="22.5" />
        <line x1="26.5" y1="18" x2="26.5" y2="20.5" />
      </g>
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className="font-display text-2xl font-semibold text-ink">Heard</span>
    </span>
  );
}
