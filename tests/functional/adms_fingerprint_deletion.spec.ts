import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointEmployee from '#models/access_point_employee'
import BiometricTemplate from '#models/biometric_template'
import BusinessUnitUser from '#models/business_unit_user'
import DeviceCommand from '#models/device_command'
import Employee from '#models/employee'
import { TenantContext } from '#utils/tenant_context'
import { BiometricVaultError } from '#exceptions/biometric_vault_error'
import FingerprintDeletionService from '#modules/biometric-vault/device-biometrics/fingerprint_deletion.service'
import { BIO_TYPE } from '#modules/biometric-vault/biometric_vault.constants'
import { ACCESS_POINT_EMPLOYEE_SYNC_STATUS } from '#models/access_point_employee'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'

/**
 * Borrado de una huella del expediente.
 *
 * Lo que hay que demostrar: que la boveda se niega a soltar un dedo que sigue
 * dentro de un checador donde la persona puede marcar --sea el equipo que lo
 * capturo o uno al que se copio-- y que, cuando si procede, el borrado se
 * lleva todas las versiones del dedo y deja constancia de quien lo pidio.
 */
const STAMP = `${Date.now()}`
const ORIGIN_SERIAL = `TEST-ADMS-FD-${STAMP}-1`
const TARGET_SERIAL = `TEST-ADMS-FD-${STAMP}-2`
const RETIRED_SERIAL = `TEST-ADMS-FD-${STAMP}-3`
const PIN_ORIGIN = '450011'
const PIN_TARGET = '450022'
const PIN_RETIRED = '450033'
const TEMPLATE = 'F'.repeat(1200)
const ACTOR_IP = '10.0.0.7'

