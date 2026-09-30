import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import BranchOffice from '#models/branch_office'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import {
  cleanupContratoImportFixture,
  createContratoImportFixture,
  createContratoInTenant,
  uniqueStamp,
  type ContratoImportTestFixture,
} from '../helpers/contrato_import_excel_fixture.js'

/**
 * Empresas contratantes: el listado agrega `contratosCount` y `sitios`
 * (sucursales ligadas como sitios de servicio, con su nombre visible).
 */

const BASE = '/api/empresas-contratantes'

type ListItem = {
  id: number
  contratosCount: number
  sitios: Array<{ id: number; name: string }>
}

let actor: TenantActor | null = null
let fixture: ContratoImportTestFixture | null = null
let sitioIds: number[] = []

async function createSitio(data: ContratoImportTestFixture, name: string): Promise<BranchOffice> {
  return BranchOffice.create({
    businessUnitId: data.businessUnit.businessUnitId,
    branchOfficeName: name,
    branchOfficeSlug: `sitio-repse-${uniqueStamp()}`,
    branchOfficeLocationAddress: null,
    branchOfficeIdealTemplateCount: null,
    branchOfficeMinActiveEmployeesPerShift: null,
    empresaContratanteId: data.contratante.empresaContratanteId,
  })
}

test.group('REPSE — listado de empresas contratantes con conteos y sitios', (group) => {
  group.setup(async () => {
    actor = await createBypassActor('owner', 'repse-empresas-conteo')
    fixture = await createContratoImportFixture(actor.businessUnit)

    await createContratoInTenant({ fixture, numeroContrato: `CSE-EMP-1-${uniqueStamp()}` })
    await createContratoInTenant({ fixture, numeroContrato: `CSE-EMP-2-${uniqueStamp()}` })

    const sitioB = await createSitio(fixture, 'Planta Norte')
    const sitioA = await createSitio(fixture, 'Almacén Centro')
    sitioIds = [sitioA.branchOfficeId, sitioB.branchOfficeId]
  })

  group.teardown(async () => {
    if (sitioIds.length > 0) {
      await db.from('branch_offices').whereIn('branch_office_id', sitioIds).delete()
    }
    sitioIds = []
    await cleanupContratoImportFixture(fixture)
    await cleanupTenantActor(actor)
    fixture = null
    actor = null
  })

  test('cada fila trae contratosCount y sitios ordenados por nombre', async ({
    client,
    assert,
  }) => {
    const owner = required(actor, 'actor')
    const data = required(fixture, 'fixture')

    const response = await client
      .get(BASE)
      .qs({ page: 1, perPage: 50 })
      .loginAs(owner.user)
      .headers(businessUnitHeaders(owner))

    response.assertStatus(200)
    const rows: ListItem[] = response.body().data.empresasContratantes.data
    const empresa = rows.find((row) => row.id === data.contratante.empresaContratanteId)

    assert.exists(empresa)
    assert.equal(empresa!.contratosCount, 2)
    assert.deepEqual(empresa!.sitios, [
      { id: sitioIds[0], name: 'Almacén Centro' },
      { id: sitioIds[1], name: 'Planta Norte' },
    ])
  })
})
