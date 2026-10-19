import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import PlatformDeviceAssignmentService from '#services/platform_device_assignment_service'
import {
  createSharedAccessPointFixture,
  type SharedFixture,
} from '#tests/helpers/shared_access_point_fixture'

interface LoggedQuery {
  sql: string
  txId: string | null
}

/** Registra cada sentencia que sale por la conexion de escritura durante `work`. */
async function withSqlLog<T>(work: () => Promise<T>): Promise<{ result: T; queries: LoggedQuery[] }> {
  const queries: LoggedQuery[] = []
  const knex = db.connection().getWriteClient()
  const onQuery = (query: { sql?: string; __knexTxId?: string }) => {
    if (query.sql) queries.push({ sql: query.sql.toLowerCase(), txId: query.__knexTxId ?? null })
  }
  knex.on('query', onQuery)
  try {
    return { result: await work(), queries }
  } finally {
    knex.off('query', onQuery)
  }
}

/**
 * Orden de candados de la desasignacion (VLRH-P0065, 3.2.3). Con REPEATABLE
 * READ la primera lectura consistente fija la snapshot de la transaccion: si
 * ocurre antes de tomar la entrega y el checador, un otorgamiento o un envio
 * confirmados en el hueco quedan fuera de lo que la revocacion ve.
 */
test.group('PlatformDeviceAssignmentService.unassign: candados', (group) => {
  let fx: SharedFixture
  group.setup(async () => {
    fx = await createSharedAccessPointFixture()
    return () => fx.cleanup()
  })

  test('toma aparato, entrega y checador con FOR UPDATE antes de cualquier lectura consistente', async ({
    assert,
  }) => {
    const { queries } = await withSqlLog(() =>
      new PlatformDeviceAssignmentService().unassign(fx.platformDeviceId, {
        releasedAt: new Date(),
        releaseReason: fx.releaseReason,
      })
    )

    const first = queries.find(
      (q) => q.txId !== null && q.sql.includes('platform_devices') && q.sql.includes('for update')
    )
    assert.exists(first, 'la desasignacion no bloqueo el aparato')
    const selects = queries.filter((q) => q.txId === first?.txId && q.sql.startsWith('select'))
    const locking = (q: LoggedQuery) => q.sql.includes('for update')

    const firstConsistent = selects.findIndex((q) => !locking(q))
    assert.isAbove(firstConsistent, 2, 'hubo una lectura consistente antes de los tres candados')
    const lockedTables = selects.slice(0, 3).map((q) => {
      assert.isTrue(locking(q), `sentencia sin candado entre los primeros: ${q.sql}`)
      return /from `?(\w+)`?/.exec(q.sql)?.[1]
    })
    // El mismo orden que otorgar (entrega antes que checador): sin ciclo.
    assert.deepEqual(lockedTables, ['platform_devices', 'platform_device_assignments', 'access_points'])
  })
})
