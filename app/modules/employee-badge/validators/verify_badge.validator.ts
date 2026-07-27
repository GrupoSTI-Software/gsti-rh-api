/**
 * Formato del token del gafete: 43 caracteres URL-safe, exactamente lo que
 * produce `randomBytes(32).toString('base64url')` (R9, §10.1 del spec).
 *
 * A propósito NO es un validator VineJS compilado: un fallo de formato debe
 * responder el mismo 404 `BDG.NF.002` que un token inexistente o revocado
 * (indistinguibilidad, regla 7) — nunca el 400/422 `BDG.VAL.001` que dispara
 * el flujo estándar de `request.validateUsing()`.
 */
export const BADGE_TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/

export function isValidBadgeTokenFormat(token: unknown): token is string {
  return typeof token === 'string' && BADGE_TOKEN_FORMAT.test(token)
}
