/** Slug del módulo de quejas en `system_modules`. */
export const COMPLAINT_MODULE_SLUG = 'complaints'

/**
 * Permiso RBAC dedicado para revelar la identidad del denunciante (`complaint.reveal_identity`).
 * Separado de `read`/`update`; operar la bandeja no autoriza la revelación.
 */
export const COMPLAINT_REVEAL_IDENTITY_PERMISSION = 'reveal-identity'

/**
 * Permiso RBAC dedicado para el reporte agregado STPS (`complaint.report`).
 * Separado de `read`; consultar la bandeja no autoriza el reporte.
 */
export const COMPLAINT_REPORT_PERMISSION = 'report'
