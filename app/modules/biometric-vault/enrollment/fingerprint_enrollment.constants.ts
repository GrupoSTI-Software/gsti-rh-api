/**
 * Enrolamiento remoto de huella (spec ADMS 6.4 y 13.13).
 */

/** Dedos que acepta el equipo. Fuera de banda no se encola nada. */
export const FINGER_ID_MIN = 0
export const FINGER_ID_MAX = 9

export function isValidFingerId(value: number): boolean {
  return Number.isInteger(value) && value >= FINGER_ID_MIN && value <= FINGER_ID_MAX
}

/**
 * Llave de idempotencia por equipo, PIN y dedo.
 *
 * Sin ella, dos clics del operador abren dos sesiones de enrolamiento sobre el
 * mismo dedo: el aparato pide el dedo dos veces y el segundo acuse llega sin
 * comando que lo espere.
 */
export function enrollmentCorrelationKey(pin: string, fingerId: number): string {
  return `enroll_fp:${pin}:${fingerId}`
}
