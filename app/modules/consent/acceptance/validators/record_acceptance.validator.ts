import vine from '@vinejs/vine'

/**
 * Valida el body de POST /api/consent/me.
 *
 * `documentVersion` es RETROCOMPAT (contrato viejo intacto). `type` es NUEVO y opcional:
 * sin él, el service resuelve el "paquete web" (aviso + términos); con él, resuelve solo
 * ese documento (lo usa la app para el consentimiento biométrico).
 */
export const recordAcceptanceValidator = vine.compile(
  vine.object({
    documentVersion: vine.string().trim().minLength(1).maxLength(20),
    type: vine.enum(['privacy_notice', 'terms_conditions', 'biometric_consent']).optional(),
  })
)
