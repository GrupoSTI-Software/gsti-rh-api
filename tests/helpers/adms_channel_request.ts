import { request as httpRequest, type IncomingMessage } from 'node:http'
import env from '#start/env'
import { channelAddressOf } from '#modules/adms/channel/channel_secret'

/**
 * Peticiones al canal ADMS como las manda un checador: por su direccion propia.
 *
 * Con `ADMS_CHANNEL_BASE_DOMAIN` configurado, el canal exige que cada equipo
 * con secreto llegue por `<secreto>.<dominio>` y responde 404 a todo lo demas.
 * Las pruebas pegan por IP contra el servidor que ya corre --que lee el `.env`
 * de la raiz, no un `.env.test`-- asi que la unica forma de que el canal las
 * atienda es que la peticion lleve el `Host` correcto.
 *
 * Sin dominio base configurado no se manda `Host` propio y todo sigue igual:
 * es la misma convivencia que aplica el canal.
 *
 * Va por `node:http` y no por `fetch` A PROPOSITO: `Host` es un nombre de
 * cabecera prohibido para `fetch`, que lo descarta SIN AVISAR y lo reescribe
 * con el de la URL. Una prueba escrita con `fetch` y la cabecera puesta se ve
 * correcta y sigue recibiendo 404. Se devuelve un `Response` para que cada
 * prueba lea la respuesta igual que antes.
 */

const SERVER_HOST = env.get('HOST')
const SERVER_PORT = env.get('PORT')

/** Estados que no admiten cuerpo: `Response` revienta si se le pasa uno. */
const NULL_BODY_STATUS = new Set([101, 103, 204, 205, 304])

export interface AdmsChannelRequestOptions {
  /**
   * Secreto del punto de acceso al que se hace pasar la peticion. `null` o
   * ausente es el equipo que todavia no tiene direccion propia.
   */
  secret?: string | null
  method?: 'GET' | 'POST'
  body?: string
  contentType?: string
}

/**
 * La direccion por la que ese equipo tiene que llegar, o `null` si no hay una.
 *
 * Compone con `channelAddressOf`, el mismo que usa el Backoffice para decirle
 * al instalador que teclear: si el formato cambia, cambia en un solo sitio.
 */
export function admsChannelHost(secret: string | null | undefined): string | null {
  return channelAddressOf(secret, env.get('ADMS_CHANNEL_BASE_DOMAIN'))
}

function toResponse(incoming: IncomingMessage, body: Buffer): Response {
  const headers = new Headers()
  for (let i = 0; i < incoming.rawHeaders.length; i += 2) {
    headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1])
  }
  const status = incoming.statusCode ?? 0
  return new Response(NULL_BODY_STATUS.has(status) ? null : body, { status, headers })
}

/**
 * Hace la peticion al canal y devuelve la respuesta ya leida.
 *
 * @param path - Ruta con su query, tal cual la pide el aparato.
 * @param options - Metodo, cuerpo, tipo de contenido y secreto del equipo.
 */
export function admsChannelRequest(
  path: string,
  options: AdmsChannelRequestOptions = {}
): Promise<Response> {
  const { secret = null, method = 'GET', body, contentType } = options

  const headers: Record<string, string> = {}
  if (contentType !== undefined) headers['content-type'] = contentType
  const address = admsChannelHost(secret)
  if (address !== null) headers.host = address

  return new Promise<Response>((resolve, reject) => {
    let answered = false
    const outgoing = httpRequest(
      { host: SERVER_HOST, port: SERVER_PORT, path, method, headers },
      (incoming) => {
        answered = true
        const chunks: Buffer[] = []
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk))
        incoming.on('end', () => resolve(toResponse(incoming, Buffer.concat(chunks))))
        incoming.on('error', reject)
      }
    )
    /**
     * Un cuerpo por encima del tope se contesta 413 antes de terminar de
     * subirlo: el error de escritura que sale de ahi no es el fallo, la
     * respuesta si llego y es la que la prueba quiere ver.
     */
    outgoing.on('error', (error) => {
      if (!answered) reject(error)
    })
    if (body !== undefined) outgoing.write(body)
    outgoing.end()
  })
}

/** Atajo de lectura: `GET` con la direccion propia del equipo. */
export function admsChannelGet(path: string, secret: string | null | undefined): Promise<Response> {
  return admsChannelRequest(path, { secret, method: 'GET' })
}

/** Atajo de subida: `POST` con cuerpo de texto y la direccion propia del equipo. */
export function admsChannelPost(
  path: string,
  body: string,
  secret: string | null | undefined,
  contentType = 'text/plain'
): Promise<Response> {
  return admsChannelRequest(path, { secret, method: 'POST', body, contentType })
}
