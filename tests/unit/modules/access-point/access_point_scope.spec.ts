import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { AccessPointScope } from '#modules/access-point/sharing/access_point_scope'
import {
  createSharedAccessPointFixture,
  type SharedFixture,
} from '#tests/helpers/shared_access_point_fixture'

test.group('AccessPointScope', (group) => {
  let fx: SharedFixture
  group.setup(async () => {
    fx = await createSharedAccessPointFixture()
    return () => fx.cleanup()
  })

  test('sin invitadas el scope es solo la responsable', async ({ assert }) => {
    await fx.share.merge({ accessPointShareRevokedAt: DateTime.utc() }).save()
    const scope = await AccessPointScope.participants(fx.accessPoint.accessPointId, fx.ownerBu)
    assert.deepEqual(scope, [fx.ownerBu])
    await fx.share.merge({ accessPointShareRevokedAt: null }).save()
  })

  test('con invitada viva el scope la incluye despues de la responsable', async ({ assert }) => {
    const scope = await AccessPointScope.participants(fx.accessPoint.accessPointId, fx.ownerBu)
    assert.deepEqual(scope, [fx.ownerBu, fx.guestBu])
  })

  test('isParticipant distingue invitada de ajena', async ({ assert }) => {
    assert.isTrue(await AccessPointScope.isParticipant(fx.accessPoint.accessPointId, fx.guestBu))
    assert.isFalse(await AccessPointScope.isParticipant(fx.accessPoint.accessPointId, fx.outsiderBu))
  })

  test('sharedWith devuelve los checadores ajenos compartidos', async ({ assert }) => {
    assert.deepEqual(await AccessPointScope.sharedWith(fx.guestBu), [fx.accessPoint.accessPointId])
    assert.deepEqual(await AccessPointScope.sharedWith(fx.outsiderBu), [])
  })

  /**
   * Cuenta las consultas que salen por el servicio de base de datos durante
   * `fn`. Al terminar deja `db` exactamente como estaba: si el metodo era
   * propiedad propia se reasigna; si venia del prototipo se borra la propia
   * que puso el espia (reasignarla la dejaria como propia para siempre).
   */
  const countQueries = async <T>(fn: () => Promise<T>): Promise<{ result: T; queries: number }> => {
    let queries = 0
    const target = db as unknown as Record<string, (...args: unknown[]) => unknown>
    const originals = new Map<string, { own: boolean; value: (...args: unknown[]) => unknown }>()
    for (const name of ['from', 'rawQuery', 'query']) {
      const original = target[name]
      originals.set(name, { own: Object.prototype.hasOwnProperty.call(target, name), value: original })
      target[name] = (...args: unknown[]) => {
        queries += 1
        return original.apply(db, args)
      }
    }
    try {
      return { result: await fn(), queries }
    } finally {
      for (const [name, original] of originals) {
        if (original.own) target[name] = original.value
        else delete target[name]
      }
    }
  }

  test('el espia de consultas deja db como estaba', async ({ assert }) => {
    const target = db as unknown as Record<string, unknown>
    const names = ['from', 'rawQuery', 'query']
    const before = names.map((name) => ({
      own: Object.prototype.hasOwnProperty.call(target, name),
      value: target[name],
    }))
    await countQueries(async () => null)
    names.forEach((name, i) => {
      assert.equal(Object.prototype.hasOwnProperty.call(target, name), before[i].own, name)
      assert.strictEqual(target[name], before[i].value, name)
    })
  })

  test('el alcance del canal sale de una sola consulta: responsable e invitada viva', async ({
    assert,
  }) => {
    const { result, queries } = await countQueries(() =>
      AccessPointScope.channelScope(fx.accessPoint.accessPointId, fx.ownerBu)
    )
    assert.equal(queries, 1)
    assert.deepEqual(result, {
      participantBusinessUnitIds: [fx.ownerBu, fx.guestBu],
      everShared: true,
    })
  })

  test('la ex-invitada con vinculos sin baja sigue en el canal y el aparato cuenta como compartido', async ({
    assert,
  }) => {
    await fx.share.merge({ accessPointShareRevokedAt: DateTime.utc() }).save()
    try {
      const scope = await AccessPointScope.channelScope(fx.accessPoint.accessPointId, fx.ownerBu)
      assert.deepEqual(scope, {
        participantBusinessUnitIds: [fx.ownerBu, fx.guestBu],
        everShared: true,
      })
      assert.deepEqual(
        await AccessPointScope.channelParticipants(fx.accessPoint.accessPointId, fx.ownerBu),
        [fx.ownerBu, fx.guestBu]
      )
    } finally {
      await fx.share.merge({ accessPointShareRevokedAt: null }).save()
    }
  })

  test('un aparato sin invitaciones ni vinculos ajenos es solo de la responsable', async ({
    assert,
  }) => {
    const scope = await AccessPointScope.channelScope(0, fx.ownerBu)
    assert.deepEqual(scope, { participantBusinessUnitIds: [fx.ownerBu], everShared: false })
  })
})
