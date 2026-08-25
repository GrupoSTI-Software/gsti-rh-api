/**
 * Catálogo ÚNICO de códigos de error del módulo de salidas de personal
 * (cadena CAP-05-07). Lo crea "Configurar el catálogo de conceptos de salida"
 * (USRH1786568279581) y lo extienden las historias hermanas — USRH1786568279584
 * agrega `OFFB.CONCEPT.REORDER_INVALID` y `OFFB.CONCEPT.IN_USE`; no se
 * declaran aquí para no dejar constantes muertas.
 *
 * Convención vigente para toda la cadena: `OFFB.<SLICE>.<SEMANTICO>` en
 * SCREAMING_SNAKE, sin numeración (estilo `position_level_error_codes.ts`).
 * El BO ramifica su UI por `key`; estos códigos quedan para trazabilidad.
 */
export const EMPLOYEE_OFFBOARDING_ERROR_CODES = {
  /** Cuerpo o parámetros de consulta mal formados (VineJS) — 400. */
  VAL_INPUT: 'OFFB.CONCEPT.VAL_INPUT',
  /** Nombre duplicado en la misma empresa excluyendo eliminados (regla 4) — 409. */
  NAME_TAKEN: 'OFFB.CONCEPT.NAME_TAKEN',
  /** Concepto inexistente o fuera del alcance (regla 1) — 404 indistinguible. */
  NOT_FOUND: 'OFFB.CONCEPT.NOT_FOUND',
  /** Empresa inexistente, eliminada o fuera del alcance — 422. */
  REF_INVALID: 'OFFB.CONCEPT.REF_INVALID',
  /** Alterar la naturaleza o eliminar el concepto derivado (regla 6) — 422. */
  SOURCE_LOCKED: 'OFFB.CONCEPT.SOURCE_LOCKED',
  /** Segundo concepto derivado del inventario en la misma empresa (regla 6) — 409. */
  SOURCE_DUPLICATED: 'OFFB.CONCEPT.SOURCE_DUPLICATED',
  /** Reordenamiento con ids ajenos, duplicados o lista incompleta (USRH1786568279584) — 422. */
  REORDER_INVALID: 'OFFB.CONCEPT.REORDER_INVALID',
  /** Concepto ya usado en alguna salida registrada: se desactiva, no se elimina (USRH1786568279584) — 409. */
  IN_USE: 'OFFB.CONCEPT.IN_USE',
  /** Sin permiso sobre el módulo employee-offboardings (regla 9) — 403. */
  FORBIDDEN: 'OFFB.CONCEPT.FORBIDDEN',
  /** Error no clasificado del dominio — 500. */
  SYS_UNHANDLED: 'OFFB.CONCEPT.UNEXPECTED',
  /** Cuerpo o parámetros del expediente mal formados (USRH1786568279587) — 400. */
  CASE_VAL_INPUT: 'OFFB.CASE.VAL_INPUT',
  /** Colaborador inexistente o fuera del alcance (USRH1786568279587) — 404 uniforme. */
  CASE_EMPLOYEE_NOT_FOUND: 'OFFB.CASE.EMPLOYEE_NOT_FOUND',
  /** Colaborador sin expediente de salida abierto (USRH1786568279587) — 404. */
  CASE_NOT_FOUND: 'OFFB.CASE.NOT_FOUND',
  /** Ya existe un expediente abierto para el colaborador (regla 1, USRH1786568279587) — 409. */
  CASE_ALREADY_OPEN: 'OFFB.CASE.ALREADY_OPEN',
  /** Sin permiso sobre employee-offboardings en el slice del expediente — 403. */
  CASE_FORBIDDEN: 'OFFB.CASE.FORBIDDEN',
  /** Error no controlado del expediente — 500. */
  CASE_UNEXPECTED: 'OFFB.CASE.UNEXPECTED',
} as const

export type EmployeeOffboardingErrorCode =
  (typeof EMPLOYEE_OFFBOARDING_ERROR_CODES)[keyof typeof EMPLOYEE_OFFBOARDING_ERROR_CODES]
