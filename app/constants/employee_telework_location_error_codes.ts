/**
 * Catálogo estable de códigos de error del módulo de lugares de teletrabajo
 * (NOM-037 5.1 / 5.1.1 / 5.1.2). Se usan en todas las respuestas HTTP para
 * que los clientes reaccionen de forma programática sin parsear mensajes
 * localizados.
 *
 * Ver `docs/spec-USRH1782792802405.md` §4.
 */
export const TWL_ERROR_CODES = {
  /** Error de validación VineJS o input inválido */
  VAL_INPUT: 'TWL.VAL.001',
  /**
   * Gating por modalidad: el empleado no es teletrabajador (modalidad
   * `Onsite`). Solo `Remote` y `Hybrid` pueden tener lugares de teletrabajo.
   * Genera 422 con key estable `solo-teletrabajadores`.
   */
  ONLY_TELEWORKERS: 'TWL.VAL.GATING.001',
  /** Empleado inexistente o fuera del tenant del usuario autenticado */
  EMPLOYEE_NOT_FOUND: 'TWL.NF.EMP.001',
  /** Lugar inexistente, dado de baja o fuera del tenant */
  LOCATION_NOT_FOUND: 'TWL.NF.LOC.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'TWL.SYS.001',
} as const

export type TwlErrorCode = (typeof TWL_ERROR_CODES)[keyof typeof TWL_ERROR_CODES]

/**
 * Tipos de lugar de teletrabajo aceptados por la NOM-037 5.1:
 * domicilio del trabajador, espacio de coworking u otro sitio acordado.
 */
export const TELEWORK_LOCATION_TYPES = {
  HOME: 'home',
  COWORKING: 'coworking',
  OTHER: 'other',
} as const

export type TeleworkLocationType =
  (typeof TELEWORK_LOCATION_TYPES)[keyof typeof TELEWORK_LOCATION_TYPES]

export const TELEWORK_LOCATION_TYPE_VALUES: readonly TeleworkLocationType[] = [
  TELEWORK_LOCATION_TYPES.HOME,
  TELEWORK_LOCATION_TYPES.COWORKING,
  TELEWORK_LOCATION_TYPES.OTHER,
]
