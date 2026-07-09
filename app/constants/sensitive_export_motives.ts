/**
 * Catálogo fijo de motivos para exportaciones con datos sensibles.
 *
 * Definido con producto (Wilvardo 2026-07-02). No editable por el cliente en este corte.
 *
 * Ref: USRH1783029947540 — regla 7.
 */
export const SENSITIVE_EXPORT_MOTIVES = [
  'auditoria-interna',
  'requerimiento-autoridad',
  'tramite-institucional',
  'proceso-nomina',
  'registro-empleados-nuevos',
  'actualizacion-masiva-empleados',
  'otro',
] as const

export type SensitiveExportMotive = (typeof SENSITIVE_EXPORT_MOTIVES)[number]

/** Motivo que exige nota obligatoria (regla 7 / SEC.EXP.VAL.002). */
export const SENSITIVE_EXPORT_MOTIVE_REQUIRES_NOTE: SensitiveExportMotive = 'otro'

export function isSensitiveExportMotive(value: string): value is SensitiveExportMotive {
  return (SENSITIVE_EXPORT_MOTIVES as readonly string[]).includes(value)
}
