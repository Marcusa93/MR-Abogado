import { useCallback, useEffect, useRef, useState } from 'react'

export interface DragPos { x: number; y: number }

function clamp(p: DragPos, size: { w: number; h: number }): DragPos {
  return {
    x: Math.max(8, Math.min(window.innerWidth - size.w - 8, p.x)),
    y: Math.max(8, Math.min(window.innerHeight - size.h - 8, p.y)),
  }
}

/**
 * Makes a fixed-position element draggable via pointer events (mouse + touch).
 * Persists position to localStorage.
 *
 * Usage:
 *   const { pos, handlers, wasDrag } = useDraggable('my-key', { w: 52, h: 52 })
 *
 *   <button
 *     style={pos ? { position:'fixed', left: pos.x, top: pos.y } : defaultStyle}
 *     onClick={() => { if (wasDrag()) return; doToggle() }}
 *     {...handlers}
 *   />
 *
 * wasDrag() returns true if the last pointerdown resulted in a drag — call it
 * at the top of onClick to suppress accidental clicks after dragging.
 */
export function useDraggable(storageKey: string, size: { w: number; h: number }) {
  const [pos, setPos] = useState<DragPos | null>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      return clamp(JSON.parse(raw) as DragPos, size)
    } catch {
      return null
    }
  })

  const active = useRef(false)
  const movedRef = useRef(false)
  const origin = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const latestPos = useRef<DragPos | null>(pos)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => { latestPos.current = pos }, [pos])

  // Clamp on viewport resize
  useEffect(() => {
    const onResize = () => setPos(p => p ? clamp(p, size) : p)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [size.w, size.h])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    // Only primary button / single touch
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    origin.current = { mx: e.clientX, my: e.clientY, px: rect.left, py: rect.top }
    active.current = true
    movedRef.current = false
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!active.current) return
    const dx = e.clientX - origin.current.mx
    const dy = e.clientY - origin.current.my
    if (!movedRef.current && Math.hypot(dx, dy) < 6) return
    movedRef.current = true
    setIsDragging(true)
    const next = clamp({ x: origin.current.px + dx, y: origin.current.py + dy }, size)
    setPos(next)
    latestPos.current = next
  }, [size.w, size.h])

  const onPointerUp = useCallback(() => {
    active.current = false
    setIsDragging(false)
    if (latestPos.current) {
      localStorage.setItem(storageKey, JSON.stringify(latestPos.current))
    }
  }, [storageKey])

  /** Call at the top of onClick — returns true if the gesture was a drag, not a tap */
  const wasDrag = useCallback(() => {
    if (movedRef.current) { movedRef.current = false; return true }
    return false
  }, [])

  return {
    pos,
    isDragging,
    wasDrag,
    handlers: { onPointerDown, onPointerMove, onPointerUp } as const,
  }
}
