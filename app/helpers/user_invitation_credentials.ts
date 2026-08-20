import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import {
  PROVISIONAL_PASSWORD_ALPHABET,
  PROVISIONAL_PASSWORD_LENGTH,
  USER_INVITATION_TOKEN_VALIDITY_DAYS,
} from '#constants/user_invitation'
import { randomStringFromAlphabet } from '#helpers/csprng_string'

/**
 * Contraseña provisional impredecible para cuentas recién creadas por invitación.
 * Nunca se expone, se envía ni se registra en claro.
 */
export function generateProvisionalPassword(): string {
  return randomStringFromAlphabet(PROVISIONAL_PASSWORD_ALPHABET, PROVISIONAL_PASSWORD_LENGTH)
}

/**
 * Token de invitación URL-safe (43 caracteres, CSPRNG).
 * Cabe en `users.user_token` (varchar 150).
 */
export function generateInvitationToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Fecha límite del enlace de invitación desde el instante de emisión. */
export function buildInvitationTokenExpiresAt(from: DateTime = DateTime.utc()): DateTime {
  return from.plus({ days: USER_INVITATION_TOKEN_VALIDITY_DAYS })
}
