import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useToastStore, toast } from '@/stores/toast-store'

describe('toast-store', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
    vi.useFakeTimers()
  })

  it('adds a success toast', () => {
    toast.success('Test title', 'Test desc')
    const state = useToastStore.getState()
    expect(state.toasts).toHaveLength(1)
    expect(state.toasts[0].type).toBe('success')
    expect(state.toasts[0].title).toBe('Test title')
    expect(state.toasts[0].description).toBe('Test desc')
  })

  it('adds an error toast', () => {
    toast.error('Error!', 'Something broke')
    const state = useToastStore.getState()
    expect(state.toasts).toHaveLength(1)
    expect(state.toasts[0].type).toBe('error')
  })

  it('removes toast after 5 seconds', () => {
    toast.info('Temporary')
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(5000)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('can manually remove a toast', () => {
    toast.warning('Manual remove')
    const id = useToastStore.getState().toasts[0].id
    useToastStore.getState().removeToast(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('handles multiple toasts', () => {
    toast.success('First')
    toast.error('Second')
    toast.info('Third')
    expect(useToastStore.getState().toasts).toHaveLength(3)
  })
})
