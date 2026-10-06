import { timingSafeEqual } from 'node:crypto'

const utf8Encoder = new TextEncoder()

/**
 * Comparación en tiempo constante del token opaco del borrador de registro (USRH1790718243123).
 */
export function signupTokenMatches(stored: string | null | undefined, presented: string): boolean {
  if (stored === null || stored === undefined) {
    return false
  }
  const left = utf8Encoder.encode(stored)
  const right = utf8Encoder.encode(presented)
  if (left.length !== right.length) {
    return false
  }
  return timingSafeEqual(left, right)
}
