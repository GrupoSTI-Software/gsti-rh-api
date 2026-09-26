import { test } from '@japa/runner'
import {
  TENANT_SCOPE_BLOCK_LOG_CODE,
  createTenantScopeBlockLog,
  resolveCallsite,
  type TenantScopeBlockPayload,
} from '#utils/tenant_scope_block_log'

function makeRecorder(options?: {
  now?: () => number
  environment?: () => string
  mode?: 'observed' | 'blocked'
  windowMs?: number
  maxKeys?: number
}) {
  const emitted: Array<{ level: 'debug' | 'info' | 'warn'; payload: TenantScopeBlockPayload; message: string }> =
    []
  let now = 0
  const record = createTenantScopeBlockLog({
    now: options?.now ?? (() => {
      now += 1
      return now
    }),
    environment: options?.environment ?? (() => 'production'),
    emit: (level, payload, message) => {
      emitted.push({ level, payload, message })
    },
    captureStack: () =>
      new Error().stack?.replace(
        /^Error/,
        'Error\n    at app/services/employee_service.ts:42:10\n    at node_modules/foo/bar.js:1:1'
      ),
    mode: options?.mode ?? 'observed',
    windowMs: options?.windowMs ?? 300_000,
    maxKeys: options?.maxKeys ?? 500,
  })

  return { record, emitted, getNow: () => now }
}

test.group('resolveCallsite', () => {
  test('devuelve el primer frame fuera de node_modules y del mixin', ({ assert }) => {
    const stack = [
      'Error',
      '    at record (app/utils/tenant_scope_block_log.ts:10:1)',
      '    at applyTenantFilter (app/mixins/with_business_unit_scope.ts:20:5)',
      '    at Employee.query (app/services/employee_service.ts:42:10)',
      '    at node_modules/@adonisjs/lucid/build/src/orm/query/index.js:1:1',
    ].join('\n')

    assert.equal(resolveCallsite(stack, '/srv/api'), 'app/services/employee_service.ts:42')
  })

  test('sin stack util devuelve unknown', ({ assert }) => {
    assert.equal(resolveCallsite(undefined, '/srv/api'), 'unknown')
  })
})

test.group('createTenantScopeBlockLog — payload y niveles', () => {
  test('emite payload cerrado con code, mode, table, hook, environment, callsite y suppressed', ({
    assert,
  }) => {
    const { record, emitted } = makeRecorder({ environment: () => 'test' })

    record({ table: 'employees', hook: 'fetch' })

    assert.lengthOf(emitted, 1)
    assert.equal(emitted[0].level, 'debug')
    assert.equal(emitted[0].payload.code, TENANT_SCOPE_BLOCK_LOG_CODE)
    assert.equal(emitted[0].payload.mode, 'observed')
    assert.equal(emitted[0].payload.table, 'employees')
    assert.equal(emitted[0].payload.hook, 'fetch')
    assert.equal(emitted[0].payload.environment, 'test')
    assert.equal(emitted[0].payload.callsite, 'app/services/employee_service.ts:42')
    assert.equal(emitted[0].payload.suppressed, 0)
    assert.include(emitted[0].message, 'observada')
  })

  test('en producción observed usa info; blocked usa warn', ({ assert }) => {
    const observed = makeRecorder({ environment: () => 'production', mode: 'observed' })
    observed.record({ table: 'people', hook: 'find' })
    assert.equal(observed.emitted[0].level, 'info')

    const blocked = makeRecorder({ environment: () => 'production', mode: 'blocked' })
    blocked.record({ table: 'people', hook: 'find' })
    assert.equal(blocked.emitted[0].level, 'warn')
    assert.include(blocked.emitted[0].message, 'bloqueada')
  })
})

test.group('createTenantScopeBlockLog — muestreo', () => {
  test('agrupa repeticiones dentro de la ventana e incrementa suppressed en la siguiente emisión', ({
    assert,
  }) => {
    let clock = 0
    const { record, emitted } = makeRecorder({
      now: () => {
        clock += 1_000
        return clock
      },
      windowMs: 5_000,
    })

    record({ table: 'employees', hook: 'paginate' })
    record({ table: 'employees', hook: 'paginate' })
    record({ table: 'employees', hook: 'paginate' })

    assert.lengthOf(emitted, 1)
    assert.equal(emitted[0].payload.suppressed, 0)

    clock = 6_000
    record({ table: 'employees', hook: 'paginate' })

    assert.lengthOf(emitted, 2)
    assert.equal(emitted[1].payload.suppressed, 2)
  })

  test('nunca lanza aunque emit falle', ({ assert }) => {
    const record = createTenantScopeBlockLog({
      now: () => Date.now(),
      environment: () => 'test',
      emit: () => {
        throw new Error('logger caído')
      },
      captureStack: () => undefined,
      mode: 'observed',
      windowMs: 300_000,
      maxKeys: 500,
    })

    assert.doesNotThrows(() => record({ table: 'employees', hook: 'find' }))
  })
})
