/**
 * Catálogo estable de códigos de error del módulo de canalizaciones de evento
 * traumático (formato MOD.TYPE.NNN). Permite que los clientes reaccionen de forma
 * programática sin parsear mensajes.
 *
 * Nota: el módulo nace exponiendo el campo `code` (el hermano del reporte aún usa
 * `errorCode`; su homologación queda fuera de esta HU).
 */
export const TREF_ERROR_CODES = {
  /** Error de validación VineJS o input fuera de rango */
  VAL_INPUT: 'TREF.VAL.001',
  /** Fecha de canalización anterior a la ocurrencia del evento */
  DATE_BEFORE_EVENT: 'TREF.VAL.DATE.001',
  /** Fecha de canalización futura */
  DATE_FUTURE: 'TREF.VAL.DATE.002',
  /** Canalización inexistente o ajena al reporte */
  REFERRAL_NOT_FOUND: 'TREF.NF.REFERRAL.001',
  /** Sin permisos sobre el módulo */
  FORBIDDEN: 'TREF.FORBID.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'TREF.SYS.001',
} as const

export type TrefErrorCode = (typeof TREF_ERROR_CODES)[keyof typeof TREF_ERROR_CODES]
