import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Test the F-key date shortcut logic (extracted from DateInput component)
// ---------------------------------------------------------------------------

function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function shouldFillToday(key: string, ctrlKey: boolean, metaKey: boolean, altKey: boolean): boolean {
  return (key === 'f' || key === 'F') && !ctrlKey && !metaKey && !altKey
}

describe('DateInput F-key shortcut', () => {
  it('should trigger on lowercase f', () => {
    expect(shouldFillToday('f', false, false, false)).toBe(true)
  })

  it('should trigger on uppercase F', () => {
    expect(shouldFillToday('F', false, false, false)).toBe(true)
  })

  it('should NOT trigger with Ctrl+F', () => {
    expect(shouldFillToday('f', true, false, false)).toBe(false)
  })

  it('should NOT trigger with Cmd+F', () => {
    expect(shouldFillToday('f', false, true, false)).toBe(false)
  })

  it('should NOT trigger with Alt+F', () => {
    expect(shouldFillToday('f', false, false, true)).toBe(false)
  })

  it('should NOT trigger on other keys', () => {
    expect(shouldFillToday('a', false, false, false)).toBe(false)
    expect(shouldFillToday('Enter', false, false, false)).toBe(false)
  })

  it('getToday returns YYYY-MM-DD format', () => {
    const today = getToday()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ---------------------------------------------------------------------------
// Test WhatsApp number formatting (extracted from whatsapp-button)
// ---------------------------------------------------------------------------

function formatWhatsAppNumber(phone: string): string {
  let clean = phone.replace(/[\s\-()]/g, '')
  if (clean.startsWith('0')) clean = '54' + clean.slice(1)
  if (!clean.startsWith('+')) clean = '+' + clean
  return clean.replace('+', '')
}

describe('WhatsApp number formatting', () => {
  it('should handle Argentine mobile with leading 0', () => {
    expect(formatWhatsAppNumber('0381 155 123456')).toBe('54381155123456')
  })

  it('should handle number with dashes', () => {
    expect(formatWhatsAppNumber('0381-155-123456')).toBe('54381155123456')
  })

  it('should handle number already with country code', () => {
    expect(formatWhatsAppNumber('+54 381 155 123456')).toBe('54381155123456')
  })

  it('should handle clean number', () => {
    expect(formatWhatsAppNumber('5493814123456')).toBe('5493814123456')
  })
})
