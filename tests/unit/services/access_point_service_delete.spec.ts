import { test } from '@japa/runner'
import type { I18n } from '@adonisjs/i18n'
import type AccessPoint from '#models/access_point'
import { AdmsError } from '#exceptions/adms_error'
import AccessPointService from '#services/access_point_service'
import type {
  AccessPointScopePort,
  ChannelScope,
} from '#modules/access-point/sharing/access_point_scope.port'

const i18n = { formatMessage: (key: string) => key } as unknown as I18n

/** Puerto falso: solo responde el scope del canal que pide el borrado. */
function scopeWith(channel: ChannelScope): AccessPointScopePort {
  return {
    channelScope: async () => channel,
  } as unknown as AccessPointScopePort
}

/** Checador falso que anota si se borro. */
function fakeAccessPoint(): { accessPoint: AccessPoint; deleted: () => boolean } {
  let deleted = false
  const accessPoint = {
    accessPointId: 10,
    businessUnitId: 1,
    delete: async () => {
      deleted = true
    },
  } as unknown as AccessPoint
  return { accessPoint, deleted: () => deleted }
}

/**
 * La regla del 409 de borrado vive en el servicio (VLRH-P0065, 3.2): con
 * invitadas vivas o personal de una ex-invitada sin baja no se borra; un
 * aparato nunca compartido se borra aunque cargue vinculos de otra empresa.
 */
test.group('AccessPointService.delete', () => {
  test('con invitada viva responde 409 y no borra', async ({ assert }) => {
    const { accessPoint, deleted } = fakeAccessPoint()
    const service = new AccessPointService(
      i18n,
      scopeWith({ participantBusinessUnitIds: [1, 2], everShared: true })
    )
    let failure: unknown = null
    try {
      await service.delete(accessPoint)
    } catch (error) {
      failure = error
    }
    assert.instanceOf(failure, AdmsError)
    assert.equal((failure as AdmsError).httpStatus, 409)
    assert.equal((failure as AdmsError).key, 'checador-con-invitaciones-vivas')
    assert.isFalse(deleted())
  })

  test('nunca compartido con vinculo de otra empresa: se borra', async ({ assert }) => {
    const { accessPoint, deleted } = fakeAccessPoint()
    const service = new AccessPointService(
      i18n,
      scopeWith({ participantBusinessUnitIds: [1, 3], everShared: false })
    )
    await service.delete(accessPoint)
    assert.isTrue(deleted())
  })

  test('compartido alguna vez y sin nadie mas en el canal: se borra', async ({ assert }) => {
    const { accessPoint, deleted } = fakeAccessPoint()
    const service = new AccessPointService(
      i18n,
      scopeWith({ participantBusinessUnitIds: [1], everShared: true })
    )
    await service.delete(accessPoint)
    assert.isTrue(deleted())
  })
})
