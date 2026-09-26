/**
 * Códigos estables para el cliente (difusión anonimizada NOM-035 5.7.e).
 * Prefijo NOM035.DISC = NOM-035 Disclosure.
 */
export const NOM035_DISCLOSURE_ERROR_CODES = {
  /** Parámetros de entrada inválidos (Vine o query param). */
  VAL_INPUT: 'NOM035.DISC.VAL_INPUT',
  /** Sin permiso para consultar la vista de difusión. */
  FORBIDDEN: 'NOM035.DISC.FORBIDDEN',
  /** Usuario autenticado sin empleado asociado. */
  NO_EMPLOYEE: 'NOM035.DISC.NO_EMPLOYEE',
  /** Empleado sin centro de trabajo activo. */
  NO_BRANCH: 'NOM035.DISC.NO_BRANCH',
  /** Recurso no encontrado o fuera de alcance tenant. */
  NOT_FOUND: 'NOM035.DISC.NOT_FOUND',
  /** Error inesperado no tipado. */
  SYS_UNHANDLED: 'NOM035.DISC.SYS_UNHANDLED',
} as const

export type Nom035DisclosureErrorCode =
  (typeof NOM035_DISCLOSURE_ERROR_CODES)[keyof typeof NOM035_DISCLOSURE_ERROR_CODES]
