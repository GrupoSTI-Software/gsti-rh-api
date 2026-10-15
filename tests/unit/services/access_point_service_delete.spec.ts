import { test } from '@japa/runner'
import type { I18n } from '@adonisjs/i18n'
import type AccessPoint from '#models/access_point'
import { AdmsError } from '#exceptions/adms_error'
import AccessPointService from '#services/access_point_service'
import type {
  AccessPointScopePort,
  ChannelScope,
} from '#modules/access-point/sharing/access_point_scope.port'
import type { EmployeeSyncRepository } from '#modules/access-point/employee-sync/employee_sync.repository'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

const i18n = { formatMessage: (key: string) => key } as unknown as I18n

/** Orden de lo que pasa en un borrado: candado, lectura del canal, borrado. */
let steps: string[] = []

/** Transaccion falsa del candado del aparato. */
const deviceTrx = { fake: 'trx-del-aparato' } as unknown as TransactionClientContract

/** Puerto falso: solo responde el scope del canal que pide el borrado. */
function scopeWith(channel: ChannelScope): AccessPointScopePort {
  return {
    channelScope: async () => {
      steps.push('channel-scope')
      return channel
    },
  } as unknown as AccessPointScopePort
}

/** Candado falso del aparato: anota que se tomo y corre dentro de su transaccion. */
const deviceLock: Pick<EmployeeSyncRepository, 'inDeviceTransaction'> = {
  async inDeviceTransaction(accessPointId, fn) {
    steps.push(`lock:${accessPointId}`)
    return fn(deviceTrx)
  },
}

/** Checador falso que anota si se borro y con que transaccion. */
function fakeAccessPoint(): { accessPoint: AccessPoint; deleted: () => boolean } {
  let deleted = false
  let trx: unknown = null
  const accessPoint = {
    accessPointId: 10,
    businessUnitId: 1,
    useTransaction(value: unknown) {
      trx = value
      return accessPoint
    },
    delete: async () => {
      steps.push(trx === deviceTrx ? 'delete-en-trx' : 'delete-fuera')
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
test.group('AccessPointService.delete', (group) => {
  group.each.setup(() => {
    steps = []
  })

  test('con invitada viva responde 409 y no borra', async ({ assert }) => {
    const { accessPoint, deleted } = fakeAccessPoint()
    const service = new AccessPointService(
      i18n,
      scopeWith({ participantBusinessUnitIds: [1, 2], everShared: true }),
      deviceLock
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
      scopeWith({ participantBusinessUnitIds: [1, 3], everShared: false }),
      deviceLock
    )
    await service.delete(accessPoint)
    assert.isTrue(deleted())
  })

  test('compartido alguna vez y sin nadie mas en el canal: se borra', async ({ assert }) => {
    const { accessPoint, deleted } = fakeAccessPoint()
    const service = new AccessPointService(
      i18n,
      scopeWith({ participantBusinessUnitIds: [1], everShared: true }),
      deviceLock
    )
    await service.delete(accessPoint)
    assert.isTrue(deleted())
  })

  test('decide y borra con el aparato bloqueado, en la misma transaccion (A2-15)', async ({
    assert,
  }) => {
    const { accessPoint } = fakeAccessPoint()
    const service = new AccessPointService(
      i18n,
      scopeWith({ participantBusinessUnitIds: [1], everShared: true }),
      deviceLock
    )
    await service.delete(accessPoint)
    assert.deepEqual(steps, ['lock:10', 'channel-scope', 'delete-en-trx'])
  })

  test('el 409 tambien se decide con el aparato bloqueado', async ({ assert }) => {
    const { accessPoint } = fakeAccessPoint()
    const service = new AccessPointService(
      i18n,
      scopeWith({ participantBusinessUnitIds: [1, 2], everShared: true }),
      deviceLock
    )
    await assert.rejects(() => service.delete(accessPoint))
    assert.deepEqual(steps, ['lock:10', 'channel-scope'])
  })
})
