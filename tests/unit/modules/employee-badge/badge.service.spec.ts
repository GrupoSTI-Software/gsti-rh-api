import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import BadgeService from '#modules/employee-badge/badge.service'
import type { BadgeRepository } from '#modules/employee-badge/badge.repository'
import type { BadgeEmployeeContext } from '#modules/employee-badge/dto/badge.dto'

/**
 * Tests unitarios del contrato del gafete (B1 de ESB-04-02-08-01), con
 * repositorio falso en memoria — mismo patrón que
 * `tests/unit/modules/legal-documents/legal_document.service.spec.ts`.
 *
 * Por qué unitario y no funcional: `vinculoVigente === false` es INALCANZABLE
 * por HTTP. `businessScope()` solo resuelve empresas con
 * `business_unit_active = 1` y sin borrado lógico
 * (`business_access_scope_service.ts:76-82` y `:92-96`), y el repositorio
 * descarta al trabajador de baja antes de armar el contexto
 * (`badge.repository.mysql.ts:34` y `:178`). La rama falsa solo se puede
 * probar sustituyendo el puerto, que es exactamente lo que hace este archivo.
 */

/** 43 chars URL-safe, el mismo largo que `randomBytes(32).toString('base64url')`. */
const FAKE_TOKEN = 'x'.repeat(43)

function makeContext(overrides: Partial<BadgeEmployeeContext> = {}): BadgeEmployeeContext {
  return {
    employeeId: 4821,
    businessUnitId: 31,
    employeeBadgeToken: FAKE_TOKEN,
    personFirstname: 'Gafete',
    personLastname: 'Unitario',
    personSecondLastname: 'Vinculo',
    employeePhoto: null,
    businessUnitLegalName: 'Gafete Unitario SA de CV',
    businessUnitName: 'Gafete Unitario',
    employeeActive: true,
    businessUnitActive: true,
    positionName: 'Operador',
    repseFolio: null,
    repseExpiresAt: null,
    ...overrides,
  }
}

function makeRepository(context: BadgeEmployeeContext): BadgeRepository {
  return {
    async findActiveEmployeeInTenant() {
      return context
    },
    async findActiveEmployeesInTenant() {
      return [context]
    },
    async findActiveEmployeeByPersonId() {
      return context
    },
    async resolveOrCreateToken() {
      return FAKE_TOKEN
    },
    async findPublicByToken() {
      return null
    },
  }
}

function buildGafete(context: BadgeEmployeeContext) {
  const service = new BadgeService(makeRepository(context))
  return service.getBadgeForEmployeeInTenant(context.employeeId, [context.businessUnitId])
}

test.group('BadgeService - contrato del gafete (B1)', () => {
  test('vinculoVigente es true con trabajador y empresa activos', async ({ assert }) => {
    const gafete = await buildGafete(makeContext())
    assert.isTrue(gafete.vinculoVigente)
  })

  test('vinculoVigente es false con la empresa desactivada', async ({ assert }) => {
    const gafete = await buildGafete(makeContext({ businessUnitActive: false }))
    assert.isFalse(gafete.vinculoVigente)
  })

  test('vinculoVigente es false con el trabajador dado de baja', async ({ assert }) => {
    const gafete = await buildGafete(makeContext({ employeeActive: false }))
    assert.isFalse(gafete.vinculoVigente)
  })

  test('folioVigenteHasta viaja como fecha civil aunque el folio esté vencido', async ({
    assert,
  }) => {
    const vigente = await buildGafete(
      makeContext({ repseFolio: 'REPSE-UNIT-1', repseExpiresAt: DateTime.fromISO('2031-03-31') })
    )
    assert.equal(vigente.folioVigenteHasta, '2031-03-31')
    assert.isTrue(vigente.folioVigente)

    const vencido = await buildGafete(
      makeContext({ repseFolio: 'REPSE-UNIT-2', repseExpiresAt: DateTime.fromISO('2020-01-15') })
    )
    assert.equal(vencido.folioVigenteHasta, '2020-01-15')
    assert.isFalse(vencido.folioVigente)
  })

  test('folioVigenteHasta es null sin registro REPSE', async ({ assert }) => {
    const gafete = await buildGafete(makeContext())
    assert.isNull(gafete.folioRepse)
    assert.isNull(gafete.folioVigente)
    assert.isNull(gafete.folioVigenteHasta)
  })

  test('fotoFaltante mira la fotografía del expediente, no la URL pública', async ({ assert }) => {
    const conFotoPrivada = await buildGafete(
      makeContext({ employeePhoto: 'employees/4821/photo.jpg' })
    )
    assert.isFalse(conFotoPrivada.fotoFaltante)
    assert.isNull(conFotoPrivada.fotoUrl)

    const conFotoPublica = await buildGafete(
      makeContext({ employeePhoto: 'https://cdn.example.com/employees/4821.jpg' })
    )
    assert.isFalse(conFotoPublica.fotoFaltante)
    assert.equal(conFotoPublica.fotoUrl, 'https://cdn.example.com/employees/4821.jpg')

    const sinFoto = await buildGafete(makeContext({ employeePhoto: null }))
    assert.isTrue(sinFoto.fotoFaltante)
    assert.isNull(sinFoto.fotoUrl)
  })

  test('el key-set del GafeteDto es exactamente el del contrato', async ({ assert }) => {
    const gafete = await buildGafete(makeContext())
    assert.deepEqual(Object.keys(gafete).sort(), [
      'empleadoId',
      'empresa',
      'folioRepse',
      'folioVigente',
      'folioVigenteHasta',
      'fotoFaltante',
      'fotoUrl',
      'nombreCompleto',
      'puesto',
      'qrDataUrl',
      'urlVerificacion',
      'vinculoVigente',
    ])
  })
})
