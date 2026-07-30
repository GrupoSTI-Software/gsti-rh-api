import { randomBytes } from 'node:crypto'

/** Alfabeto legible sin caracteres ambiguos (sin O/0/l/1/I). */
const DEMO_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
const DEMO_PASSWORD_LENGTH = 14

/**
 * Contraseña de práctica (USRH1785438246847): CSPRNG con `randomBytes` de
 * node:crypto — cuid/cuid2 y Math.random vetados (regla dura 2026-07-21).
 * Muestreo con rechazo para no sesgar la distribución por el módulo.
 * La contraseña JAMÁS se loguea ni se envía por correo.
 */
export function generateDemoPassword(): string {
  const rejectionBound = 256 - (256 % DEMO_PASSWORD_ALPHABET.length)
  const chars: string[] = []
  while (chars.length < DEMO_PASSWORD_LENGTH) {
    const bytes = randomBytes(DEMO_PASSWORD_LENGTH * 2)
    for (const byte of bytes) {
      if (chars.length >= DEMO_PASSWORD_LENGTH) {
        break
      }
      if (byte < rejectionBound) {
        chars.push(DEMO_PASSWORD_ALPHABET[byte % DEMO_PASSWORD_ALPHABET.length])
      }
    }
  }
  return chars.join('')
}

/** Sufijo aleatorio del correo demo (`demo+bu<id>-<hex8>@onboarding.valanserh.invalid`). */
export function generateDemoEmailSuffix(): string {
  return randomBytes(4).toString('hex')
}
