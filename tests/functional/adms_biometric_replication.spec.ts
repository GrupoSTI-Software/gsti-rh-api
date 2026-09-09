import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointEmployee from '#models/access_point_employee'
import AccessPointProfile from '#models/access_point_profile'
import BiometricTemplate from '#models/biometric_template'
import BusinessUnitUser from '#models/business_unit_user'
import DeviceCommand from '#models/device_command'
import Employee from '#models/employee'
import { TenantContext } from '#utils/tenant_context'
import ReplicationService from '#modules/biometric-vault/replication/replication.service'
import { BIO_TYPE } from '#modules/biometric-vault/biometric_vault.constants'

/**
 * Rebanada 10. El caso real: alguien ya puso el dedo en la entrada y no tiene
 * por que volver a ponerlo en el comedor.
 *
 * Lo que hay que demostrar: que un template solo sale hacia un equipo cuya
 * version de algoritmo coincide -- la bateria midio `Return=-30` empujando un
 * v10 a un equipo v13 -- y que el blob viaja sin tocarse.
 */
const STAMP = `${Date.now()}`
const SOURCE_SERIAL = `TEST-ADMS-R1-${STAMP}`
const COMPAT_SERIAL = `TEST-ADMS-R2-${STAMP}`
const OTHER_SERIAL = `TEST-ADMS-R3-${STAMP}`
const PIN_SOURCE = '440011'
const PIN_COMPAT = '440022'
const PIN_OTHER = '440033'
const TEMPLATE = 'Q'.repeat(1200)

