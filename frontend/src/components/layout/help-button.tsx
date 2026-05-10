import { HelpCircle } from 'lucide-react'
import { useOnboardingStore } from '@/stores/onboarding-store'

export function HelpButton() {
  const open = useOnboardingStore((s) => s.open)

  return (
    <button
      type="button"
      onClick={open}
      aria-label="Ver tour de bienvenida"
      title="Ver tour de bienvenida"
      data-tour="help-button"
      className="rounded-lg p-2 text-zinc-600 dark:text-zinc-400 hover:bg-white/5 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
    >
      <HelpCircle className="h-5 w-5" />
    </button>
  )
}
