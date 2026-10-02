/**
 * Negativas fail-closed del espejo correo ↔ credencial (USRH1789698261612):
 *  - `missing-actor`: no hay usuario autenticado o empresa activa.
 *  - `target-out-of-scope`: la cuenta de acceso no está en las empresas del actor.
 *  - `multiple-live-users`: la persona tiene varias cuentas vivas.
 * Prohibido incluir ids, correos o conteos en `message`.
 */
export type EmailMirrorRefusalReason = 'missing-actor' | 'target-out-of-scope' | 'multiple-live-users'

export class EmailMirrorRefusedError extends Error {
  constructor(readonly reason: EmailMirrorRefusalReason) {
    super(`Email mirror refused: ${reason}`)
    this.name = 'EmailMirrorRefusedError'
  }
}
