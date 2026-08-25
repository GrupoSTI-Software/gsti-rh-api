import { AsyncLocalStorage } from 'node:async_hooks'
import type { LegalCategory } from '#constants/sensitive_fields'

type SensitiveReadStore = Record<LegalCategory, boolean>

const storage = new AsyncLocalStorage<SensitiveReadStore>()

/**
 * Contexto request-scoped de lectura sensible (USRH1787204602825).
 *
 * Las cinco decisiones se resuelven una vez en middleware (async) y se leen
 * de forma síncrona desde el `serialize` de Lucid, igual que `TenantContext.getScope()`.
 *
 * Fail-closed: sin store activo, `canRead` devuelve `false`. En crons, comandos
 * y jobs el dato sale tapado — a diferencia del mixin de tenant, que sin
 * contexto es fail-open. Aquí el fail-open sería una fuga.
 */
export const SensitiveAccessContext = {
  canRead(category: LegalCategory): boolean {
    return storage.getStore()?.[category] ?? false
  },

  isActive(): boolean {
    return storage.getStore() !== undefined
  },

  run<T>(decisions: Record<LegalCategory, boolean>, fn: () => T): T {
    return storage.run(decisions, fn)
  },
}
