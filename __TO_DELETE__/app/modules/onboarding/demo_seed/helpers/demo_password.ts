import { randomBytes } from 'node:crypto'
import { randomStringFromAlphabet } from '#helpers/csprng_string'

/** Alfabeto legible sin caracteres ambiguos (sin O/0/l/1/I). */
const DEMO_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
const DEMO_PASSWORD_LENGTH = 14

/**
 * Contraseña de práctica (USRH1785438246847): CSPRNG vía el helper
 * compartido `randomStringFromAlphabet` (USRH1783115930049 lo extrajo de
 * aquí) — cuid/cuid2 y Math.random vetados (regla dura 2026-07-21).
 * La contraseña JAMÁS se loguea ni se envía por correo.
 */
export function generateDemoPassword(): string {
  return randomStringFromAlphabet(DEMO_PASSWORD_ALPHABET, DEMO_PASSWORD_LENGTH)
}

/** Sufijo aleatorio del correo demo (`demo+bu<id>-<hex8>@onboarding.valanserh.invalid`). */
export function generateDemoEmailSuffix(): string {
  return randomBytes(4).toString('hex')
}
