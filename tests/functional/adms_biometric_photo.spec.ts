import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import env from '#start/env'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointEmployee from '#models/access_point_employee'
import AccessPointProfile from '#models/access_point_profile'
import BiometricPhotoPublication, {
  PHOTO_PUBLICATION_STATUS,
} from '#models/biometric_photo_publication'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import DeviceCommand from '#models/device_command'
import Employee from '#models/employee'
import { TenantContext } from '#utils/tenant_context'
import { generatePhotoToken, hashPhotoToken } from '#modules/biometric-vault/photo/photo_token'

/**
 * Rebanada 9: la puerta de la foto.
 *
 * Esta ruta es la unica del sistema que entrega la cara de una persona sin
 * sesion detras. Lo que se prueba aqui es que TODO lo que no sea un token vivo
 * responde 404, y que nada en la respuesta distingue un caso de otro.
 */
const BASE = `http://${env.get('HOST')}:${env.get('PORT')}`
const STAMP = `${Date.now()}`
const SERIAL = `TEST-ADMS-F-${STAMP}`
const PIN = '556677'

async function get(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`, { method: 'GET' })
}

test.group('ADMS foto por token (rebanada 9)', (group) => {
  let accessPoint: AccessPoint
  let employee: Employee
  let businessUnitId: number
  const publicationIds: number[] = []

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      const pivots = await BusinessUnitUser.query().orderBy('businessUnitId', 'asc')
      let elegido: { unitId: number; employee: Employee } | null = null
      for (const candidate of pivots) {
        const someone = await Employee.query()
          .whereNull('employee_deleted_at')
          .where('business_unit_id', candidate.businessUnitId)
          .orderBy('employee_id', 'asc')
          .first()
        if (someone) {
          elegido = { unitId: candidate.businessUnitId, employee: someone }
          break
        }
      }
      if (!elegido) throw new Error('Se requiere una empresa con usuario y colaborador.')

      businessUnitId = elegido.unitId
      employee = elegido.employee
      await BusinessUnit.query().where('businessUnitId', businessUnitId).firstOrFail()

      const ap = new AccessPoint()
      ap.accessPointName = `Checador de foto ${STAMP}`
      ap.businessUnitId = businessUnitId
      ap.accessPointActive = 1
      ap.accessPointSerialNumber = SERIAL
      ap.accessPointStatus = 0
      await ap.save()
      accessPoint = ap

      const profile = new AccessPointProfile()
      profile.accessPointId = ap.accessPointId
      profile.businessUnitId = businessUnitId
      profile.accessPointProfileDialect = 'ta'
      profile.accessPointProfileLayoutKnown = 1
      profile.accessPointProfilePlatform = 'ZAM180_TFT'
      await profile.save()

      const pivot = new AccessPointEmployee()
      pivot.accessPointId = ap.accessPointId
      pivot.businessUnitId = businessUnitId
      pivot.employeeId = employee.employeeId
      pivot.accessPointEmployeePin = PIN
      pivot.accessPointEmployeeSyncStatus = 'confirmed'
      await pivot.save()
    }, 'fixture de la foto')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (publicationIds.length > 0) {
        await db
          .from('biometric_photo_publications')
          .whereIn('biometric_photo_publication_id', publicationIds)
          .delete()
      }
      await DeviceCommand.query().where('access_point_id', accessPoint.accessPointId).delete()
      await db
        .from('access_point_employees')
        .where('access_point_id', accessPoint.accessPointId)
        .delete()
      await db.from('adms_incidents').where('access_point_id', accessPoint.accessPointId).delete()
      await db
        .from('access_point_stamps')
        .where('access_point_id', accessPoint.accessPointId)
        .delete()
      await AccessPointProfile.query().where('access_point_id', accessPoint.accessPointId).delete()
      await db.from('adms_raw_messages').where('adms_raw_message_serial', SERIAL).delete()
      await db.from('access_points').where('access_point_id', accessPoint.accessPointId).delete()
    }, 'limpieza de la foto')
  })

  async function publish(overrides: Partial<BiometricPhotoPublication> = {}): Promise<string> {
    const token = generatePhotoToken()
    await TenantContext.runUnscoped(async () => {
      const row = new BiometricPhotoPublication()
      row.businessUnitId = businessUnitId
      row.employeeId = employee.employeeId
      row.accessPointId = accessPoint.accessPointId
      row.biometricPhotoPublicationTokenHash = hashPhotoToken(token)
      row.biometricPhotoPublicationPin = PIN
      row.biometricPhotoPublicationDerivativeVersion = 1
      row.biometricPhotoPublicationStatus = PHOTO_PUBLICATION_STATUS.PUBLISHED
      row.biometricPhotoPublicationExpiresAt = DateTime.utc().plus({ hours: 24 })
      row.biometricPhotoPublicationDownloadCount = 0
      Object.assign(row, overrides)
      await row.save()
      publicationIds.push(row.biometricPhotoPublicationId)
    }, 'publicacion de prueba')
    return token
  }

  test('un token con forma invalida responde 404 en texto, no JSON', async ({ assert }) => {
    const response = await get('/iclock/doc/biophoto/1/9998.jpg')
    assert.equal(response.status, 404)
    assert.include(response.headers.get('content-type') ?? '', 'text/plain')
    const body = await response.text()
    assert.equal(body.trim(), 'NOT FOUND')
  })

  test('un token bien formado pero inexistente responde exactamente igual', async ({ assert }) => {
    const response = await get(`/iclock/doc/biophoto/${generatePhotoToken()}/9998.jpg`)
    assert.equal(response.status, 404)
    const body = await response.text()
    assert.equal(body.trim(), 'NOT FOUND')
  })

  test('una publicacion vencida responde 404', async ({ assert }) => {
    const token = await publish({
      biometricPhotoPublicationExpiresAt: DateTime.utc().minus({ minutes: 1 }),
    })
    const response = await get(`/iclock/doc/biophoto/${token}/${PIN}.jpg`)
    assert.equal(response.status, 404)
  })

  test('una publicacion retirada responde 404 aunque le quede plazo', async ({ assert }) => {
    const token = await publish({
      biometricPhotoPublicationStatus: PHOTO_PUBLICATION_STATUS.WITHDRAWN,
    })
    const response = await get(`/iclock/doc/biophoto/${token}/${PIN}.jpg`)
    assert.equal(response.status, 404)
  })

  /**
   * El interruptor de uso en dispositivos se comprueba en la descarga, no solo
   * al publicar: entre una cosa y la otra alguien pudo apagarlo.
   */
  test('con publicacion viva pero sin foto autorizada, tampoco sale nada', async ({ assert }) => {
    const token = await publish()
    const response = await get(`/iclock/doc/biophoto/${token}/${PIN}.jpg`)
    assert.equal(response.status, 404)

    const publication = await TenantContext.runUnscoped(
      () =>
        BiometricPhotoPublication.query()
          .where('biometric_photo_publication_token_hash', hashPhotoToken(token))
          .firstOrFail(),
      'lectura de la publicacion'
    )
    // Y no se cuenta como descargada: nunca salio nada.
    assert.equal(publication.biometricPhotoPublicationDownloadCount, 0)
  })

  /**
   * Un token REAL que no se pudo servir es un fallo nuestro y el operador tiene
   * que verlo: el colaborador se queda sin rostro en ese equipo y el comando no
   * se cumple solo. Un token inventado es ruido de internet.
   */
  test('un token real que falla levanta incidente; uno inventado no', async ({ assert }) => {
    const antes = await TenantContext.runUnscoped(
      () =>
        db
          .from('adms_incidents')
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_incident_kind', 'photo_download_failed')
          .count('* as total'),
      'incidentes previos'
    )

    await get(`/iclock/doc/biophoto/${generatePhotoToken()}/${PIN}.jpg`)
    const traRuido = await TenantContext.runUnscoped(
      () =>
        db
          .from('adms_incidents')
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_incident_kind', 'photo_download_failed')
          .count('* as total'),
      'incidentes tras token inventado'
    )
    assert.equal(traRuido[0].total, antes[0].total)

    const token = await publish()
    await get(`/iclock/doc/biophoto/${token}/${PIN}.jpg`)
    const traReal = await TenantContext.runUnscoped(
      () =>
        db
          .from('adms_incidents')
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_incident_kind', 'photo_download_failed')
          .count('* as total'),
      'incidentes tras token real'
    )
    assert.isAbove(Number(traReal[0].total), Number(antes[0].total))
  })

  test('el canal sigue respondiendo el resto de rutas con normalidad', async ({ assert }) => {
    const response = await get(`/iclock/ping?SN=${SERIAL}`)
    assert.equal(response.status, 200)
    const body = await response.text()
    assert.equal(body.trim(), 'OK')
    assert.isNotOk(response.headers.get('set-cookie'))
  })
})
