import { randomStringFromAlphabet } from './csprng_string.js'

/**
 * Acuñación del texto del código de una alianza comercial
 * (USRH1788505941894).
 *
 * Alfabeto de 32 símbolos en mayúsculas, subconjunto del permitido por
 * el catálogo (`[A-Za-z0-9._-]{3,40}`), sin caracteres que se confunden
 * al dictar (I, O, 0, 1). Sobrevive intacto al `@beforeSave` de
 * MAYÚSCULAS. 32^10 = 50 bits.
 */

export const ALLIANCE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ALLIANCE_CODE_LENGTH = 10
export const ALLIANCE_CODE_MAX_ATTEMPTS = 8

function defaultGenerateAllianceCodeText(): string {
  return randomStringFromAlphabet(ALLIANCE_CODE_ALPHABET, ALLIANCE_CODE_LENGTH)
}

let generateImpl: () => string = defaultGenerateAllianceCodeText

/** Texto de 10 caracteres CSPRNG del alfabeto sin ambiguos. */
export function generateAllianceCodeText(): string {
  return generateImpl()
}

/**
 * Solo pruebas: fuerza el texto generado (colisión o agotamiento).
 * Pasar `null` restaura el generador real.
 */
export function replaceAllianceCodeTextGenerator(fn: (() => string) | null): void {
  generateImpl = fn ?? defaultGenerateAllianceCodeText
}
