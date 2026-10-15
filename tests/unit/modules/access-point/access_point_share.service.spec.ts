import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import AccessPointShareService from '#modules/access-point/sharing/access_point_share.service'
import type {
  AccessPointShareRepository,
  ShareAssignment,
  ShareRecord,
} from '#modules/access-point/sharing/access_point_share.repository'

const ACCESS_POINT_ID = 31
const OWNER = 1
const GUEST = 2
const SHARE_ID = 7

interface Options {
  assignment?: ShareAssignment
  groupActive?: boolean
}

function recordOf(): ShareRecord {
  return {
    accessPointShareId: SHARE_ID,
    accessPointId: ACCESS_POINT_ID,
    businessUnitId: GUEST,
    businessUnitPublicId: 'guest-public',
    businessUnitName: 'Invitada',
    grantedAt: DateTime.utc(),
    revokedAt: null,
    revokeReason: null,
  }
}

/** Repositorio falso que anota cada llamada en orden. */
function makeService(options: Options = {}) {
  const calls: string[] = []
  const assignment: ShareAssignment = options.assignment ?? {
    platformDeviceAssignmentId: 50,
    ownerBusinessUnitId: OWNER,
    accessPointId: ACCESS_POINT_ID,
    open: true,
  }
  const repository: AccessPointShareRepository = {
    async findAssignment() {
      calls.push('findAssignment')
      return assignment
    },
    async lockAccessPoint() {
      calls.push('lockAccessPoint')
    },
    async findBusinessUnitByPublicId() {
      return { businessUnitId: GUEST, businessUnitPublicId: 'guest-public', businessUnitName: 'Invitada' }
    },
    async findBusinessUnits() {
      return []
    },
    async liveGroupIdsOf() {
      return new Map([
        [OWNER, 9],
        [GUEST, 9],
      ])
    },
    async listGroupMembers() {
      return [
        { businessUnitId: OWNER, businessUnitPublicId: 'owner-public', businessUnitName: 'Responsable' },
        { businessUnitId: 3, businessUnitPublicId: 'other-public', businessUnitName: 'Otra' },
      ]
    },
    async isGroupActive() {
      return options.groupActive ?? true
    },
    async listByAccessPoint() {
      return []
    },
    async findById() {
      return recordOf()
    },
    async hasLive() {
      return false
    },
    async insert() {
      calls.push('insert')
      return SHARE_ID
    },
    async lockLiveByAccessPoint() {
      calls.push('lockLiveByAccessPoint')
      return [
        {
          accessPointShareId: SHARE_ID,
          accessPointId: ACCESS_POINT_ID,
          ownerBusinessUnitId: OWNER,
          guestBusinessUnitId: GUEST,
        },
      ]
    },
    async lockLiveById() {
      calls.push('lockLiveById')
      return {
        accessPointShareId: SHARE_ID,
        accessPointId: ACCESS_POINT_ID,
        ownerBusinessUnitId: OWNER,
        guestBusinessUnitId: GUEST,
      }
    },
    async markRevoked() {
      calls.push('markRevoked')
    },
    async listLiveGuestPivots() {
      calls.push('listLiveGuestPivots')
      return []
    },
    async listLiveInvolving() {
      return []
    },
  }
  return { service: new AccessPointShareService(repository), calls }
}

test.group('AccessPointShareService: candados', () => {
  test('revocar bloquea el aparato antes que la invitacion y que sus vinculos', async ({
    assert,
  }) => {
    const { service, calls } = makeService()
    await service.revoke({ platformDeviceAssignmentId: 50, accessPointShareId: SHARE_ID, userId: 4 })
    const locked = calls.indexOf('lockAccessPoint')
    assert.isAtLeast(locked, 0)
    assert.isBelow(locked, calls.indexOf('lockLiveById'))
    assert.isBelow(locked, calls.indexOf('listLiveGuestPivots'))
  })

  test('desasignar bloquea el aparato antes que las invitaciones y que sus vinculos', async ({
    assert,
  }) => {
    const { service, calls } = makeService()
    const trx = {} as TransactionClientContract
    await service.revokeAllForAccessPoint(ACCESS_POINT_ID, null, trx)
    const locked = calls.indexOf('lockAccessPoint')
    assert.isAtLeast(locked, 0)
    assert.isBelow(locked, calls.indexOf('lockLiveByAccessPoint'))
    assert.isBelow(locked, calls.indexOf('listLiveGuestPivots'))
  })
})
