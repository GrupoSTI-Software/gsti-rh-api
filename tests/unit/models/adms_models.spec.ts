import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import AdmsRawMessage from '#models/adms_raw_message'
import AdmsQuarantinedDevice from '#models/adms_quarantined_device'
import AccessPointStamp from '#models/access_point_stamp'
import db from '@adonisjs/lucid/services/db'
import { TenantContext } from '#utils/tenant_context'

/**
 * Verifica que las tablas nuevas existen, que el cuerpo del crudo viaja cifrado
 * en la base y descifrado en el modelo, y que `admsRawMessageBody` nunca se
 * serializa. Filas propias con serie `TEST-ADMS-MODEL-<stamp>`, limpiadas al final.
 */
test.group('ADMS models', (group) => {
  const serial = `TEST-ADMS-MODEL-${Date.now()}`
  const rawIds: number[] = []

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (rawIds.length > 0) {
        await AdmsRawMessage.query().whereIn('adms_raw_message_id', rawIds).delete()
      }
      await AdmsQuarantinedDevice.query()
        .where('adms_quarantined_device_serial', serial)
        .delete()
    }, 'limpieza de pruebas de modelos ADMS')
  })

  test('el cuerpo del crudo se cifra en reposo y no se serializa', async ({ assert }) => {
    const body = '9999\t2026-08-12 08:53:23\t0\t1\t0\t0\t0\t255\t0\t0\t\n'
    const row = await TenantContext.runUnscoped(async () => {
      const message = new AdmsRawMessage()
      message.accessPointId = null
      message.businessUnitId = null
      message.admsRawMessageSerial = serial
      message.admsRawMessageRemoteIp = '127.0.0.1'
      message.admsRawMessageMethod = 'POST'
      message.admsRawMessagePath = '/iclock/cdata'
      message.admsRawMessageQuery = `SN=${serial}&table=ATTLOG&Stamp=9999`
      message.admsRawMessageTable = 'ATTLOG'
      message.admsRawMessageStamp = '9999'
      message.admsRawMessageContentType = 'text/plain'
      message.admsRawMessageBody = body
      message.admsRawMessageBodyBytes = Buffer.byteLength(body)
      message.admsRawMessageLineCount = 1
      message.admsRawMessageStatus = 'received'
      message.admsRawMessageReceivedAt = DateTime.utc()
      await message.save()
      return message
    }, 'alta de crudo de prueba')
    rawIds.push(row.admsRawMessageId)

    const stored = await db
      .from('adms_raw_messages')
      .where('adms_raw_message_id', row.admsRawMessageId)
      .first()
    assert.isString(stored.adms_raw_message_body)
    assert.notEqual(stored.adms_raw_message_body, body)

    const reloaded = await TenantContext.runUnscoped(
      () => AdmsRawMessage.findOrFail(row.admsRawMessageId),
      'lectura de crudo de prueba'
    )
    assert.equal(reloaded.admsRawMessageBody, body)
    assert.notProperty(reloaded.serialize(), 'admsRawMessageBody')
  })

  test('cuarentena y stamps se crean con sus valores por omision', async ({ assert }) => {
    const quarantined = new AdmsQuarantinedDevice()
    quarantined.admsQuarantinedDeviceSerial = serial
    quarantined.admsQuarantinedDeviceFirstSeenAt = DateTime.utc()
    quarantined.admsQuarantinedDeviceLastSeenAt = DateTime.utc()
    quarantined.admsQuarantinedDeviceLastIp = '127.0.0.1'
    await quarantined.save()
    const reloaded = await AdmsQuarantinedDevice.findOrFail(quarantined.admsQuarantinedDeviceId)
    assert.equal(reloaded.admsQuarantinedDeviceStatus, 'pending')
    assert.equal(reloaded.admsQuarantinedDeviceHitCount, 0)
    assert.equal(reloaded.admsQuarantinedDeviceFailedClaims, 0)

    assert.equal(AccessPointStamp.table, 'access_point_stamps')
  })
})
