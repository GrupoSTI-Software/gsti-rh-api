import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { todayInBusinessZone, toBusinessDateString } from '#utils/business_date'
import {
  buildInformativaExpirationSnapshot,
  INFORMATIVA_PANORAMA_THRESHOLD_DAYS,
} from '#constants/repse_folio_aviso'
import {
  assertPermissionDenied,
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  grantModulePermissions,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import {
  cleanupTarjetaContratoFixture,
  createTarjetaContratoFixture,
  type TarjetaContratoFixture,
} from './repse_tarjeta_contrato_support.js'
import { cleanupRepseContratoArtifacts } from './repse_contratos_asignaciones_sensitive_mask_support.js'
import { createContratoInTenant, uniqueStamp } from '../helpers/contrato_import_excel_fixture.js'

/**
 * `GET /api/repse/panorama`: KPIs, pendientes en orden y permiso de lectura
 * del módulo REPSE.
 */

const URL = '/api/repse/panorama'
const REPSE_MODULE = 'repse-registrations'

let owner: TenantActor | null = null
let fixture: TarjetaContratoFixture | null = null
/** Vencido por fecha y cancelado: sin documento y sin personal, no deben generar pendientes. */
let excluidosIds: number[] = []

async function createContratoExcluido(
  data: TarjetaContratoFixture,
  estatus: 'vigente' | 'cancelado',
  fechaFinDias: number
): Promise<number> {
  const contratoId = await createContratoInTenant({
    fixture: data.base,
    numeroContrato: `CSE-PANORAMA-FUERA-${uniqueStamp()}`,
  })
  const hoy = todayInBusinessZone()
  await db
    .from('contratos_servicios_especializados')
    .where('contrato_servicio_especializado_id', contratoId)
    .update({
      contrato_servicio_especializado_estatus: estatus,
      contrato_servicio_especializado_fecha_inicio: toBusinessDateString(hoy.minus({ days: 90 })),
      contrato_servicio_especializado_fecha_fin: toBusinessDateString(
        hoy.plus({ days: fechaFinDias })
      ),
    })
  return contratoId
}

test.group('REPSE — panorama', (group) => {
  group.setup(async () => {
    owner = await createBypassActor('owner', 'repse-panorama')
    fixture = await createTarjetaContratoFixture(owner.businessUnit, 'panorama')
    excluidosIds = [
      // Declarado vigente con fechaFin ayer: estatus efectivo vencido.
      await createContratoExcluido(fixture, 'vigente', -1),
      await createContratoExcluido(fixture, 'cancelado', 20),
    ]
  })

  group.teardown(async () => {
    for (const contratoId of excluidosIds) {
      await cleanupRepseContratoArtifacts(contratoId)
    }
    excluidosIds = []
    await cleanupTarjetaContratoFixture(fixture)
    await cleanupTenantActor(owner)
    fixture = null
    owner = null
  })

  test('responde KPIs y pendientes solo de contratos vigentes, en orden', async ({ client, assert }) => {
    const actor = required(owner, 'owner')
    const data = required(fixture, 'fixture')

    const response = await client.get(URL).loginAs(actor.user).headers(businessUnitHeaders(actor))

    response.assertStatus(200)
    const body = response.body().data

    assert.deepEqual(body.kpis, {
      contratosVigentes: 2,
      empresasContratantes: 1,
      serviciosActivos: 2,
      trabajadoresAsignados: 1,
    })

    const porVencerRef = {
      contratoId: data.porVencerId,
      numeroContrato: data.base.contratoNumero,
      empresaRazonSocial: data.base.contratante.razonSocial,
    }
    const contratoPendientes = body.pendientes.filter(
      (pendiente: { tipo: string }) => pendiente.tipo !== 'informativa'
    )

    assert.deepEqual(contratoPendientes.slice(0, 2), [
      {
        tipo: 'contrato_por_vencer',
        ...porVencerRef,
        fechaFin: contratoPendientes[0].fechaFin,
        dias: data.diasPorVencer,
      },
      { tipo: 'personal_sin_asignar', ...porVencerRef, asignados: 1, declarados: 5 },
    ])
    assert.deepEqual(
      contratoPendientes.slice(2).map((pendiente: { tipo: string; contratoId: number }) => [
        pendiente.tipo,
        pendiente.contratoId,
      ]),
      [
        ['contrato_sin_documento', data.vigenteLejanoId],
        ['personal_sin_asignar', data.vigenteLejanoId],
      ]
    )
    const contratosConPendiente = body.pendientes.map(
      (pendiente: { contratoId?: number }) => pendiente.contratoId
    )
    for (const fueraId of [data.borradorId, ...excluidosIds]) {
      assert.notInclude(contratosConPendiente, fueraId)
    }

    const informativa = buildInformativaExpirationSnapshot()
    if (informativa.daysRemaining <= INFORMATIVA_PANORAMA_THRESHOLD_DAYS) {
      assert.deepEqual(body.pendientes[0], {
        tipo: 'informativa',
        fecha: informativa.presentationDate,
        dias: informativa.daysRemaining,
      })
    } else {
      assert.notEqual(body.pendientes[0].tipo, 'informativa')
    }
  })

  test('exige repse-registrations:read', async ({ client, assert }) => {
    const actor = await createTenantActor('repse-panorama-gate')
    try {
      const denied = await client.get(URL).loginAs(actor.user).headers(businessUnitHeaders(actor))
      assertPermissionDenied(assert, denied)

      await grantModulePermissions(actor, REPSE_MODULE, ['read'])
      const allowed = await client.get(URL).loginAs(actor.user).headers(businessUnitHeaders(actor))
      allowed.assertStatus(200)
      assert.deepEqual(allowed.body().data.kpis, {
        contratosVigentes: 0,
        empresasContratantes: 0,
        serviciosActivos: 0,
        trabajadoresAsignados: 0,
      })
    } finally {
      await cleanupTenantActor(actor)
    }
  })
})
