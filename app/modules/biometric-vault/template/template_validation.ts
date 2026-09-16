import {
  TEMPLATE_BASE64_PATTERN,
  TEMPLATE_SIZE_BAND_DEFAULT,
  TEMPLATE_SIZE_BANDS,
} from '../biometric_vault.constants.js'

export type TemplateRejection =
  | 'empty'
  | 'not_base64'
  | 'too_short'
  | 'too_long'

export type TemplateValidation =
  | { ok: true; size: number }
  | { ok: false; reason: TemplateRejection; size: number }

/**
 * Valida un blob biometrico antes de guardarlo (spec 7.1).
 *
 * Se mide la longitud del BASE64, no la del binario decodificado: es lo que el
 * equipo manda y lo que se guarda, y evita decodificar para descubrir que era
 * basura. Un blob fuera de banda no se guarda: media huella no sirve para
 * identificar a nadie y ocuparia el slot del dedo bueno.
 */
export function validateTemplate(input: { bioType: number; template: string }): TemplateValidation {
  const template = input.template
  const size = template.length

  if (size === 0) return { ok: false, reason: 'empty', size }
  if (!TEMPLATE_BASE64_PATTERN.test(template)) return { ok: false, reason: 'not_base64', size }

  const band = TEMPLATE_SIZE_BANDS[input.bioType] ?? TEMPLATE_SIZE_BAND_DEFAULT
  if (size < band.min) return { ok: false, reason: 'too_short', size }
  if (size > band.max) return { ok: false, reason: 'too_long', size }

  return { ok: true, size }
}
