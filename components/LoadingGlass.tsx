import React from 'react';

interface LoadingGlassProps {
  label?: string;
  className?: string;
}

const LoadingGlass: React.FC<LoadingGlassProps> = ({ label = 'Loading...', className = '' }) => (
  <div className={`mx-auto flex w-full max-w-md items-center justify-center ${className}`}>
    <div className="flex w-full items-center gap-3 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm text-slate-500 shadow-sm backdrop-blur-md">
      <span className="relative inline-flex h-5 w-5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-500/40"></span>
        <span className="relative inline-flex h-5 w-5 rounded-full bg-cyan-600"></span>
      </span>
      <span className="font-medium">{label}</span>
      <span className="ml-auto h-2 w-24 animate-pulse rounded-full bg-slate-200/70"></span>
    </div>
  </div>
);

export default LoadingGlass;
