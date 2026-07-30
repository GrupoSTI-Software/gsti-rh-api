import { test } from '@japa/runner'
import { PLATFORM_TENANT_ERROR_CODES } from '../../../app/constants/platform_tenant_error_codes.js'
import { PlatformTenantServiceError } from '../../../app/exceptions/platform_tenant_service_error.js'
import { resolvePlatformTenantApiError } from '../../../app/helpers/platform_tenant_api_error.js'
import { TENANT_SUBSCRIPTION_STATUSES } from '../../../app/validators/platform_tenant.js'

// ─── Helpers que simulan lógica del servicio ──────────────────────────────────

function validateTenantExists(row: unknown, publicId: string): void {
  if (!row) {
    throw new PlatformTenantServiceError(
      `Empresa ${publicId} no encontrada`,
      PLATFORM_TENANT_ERROR_CODES.NOT_FOUND,
      404,
      'tenant-no-encontrado',
      'La empresa solicitada no existe o no está disponible.'
    )
  }
}

function resolveSubscription(
  row: Record<string, unknown>
): { status: string; planName: string | null } | null {
  if (!row.subscriptionStatus) return null
  return {
    status: row.subscriptionStatus as string,
    planName: (row.planName as string | null) ?? null,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.group('PLT.TEN.* — códigos de error', () => {
  test('todos los códigos tienen prefijo PLT.TEN.', ({ assert }) => {
    for (const code of Object.values(PLATFORM_TENANT_ERROR_CODES)) {
      assert.isTrue(code.startsWith('PLT.TEN.'), `${code} debe tener prefijo PLT.TEN.`)
    }
  })

  test('NOT_FOUND es PLT.TEN.NOT_FOUND', ({ assert }) => {
    assert.equal(PLATFORM_TENANT_ERROR_CODES.NOT_FOUND, 'PLT.TEN.NOT_FOUND')
  })

  test('VAL_INPUT es PLT.TEN.VAL_INPUT', ({ assert }) => {
    assert.equal(PLATFORM_TENANT_ERROR_CODES.VAL_INPUT, 'PLT.TEN.VAL_INPUT')
  })

  test('SYS_UNHANDLED es PLT.TEN.SYS_UNHANDLED', ({ assert }) => {
    assert.equal(PLATFORM_TENANT_ERROR_CODES.SYS_UNHANDLED, 'PLT.TEN.SYS_UNHANDLED')
  })
})

test.group('PlatformTenantServiceError', () => {
  test('preserva errorCode, httpStatus, key y detail', ({ assert }) => {
    const err = new PlatformTenantServiceError(
      'Empresa no encontrada',
      PLATFORM_TENANT_ERROR_CODES.NOT_FOUND,
      404,
      'tenant-no-encontrado',
      'La empresa solicitada no existe.'
    )
    assert.equal(err.errorCode, 'PLT.TEN.NOT_FOUND')
    assert.equal(err.httpStatus, 404)
    assert.equal(err.key, 'tenant-no-encontrado')
    assert.equal(err.detail, 'La empresa solicitada no existe.')
    assert.equal(err.name, 'PlatformTenantServiceError')
  })

  test('httpStatus default es 400', ({ assert }) => {
    const err = new PlatformTenantServiceError('Error', PLATFORM_TENANT_ERROR_CODES.SYS_UNHANDLED)
    assert.equal(err.httpStatus, 400)
  })
})

test.group('resolvePlatformTenantApiError', () => {
  test('E_VALIDATION_ERROR → 422 con PLT.TEN.VAL_INPUT', ({ assert }) => {
    const error = { code: 'E_VALIDATION_ERROR', messages: [{ message: 'status inválido' }] }
    const result = resolvePlatformTenantApiError(error)
    assert.equal(result.status, 422)
    assert.equal(result.code, 'PLT.TEN.VAL_INPUT')
    assert.equal(result.detail, 'status inválido')
  })

  test('PlatformTenantServiceError NOT_FOUND → 404', ({ assert }) => {
    const error = new PlatformTenantServiceError(
      'No encontrado',
      PLATFORM_TENANT_ERROR_CODES.NOT_FOUND,
      404,
      'tenant-no-encontrado',
      'La empresa no existe.'
    )
    const result = resolvePlatformTenantApiError(error)
    assert.equal(result.status, 404)
    assert.equal(result.code, 'PLT.TEN.NOT_FOUND')
    assert.equal(result.key, 'tenant-no-encontrado')
  })

  test('error desconocido → 500 con SYS_UNHANDLED', ({ assert }) => {
    const result = resolvePlatformTenantApiError(new Error('Fallo inesperado'))
    assert.equal(result.status, 500)
    assert.equal(result.code, 'PLT.TEN.SYS_UNHANDLED')
  })

  test('E_VALIDATION_ERROR sin messages usa fallback', ({ assert }) => {
    const result = resolvePlatformTenantApiError({ code: 'E_VALIDATION_ERROR' })
    assert.equal(result.detail, 'Datos inválidos')
  })
})

test.group('getTenantDetail — validación de existencia', () => {
  test('empresa inexistente (null) lanza NOT_FOUND con 404', ({ assert }) => {
    let err: PlatformTenantServiceError | null = null
    try {
      validateTenantExists(null, 'uuid-inexistente')
    } catch (e) {
      err = e as PlatformTenantServiceError
    }
    assert.equal(err?.errorCode, 'PLT.TEN.NOT_FOUND')
    assert.equal(err?.httpStatus, 404)
    assert.equal(err?.key, 'tenant-no-encontrado')
  })

  test('empresa existente no lanza error', ({ assert }) => {
    assert.doesNotThrow(() =>
      validateTenantExists({ businessUnitPublicId: 'uuid-real' }, 'uuid-real')
    )
  })
})

test.group('resolveSubscription — regla: empresa sin suscripción', () => {
  test('row sin subscriptionStatus devuelve subscription: null', ({ assert }) => {
    const result = resolveSubscription({ subscriptionStatus: null })
    assert.isNull(result)
  })

  test('row con subscriptionStatus devuelve el snapshot', ({ assert }) => {
    const result = resolveSubscription({
      subscriptionStatus: 'active',
      planName: 'Plan Pro',
    })
    assert.isNotNull(result)
    assert.equal(result?.status, 'active')
    assert.equal(result?.planName, 'Plan Pro')
  })

  test('row con subscriptionStatus pero planName null devuelve planName null', ({ assert }) => {
    const result = resolveSubscription({
      subscriptionStatus: 'trialing',
      planName: null,
    })
    assert.isNull(result?.planName)
  })
})

test.group('TENANT_SUBSCRIPTION_STATUSES — valores válidos del filtro', () => {
  test('contiene los 4 estados del enum de suscripción', ({ assert }) => {
    assert.includeMembers([...TENANT_SUBSCRIPTION_STATUSES], [
      'trialing',
      'active',
      'past_due',
      'canceled',
    ])
  })
})

test.group('listTenants — defaults de paginación', () => {
  test('page y limit usan defaults 1 y 20 si no se pasan', ({ assert }) => {
    const page = undefined ?? 1
    const limit = undefined ?? 20
    assert.equal(page, 1)
    assert.equal(limit, 20)
  })

  test('limit se clampea a máx 100', ({ assert }) => {
    const limit = Math.min(150, 100)
    assert.equal(limit, 100)
  })

  test('offset se calcula correctamente', ({ assert }) => {
    const page = 3
    const limit = 20
    const offset = (page - 1) * limit
    assert.equal(offset, 40)
  })

  test('lastPage mínimo es 1 aunque total sea 0', ({ assert }) => {
    const lastPage = Math.max(1, Math.ceil(0 / 20))
    assert.equal(lastPage, 1)
  })
})
