/**
 * Respuesta de GET /api/consent/me y POST /api/consent/me.
 *
 * - `accepted`: true si el usuario ya aceptó la versión vigente.
 * - `currentVersion`: la versión que actualmente se requiere aceptar.
 * - `acceptedVersion`: la versión que el usuario aceptó (null si nunca aceptó).
 * - `acceptedAt`: ISO 8601 timestamp de la aceptación más reciente (null si nunca).
 */
export interface ConsentStatusDto {
  accepted: boolean
  currentVersion: string
  acceptedVersion: string | null
  acceptedAt: string | null
}
