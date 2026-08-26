import { AsyncLocalStorage } from 'node:async_hooks'
import logger from '@adonisjs/core/services/logger'
import type { LegalCategory } from '#constants/sensitive_fields'

export type SensitiveWriteDecision = 'allowed' | 'denied' | 'unresolved'

export type SensitiveAccessStore = {
  read: Record<LegalCategory, boolean>
  write: Record<LegalCategory, SensitiveWriteDecision>
  unguarded?: boolean
}

const storage = new AsyncLocalStorage<SensitiveAccessStore>()

const emptyRead: Record<LegalCategory, boolean> = {
  identificacion: false,
  contacto: false,
  financiero: false,
  salud: false,
  biometrico: false,
}

const emptyWrite: Record<LegalCategory, SensitiveWriteDecision> = {
  identificacion: 'denied',
  contacto: 'denied',
  financiero: 'denied',
  salud: 'denied',
  biometrico: 'denied',
}

/**
 * Contexto request-scoped de acceso sensible (lectura: USRH1787204602825;
 * escritura: USRH1787204602831).
 *
 * Lectura fail-closed: sin store, `canRead` es false.
 * Escritura: el mixin no exige si `!isActive()` (fail-open fuera de HTTP).
 * Con store activo, `canWrite` solo es true si la decisión es `allowed`.
 */
export const SensitiveAccessContext = {
  canRead(category: LegalCategory): boolean {
    return storage.getStore()?.read[category] ?? false
  },

  canWrite(category: LegalCategory): boolean {
    return storage.getStore()?.write[category] === 'allowed'
  },

  writeDecision(category: LegalCategory): SensitiveWriteDecision {
    return storage.getStore()?.write[category] ?? 'denied'
  },

  isActive(): boolean {
    return storage.getStore() !== undefined
  },

  isUnguarded(): boolean {
    return storage.getStore()?.unguarded === true
  },

  run<T>(store: SensitiveAccessStore, fn: () => T): T {
    return storage.run(store, fn)
  },

  runUnguarded<T>(reason: string, fn: () => T): T {
    logger.warn({ reason }, 'SensitiveAccessContext.runUnguarded: exigencia de escritura sensible omitida')
    const current = storage.getStore()
    const next: SensitiveAccessStore = current
      ? { ...current, read: { ...current.read }, write: { ...current.write }, unguarded: true }
      : { read: { ...emptyRead }, write: { ...emptyWrite }, unguarded: true }
    return storage.run(next, fn)
  },
}
