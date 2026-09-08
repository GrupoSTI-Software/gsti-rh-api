import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AdmsQuarantinedDevice from '#models/adms_quarantined_device'
import BiometricPhotoPublication, {
  PHOTO_PUBLICATION_STATUS,
} from '#models/biometric_photo_publication'
import BusinessUnitUser from '#models/business_unit_user'
import DeviceCommand from '#models/device_command'
import Employee from '#models/employee'
import { TenantContext } from '#utils/tenant_context'
import RetentionService from '#modules/adms/retention/retention.service'
import { hashPhotoToken, generatePhotoToken } from '#modules/biometric-vault/photo/photo_token'

/**
 * Rebanada 12: nada se guarda para siempre y nada se borra sin plazo.
 *
 * Lo que hay que demostrar es lo que NO se borra: un comando vivo por viejo que
 * sea, y una publicacion que todavia sirve.
 */
const STAMP = `${Date.now()}`
const SERIAL = `TEST-ADMS-RT-${STAMP}`

test.group('ADMS retencion (rebanada 12)', (group) => {
  let accessPoint: AccessPoint
  let employee: Employee
  let businessUnitId: number
  const publicationIds: number[] = []
  let quarantineId: number

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      const pivots = await BusinessUnitUser.query().orderBy('businessUnitId', 'asc')
      let elegido: { unitId: number; employee: Employee } | null = null
      for (const candidate of pivots) {
        const someone = await Employee.query()
          .whereNull('employee_deleted_at')
          .where('business_unit_id', candidate.businessUnitId)
          .first()
        if (someone) {
          elegido = { unitId: candidate.businessUnitId, employee: someone }
          break
        }
      }
      if (!elegido) throw new Error('Se requiere una empresa con usuario y colaborador.')
      businessUnitId = elegido.unitId
      employee = elegido.employee

      const ap = new AccessPoint()
      ap.accessPointName = `Checador de retencion ${STAMP}`
      ap.businessUnitId = businessUnitId
      ap.accessPointActive = 1
      ap.accessPointSerialNumber = SERIAL
      ap.accessPointStatus = 0
      await ap.save()
      accessPoint = ap
    }, 'fixture de retencion')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (publicationIds.length > 0) {
        await db
          .from('biometric_photo_publications')
          .whereIn('biometric_photo_publication_id', publicationIds)
          .delete()
      }
      await db
        .from('adms_quarantined_devices')
        .where('adms_quarantined_device_id', quarantineId)
        .delete()
      await db.from('device_commands').where('access_point_id', accessPoint.accessPointId).delete()
      await db.from('access_points').where('access_point_id', accessPoint.accessPointId).delete()
    }, 'limpieza de retencion')
  })

  async function makeCommand(status: string, createdAt: DateTime): Promise<DeviceCommand> {
    return TenantContext.runUnscoped(async () => {
      const command = new DeviceCommand()
      command.deviceCommandWireId = Number(`${Date.now()}${Math.trunc(performance.now())}`.slice(0, 15))
      command.accessPointId = accessPoint.accessPointId
      command.businessUnitId = businessUnitId
      command.deviceCommandKind = 'check'
      command.deviceCommandPayload = 'CHECK'
      command.deviceCommandStatus = status as DeviceCommand['deviceCommandStatus']
      command.deviceCommandPriority = 9
      command.deviceCommandAttempts = 0
      command.deviceCommandMaxAttempts = 3
      await command.save()
      // La fecha de alta es automatica: se reescribe para simular antiguedad.
      await db
        .from('device_commands')
        .where('device_command_id', command.deviceCommandId)
        .update({ device_command_created_at: createdAt.toFormat('yyyy-MM-dd HH:mm:ss') })
      return command
    }, 'comando de prueba')
  }

  test('un comando cerrado y viejo se borra', async ({ assert }) => {
    const viejo = await makeCommand('executed', DateTime.utc().minus({ days: 400 }))
    const result = await new RetentionService().purgeCommands()

    assert.isAtLeast(result.deleted, 1)
    const sigue = await TenantContext.runUnscoped(
      () => DeviceCommand.query().where('device_command_id', viejo.deviceCommandId).first(),
      'lectura tras purgar'
    )
    assert.isNull(sigue)
  })

  /**
   * Un `pending` de hace un año es un equipo que lleva un año sin recoger su
   * orden. Borrarlo esconde el problema en vez de resolverlo.
   */
  test('un comando VIVO no se borra por viejo que sea', async ({ assert }) => {
    const pendiente = await makeCommand('pending', DateTime.utc().minus({ days: 400 }))
    await new RetentionService().purgeCommands()

    const sigue = await TenantContext.runUnscoped(
      () => DeviceCommand.query().where('device_command_id', pendiente.deviceCommandId).first(),
      'lectura tras purgar'
    )
    assert.isNotNull(sigue)
  })

  test('una publicacion vencida se cierra antes de purgarse', async ({ assert }) => {
    const token = generatePhotoToken()
    const publication = await TenantContext.runUnscoped(async () => {
      const row = new BiometricPhotoPublication()
      row.businessUnitId = businessUnitId
      row.employeeId = employee.employeeId
      row.accessPointId = accessPoint.accessPointId
      row.biometricPhotoPublicationTokenHash = hashPhotoToken(token)
      row.biometricPhotoPublicationPin = '990011'
      row.biometricPhotoPublicationDerivativeVersion = 1
      row.biometricPhotoPublicationStatus = PHOTO_PUBLICATION_STATUS.PUBLISHED
      row.biometricPhotoPublicationExpiresAt = DateTime.utc().minus({ days: 2 })
      row.biometricPhotoPublicationDownloadCount = 0
      await row.save()
      publicationIds.push(row.biometricPhotoPublicationId)
      return row
    }, 'publicacion vencida')

    await new RetentionService().expirePhotoPublications()

    const releida = await TenantContext.runUnscoped(
      () =>
        BiometricPhotoPublication.query()
          .where('biometric_photo_publication_id', publication.biometricPhotoPublicationId)
          .firstOrFail(),
      'relectura'
    )
    // Mientras dijera `published`, cualquier lectura casual la leeria como viva.
    assert.equal(releida.biometricPhotoPublicationStatus, 'expired')
  })

  test('una publicacion que todavia sirve no se toca', async ({ assert }) => {
    const token = generatePhotoToken()
    const viva = await TenantContext.runUnscoped(async () => {
      const row = new BiometricPhotoPublication()
      row.businessUnitId = businessUnitId
      row.employeeId = employee.employeeId
      row.accessPointId = accessPoint.accessPointId
      row.biometricPhotoPublicationTokenHash = hashPhotoToken(token)
      row.biometricPhotoPublicationPin = '990022'
      row.biometricPhotoPublicationDerivativeVersion = 1
      row.biometricPhotoPublicationStatus = PHOTO_PUBLICATION_STATUS.PUBLISHED
      row.biometricPhotoPublicationExpiresAt = DateTime.utc().plus({ hours: 3 })
      row.biometricPhotoPublicationDownloadCount = 0
      await row.save()
      publicationIds.push(row.biometricPhotoPublicationId)
      return row
    }, 'publicacion viva')

    await new RetentionService().expirePhotoPublications()
    await new RetentionService().purgePhotoPublications()

    const releida = await TenantContext.runUnscoped(
      () =>
        BiometricPhotoPublication.query()
          .where('biometric_photo_publication_id', viva.biometricPhotoPublicationId)
          .first(),
      'relectura'
    )
    assert.isNotNull(releida)
    assert.equal(releida?.biometricPhotoPublicationStatus, 'published')
  })

  test('una cuarentena reclamada no se purga: es historia', async ({ assert }) => {
    const reclamada = await TenantContext.runUnscoped(async () => {
      const row = new AdmsQuarantinedDevice()
      row.admsQuarantinedDeviceSerial = `TEST-ADMS-RTQ-${STAMP}`
      row.admsQuarantinedDeviceFirstSeenAt = DateTime.utc().minus({ days: 200 })
      row.admsQuarantinedDeviceLastSeenAt = DateTime.utc().minus({ days: 200 })
      row.admsQuarantinedDeviceLastIp = '10.0.0.1'
      row.admsQuarantinedDeviceHitCount = 1
      row.admsQuarantinedDeviceStatus = 'claimed'
      row.admsQuarantinedDeviceFailedClaims = 0
      await row.save()
      quarantineId = row.admsQuarantinedDeviceId
      return row
    }, 'cuarentena reclamada')

    await new RetentionService().purgeQuarantine()

    const sigue = await TenantContext.runUnscoped(
      () =>
        AdmsQuarantinedDevice.query()
          .where('adms_quarantined_device_id', reclamada.admsQuarantinedDeviceId)
          .first(),
      'relectura'
    )
    assert.isNotNull(sigue)
  })
})
