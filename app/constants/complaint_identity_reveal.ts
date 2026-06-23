/** Slug del módulo de quejas en `system_modules`. */
export const COMPLAINT_MODULE_SLUG = 'complaints'

/**
 * Permiso RBAC dedicado para revelar la identidad del denunciante (`complaint.reveal_identity`).
 * Separado de `read`/`update`; operar la bandeja no autoriza la revelación.
 */
export const COMPLAINT_REVEAL_IDENTITY_PERMISSION = 'reveal-identity'
