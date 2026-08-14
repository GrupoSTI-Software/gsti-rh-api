/**
 * Catálogo estable de códigos de error del catálogo de niveles de puesto
 * (USRH1785273891312). Prefijo `ORG.POSLEVEL` fijado por el spec §6; el BO
 * ramifica su UI por `key`, estos códigos quedan para trazabilidad y soporte.
 */
export const POSITION_LEVEL_ERROR_CODES = {
  /** Body o parámetros inválidos (regla 8). */
  VAL_INPUT: 'ORG.POSLEVEL.VAL_INPUT',
  /** Nombre duplicado en la misma empresa excluyendo eliminados (regla 2). */
  NAME_TAKEN: 'ORG.POSLEVEL.NAME_TAKEN',
  /** Nivel inexistente o fuera del scope del usuario (regla 1) — 404 indistinguible. */
  NOT_FOUND: 'ORG.POSLEVEL.NOT_FOUND',
  /** Razón social inexistente, eliminada o fuera de scope. */
  REF_INVALID: 'ORG.POSLEVEL.REF_INVALID',
  /** Nivel referenciado por algún puesto: solo se desactiva (regla 5). */
  IN_USE: 'ORG.POSLEVEL.IN_USE',
  /** Reordenamiento con ids ajenos, duplicados o lista incompleta (regla 3). */
  REORDER_INVALID: 'ORG.POSLEVEL.REORDER_INVALID',
  /** Sin permiso sobre la estructura organizacional (regla 9). */
  FORBIDDEN: 'ORG.POSLEVEL.FORBIDDEN',
  /** Error no clasificado del dominio. */
  SYS_UNHANDLED: 'ORG.POSLEVEL.UNEXPECTED',
} as const

export type PositionLevelErrorCode =
  (typeof POSITION_LEVEL_ERROR_CODES)[keyof typeof POSITION_LEVEL_ERROR_CODES]
