import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { resolveTenantBillingCompleteness } from '../../../app/services/platform_tenant_service.js'

/**
 * USRH1788052455649 — la completitud fiscal viaja en el listado de plataforma.
 *
 * Dos frentes:
 *  1. La regla derivada (`resolveTenantBillingCompleteness`) es pura y trata la
 *     ausencia de perfil como perfil vacío, sin escribir una segunda lista de
 *     campos obligatorios (regla 3: la regla de completitud es una sola).
 *  2. La resolución por página usa UNA consulta, jamás una por fila.
 */

const SERVICE_FILE = join(process.cwd(), 'app/services/platform_tenant_service.ts')

function readService(): string {
  return readFileSync(SERVICE_FILE, 'utf-8')
}

/** Recorta el cuerpo de `listTenants` hasta el siguiente método de la clase. */
function extractListTenants(content: string): string {
  const signature = 'async listTenants('
  const start = content.indexOf(signature)
  if (start === -1) {
    throw new Error('No se encontró "async listTenants(" en platform_tenant_service.ts')
  }
  const rest = content.slice(start)
  const end = rest.indexOf('\n  async getTenantDetail(')
  return end === -1 ? rest : rest.slice(0, end)
}

const completeProfile = {
  rfc: 'ABC010101AB9',
  legalName: 'Abc SA de CV',
  postalCode: '06600',
  taxRegimeCode: '601',
  cfdiUseCode: 'G03',
}

test.group('resolveTenantBillingCompleteness — regla derivada del listado', () => {
  test('perfil con los cinco datos capturados → completo y sin faltantes (regla 1)', ({
    assert,
  }) => {
    const result = resolveTenantBillingCompleteness(completeProfile)

    assert.isTrue(result.complete)
    assert.deepEqual(result.missingFields, [])
  })

  test('perfil sin código postal ni uso de CFDI los lista en el orden del catálogo (regla 1)', ({
    assert,
  }) => {
    const result = resolveTenantBillingCompleteness({
      ...completeProfile,
      postalCode: null,
      cfdiUseCode: null,
    })

    assert.isFalse(result.complete)
    assert.deepEqual(result.missingFields, ['postalCode', 'cfdiUseCode'])
  })

  test('perfil ausente cuenta como incompleto con los cinco datos faltantes (regla 2)', ({
    assert,
  }) => {
    const result = resolveTenantBillingCompleteness(null)

    assert.isFalse(result.complete)
    assert.deepEqual(result.missingFields, [
      'rfc',
      'legalName',
      'postalCode',
      'taxRegimeCode',
      'cfdiUseCode',
    ])
  })

  test('perfil ausente nunca devuelve completo ni un arreglo vacío (regla 2)', ({ assert }) => {
    const result = resolveTenantBillingCompleteness(null)

    assert.notEqual(result.complete, true)
    assert.isAbove(result.missingFields.length, 0)
  })

  test('el campo en blanco cuenta como faltante, no como capturado', ({ assert }) => {
    const result = resolveTenantBillingCompleteness({ ...completeProfile, legalName: '   ' })

    assert.isFalse(result.complete)
    assert.deepEqual(result.missingFields, ['legalName'])
  })

  test('dos lecturas seguidas devuelven el mismo orden (orden estable)', ({ assert }) => {
    const first = resolveTenantBillingCompleteness(null)
    const second = resolveTenantBillingCompleteness(null)

    assert.deepEqual(first.missingFields, second.missingFields)
  })
})

test.group('completitud fiscal del listado — una sola regla (regla 3)', () => {
  test('el perfil ausente se evalúa con computeBillingProfileCompleteness, no con una lista propia', ({
    assert,
  }) => {
    const content = readService()

    assert.include(
      content,
      'computeBillingProfileCompleteness(profile ?? EMPTY_BILLING_PROFILE)',
      'la ausencia de perfil debe pasar por la misma regla, con un perfil vacío como entrada'
    )
  })

  test('el servicio no escribe una segunda lista de los cinco campos obligatorios', ({
    assert,
  }) => {
    const content = readService()

    assert.notInclude(
      content,
      "'taxRegimeCode', 'cfdiUseCode']",
      'el catálogo de campos obligatorios vive solo en tenant_billing_profile_completeness.ts'
    )
  })
})

test.group('listTenants — la completitud se resuelve por página, no por fila', () => {
  test('llama loadBillingCompletenessMap exactamente una vez', ({ assert }) => {
    const body = extractListTenants(readService())
    const calls = body.match(/this\.loadBillingCompletenessMap\(/g) ?? []

    assert.lengthOf(calls, 1, 'una sola resolución por página, nunca una por fila')
  })

  test('resuelve la completitud antes de armar las filas', ({ assert }) => {
    const body = extractListTenants(readService())
    const mapIndex = body.indexOf('this.loadBillingCompletenessMap(')
    const rowsMapIndex = body.indexOf('const data: TenantListItem[] = rows.map(')

    assert.isAbove(mapIndex, -1)
    assert.isAbove(rowsMapIndex, -1)
    assert.isBelow(mapIndex, rowsMapIndex, 'el mapa se arma antes del pliegue por fila')
  })

  test('no consulta el modelo del perfil fiscal dentro de listTenants', ({ assert }) => {
    const body = extractListTenants(readService())

    assert.notInclude(
      body,
      'TenantBillingProfile.query(',
      'la consulta del perfil vive en loadBillingCompletenessMap, no en el cuerpo del listado'
    )
  })

  test('loadBillingCompletenessMap consulta por lote y bajo el bypass auditado', ({ assert }) => {
    const content = readService()
    const start = content.indexOf('private async loadBillingCompletenessMap(')
    assert.isAbove(start, -1, 'debe existir loadBillingCompletenessMap')

    const body = content.slice(start, start + 1500)

    assert.include(body, "whereIn('businessUnitId', businessUnitIds)")
    assert.include(body, 'TenantContext.runUnscoped(')
    assert.include(body, 'PLATFORM_BILLING_PROFILE_UNSCOPE_REASON')
  })

  test('la consulta del perfil va por Lucid, no por db.from crudo (el RFC viaja cifrado)', ({
    assert,
  }) => {
    const content = readService()
    const start = content.indexOf('private async loadBillingCompletenessMap(')
    const body = content.slice(start, start + 1500)

    assert.include(body, 'TenantBillingProfile.query()')
    assert.notInclude(body, "db.from('tenant_billing_profiles")
  })
})
