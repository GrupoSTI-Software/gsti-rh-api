/**
 * Catálogo estable de códigos de error del módulo de turnos (Shift).
 * USRH1783821206521 — 404 uniforme para acceso directo fuera de la unidad
 * dueña (no distingue "no existe" de "no es tuyo").
 */
export const SHIFT_ERROR_CODES = {
  /** Turno inexistente o ajeno a la unidad de negocio seleccionada */
  NOT_FOUND: 'SFT.NF.001',
} as const

export type ShiftErrorCode = (typeof SHIFT_ERROR_CODES)[keyof typeof SHIFT_ERROR_CODES]
