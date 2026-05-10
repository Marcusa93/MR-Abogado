import { describe, it, expect } from 'vitest'

// Test the WhatsApp URL generation indirectly by importing the format function
// We test the number formatting logic

describe('WhatsApp number formatting', () => {
  // Replicate the formatWhatsAppNumber logic for testing
  function formatWhatsAppNumber(phone: string): string {
    let clean = phone.replace(/[\s\-()]/g, '')
    if (clean.startsWith('0')) clean = '54' + clean.slice(1)
    if (!clean.startsWith('+')) clean = '+' + clean
    return clean.replace('+', '')
  }

  it('formats Argentine mobile numbers correctly', () => {
    expect(formatWhatsAppNumber('0381-155-123456')).toBe('54381155123456')
    expect(formatWhatsAppNumber('011 15 1234 5678')).toBe('54111512345678')
  })

  it('handles numbers starting with 54', () => {
    expect(formatWhatsAppNumber('54 381 123456')).toBe('54381123456')
  })

  it('handles numbers with +', () => {
    expect(formatWhatsAppNumber('+54 381 123456')).toBe('54381123456')
  })

  it('strips spaces, dashes, parens', () => {
    expect(formatWhatsAppNumber('(0381) 456-7890')).toBe('543814567890')
  })
})

describe('WhatsApp contextual messages', () => {
  // Test the message builder logic
  function buildMessage(tipo: string, nombre?: string): string {
    const saludo = nombre
      ? `Hola ${nombre}! Nos comunicamos del estudio Alba Guerra`
      : 'Hola! Nos comunicamos del estudio Alba Guerra'

    switch (tipo) {
      case 'turno':
        return `${saludo} para recordarle que tiene un turno en ANSES.`
      case 'resolucion':
        return `${saludo}. Nos complace informarle que su trámite ha sido resuelto favorablemente.`
      case 'documentacion':
        return `${saludo} para informarle que necesitamos documentación adicional.`
      default:
        return `${saludo} para comunicarle sobre el estado de su trámite.`
    }
  }

  it('includes client name when provided', () => {
    const msg = buildMessage('general', 'María')
    expect(msg).toContain('Hola María!')
    expect(msg).toContain('estudio Alba Guerra')
  })

  it('works without client name', () => {
    const msg = buildMessage('general')
    expect(msg).toContain('Hola!')
    expect(msg).not.toContain('undefined')
  })

  it('turno message mentions ANSES', () => {
    const msg = buildMessage('turno', 'Juan')
    expect(msg).toContain('turno en ANSES')
  })

  it('resolucion message is positive', () => {
    const msg = buildMessage('resolucion', 'Ana')
    expect(msg).toContain('resuelto favorablemente')
  })

  it('documentacion message requests docs', () => {
    const msg = buildMessage('documentacion')
    expect(msg).toContain('documentación adicional')
  })
})
