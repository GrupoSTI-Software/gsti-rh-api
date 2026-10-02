import { ASSIST_ORIGIN } from '#constants/assist_origin'
import {
  ATTLOG_VERIFY_FACE,
  ATTLOG_VERIFY_FINGERPRINT,
} from '#modules/device-commands/device_command.constants'

/** Medio por el que se registró una checada. */
export const ASSIST_SOURCE_KIND = {
  /** Checador físico: por ADMS o sincronizado desde BioTime. */
  DEVICE: 'device',
  /** App del colaborador o kiosco. */
  APP: 'app',
  /** Captura administrativa desde el backoffice. */
  BACKOFFICE: 'backoffice',
  /** Registro histórico sin datos suficientes para saberlo. */
  UNKNOWN: 'unknown',
} as const

export type AssistSourceKind = (typeof ASSIST_SOURCE_KIND)[keyof typeof ASSIST_SOURCE_KIND]

/** Canal por el que el checador entregó la checada. */
export type AssistDeviceChannel = 'adms' | 'biotime'

/** Forma en que el checador reconoció al colaborador. */
export type AssistVerifyMethod = 'fingerprint' | 'face' | 'other'

/** Ubicación reportada por el dispositivo al checar. */
export interface AssistLocation {
  latitude: number
  longitude: number
  /** Radio de precisión en metros, si el dispositivo lo reportó. */
  precisionMeters: number | null
}

/** Datos de una checada que deciden su origen. */
export interface AssistSourceFacts {
  origin: string | null
  terminalSerialNumber: string | null
  createdByUserId: number | null
  hasLocation: boolean
}

/**
 * Resuelve el medio de una checada. Los registros históricos no traen
 * `assist_origin`: los de BioTime se reconocen por la serie del checador y los
 * de la app por sus coordenadas.
 */
export function resolveAssistSourceKind(facts: AssistSourceFacts): AssistSourceKind {
  const origin = facts.origin
  if (origin === ASSIST_ORIGIN.ADMS || origin === ASSIST_ORIGIN.SYNC)
    return ASSIST_SOURCE_KIND.DEVICE
  if (origin === ASSIST_ORIGIN.ADMIN_CAPTURE || origin === ASSIST_ORIGIN.MANUAL) {
    return ASSIST_SOURCE_KIND.BACKOFFICE
  }
  if (origin === ASSIST_ORIGIN.SELF_SERVICE || origin === ASSIST_ORIGIN.DEVICE) {
    return ASSIST_SOURCE_KIND.APP
  }
  if (facts.createdByUserId) return ASSIST_SOURCE_KIND.BACKOFFICE
  if (facts.terminalSerialNumber) return ASSIST_SOURCE_KIND.DEVICE
  if (facts.hasLocation) return ASSIST_SOURCE_KIND.APP
  return ASSIST_SOURCE_KIND.UNKNOWN
}

/** El canal ADMS deja su origen; lo demás que trae serie llegó de BioTime. */
export function resolveDeviceChannel(origin: string | null): AssistDeviceChannel {
  return origin === ASSIST_ORIGIN.ADMS ? 'adms' : 'biotime'
}

/** Traduce el código de verificación del checador (gramática ZK). */
export function resolveVerifyMethod(code: number | null | undefined): AssistVerifyMethod | null {
  if (code === null || code === undefined) return null
  if (code === ATTLOG_VERIFY_FINGERPRINT) return 'fingerprint'
  if (code === ATTLOG_VERIFY_FACE) return 'face'
  return 'other'
}

/**
 * Coordenadas utilizables de una checada. El 0,0 y los valores fuera de rango
 * son el relleno de los registros sin ubicación.
 */
export function parseAssistLocation(
  latitude: number | string | null | undefined,
  longitude: number | string | null | undefined,
  precision: number | string | null | undefined
): AssistLocation | null {
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (latitude === null || latitude === undefined || latitude === '') return null
  if (longitude === null || longitude === undefined || longitude === '') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null
  const meters = Number(precision)
  return {
    latitude: lat,
    longitude: lon,
    precisionMeters:
      precision !== null && precision !== undefined && Number.isFinite(meters) && meters > 0
        ? meters
        : null,
  }
}
