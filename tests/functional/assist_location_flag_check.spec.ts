import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ASSIST_LOCATION_FLAG } from '#constants/assist_location_flag'
import {
  cleanupTenantActor,
  createTenantActor,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * La BD solo acepta el vocabulario de `ASSIST_LOCATION_FLAG` en
 * `assists.assist_location_flag` (VLRH-H1791056345261). Si la constante gana un
 * valor, este caso falla hasta que una migración actualice el CHECK.
 *
 * Cada inserción corre en una transacción que se revierte: no deja checadas.
 */

const PUNCH = '2026-10-06 14:02:00'

async function insertWithFlag(
  trx: TransactionClientContract,
  businessUnitId: number,
  flag: string | null
): Promise<void> {
  await trx.table('assists').insert({
    assist_emp_code: 'TEST-LOCATION-FLAG-CHECK',
    assist_emp_id: 0,
    business_unit_id: businessUnitId,
    assist_punch_time: PUNCH,
    assist_punch_time_utc: PUNCH,
    assist_punch_time_origin: PUNCH,
    assist_upload_time: PUNCH,
    assist_sync_id: 0,
    assist_location_flag: flag,
  })
}

/** Intenta la inserción y siempre revierte; devuelve el error, si lo hubo. */
async function tryInsert(businessUnitId: number, flag: string | null): Promise<unknown> {
  const trx = await db.transaction()
  try {
    await insertWithFlag(trx, businessUnitId, flag)
    return null
  } catch (error) {
    return error
  } finally {
    await trx.rollback()
  }
}

test.group('CHECK de la marca de ubicación en assists', (group) => {
  let actor: TenantActor | null = null

  group.setup(async () => {
    actor = await createTenantActor('marca-check')
  })

  group.teardown(async () => {
    await cleanupTenantActor(actor)
  })

  test('acepta NULL y cada valor de ASSIST_LOCATION_FLAG', async ({ assert }) => {
    const businessUnitId = actor!.businessUnit.businessUnitId
    for (const flag of [null, ...Object.values(ASSIST_LOCATION_FLAG)]) {
      assert.isNull(await tryInsert(businessUnitId, flag), String(flag))
    }
  })

  test('rechaza un valor fuera del vocabulario: {value}')
    .with([{ value: 'otro' }, { value: '' }, { value: 'SIMULATED' }])
    .run(async ({ assert }, row) => {
      const error = await tryInsert(actor!.businessUnit.businessUnitId, row.value)
      assert.instanceOf(error, Error)
      assert.equal((error as { code?: string }).code, 'ER_CHECK_CONSTRAINT_VIOLATED')
    })
})
