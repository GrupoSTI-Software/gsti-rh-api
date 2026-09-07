import type { IncomingMessage } from 'node:http'

export type RawBodyResult =
  | { ok: true; body: string; bytes: number }
  | { ok: false; reason: 'too_large'; bytes: number }

/**
 * Lee el cuerpo de la peticion directamente del socket, con tope de bytes.
 *
 * El canal no pasa por el bodyparser global (spec v2, 4.1): el checador manda
 * `text/plain`, `application/octet-stream` o `application/push`, y ninguno debe
 * bufferizarse con la configuracion del resto del API. Al superar el tope deja
 * de acumular y devuelve `too_large` con los bytes vistos hasta ese momento.
 */
export function readRawBody(req: IncomingMessage, maxBytes: number): Promise<RawBodyResult> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let bytes = 0
    let settled = false

    const finish = (result: RawBodyResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    req.on('data', (chunk: Buffer | string) => {
      if (settled) return
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk
      bytes += buffer.length
      if (bytes > maxBytes) {
        finish({ ok: false, reason: 'too_large', bytes })
        req.resume()
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => finish({ ok: true, body: Buffer.concat(chunks).toString('utf8'), bytes }))
    req.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
  })
}