test.group('ADMS replicacion de biometricos (rebanada 10)', (group) => {
  let source: AccessPoint
  let compatible: AccessPoint
  let incompatible: AccessPoint
  let employee: Employee
  let businessUnitId: number
  let templateId: number
  let userId: number

  async function makeDevice(serial: string, pin: string, fpVersion: string): Promise<AccessPoint> {
    const ap = new AccessPoint()
    ap.accessPointName = `Checador ${serial}`
    ap.businessUnitId = businessUnitId
    ap.accessPointActive = 1
    ap.accessPointSerialNumber = serial
    ap.accessPointStatus = 0
    await ap.save()

    const profile = new AccessPointProfile()
    profile.accessPointId = ap.accessPointId
    profile.businessUnitId = businessUnitId
    profile.accessPointProfileDialect = 'ta'
    profile.accessPointProfileLayoutKnown = 1
    profile.accessPointProfilePlatform = 'ZAM180_TFT'
    profile.accessPointProfileFpVersion = fpVersion
    await profile.save()

    const pivot = new AccessPointEmployee()
    pivot.accessPointId = ap.accessPointId
    pivot.businessUnitId = businessUnitId
    pivot.employeeId = employee.employeeId
    pivot.accessPointEmployeePin = pin
    pivot.accessPointEmployeeSyncStatus = 'confirmed'
    await pivot.save()

    return ap
  }

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      const pivots = await BusinessUnitUser.query().orderBy('businessUnitId', 'asc')
      let elegido: { unitId: number; userId: number; employee: Employee } | null = null
      for (const candidate of pivots) {
        const someone = await Employee.query()
          .whereNull('employee_deleted_at')
          .where('business_unit_id', candidate.businessUnitId)
          .orderBy('employee_id', 'asc')
          .first()
        if (someone) {
          elegido = { unitId: candidate.businessUnitId, userId: candidate.userId, employee: someone }
          break
        }
      }
      if (!elegido) throw new Error('Se requiere una empresa con usuario y colaborador.')

      businessUnitId = elegido.unitId
      employee = elegido.employee
      userId = elegido.userId

      source = await makeDevice(SOURCE_SERIAL, PIN_SOURCE, '13')
      compatible = await makeDevice(COMPAT_SERIAL, PIN_COMPAT, '13.2')
      incompatible = await makeDevice(OTHER_SERIAL, PIN_OTHER, '10')

      const template = new BiometricTemplate()
      template.employeeId = employee.employeeId
      template.businessUnitId = businessUnitId
      template.biometricTemplateBioType = BIO_TYPE.FINGERPRINT
      template.biometricTemplateBioNo = 3
      template.biometricTemplateBioIndex = 0
      template.biometricTemplateBioFormat = 0
      template.biometricTemplateMajorVer = '13'
      template.biometricTemplateMinorVer = '2'
      template.biometricTemplateValid = 1
      // Dedo de coaccion: el comando destino tiene que repetirlo tal cual.
      template.biometricTemplateDuress = 1
      template.biometricTemplateTemplate = TEMPLATE
      template.biometricTemplateSize = TEMPLATE.length
      template.sourceAccessPointId = source.accessPointId
      template.biometricTemplateCapturedAt = DateTime.utc()
      await template.save()
      templateId = template.biometricTemplateId
    }, 'fixture de la replicacion')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      const ids = [source.accessPointId, compatible.accessPointId, incompatible.accessPointId]
      await db.from('pii_access_logs').where('pii_access_log_record_id', templateId).delete()
      await db.from('biometric_templates').where('biometric_template_id', templateId).delete()
      await DeviceCommand.query().whereIn('access_point_id', ids).delete()
      await db.from('access_point_employees').whereIn('access_point_id', ids).delete()
      await db.from('adms_incidents').whereIn('access_point_id', ids).delete()
      await AccessPointProfile.query().whereIn('access_point_id', ids).delete()
      await db.from('access_points').whereIn('access_point_id', ids).delete()
    }, 'limpieza de la replicacion')
  })

  async function replicate(dryRun: boolean) {
    return TenantContext.run([businessUnitId], () =>
      new ReplicationService().replicate({
        employeeId: employee.employeeId,
        businessUnitId,
        sourceAccessPointId: source.accessPointId,
        targetAccessPointIds: [compatible.accessPointId, incompatible.accessPointId],
        modalities: ['fingerprint'],
        actor: {
          userId,
          ip: '10.0.0.9',
          userAgent: 'japa',
          requestId: `test-${STAMP}`,
        },
        dryRun,
      })
    )
  }

  test('la vista previa no encola nada y ya dice que va a pasar', async ({ assert }) => {
    const result = await replicate(true)

    const destinoCompatible = result.targets.find(
      (target) => target.accessPointId === compatible.accessPointId
    )
    const destinoIncompatible = result.targets.find(
      (target) => target.accessPointId === incompatible.accessPointId
    )
    assert.equal(destinoCompatible?.items[0].status, 'queued')
    assert.equal(destinoIncompatible?.items[0].status, 'skipped')
    assert.equal(destinoIncompatible?.items[0].reason, 'not_replicable_version')

    const commands = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .whereIn('access_point_id', [compatible.accessPointId, incompatible.accessPointId])
          .count('* as total'),
      'conteo tras la vista previa'
    )
    assert.equal(commands[0].$extras.total, 0)
  })

  test('el template solo sale hacia el equipo con la misma version mayor', async ({ assert }) => {
    await replicate(false)

    const commands = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .whereIn('access_point_id', [compatible.accessPointId, incompatible.accessPointId])
          .where('device_command_kind', 'biodata_write'),
      'comandos encolados'
    )

    assert.lengthOf(commands, 1)
    assert.equal(commands[0].accessPointId, compatible.accessPointId)
    // 13 y 13.2 son la misma version mayor; 10 no.
    assert.equal(commands[0].deviceCommandPin, PIN_COMPAT)
  })

  test('el blob viaja verbatim y con el PIN del destino en la cabecera', async ({ assert }) => {
    const command = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', compatible.accessPointId)
          .where('device_command_kind', 'biodata_write')
          .firstOrFail(),
      'comando de copia'
    )

    const payload = command.deviceCommandPayload ?? ''
    assert.include(payload, `Pin=${PIN_COMPAT}`)
    assert.include(payload, `Tmp=${TEMPLATE}`)
    assert.include(payload, 'MajorVer=13')
    assert.include(payload, 'MinorVer=2')
    // El dedo de coaccion se repite del registro: inventarlo cambiaria lo que
    // significa ese dedo para quien lo usa.
    assert.include(payload, 'Duress=1')
    assert.equal(command.biometricTemplateId, templateId)
  })

  /**
   * Sacar un blob de la boveda deja asiento. Sin esto, un biometrico se podria
   * leer sin que conste quien lo leyo.
   */
  test('cada lectura del blob queda asentada a nombre de quien la hizo', async ({ assert }) => {
    const logs = await TenantContext.runUnscoped(
      () =>
        db
          .from('pii_access_logs')
          .where('pii_access_log_record_id', templateId)
          .where('pii_access_log_model', 'BiometricTemplate')
          .select('user_id'),
      'bitacora de acceso'
    )
    assert.isAtLeast(logs.length, 1)
    assert.equal(logs[0].user_id, userId)
  })

  test('repetir la copia no duplica el comando', async ({ assert }) => {
    await replicate(false)
    const commands = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', compatible.accessPointId)
          .where('device_command_kind', 'biodata_write'),
      'comandos tras repetir'
    )
    assert.lengthOf(commands, 1)
  })
})
