/**
 * Errores de la cola de comandos hacia el checador (spec ADMS 12).
 * Gramatica `DCMD.<BUCKET>.NNN`, igual que `ADMS.*`.
 */
export const DEVICE_COMMAND_ERROR_CODES = {
  /** Transicion de estado no permitida por la maquina (spec 6.2). */
  STATE_INVALID: 'DCMD.STATE.001',
  /** El comando no admite reintento o agoto sus intentos. */
  STATE_NOT_RETRYABLE: 'DCMD.STATE.002',
  /** Solo un comando pendiente se puede cancelar. */
  STATE_NOT_CANCELLABLE: 'DCMD.STATE.003',
  /** Un campo del comando trae TAB o salto de linea y partiria la orden. */
  VAL_UNSAFE_FIELD: 'DCMD.VAL.001',
  /** Falta un dato obligatorio del comando. */
  VAL_MISSING_FIELD: 'DCMD.VAL.002',
  /** No se pudo asignar un identificador de cable unico. */
  SYS_WIRE_ID: 'DCMD.SYS.001',
  /** Comando fuera del alcance de la peticion. */
  AUTHZ_OUT_OF_SCOPE: 'DCMD.AUTHZ.001',
  /** Sin permiso para gestionar comandos. */
  AUTHZ_FORBIDDEN: 'DCMD.AUTHZ.002',
  /** No clasificado. */
  SYS_INTERNAL: 'DCMD.SYS.002',
} as const

export type DeviceCommandErrorCode =
  (typeof DEVICE_COMMAND_ERROR_CODES)[keyof typeof DEVICE_COMMAND_ERROR_CODES]
