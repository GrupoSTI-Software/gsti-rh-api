import type { Limiter } from '@adonisjs/limiter'

/**
 * Candados de fuerza bruta de la consulta de estatus del buzón
 * (USRH1783115930049, regla 2): solo los fallos consumen cuota —
 * `limiter.penalize` incrementa el contador únicamente cuando el
 * callback lanza; si la queja/passphrase son correctas, el contador de
 * ese folio/IP se borra (reset), así que consultar bien nunca acerca al
 * bloqueo.
 *
 * Orden de evaluación: primero el origen (IP), luego el folio — ambos
 * candados se revisan ANTES de tocar la base de datos si ya están
 * agotados, para no gastar una consulta en un intento que de todos
 * modos será rechazado. Extraído a un helper propio para poder
 * probarlo contra el store `memory` real de `@adonisjs/limiter` sin
 * bootear la app ni depender de una base de datos.
 */
export async function consultStatusRateLimited<T>(params: {
  ipLimiter: Limiter
  ipKey: string
  folioLimiter: Limiter
  folioKey: string
  callback: () => Promise<T>
}): Promise<T> {
  const { ipLimiter, ipKey, folioLimiter, folioKey, callback } = params

  const [ipThrottle, result] = await ipLimiter.penalize(ipKey, async () => {
    const [folioThrottle, innerResult] = await folioLimiter.penalize(folioKey, callback)
    if (folioThrottle) {
      throw folioThrottle
    }
    return innerResult
  })
  if (ipThrottle) {
    throw ipThrottle
  }
  return result
}
