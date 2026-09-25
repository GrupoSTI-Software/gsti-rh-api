/** Tabla sobre la que escribe el espejo correo ↔ credencial (USRH1789698261612). */
export type EmailMirrorTarget = 'users' | 'people' | 'employees'

/**
 * Choque de unicidad detectado por el espejo ANTES de escribir. Lleva el
 * destino para que el controlador elija el cuerpo sin adivinar.
 * Prohibido incluir el correo o ids en `message`.
 */
export class EmailMirrorConflictError extends Error {
  readonly httpStatus: number = 400

  constructor(readonly target: EmailMirrorTarget) {
    super(`Email mirror conflict on ${target}`)
    this.name = 'EmailMirrorConflictError'
  }
}
