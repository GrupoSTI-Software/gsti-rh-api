import vine from '@vinejs/vine'
import { SENSITIVE_EXPORT_MOTIVES } from '#constants/sensitive_export_motives'

/**
 * Parámetros opcionales de confirmación para exportaciones sensibles.
 * El motivo solo es obligatorio cuando el usuario tiene permiso `export-sensitive-data`;
 * esa validación de negocio ocurre en `PiiExportService.deliverSensitiveExport`.
 */
export const sensitiveExportQueryValidator = vine.compile(
  vine.object({
    motive: vine.enum([...SENSITIVE_EXPORT_MOTIVES]).optional(),
    note: vine.string().trim().maxLength(500).optional(),
  })
)
