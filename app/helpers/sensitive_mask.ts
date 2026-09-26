/**
 * Carácter de máscara — U+2022 BULLET (•).
 *
 * Se eligió porque:
 *   - No aparece en ningún dato legítimo (CURP, RFC, CLABE, correo, teléfono, diagnóstico).
 *   - Es detectable de forma fiable para rechazar escrituras accidentales de la máscara
 *     como valor real (regla 9 de la HU, guard `noMaskChar` en los validators).
 *
 * Ref: USRH1783019898097 §9 (sustituido por USRH1789328027039).
 */
export const MASK_CHAR = '•' // U+2022

/** Máscara fija única para cualquier dato sensible tapado (USRH1789328027039). */
export const SENSITIVE_MASK = MASK_CHAR.repeat(5)

/**
 * Enmascara un valor sensible devolviendo la máscara fija sin pistas.
 *
 * Reglas (USRH1789328027039):
 *   - Valor capturado → `SENSITIVE_MASK` (`•••••`), sin importar categoría, largo ni forma.
 *   - `null` / `undefined` → `null`.
 *   - Cadena vacía o solo espacios → se devuelve igual (no hay dato que tapar).
 *
 * El servidor (nómina, exports, validaciones) lee las propiedades del modelo
 * (ya descifradas por `consume`) sin pasar por esta función; esta solo aplica
 * a la serialización JSON hacia el BO.
 *
 * @param value — valor en claro (post-descifrado del modelo Lucid).
 * @returns       — cadena enmascarada o `null`.
 */
export function maskSensitiveValue(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  if (value.trim() === '') return value
  return SENSITIVE_MASK
}

/** Formas reconocidas como eco de máscara — reconocimiento sin BD (USRH1787433076990). */
export const MASK_ECHO_PATTERNS: readonly RegExp[] = [
  /^•+$/, // máscara fija (USRH1789328027039)
  /^•+[^•]{4}$/, // identificación, financiero, teléfonos (forma heredada)
  /^[^•]•{3}@[^•]+$/, // correo contacto (forma heredada)
]

export function isMaskEcho(value: unknown): boolean {
  return typeof value === 'string' && MASK_ECHO_PATTERNS.some((pattern) => pattern.test(value))
}
