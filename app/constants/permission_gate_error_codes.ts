/**
 * Claves uniformes de negativa de la pieza única de control de acceso
 * (USRH1785766406721): mismo título/detalle/clave sin importar el módulo
 * que la declare.
 */
export const PERMISSION_GATE_ERROR_CODES = {
  /** El sistema resolvió el permiso y la acción no está concedida. */
  DENIED: 'PERM.DENIED',
  /**
   * El sistema no logró determinar qué puede hacer quien envía la petición
   * (rol inválido/inexistente o falla al resolver): se niega y se distingue
   * explícitamente de "no tienes ese permiso".
   */
  UNRESOLVED: 'PERM.UNRESOLVED',
} as const
