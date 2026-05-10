import { describe, it, expect } from 'vitest'

// Test the formatWhatsAppNumber logic (extracted for testing)
function formatWhatsAppNumber(phone: string): string {
  let clean = phone.replace(/[\s\-()]/g, '')
  if (clean.startsWith('0')) clean = '54' + clean.slice(1)
  if (!clean.startsWith('+')) clean = '+' + clean
  return clean.replace('+', '')
}

describe('formatWhatsAppNumber', () => {
  it('handles Argentine mobile number starting with 0', () => {
    expect(formatWhatsAppNumber('0381 123 4567')).toBe('54381 123 4567'.replace(/\s/g, ''))
    expect(formatWhatsAppNumber('03814567890')).toBe('543814567890')
  })

  it('handles number already with country code', () => {
    expect(formatWhatsAppNumber('+54 381 1234567')).toBe('543811234567')
  })

  it('strips dashes and parentheses', () => {
    expect(formatWhatsAppNumber('(0381) 456-7890')).toBe('543814567890')
  })

  it('handles number without leading 0 or +', () => {
    expect(formatWhatsAppNumber('3814567890')).toBe('3814567890')
  })
})
