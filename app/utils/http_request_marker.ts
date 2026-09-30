import { AsyncLocalStorage } from 'node:async_hooks'

const storage = new AsyncLocalStorage<true>()

/**
 * Marca request-scoped de «esta ejecución viene de una petición HTTP».
 *
 * La abre `HttpRequestMarkerMiddleware` (primera entrada de `server.use` en
 * `start/kernel.ts`). Comandos, scheduler, seeders y pruebas directas nunca
 * pasan por el middleware: la marca es `false`.
 */
export const HttpRequestMarker = {
  isInHttpRequest(): boolean {
    return storage.getStore() === true
  },

  run<T>(fn: () => T): T {
    return storage.run(true, fn)
  },
}
