import vine from '@vinejs/vine'

/** Mapa de caracteres RFC según Anexo 20 del SAT para el dígito verificador. */
const RFC_CHAR_VALUES: Record<string, number> = {
  '0': 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  A: 10,
  B: 11,
  C: 12,
  D: 13,
  E: 14,
  F: 15,
  G: 16,
  H: 17,
  I: 18,
  J: 19,
  K: 20,
  L: 21,
  M: 22,
  N: 23,
  O: 25,
  P: 26,
  Q: 27,
  R: 28,
  S: 29,
  T: 30,
  U: 31,
  V: 32,
  W: 33,
  X: 34,
  Y: 35,
  Z: 36,
  ' ': 37,
  Ñ: 38,
  '&': 24,
}

const RFC_MORAL_PATTERN = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/
const RFC_FISICA_PATTERN = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/

/** RFC genéricos oficiales del SAT (público en general); no aplican dígito verificador estándar. */
export const SAT_GENERIC_RFCS = ['XAXX010101000', 'XEXX010101000'] as const

/**
 * Indica si el valor es un RFC genérico reservado por el SAT.
 */
export function isSatGenericRfc(value: string): boolean {
  return (SAT_GENERIC_RFCS as readonly string[]).includes(normalizeRfc(value))
}

/**
 * Normaliza un RFC: trim y mayúsculas.
 */
export function normalizeRfc(value: string): string {
  return value.trim().toUpperCase()
}

function mapRfcChar(char: string): number | undefined {
  return RFC_CHAR_VALUES[char]
}

/**
 * Calcula el dígito verificador SAT para la porción base del RFC (sin el último carácter).
 */
export function computeRfcCheckDigit(rfcBase: string): string {
  let sum = 0
  for (let i = 0; i < rfcBase.length; i++) {
    const mapped = mapRfcChar(rfcBase[i])
    if (mapped === undefined) {
      return ''
    }
    sum += mapped * (rfcBase.length + 1 - i)
  }

  const remainder = sum % 11
  if (remainder === 0) {
    return '0'
  }
  const check = 11 - remainder
  if (check === 10) {
    return 'A'
  }
  return String(check)
}

/**
 * Valida formato (12 persona moral / 13 persona física) y dígito verificador SAT.
 */
export function isValidRfcSat(value: string): boolean {
  const rfc = normalizeRfc(value)

  if (isSatGenericRfc(rfc)) {
    return true
  }

  if (rfc.length !== 12 && rfc.length !== 13) {
    return false
  }

  const pattern = rfc.length === 12 ? RFC_MORAL_PATTERN : RFC_FISICA_PATTERN
  if (!pattern.test(rfc)) {
    return false
  }

  const base = rfc.slice(0, -1)
  const providedCheck = rfc.slice(-1)
  const expectedCheck = computeRfcCheckDigit(base)

  return expectedCheck.length > 0 && expectedCheck === providedCheck
}

/** Mensaje de detalle cuando el dígito verificador no coincide. */
export function rfcInvalidDetailMessage(): string {
  return 'El RFC no cumple con el formato del SAT o el dígito verificador es incorrecto.'
}

const rfcSatRule = vine.createRule((value, _options, field) => {
  const normalized = normalizeRfc(String(value))
  if (!isValidRfcSat(normalized)) {
    field.report(rfcInvalidDetailMessage(), 'rfc_sat', field)
  }
})

/**
 * Regla Vine reutilizable para RFC con validación SAT.
 */
export const rfcSatField = vine
  .string()
  .trim()
  .minLength(12)
  .maxLength(13)
  .use(rfcSatRule())
  .transform((value) => normalizeRfc(value))

/**
 * RFC opcional y nullable para upserts parciales.
 * Debe declarar `.optional().nullable()` antes del `.transform()` final;
 * encadenarlo sobre `rfcSatField` provoca `.trim()` sobre `null`.
 */
export const rfcSatOptionalNullableField = vine
  .string()
  .trim()
  .minLength(12)
  .maxLength(13)
  .use(rfcSatRule())
  .optional()
  .nullable()
  .transform((value) => (value === null || value === undefined ? value : normalizeRfc(value)))