test.group('ADMS borrado de huellas del expediente', (group) => {
  /** Equipo donde se capturo la huella y donde el colaborador sigue dado de alta. */
  let origin: AccessPoint
  /** Equipo con vinculo vivo al que se copio una huella. */
  let target: AccessPoint
  /** Equipo donde el colaborador ya recibio la baja: su vinculo esta `revoked`. */
  let retired: AccessPoint
  let employee: Employee
  let businessUnitId: number
  let userId: number
  /**
   * Dedos sin ninguna huella previa del colaborador, uno por caso. El spec corre
   * sobre una base con datos vivos: un dedo que ya tuviera un template real
   * contaminaria tanto el 404 como el conteo de versiones borradas.
   */
  let freeFingers: number[]
  /** Templates que crea cada prueba: el teardown los retira aunque la prueba falle. */
  const templateIds: number[] = []

  async function deleteTemplate(id: number): Promise<void> {
    await DeviceCommand.query().where('biometric_template_id', id).delete()
    const logs = await db
      .from('pii_access_logs')
      .where('pii_access_log_model', 'BiometricTemplate')
      .where('pii_access_log_record_id', id)
      .select('pii_access_log_id')
    const logIds = logs.map((row) => Number(row.pii_access_log_id))
    if (logIds.length > 0) {
      await db.from('pii_access_log_subjects').whereIn('pii_access_log_id', logIds).delete()
      await db.from('pii_access_logs').whereIn('pii_access_log_id', logIds).delete()
    }
    await db.from('biometric_templates').where('biometric_template_id', id).delete()
  }

  async function makeDevice(
    serial: string,
    pin: string,
    syncStatus: AccessPointEmployee['accessPointEmployeeSyncStatus']
  ): Promise<AccessPoint> {
    const ap = new AccessPoint()
    ap.accessPointName = `Checador ${serial}`
    ap.businessUnitId = businessUnitId
    ap.accessPointActive = 1
    ap.accessPointSerialNumber = serial
    ap.accessPointStatus = 0
    await ap.save()

    const pivot = new AccessPointEmployee()
    pivot.accessPointId = ap.accessPointId
    pivot.businessUnitId = businessUnitId
    pivot.employeeId = employee.employeeId
    pivot.accessPointEmployeePin = pin
    pivot.accessPointEmployeeSyncStatus = syncStatus
    await pivot.save()

    return ap
  }

  async function makeTemplate(
    fingerId: number,
    majorVer: string,
    sourceAccessPointId: number | null
  ): Promise<BiometricTemplate> {
    const template = new BiometricTemplate()
    template.employeeId = employee.employeeId
    template.businessUnitId = businessUnitId
    template.biometricTemplateBioType = BIO_TYPE.FINGERPRINT
    template.biometricTemplateBioNo = fingerId
    template.biometricTemplateBioIndex = 0
    template.biometricTemplateBioFormat = 0
    template.biometricTemplateMajorVer = majorVer
    template.biometricTemplateMinorVer = '0'
    template.biometricTemplateValid = 1
    template.biometricTemplateDuress = 0
    template.biometricTemplateTemplate = TEMPLATE
    template.biometricTemplateSize = TEMPLATE.length
    template.sourceAccessPointId = sourceAccessPointId
    template.biometricTemplateCapturedAt = DateTime.utc()
    await template.save()
    templateIds.push(template.biometricTemplateId)
    return template
  }

  /** Copia ya entregada a un equipo: `biodata_write` ejecutado apuntando al template. */
  async function makeExecutedCopy(
    accessPoint: AccessPoint,
    pin: string,
    template: BiometricTemplate
  ): Promise<DeviceCommand> {
    const command = new DeviceCommand()
    command.deviceCommandWireId = Number(
      `${Date.now()}${Math.trunc(performance.now())}`.slice(0, 15)
    )
    command.accessPointId = accessPoint.accessPointId
    command.businessUnitId = businessUnitId
    command.employeeId = employee.employeeId
    command.deviceCommandKind = DEVICE_COMMAND_KIND.BIODATA_WRITE
    command.deviceCommandPin = pin
    command.deviceCommandBioNo = template.biometricTemplateBioNo
    command.deviceCommandPayload = `DATA UPDATE FINGERTMP PIN=${pin}\tFID=${template.biometricTemplateBioNo}`
    command.deviceCommandStatus = DEVICE_COMMAND_STATUS.EXECUTED
    command.deviceCommandPriority = 5
    command.deviceCommandAttempts = 1
    command.deviceCommandMaxAttempts = 3
    command.deviceCommandExecutedAt = DateTime.utc()
    command.biometricTemplateId = template.biometricTemplateId
    await command.save()
    return command
  }

  async function deleteFinger(fingerId: number) {
    return TenantContext.run([businessUnitId], () =>
      new FingerprintDeletionService().delete({
        employeeId: employee.employeeId,
        fingerId,
        actor: {
          userId,
          businessUnitId,
          ip: ACTOR_IP,
          userAgent: 'japa',
          requestId: `test-fd-${STAMP}`,
        },
      })
    )
  }

  /** El error tipado es el contrato: el Backoffice ramifica por `key`. */
  async function expectVaultError(fingerId: number): Promise<BiometricVaultError> {
    try {
      await deleteFinger(fingerId)
    } catch (error) {
      if (error instanceof BiometricVaultError) return error
      throw error
    }
    throw new Error('El borrado tenia que rechazarse y no lo hizo.')
  }

  async function countTemplatesOf(fingerId: number): Promise<number> {
    const rows = await TenantContext.runUnscoped(
      () =>
        db
          .from('biometric_templates')
          .where('employee_id', employee.employeeId)
          .where('biometric_template_bio_type', BIO_TYPE.FINGERPRINT)
          .where('biometric_template_bio_no', fingerId)
          .count('* as total'),
      'conteo de templates del dedo'
    )
    return Number(rows[0].total)
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
          elegido = {
            unitId: candidate.businessUnitId,
            userId: candidate.userId,
            employee: someone,
          }
          break
        }
      }
      if (!elegido) throw new Error('Se requiere una empresa con usuario y colaborador.')

      businessUnitId = elegido.unitId
      employee = elegido.employee
      userId = elegido.userId

      const taken = await BiometricTemplate.query()
        .where('employee_id', employee.employeeId)
        .where('biometric_template_bio_type', BIO_TYPE.FINGERPRINT)
        .select('biometric_template_bio_no')
      const takenFingers = new Set(taken.map((row) => row.biometricTemplateBioNo))
      freeFingers = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0].filter((finger) => !takenFingers.has(finger))
      if (freeFingers.length < 5) {
        throw new Error('El colaborador de prueba necesita al menos cinco dedos sin huella.')
      }

      origin = await makeDevice(
        ORIGIN_SERIAL,
        PIN_ORIGIN,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED
      )
      target = await makeDevice(
        TARGET_SERIAL,
        PIN_TARGET,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED
      )
      retired = await makeDevice(
        RETIRED_SERIAL,
        PIN_RETIRED,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED
      )
    }, 'fixture del borrado de huellas')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      const ids = [origin.accessPointId, target.accessPointId, retired.accessPointId]
      for (const id of templateIds) await deleteTemplate(id)
      await DeviceCommand.query().whereIn('access_point_id', ids).delete()
      await db.from('access_point_employees').whereIn('access_point_id', ids).delete()
      await db.from('access_points').whereIn('access_point_id', ids).delete()
    }, 'limpieza del borrado de huellas')
  })

  test('un dedo sin huella en el expediente responde que no hay nada que borrar', async ({
    assert,
  }) => {
    const error = await expectVaultError(freeFingers[0])

    assert.equal(error.httpStatus, 404)
    assert.equal(error.key, 'biometrico-no-encontrado')
  })

  /**
   * El protocolo no tiene verbo para retirar un dedo suelto del aparato. Borrar
   * de la base lo que el checador sigue aceptando dejaria al expediente
   * mintiendo, asi que el servicio se niega y la fila se queda.
   */
  test('la huella capturada en un equipo con vinculo vivo no se borra', async ({ assert }) => {
    const finger = freeFingers[1]
    await TenantContext.runUnscoped(
      () => makeTemplate(finger, '13', origin.accessPointId),
      'huella capturada en el equipo de origen'
    )

    const error = await expectVaultError(finger)

    assert.equal(error.httpStatus, 409)
    assert.equal(error.key, 'huella-en-uso')
    assert.equal(await countTemplatesOf(finger), 1)
  })

  /**
   * La copia cuenta igual que la captura: un `biodata_write` ejecutado hacia un
   * equipo donde la persona sigue dada de alta significa que el dedo esta ahi
   * dentro, aunque el equipo que lo capturo ya haya recibido la baja.
   */
  test('la huella copiada a un equipo con vinculo vivo tampoco se borra', async ({ assert }) => {
    const finger = freeFingers[2]
    await TenantContext.runUnscoped(async () => {
      const template = await makeTemplate(finger, '13', retired.accessPointId)
      await makeExecutedCopy(target, PIN_TARGET, template)
    }, 'huella copiada al equipo destino')

    const error = await expectVaultError(finger)

    assert.equal(error.httpStatus, 409)
    assert.equal(error.key, 'huella-en-uso')
    assert.equal(await countTemplatesOf(finger), 1)
  })

  /**
   * Un vinculo `revoked` no retiene nada: el aparato ya recibio la baja del
   * colaborador y con ella se fueron sus huellas. El borrado procede y deja
   * constancia de quien lo pidio, porque una supresion sin rastro es justo lo
   * que no se puede demostrar despues.
   */
  test('con el vinculo revocado la huella se borra y queda asentado quien lo pidio', async ({
    assert,
  }) => {
    const finger = freeFingers[3]
    const template = await TenantContext.runUnscoped(
      () => makeTemplate(finger, '13', retired.accessPointId),
      'huella del equipo ya retirado'
    )

    const result = await deleteFinger(finger)

    assert.deepEqual(result, { deleted: 1 })
    assert.equal(await countTemplatesOf(finger), 0)

    const logs = await TenantContext.runUnscoped(
      () =>
        db
          .from('pii_access_logs')
          .where('pii_access_log_model', 'BiometricTemplate')
          .where('pii_access_log_record_id', template.biometricTemplateId)
          .select(
            'user_id',
            'business_unit_id',
            'pii_access_log_model_column',
            'pii_access_log_accessor_ip',
            'pii_access_log_request_id'
          ),
      'bitacora del borrado'
    )
    assert.lengthOf(logs, 1)
    assert.equal(logs[0].user_id, userId)
    assert.equal(logs[0].business_unit_id, businessUnitId)
    assert.equal(logs[0].pii_access_log_model_column, 'biometricTemplateTemplate')
    assert.equal(logs[0].pii_access_log_accessor_ip, ACTOR_IP)
    assert.equal(logs[0].pii_access_log_request_id, `test-fd-${STAMP}`)
  })

  /**
   * El mismo dedo puede vivir dos veces en la boveda con distinta version de
   * algoritmo (un v10 de un equipo viejo y un v13 del nuevo). Borrar el dedo es
   * borrar la persona-dedo, no una version: las dos se van juntas y cada una
   * con su asiento.
   */
  test('las versiones del mismo dedo se borran juntas', async ({ assert }) => {
    const finger = freeFingers[4]
    const versions = await TenantContext.runUnscoped(
      () =>
        Promise.all([
          makeTemplate(finger, '10', retired.accessPointId),
          makeTemplate(finger, '13', retired.accessPointId),
        ]),
      'dos versiones del mismo dedo'
    )

    const result = await deleteFinger(finger)

    assert.deepEqual(result, { deleted: 2 })
    assert.equal(await countTemplatesOf(finger), 0)

    const logs = await TenantContext.runUnscoped(
      () =>
        db
          .from('pii_access_logs')
          .where('pii_access_log_model', 'BiometricTemplate')
          .whereIn(
            'pii_access_log_record_id',
            versions.map((version) => version.biometricTemplateId)
          )
          .count('* as total'),
      'bitacora de las dos versiones'
    )
    assert.equal(Number(logs[0].total), 2)
  })
})
