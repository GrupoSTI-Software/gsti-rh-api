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
 * Etiqueta de dominio valida: letras, digitos y guiones internos.
 *
 * Sin punto final y sin guion en los extremos, que es lo que acepta el DNS y
 * lo que `hostLabelOf` va a comparar despues contra el `Host` de la peticion.
 */
const DOMAIN_LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

/**
 * Valida el dominio comun del canal, o explica por que no sirve.
 *
 * Se comprueba al arrancar porque el modo de fallo es mudo y caro: un valor
 * que `hostLabelOf` no sabe recortar hace que NINGUN equipo con secreto
 * coincida, y el canal responde 404 a toda la flota sin un solo error en el
 * log. El caso real que lo motivo fue `*.valanserh.app`: el asterisco es
 * sintaxis de DNS, aqui solo va el dominio, y con el puesto el sufijo buscado
 * pasa a ser `.*.valanserh.app`, que ningun `Host` trae jamas.
 *
 * @param name - Nombre de la variable, para el mensaje de error.
 * @param value - Valor crudo del entorno.
 * @returns El dominio normalizado, o `undefined` cuando esta vacio (convivencia).
 * @throws Error si el valor no es un dominio que el canal pueda comparar.
 */
export function assertChannelBaseDomain(name: string, value?: string): string | undefined {
  if (value === undefined || value.trim() === '') return undefined

  const raw = value.trim()
  const domain = raw.toLowerCase()

  const rechazo = (motivo: string): never => {
    throw new Error(
      `${name} tiene que ser el dominio comun del canal, sin nada mas ` +
        `(por ejemplo adms.valanserh.app). Llego "${raw}": ${motivo}`
    )
  }

  if (domain.includes('*')) {
    rechazo('el comodin va en el registro DNS, aqui va el dominio pelon')
  }
  if (domain.includes('://')) rechazo('sobra el esquema')
  if (domain.includes('/')) rechazo('sobra la ruta: el equipo solo teclea un nombre de servidor')
  if (domain.includes(':')) rechazo('sobra el puerto')
  if (/\s/.test(domain)) rechazo('tiene espacios')
  if (domain.startsWith('.') || domain.endsWith('.')) rechazo('sobra el punto de los extremos')

  const labels = domain.split('.')
  if (labels.length < 2) {
    rechazo('le falta al menos un punto: el secreto va como etiqueta delante de este dominio')
  }
  if (!labels.every((label) => DOMAIN_LABEL.test(label))) {
    rechazo('alguna etiqueta no es valida para DNS')
  }

  return domain
}

/**
 * La direccion completa que se teclea en el menu del checador.
 *
 * El secreto no se teclea solo: va como etiqueta delante del dominio comun, y
 * eso es lo que el aparato resuelve por DNS. Mostrarle al operador los 14
 * caracteres pelones lo obliga a saberse el formato de memoria -- y a
 * inventarselo mal cuando no se lo sabe.
 *
 * Devuelve `null` sin dominio base configurado: ahi no hay direccion que dar,
 * porque el canal todavia atiende por el dominio comun.
 *
 * @param secret - Secreto del punto de acceso, o `null` en un equipo anterior al canal.
 * @param baseDomain - Dominio comun del canal (`ADMS_CHANNEL_BASE_DOMAIN`).
 * @returns El nombre completo del host, o `null` si no hay direccion propia que teclear.
 */
export function channelAddressOf(
  secret: string | null | undefined,
  baseDomain: string | null | undefined
): string | null {
  if (!secret || !baseDomain) return null
  const base = baseDomain.trim().toLowerCase()
  if (base.length === 0) return null
  return `${secret.trim().toLowerCase()}.${base}`
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

  /**
   * Se mide en BYTES, no en caracteres.
   *
   * `length` cuenta unidades UTF-16 y `timingSafeEqual` exige buffers del mismo
   * tamano en bytes: un `Host` con un byte alto --que Node decodifica como un
   * caracter que ocupa dos bytes en utf8-- pasaba la guarda y hacia reventar la
   * comparacion. Esa excepcion salia como 500, y un 500 frente al 200 de una
   * serie desconocida convertia el canal en un oraculo: justo lo que se quiso
   * evitar respondiendo 404 en vez de 403.
   */
  const candidate = Buffer.from(label, 'utf8')
  const expected = Buffer.from(secret, 'utf8')
  if (candidate.length !== expected.length) return false

  return timingSafeEqual(candidate, expected)
}
