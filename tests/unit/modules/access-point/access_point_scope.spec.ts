import { test } from '@japa/runner'
import { DateTime } from 'luxon'
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
})
