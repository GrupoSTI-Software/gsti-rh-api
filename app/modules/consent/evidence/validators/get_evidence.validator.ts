import vine from '@vinejs/vine'

const positiveIdField = vine.number().min(1)

/**
 * Filtros combinables de `GET /api/consent/evidence` y `GET /api/consent/evidence/export`
 * (regla 3, USRH1783368377327): por documento (`type`+`version` o `legalDocumentId`), por
 * usuario (`userId`) y por empresa/tenant (`businessUnitPublicId`, o `businessUnitId` legacy).
 * Todos opcionales; ausentes = sin acotar (vista global).
 */
const evidenceFiltersSchema = {
  type: vine.enum(['privacy_notice', 'terms_conditions', 'biometric_consent']).optional(),
  version: vine.string().trim().minLength(1).maxLength(20).optional(),
  legalDocumentId: positiveIdField.optional(),
  userId: positiveIdField.optional(),
  /** Código público (UUID v4) — forma canónica; se resuelve al id interno en el controller. */
  businessUnitPublicId: vine.string().uuid({ version: [4] }).optional(),
  /** Id interno — legacy, aceptado por compatibilidad (mismo patrón que `business_unit_scope_middleware`). */
  businessUnitId: positiveIdField.optional(),
  /** Honrado solo si el caller tiene el permiso dedicado de revelado (regla 4). */
  reveal: vine.boolean().optional(),
}

export const getEvidenceValidator = vine.compile(
  vine.object({
    ...evidenceFiltersSchema,
    page: vine.number().min(1).optional(),
    perPage: vine.number().min(1).max(500).optional(),
  })
)

export const getEvidenceExportValidator = vine.compile(vine.object(evidenceFiltersSchema))
