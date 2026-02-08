import React from 'react';

const SIZE_MAP = {
  sm: {
    box: 'h-6 w-6',
    ring: 'border-2',
    innerInset: 'inset-1',
    dot: 'h-1.5 w-1.5',
    text: 'text-[10px]',
    gap: 'gap-2',
  },
  md: {
    box: 'h-12 w-12',
    ring: 'border-4',
    innerInset: 'inset-2',
    dot: 'h-2 w-2',
    text: 'text-xs',
    gap: 'gap-3',
  },
  lg: {
    box: 'h-16 w-16',
    ring: 'border-4',
    innerInset: 'inset-2.5',
    dot: 'h-2.5 w-2.5',
    text: 'text-xs',
    gap: 'gap-4',
  },
};

export default function LoadingIndicator({ label = 'Loading…', size = 'md', className = '' }) {
  const s = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label || 'Loading'}
      className={`flex flex-col items-center justify-center ${s.gap} ${className}`}
    >
      <div className={`relative ${s.box}`}>
        <div className={`absolute inset-0 rounded-full ${s.ring} border-amber-500/25 border-t-amber-500 animate-spin`} />
        <div
          className={`absolute ${s.innerInset} rounded-full ${s.ring} border-white/10 border-t-white/60 animate-spin [animation-direction:reverse] [animation-duration:900ms]`}
        />
        <div className="absolute inset-0 grid place-items-center">
          <div className={`${s.dot} rounded-full bg-amber-500/90 animate-pulse shadow-[0_0_18px_rgba(245,158,11,0.35)]`} />
        </div>
      </div>

      {label ? <div className={`${s.text} font-black uppercase tracking-widest text-slate-400`}>{label}</div> : null}
    </div>
  );
}
