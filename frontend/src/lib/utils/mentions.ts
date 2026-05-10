// ---------------------------------------------------------------------------
// @mention utilities
// Format stored in DB: @[uuid:Display Name]
// ---------------------------------------------------------------------------

export const MENTION_REGEX = /@\[([a-f0-9-]+):([^\]]+)\]/g

export interface ParsedMention {
  userId: string
  displayName: string
}

/** Extract all @mentions from text */
export function parseMentions(text: string): ParsedMention[] {
  const mentions: ParsedMention[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null
  const re = new RegExp(MENTION_REGEX.source, 'g')
  while ((match = re.exec(text)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1])
      mentions.push({ userId: match[1], displayName: match[2] })
    }
  }
  return mentions
}

/** Detect if cursor is in an active @query position */
export function getAtTriggerPosition(
  text: string,
  cursorPos: number,
): { start: number; query: string } | null {
  // Walk backwards from cursor to find @
  const before = text.slice(0, cursorPos)
  // Find last @ that isn't inside a mention token @[...]
  const atIdx = before.lastIndexOf('@')
  if (atIdx < 0) return null

  // Check it's not part of a completed mention @[uuid:name]
  const afterAt = text.slice(atIdx)
  if (afterAt.startsWith('@[')) return null

  // Must be at start of text or preceded by whitespace/newline
  if (atIdx > 0 && !/\s/.test(text[atIdx - 1])) return null

  const query = before.slice(atIdx + 1)
  // Abort if query contains newline (user moved on)
  if (query.includes('\n')) return null

  return { start: atIdx, query }
}

/** Replace @partial at cursor with a full mention token */
export function insertMention(
  text: string,
  cursorPos: number,
  member: { id: string; nombre: string; apellido: string },
): { newText: string; newCursor: number } {
  const trigger = getAtTriggerPosition(text, cursorPos)
  if (!trigger) return { newText: text, newCursor: cursorPos }

  const token = `@[${member.id}:${member.nombre} ${member.apellido}] `
  const before = text.slice(0, trigger.start)
  const after = text.slice(cursorPos)
  const newText = before + token + after
  return { newText, newCursor: before.length + token.length }
}

export interface MentionPart {
  type: 'text' | 'mention'
  content: string
  userId?: string
}

/** Split text into segments for rendering with styled @mention spans */
/** Strip UUIDs from mentions: `@[uuid:Name]` → `@Name` */
export function stripMentionIds(text: string): string {
  return text.replace(/@\[([a-f0-9-]+):([^\]]+)\]/g, '@$2')
}

/** Split text into segments for rendering with styled @mention spans */
export function renderMentionParts(text: string): MentionPart[] {
  const parts: MentionPart[] = []
  const re = new RegExp(MENTION_REGEX.source, 'g')
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    parts.push({
      type: 'mention',
      content: `@${match[2]}`,
      userId: match[1],
    })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return parts
}
