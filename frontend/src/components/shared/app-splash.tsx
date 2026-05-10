interface AppSplashProps {
  message?: string
  fullscreen?: boolean
  phase?: 'enter' | 'exit'
}

export function AppSplash({
  message = 'Sistema de gestión de expedientes',
  fullscreen = true,
  phase = 'enter',
}: AppSplashProps) {
  return (
    <div
      className={[
        'relative isolate flex items-center justify-center overflow-hidden bg-zinc-50 dark:bg-zinc-950',
        fullscreen ? 'min-h-screen px-6 py-10' : 'min-h-[24rem] rounded-[2rem] px-6 py-10',
      ].join(' ')}
      role="status"
      aria-label={message}
    >
      <div className="brand-splash-bg absolute inset-0" />
      <div className="absolute inset-0 dot-pattern opacity-25" />
      <div className="animate-logo-aura absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--brand-accent)]/12 blur-3xl dark:bg-[var(--brand-accent)]/10" />

      <div
        className={[
          'relative z-10 flex max-w-2xl flex-col items-center gap-6 text-center',
          phase === 'exit' ? 'animate-brand-splash-out' : 'animate-brand-splash-in',
        ].join(' ')}
      >
        <div className="brand-logo-frame">
          <img
            src="/logo/mr-logo-blanco.svg"
            alt="Marco Rossi"
            className="animate-brand-logo h-40 w-auto object-contain md:h-56"
          />
        </div>

        <div className="animate-fade-in-up [animation-delay:180ms] [animation-fill-mode:both]">
          <p className="text-[0.68rem] font-medium uppercase tracking-[0.45em] text-zinc-500 dark:text-zinc-400">
            Dr. Marco Rossi
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[0.14em] text-zinc-950 dark:text-zinc-50 md:text-4xl">
            Estudio Jurídico
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 md:text-base">{message}</p>
        </div>
      </div>
    </div>
  )
}
