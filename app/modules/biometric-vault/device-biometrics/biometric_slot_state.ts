import { majorOf } from '../template/template.service.js'

/**
 * En que situacion esta un biometrico respecto al equipo por el que se pregunta.
 *
 * Sin equipo la pregunta es otra --que tiene la persona en su expediente-- y la
 * respuesta es `registered` a secas.
 */
export const BIOMETRIC_SLOT_STATE = {
  /** Hay dato en el expediente. Se usa cuando no se pregunto por un equipo. */
  REGISTERED: 'registered',
  /** Esta en ese equipo: se capturo ahi, o se le copio y el equipo lo confirmo. */
  HERE: 'here',
  /** No esta en ese equipo, pero se le puede copiar sin traer a la persona. */
  COPYABLE: 'copyable',
  /** Existe, pero es de otra generacion de algoritmo: hay que capturarlo de nuevo ahi. */
  INCOMPATIBLE: 'incompatible',
  /** Viene del conector viejo: se sabe que existe, no en que equipo ni con que version. */
  UNKNOWN: 'unknown',
} as const

export type BiometricSlotState = (typeof BIOMETRIC_SLOT_STATE)[keyof typeof BIOMETRIC_SLOT_STATE]

/**
 * Cual de dos situaciones del mismo dedo es la que hay que contar.
 *
 * Un dedo puede tener varias versiones guardadas --se capturo en dos equipos de
 * distinta generacion-- y lo que el operador necesita saber es la mejor
 * situacion de ese dedo aqui, no la primera que aparezca en la lista.
 */
const RANK: Readonly<Record<BiometricSlotState, number>> = {
  [BIOMETRIC_SLOT_STATE.HERE]: 0,
  [BIOMETRIC_SLOT_STATE.COPYABLE]: 1,
  [BIOMETRIC_SLOT_STATE.UNKNOWN]: 2,
  [BIOMETRIC_SLOT_STATE.INCOMPATIBLE]: 3,
  [BIOMETRIC_SLOT_STATE.REGISTERED]: 4,
}

export function betterState(
  current: BiometricSlotState | null,
  next: BiometricSlotState
): BiometricSlotState {
  if (current === null) return next
  return RANK[next] < RANK[current] ? next : current
}

/**
 * Como se lee un template concreto desde un equipo.
 *
 * `present` lo resuelve quien consulta --el template se capturo ahi, o se le
 * copio y el equipo lo confirmo-- porque es un hecho del canal, no del dato.
 *
 * Sin version conocida la respuesta es `unknown` y no `copyable`: un equipo que
 * todavia no dijo con que algoritmo trabaja, o un template que subio sin
 * declararla, dejan la pregunta abierta, y darla por buena es lo que manda a
 * copiar un dato que el aparato va a rechazar.
 */
export function resolveSlotState(input: {
  present: boolean
  templateMajorVer: string | null
  deviceVersion: string | null
}): BiometricSlotState {
  if (input.present) return BIOMETRIC_SLOT_STATE.HERE
  if (input.deviceVersion === null || input.templateMajorVer === null) {
    return BIOMETRIC_SLOT_STATE.UNKNOWN
  }

  const target = majorOf(input.deviceVersion)
  const source = majorOf(input.templateMajorVer)
  if (target === null || source === null) return BIOMETRIC_SLOT_STATE.UNKNOWN

  return target === source ? BIOMETRIC_SLOT_STATE.COPYABLE : BIOMETRIC_SLOT_STATE.INCOMPATIBLE
}
