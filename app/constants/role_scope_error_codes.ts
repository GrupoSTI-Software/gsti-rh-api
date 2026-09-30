/**
 * Catálogo estable de códigos del alcance por rol.
 *
 * `roles.role_management_days` limita cuántos días atrás puede alguien tocar la
 * asistencia de otra persona. El código es propio y no cuelga del catálogo de
 * checadas porque la misma regla rige también las excepciones de turno y los
 * cambios de turno.
 */
export const ROLE_SCOPE_ERROR_CODES = {
  /** La fecha del registro es más antigua de lo que el rol puede modificar. */
  VAL_DAY_OUT_OF_ROLE_SCOPE: 'RSC.VAL.001',
} as const

export type RoleScopeErrorCode =
  (typeof ROLE_SCOPE_ERROR_CODES)[keyof typeof ROLE_SCOPE_ERROR_CODES]
