import { test } from '@japa/runner'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import {
  cleanupTarjetaContratoFixture,
  createTarjetaContratoFixture,
  type TarjetaContratoFixture,
} from './repse_tarjeta_contrato_support.js'

/**
 * Contratos REPSE: datos de tarjeta en listado y detalle, y filtro `porVencer`
 * resuelto en SQL y combinable con `estatus`.
 */

const BASE = '/api/contratos-servicios-especializados'

type ContratoTarjeta = {
  id: number
  estatus: string
  porVencer: boolean
  diasParaVencer: number | null
  trabajadoresAsignados: number
  trabajadoresDeclarados: number
  tieneDocumentoFirmado: boolean
}

let actor: TenantActor | null = null
let fixture: TarjetaContratoFixture | null = null

/** El título del listado depende del idioma: se toma la única llave de `data`. */
function listRows(body: { data: Record<string, { data: ContratoTarjeta[] }> }): ContratoTarjeta[] {
  return Object.values(body.data)[0].data
}

test.group('REPSE — contratos con datos de tarjeta y filtro porVencer', (group) => {
  group.setup(async () => {
    actor = await createBypassActor('owner', 'repse-tarjeta')
    fixture = await createTarjetaContratoFixture(actor.businessUnit, 'tarjeta')
  })

  group.teardown(async () => {
    await cleanupTarjetaContratoFixture(fixture)
    await cleanupTenantActor(actor)
    fixture = null
    actor = null
  })

  test('el listado trae asignados, declarados, documento y vencimiento', async ({
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
    const rows = listRows(response.body())
    const porVencer = rows.find((row) => row.id === data.porVencerId)
    const lejano = rows.find((row) => row.id === data.vigenteLejanoId)
    const borrador = rows.find((row) => row.id === data.borradorId)

    assert.deepInclude(porVencer, {
      estatus: 'vigente',
      porVencer: true,
      diasParaVencer: data.diasPorVencer,
      trabajadoresAsignados: 1,
      trabajadoresDeclarados: 5,
      tieneDocumentoFirmado: true,
    })
    assert.deepInclude(lejano, {
      estatus: 'vigente',
      porVencer: false,
      diasParaVencer: 200,
      trabajadoresAsignados: 0,
      tieneDocumentoFirmado: false,
    })
    assert.deepInclude(borrador, {
      estatus: 'borrador',
      porVencer: false,
      diasParaVencer: null,
      tieneDocumentoFirmado: false,
    })
  })

  test('el detalle trae los mismos datos de tarjeta', async ({ client, assert }) => {
    const owner = required(actor, 'actor')
    const data = required(fixture, 'fixture')

    const response = await client
      .get(`${BASE}/${data.porVencerId}`)
      .loginAs(owner.user)
      .headers(businessUnitHeaders(owner))

    response.assertStatus(200)
    const contrato = Object.values(response.body().data)[0] as ContratoTarjeta
    assert.deepInclude(contrato, {
      porVencer: true,
      diasParaVencer: data.diasPorVencer,
      trabajadoresAsignados: 1,
      trabajadoresDeclarados: 5,
      tieneDocumentoFirmado: true,
    })
  })

  test('porVencer filtra en SQL y se combina con estatus', async ({ client, assert }) => {
    const owner = required(actor, 'actor')
    const data = required(fixture, 'fixture')

    const listar = async (qs: Record<string, string | number>) => {
      const response = await client
        .get(BASE)
        .qs({ page: 1, perPage: 50, ...qs })
        .loginAs(owner.user)
        .headers(businessUnitHeaders(owner))
      response.assertStatus(200)
      return listRows(response.body())
        .map((row) => row.id)
        .sort((a, b) => a - b)
    }

    assert.deepEqual(await listar({ porVencer: 'true' }), [data.porVencerId])
    assert.deepEqual(
      await listar({ porVencer: 'false' }),
      [data.vigenteLejanoId, data.borradorId].sort((a, b) => a - b)
    )
    assert.deepEqual(await listar({ estatus: 'vigente', porVencer: 'false' }), [
      data.vigenteLejanoId,
    ])
    assert.deepEqual(await listar({ estatus: 'borrador', porVencer: 'true' }), [])

    const paginado = await client
      .get(BASE)
      .qs({ page: 1, perPage: 1, porVencer: 'false' })
      .loginAs(owner.user)
      .headers(businessUnitHeaders(owner))
    paginado.assertStatus(200)
    const bundle = Object.values(paginado.body().data)[0] as { meta: { total: number } }
    assert.equal(bundle.meta.total, 2)
  })
})
