/**
 * Catálogo estable de códigos de error del módulo de registro electrónico de
 * jornada (work journal entries). Formato `WJE.<TIPO>.NNN`.
 *
 * Espeja la convención v2 (`code` + `key`) del precedente write-once
 * `version_contrato_especializado_error_codes.ts`.
 */
export const WJE_ERROR_CODES = {
  /** Validación VineJS o rango de fechas inválido */
  VAL_INPUT: 'WJE.VAL.001',
  /** Empleado o entrada no encontrada dentro del tenant */
  NOT_FOUND: 'WJE.NF.001',
  /** Intento de mutar o re-sellar una entrada ya cerrada (write-once) */
  IMMUTABLE: 'WJE.CONFLICT.001',
  /** Se exigió sellar un periodo sin datos de asistencia materializables */
  PERIOD_WITHOUT_DATA: 'WJE.CONFLICT.002',
  /** La verificación de integridad detectó alteración (sello no cuadra) */
  INTEGRITY_INVALID: 'WJE.INTEGRITY.001',
  /** Fuera del scope de empresa o sin permiso */
  FORBIDDEN: 'WJE.FORBID.001',
  /** Secreto HMAC ausente: el sellado no puede operar */
  SEAL_SECRET_MISSING: 'WJE.SYS.002',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'WJE.SYS.001',
} as const

export type WjeErrorCode = (typeof WJE_ERROR_CODES)[keyof typeof WJE_ERROR_CODES]
