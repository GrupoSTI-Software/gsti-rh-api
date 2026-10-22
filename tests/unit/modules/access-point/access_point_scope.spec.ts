import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPointScopeRepositoryMysql from '#modules/access-point/sharing/access_point_scope.repository.mysql'
import {
  createSharedAccessPointFixture,
  type SharedFixture,
} from '#tests/helpers/shared_access_point_fixture'

test.group('AccessPointScope', (group) => {
  let fx: SharedFixture
  const scopeRepository = new AccessPointScopeRepositoryMysql()
  group.setup(async () => {
    fx = await createSharedAccessPointFixture()
    return () => fx.cleanup()
  })

  test('sin invitadas el scope es solo la responsable', async ({ assert }) => {
    await fx.share.merge({ accessPointShareRevokedAt: DateTime.utc() }).save()
    const scope = await scopeRepository.participants(fx.accessPoint.accessPointId, fx.ownerBu)
    assert.deepEqual(scope, [fx.ownerBu])
    await fx.share.merge({ accessPointShareRevokedAt: null }).save()
  })

  test('con invitada viva el scope la incluye despues de la responsable', async ({ assert }) => {
    const scope = await scopeRepository.participants(fx.accessPoint.accessPointId, fx.ownerBu)
    assert.deepEqual(scope, [fx.ownerBu, fx.guestBu])
  })

  test('isParticipant distingue invitada de ajena', async ({ assert }) => {
    assert.isTrue(await scopeRepository.isParticipant(fx.accessPoint.accessPointId, fx.guestBu))
    assert.isFalse(await scopeRepository.isParticipant(fx.accessPoint.accessPointId, fx.outsiderBu))
  })

  test('sharedWith devuelve los checadores ajenos compartidos', async ({ assert }) => {
    assert.deepEqual(await scopeRepository.sharedWith(fx.guestBu), [fx.accessPoint.accessPointId])
    assert.deepEqual(await scopeRepository.sharedWith(fx.outsiderBu), [])
  })

  test('sharedWithAny junta los compartidos de varias empresas sin duplicados', async ({
    assert,
  }) => {
    assert.deepEqual(
      await scopeRepository.sharedWithAny([fx.guestBu, fx.outsiderBu, fx.ownerBu, fx.guestBu]),
      [fx.accessPoint.accessPointId]
    )
    assert.deepEqual(await scopeRepository.sharedWithAny([fx.outsiderBu]), [])
    assert.deepEqual(await scopeRepository.sharedWithAny([]), [])
  })

  test('sharedWithAny deja fuera las invitaciones revocadas', async ({ assert }) => {
    await fx.share.merge({ accessPointShareRevokedAt: DateTime.utc() }).save()
    try {
      assert.deepEqual(await scopeRepository.sharedWithAny([fx.guestBu]), [])
    } finally {
      await fx.share.merge({ accessPointShareRevokedAt: null }).save()
    }
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
      scopeRepository.channelScope(fx.accessPoint.accessPointId, fx.ownerBu)
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
      const scope = await scopeRepository.channelScope(fx.accessPoint.accessPointId, fx.ownerBu)
      assert.deepEqual(scope, {
        participantBusinessUnitIds: [fx.ownerBu, fx.guestBu],
        everShared: true,
      })
      assert.deepEqual(
        await scopeRepository.channelParticipants(fx.accessPoint.accessPointId, fx.ownerBu),
        [fx.ownerBu, fx.guestBu]
      )
    } finally {
      await fx.share.merge({ accessPointShareRevokedAt: null }).save()
    }
  })

  test('un aparato sin invitaciones ni vinculos ajenos es solo de la responsable', async ({
    assert,
  }) => {
    const scope = await scopeRepository.channelScope(0, fx.ownerBu)
    assert.deepEqual(scope, { participantBusinessUnitIds: [fx.ownerBu], everShared: false })
  })

  test('visibleTo: la responsable lo ve como owner con el scope del aparato', async ({
    assert,
  }) => {
    const seen = await scopeRepository.visibleTo(fx.accessPoint.accessPointId, [fx.ownerBu])
    assert.equal(seen?.accessPoint.accessPointId, fx.accessPoint.accessPointId)
    assert.equal(seen?.role, 'owner')
    assert.deepEqual(seen?.deviceScope, [fx.ownerBu, fx.guestBu])
  })

  test('visibleTo: la invitada viva lo ve como guest; la ajena no lo ve', async ({ assert }) => {
    const guest = await scopeRepository.visibleTo(fx.accessPoint.accessPointId, [fx.guestBu])
    assert.equal(guest?.role, 'guest')
    assert.deepEqual(guest?.deviceScope, [fx.ownerBu, fx.guestBu])
    assert.isNull(await scopeRepository.visibleTo(fx.accessPoint.accessPointId, [fx.outsiderBu]))
  })

  test('visibleTo: falla cerrado con alcance vacio o checador inexistente', async ({ assert }) => {
    assert.isNull(await scopeRepository.visibleTo(fx.accessPoint.accessPointId, []))
    assert.isNull(await scopeRepository.visibleTo(0, [fx.ownerBu]))
  })

  test('visibleTo: la ex-invitada con personal sin baja solo entra con includeLingering', async ({
    assert,
  }) => {
    await fx.share.merge({ accessPointShareRevokedAt: DateTime.utc() }).save()
    try {
      const apId = fx.accessPoint.accessPointId
      assert.isNull(await scopeRepository.visibleTo(apId, [fx.guestBu]))
      const lingering = await scopeRepository.visibleTo(apId, [fx.guestBu], {
        includeLingering: true,
      })
      assert.equal(lingering?.role, 'guest')
      assert.deepEqual(lingering?.deviceScope, [fx.ownerBu, fx.guestBu])
    } finally {
      await fx.share.merge({ accessPointShareRevokedAt: null }).save()
    }
  })

  test('roleOf decide sobre un checador ya leido con la misma regla', async ({ assert }) => {
    const ap = { accessPointId: fx.accessPoint.accessPointId, businessUnitId: fx.ownerBu }
    const asOwner = await scopeRepository.roleOf(ap, [fx.ownerBu])
    const asGuest = await scopeRepository.roleOf(ap, [fx.guestBu])
    assert.equal(asOwner?.role, 'owner')
    assert.equal(asGuest?.role, 'guest')
    assert.isNull(await scopeRepository.roleOf(ap, [fx.outsiderBu]))
    assert.isNull(await scopeRepository.roleOf(ap, []))
  })
})
