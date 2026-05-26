/**
 * Catálogo estable de códigos de error del módulo de registros REPSE.
 *
 * Los códigos se incluyen en cada respuesta HTTP para que los clientes
 * reaccionen de forma programática sin parsear el mensaje localizado.
 */
export const REPSE_ERROR_CODES = {
  /** Validación VineJS o input fuera de rango */
  VAL_INPUT: 'REPSE.VAL.001',
  /** expiresAt anterior o igual a registeredAt */
  DATE_RANGE_INVALID: 'REPSE.VAL.DATE.001',
  /** Fechas no parseables (formato inválido) */
  DATE_FORMAT_INVALID: 'REPSE.VAL.DATE.002',
  /** BusinessUnit inexistente o ajena al tenant del usuario autenticado */
  BUSINESS_UNIT_NOT_FOUND: 'REPSE.NF.BU.001',
  /** Registro REPSE inexistente al consultar, editar o eliminar */
  REPSE_NOT_FOUND: 'REPSE.NF.REG.001',
  /** Folio repetido para la misma empresa */
  FOLIO_DUPLICATE: 'REPSE.CONFLICT.FOLIO.001',
  /** Sin permisos sobre el módulo */
  FORBIDDEN: 'REPSE.FORBID.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'REPSE.SYS.001',
} as const

export type RepseErrorCode = (typeof REPSE_ERROR_CODES)[keyof typeof REPSE_ERROR_CODES]
