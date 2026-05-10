import { useCallback, type KeyboardEvent } from 'react'

/**
 * Hook that returns an onKeyDown handler for date inputs.
 * When the user presses "F", it fills in today's date.
 * Also enforces minimum date (today) if `minToday` is true.
 */
export function useDateShortcut(
  setter: (date: string) => void,
  options: { minToday?: boolean } = {}
) {
  const today = new Date().toISOString().split('T')[0]

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'f' || e.key === 'F') {
        // Only trigger if not typing in a text input (only for date inputs)
        const target = e.currentTarget
        if (target.type === 'date') {
          e.preventDefault()
          setter(today)
        }
      }
    },
    [setter, today]
  )

  return {
    onKeyDown,
    min: options.minToday ? today : undefined,
    today,
  }
}
