import type { LegalCategory } from '#constants/sensitive_fields'

/**
 * Carácter de máscara — U+2022 BULLET (•).
 *
 * Se eligió porque:
 *   - No aparece en ningún dato legítimo (CURP, RFC, CLABE, correo, teléfono, diagnóstico).
 *   - Es detectabe de forma fiable para rechazar escrituras accidentales de la máscara
 *     como valor real (regla 9 de la HU, guard `noMaskChar` en los validators).
 *
 * Ref: USRH1783019898097 §9.
 */
export const MASK_CHAR = '•' // U+2022

/**
 * Enmascara un valor sensible devolviendo solo la pista mínima necesaria para
 * el trabajo diario, sin revelar el dato completo.
 *
 * Reglas por categoría (USRH1783019898097 §9):
 *   - `identificacion` | `financiero` | teléfonos (`contacto` no-correo):
 *       `•` × (len − 4) + últimos 4 caracteres.
 *       Ejemplo: CURP "ABCD123456MDFABC01" → "••••••••••••••BC01"
 *   - `contacto` correo (valor con `@`):
 *       primer carácter + `•••@` + dominio completo.
 *       Ejemplo: "juan@empresa.com" → "j•••@empresa.com"
 *   - `salud` | `biometrico`:
 *       máscara total fija `•••••` — dato sensible reforzado; ninguna pista.
 *   - `null` / `undefined` → `null` (sin transformación).
 *
 * El servidor (nómina, exports, validaciones) lee las propiedades del modelo
 * (ya descifradas por `consume`) sin pasar por esta función; esta solo aplica
 * a la serialización JSON hacia el BO.
 *
 * @param value         — valor en claro (post-descifrado del modelo Lucid).
 * @param legalCategory — categoría LFPDPPP del campo.
 * @returns             — cadena enmascarada o `null`.
 */
export function maskSensitiveValue(
  value: string | null | undefined,
  legalCategory: LegalCategory
): string | null {
  if (value === null || value === undefined) return null

  switch (legalCategory) {
    case 'salud':
    case 'biometrico':
      return MASK_CHAR.repeat(5)

    case 'contacto':
      return value.includes('@') ? maskEmail(value) : maskLastFour(value)

    case 'identificacion':
    case 'financiero':
      return maskLastFour(value)
  }
}

// ─── helpers privados ─────────────────────────────────────────────────────────

/**
 * Devuelve `•` × (len − 4) + últimos 4 caracteres.
 * Si el valor tiene 4 o menos caracteres, enmascara todo.
 */
function maskLastFour(value: string): string {
  if (value.length <= 4) return MASK_CHAR.repeat(value.length)
  return MASK_CHAR.repeat(value.length - 4) + value.slice(-4)
}

/**
 * Devuelve primer carácter + `•••@` + dominio completo.
 * Si el valor no contiene `@`, aplica `maskLastFour` como fallback.
 */
function maskEmail(value: string): string {
  const atIdx = value.indexOf('@')
  if (atIdx < 0) return maskLastFour(value)
  const domain = value.slice(atIdx + 1)
  const firstChar = value.length > 0 ? value[0] : MASK_CHAR
  return `${firstChar}${MASK_CHAR.repeat(3)}@${domain}`
}
