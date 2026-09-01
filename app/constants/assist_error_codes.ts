/**
 * Catálogo estable de códigos de error del dominio de asistencia (checadas).
 * Gramática `AST.<BUCKET>.NNN`. Reservas de USRH1786566437097 y USRH1787157820192.
 */
export const ASSIST_ERROR_CODES = {
  /** Contexto tenant no resuelto (USRH1786566437097). */
  TENANT_UNRESOLVED: 'AST.VAL.001',
  /** `employeeId` ausente o no es entero positivo. */
  VAL_EMPLOYEE_ID: 'AST.VAL.002',
  /** El `employeeId` no resuelve a un colaborador de la empresa activa. */
  VAL_EMPLOYEE_NOT_FOUND: 'AST.VAL.008',
  /** `assistChannel` presente pero fuera del vocabulario cerrado `ASSIST_CHANNEL`. */
  VAL_CHANNEL_UNKNOWN: 'AST.VAL.009',
  /** Colaborador dado de baja; no se registra jornada. */
  AUTHZ_EMPLOYEE_TERMINATED: 'AST.AUTHZ.001',
  /** Captura ajena sin permiso `add-assist-manual`. */
  AUTHZ_FOREIGN_WRITE: 'AST.AUTHZ.002',
  /** Sincronización general sin permiso `sync-assist`. */
  AUTHZ_SYNC: 'AST.AUTHZ.003',
  /** Límite de volumen de registros superado. */
  RATE_LIMIT: 'AST.RATE.001',
  /** Clave natural duplicada (USRH1786566437097). */
  CONFLICT_DUPLICATE: 'AST.CONFLICT.001',
} as const

export type AssistErrorCode = (typeof ASSIST_ERROR_CODES)[keyof typeof ASSIST_ERROR_CODES]
