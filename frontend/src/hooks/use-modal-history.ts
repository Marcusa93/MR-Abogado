import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

/**
 * Intercepts the browser/phone back button while a modal is open and calls
 * `onClose` instead of navigating away from the page.
 *
 * Uses React Router's `useBlocker` (not raw `popstate`) so that the router
 * doesn't process the pop before we get to handle it.
 *
 * Usage: call `useModalHistory(onClose)` at the top of any modal component.
 * The `onClose` identity doesn't need to be stable — it's tracked via a ref.
 */
export function useModalHistory(onClose: () => void) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const blocker = useBlocker(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    // Cancel the navigation (stay on current page) then close the modal.
    blocker.reset()
    onCloseRef.current()
  }, [blocker.state])
}
