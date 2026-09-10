import { randomInt, timingSafeEqual } from 'node:crypto'

/**
 * Largo del secreto que viaja en la direccion del servidor.
 *
 * Con el alfabeto de abajo, 14 caracteres dan ~69 bits: de sobra frente a un
 * canal con limite de tasa. Corto a proposito, porque lo teclea una persona en
 * el menu de un checador.
 */
export const CHANNEL_SECRET_LENGTH = 14

/**
 * Base32 sin ambiguedades: fuera `i`, `l`, `o`, `0` y `1`.
 *
 * Quien teclea esto lo lee de una pantalla y lo escribe en el menu de un
 * aparato: un cero que se lee como O convierte un alta en una llamada a
 * soporte.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export function generateChannelSecret(): string {
  let secret = ''
  for (let i = 0; i < CHANNEL_SECRET_LENGTH; i += 1) {
    secret += ALPHABET[randomInt(ALPHABET.length)]
  }
  return secret
}

/**
 * La etiqueta propia del `Host`, o `null` si la peticion llego al dominio comun.
 *
 * Hace falta el dominio base para distinguir `<secreto>.adms.valanserh.com` de
 * `adms.valanserh.com`: contar etiquetas no sirve, porque el dominio base puede
 * tener dos niveles o cuatro segun el despliegue.
 *
 * Devuelve `null`, y no una etiqueta cualquiera, en tres casos que significan lo
 * mismo --"esta peticion no trae direccion propia"--: sin dominio base
 * configurado, cuando el host ES el dominio comun, y cuando el host no
 * pertenece a ese dominio. Una IP tambien: sus puntos separan octetos, no
 * subdominios, y tomar `192` por etiqueta convertiria cualquier peticion por IP
 * en un intento de suplantacion.
 */
export function hostLabelOf(
  host: string | null | undefined,
  baseDomain: string | null | undefined
): string | null {
  if (!host || !baseDomain) return null

  const withoutPort = host.split(':')[0].trim().toLowerCase()
  if (withoutPort.length === 0) return null
  if (/^[0-9.]+$/.test(withoutPort)) return null

  const base = baseDomain.trim().toLowerCase()
  if (withoutPort === base) return null

  const suffix = `.${base}`
  if (!withoutPort.endsWith(suffix)) return null

  const label = withoutPort.slice(0, -suffix.length)
  /** Una sola etiqueta: `a.b.adms…` no es la direccion de nadie. */
  if (label.length === 0 || label.includes('.')) return null

  return label
}

/**
 * Compara etiqueta y secreto sin filtrar por temporizacion.
 *
 * El largo es fijo y publico, asi que rechazar primero por largo no le dice al
 * atacante nada que no sepa ya; `timingSafeEqual` exige buffers del mismo
 * tamano y reventaria sin esa guarda.
 */
export function channelSecretMatches(
  label: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!label || !secret) return false
  if (label.length !== secret.length) return false

  return timingSafeEqual(Buffer.from(label, 'utf8'), Buffer.from(secret, 'utf8'))
}
