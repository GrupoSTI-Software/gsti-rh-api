import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'

export type TenantScopeBlockHook = 'find' | 'fetch' | 'paginate'
/** R1 = 'observed' (registra y deja pasar). R4 cambia a 'blocked'. */
export type TenantScopeBlockMode = 'observed' | 'blocked'

export const TENANT_SCOPE_BLOCK_LOG_CODE = 'TENANT.CONTEXT.MISSING'
export const TENANT_SCOPE_BLOCK_LOG_WINDOW_MS = 300_000
export const TENANT_SCOPE_BLOCK_LOG_MAX_KEYS = 500
export const TENANT_SCOPE_BLOCK_MODE: TenantScopeBlockMode = 'observed'

export interface TenantScopeBlockEvent {
  table: string
  hook: TenantScopeBlockHook
}

/** Campos cerrados. Agregar uno exige editar este tipo y el test N4. */
export interface TenantScopeBlockPayload {
  code: typeof TENANT_SCOPE_BLOCK_LOG_CODE
  mode: TenantScopeBlockMode
  table: string
  hook: TenantScopeBlockHook
  environment: string
  callsite: string
  suppressed: number
}

type EmitLevel = 'debug' | 'info' | 'warn'

export interface TenantScopeBlockLogDeps {
  now: () => number
  environment: () => string
  emit: (level: EmitLevel, payload: TenantScopeBlockPayload, message: string) => void
  captureStack: () => string | undefined
  mode: TenantScopeBlockMode
  windowMs: number
  maxKeys: number
}

interface KeyState {
  lastEmittedAt: number
  suppressed: number
}

const OWN_FRAMES = ['node_modules', 'with_business_unit_scope', 'tenant_scope_block_log', 'node:']

/** Primer frame fuera de node_modules, del mixin y de este módulo, como `app/...:línea`. */
export function resolveCallsite(stack: string | undefined, root: string): string {
  if (!stack) return 'unknown'
  for (const line of stack.split('\n').slice(1)) {
    if (OWN_FRAMES.some((own) => line.includes(own))) continue
    const match = line.match(/\(?((?:file:\/\/)?[^\s()]+):(\d+):\d+\)?\s*$/)
    if (!match) continue
    const file = match[1].replace('file://', '').replace(`${root}/`, '')
    return `${file}:${match[2]}`
  }
  return 'unknown'
}

export function createTenantScopeBlockLog(deps: TenantScopeBlockLogDeps) {
  const state = new Map<string, KeyState>()

  return function record(event: TenantScopeBlockEvent): void {
    try {
      const key = `${event.table}:${event.hook}`
      const now = deps.now()
      const current = state.get(key)

      if (current && now - current.lastEmittedAt < deps.windowMs) {
        current.suppressed += 1
        return
      }

      if (!current && state.size >= deps.maxKeys) {
        const oldest = state.keys().next().value
        if (oldest !== undefined) state.delete(oldest)
      }

      const suppressed = current?.suppressed ?? 0
      state.delete(key)
      state.set(key, { lastEmittedAt: now, suppressed: 0 })

      const environment = deps.environment()
      const level: EmitLevel =
        environment === 'test' ? 'debug' : deps.mode === 'observed' ? 'info' : 'warn'

      deps.emit(
        level,
        {
          code: TENANT_SCOPE_BLOCK_LOG_CODE,
          mode: deps.mode,
          table: event.table,
          hook: event.hook,
          environment,
          callsite: resolveCallsite(deps.captureStack(), app.appRoot.pathname.replace(/\/$/, '')),
          suppressed,
        },
        deps.mode === 'observed'
          ? 'Consulta sin empresa identificada (observada, no bloqueada)'
          : 'Consulta sin empresa identificada (bloqueada)'
      )
    } catch {
      // El registro nunca rompe ni altera la consulta que lo disparó.
    }
  }
}

/** Instancia de proceso que usa el mixin. */
export const recordTenantScopeBlock = createTenantScopeBlockLog({
  now: () => Date.now(),
  environment: () => app.getEnvironment(),
  emit: (level, payload, message) => logger[level](payload, message),
  captureStack: () => new Error().stack,
  mode: TENANT_SCOPE_BLOCK_MODE,
  windowMs: TENANT_SCOPE_BLOCK_LOG_WINDOW_MS,
  maxKeys: TENANT_SCOPE_BLOCK_LOG_MAX_KEYS,
})
