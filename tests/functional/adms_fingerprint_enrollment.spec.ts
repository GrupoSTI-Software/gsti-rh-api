import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import env from '#start/env'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointEmployee from '#models/access_point_employee'
import AccessPointProfile from '#models/access_point_profile'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import DeviceCommand from '#models/device_command'
import Employee from '#models/employee'
import User from '#models/user'
import { TenantContext } from '#utils/tenant_context'
import DeviceCommandService from '#modules/device-commands/device_command.service'
import { DEVICE_COMMAND_KIND } from '#modules/device-commands/device_command.constants'
import FingerprintEnrollmentService from '#modules/biometric-vault/enrollment/fingerprint_enrollment.service'
import type { BiometricVaultError } from '#exceptions/biometric_vault_error'

/**
 * Rebanada 8 de extremo a extremo.
 *
 * Lo que hay que demostrar: que el enrolamiento NO se da por hecho con el
 * acuse. `Return=0` significa recibido; la prueba de que la huella entro es que
 * el equipo la suba o que alguien marque con ella.
 */
const BASE = `http://${env.get('HOST')}:${env.get('PORT')}`
const STAMP = `${Date.now()}`
const SERIAL = `TEST-ADMS-E-${STAMP}`
const PIN = '667788'
/** Base64 de 700 caracteres: dentro de la banda de huella (512 a 4096). */
const TEMPLATE = 'A'.repeat(700)

async function get(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`, { method: 'GET' })
}

async function postText(path: string, body: string, type = 'text/plain'): Promise<Response> {
  return fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': type }, body })
}

test.group('ADMS enrolamiento remoto de huella (rebanada 8)', (group) => {
  let accessPoint: AccessPoint
  let employee: Employee
  let businessUnitId: number
  let publicId: string
  let user: User
  let pivotId: number
  let currentLegalDocumentId: number

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      /**
       * Hace falta una empresa con usuario y con al menos un colaborador que
       * NO haya firmado el consentimiento vigente: la puerta se prueba con
       * alguien real que no ha firmado, no con uno inventado.
       */
      const vigente = await db
        .from('legal_documents')
        .where('legal_document_type', 'biometric_consent')
        .where('legal_document_is_current', true)
        .first()
      if (!vigente) {
        throw new Error('Se requiere un documento de consentimiento biometrico vigente.')
      }
      currentLegalDocumentId = vigente.legal_document_id

      const pivots = await BusinessUnitUser.query().orderBy('businessUnitId', 'asc')
      let elegido: { unitId: number; userId: number; employee: Employee } | null = null
      for (const candidate of pivots) {
        const someone = await Employee.query()
          .whereNull('employee_deleted_at')
          .where('business_unit_id', candidate.businessUnitId)
          .whereNotExists((sub) => {
            /**
             * Los DOS anclajes. El consentimiento digital cuelga del usuario y
             * el fisico del colaborador; mirar solo uno deja pasar a alguien
             * que si firmo y la prueba dejaria de probar la puerta.
             */
            sub
              .from('user_consents as uc')
              .where('uc.legal_document_id', currentLegalDocumentId)
              .where((clause) => {
                clause.whereRaw('uc.employee_id = employees.employee_id').orWhereExists((inner) => {
                  inner
                    .from('users as u')
                    .whereRaw('u.person_id = employees.person_id')
                    .whereRaw('uc.user_id = u.user_id')
                })
              })
          })
          .orderBy('employee_id', 'asc')
          .first()
        if (someone) {
          elegido = { unitId: candidate.businessUnitId, userId: candidate.userId, employee: someone }
          break
        }
      }
      if (!elegido) {
        throw new Error('Se requiere una empresa con usuario y un colaborador sin consentimiento.')
      }

      businessUnitId = elegido.unitId
      employee = elegido.employee
      const unit = await BusinessUnit.query().where('businessUnitId', businessUnitId).firstOrFail()
      publicId = String(unit.businessUnitPublicId)
      user = await User.query()
        .whereNull('user_deleted_at')
        .where('user_id', elegido.userId)
        .firstOrFail()

      const ap = new AccessPoint()
      ap.accessPointName = `Checador de enrolamiento ${STAMP}`
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
      profile.accessPointProfileFpCount = 10
      await profile.save()

      const pivot = new AccessPointEmployee()
      pivot.accessPointId = ap.accessPointId
      pivot.businessUnitId = businessUnitId
      pivot.employeeId = employee.employeeId
      pivot.accessPointEmployeePin = PIN
      pivot.accessPointEmployeeSyncStatus = 'confirmed'
      await pivot.save()
      pivotId = pivot.accessPointEmployeeId
    }, 'fixture del enrolamiento')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      await db.from('biometric_templates').where('employee_id', employee.employeeId).delete()
      await DeviceCommand.query().where('access_point_id', accessPoint.accessPointId).delete()
      await db
        .from('access_point_employees')
        .where('access_point_id', accessPoint.accessPointId)
        .delete()
      await db.from('adms_incidents').where('access_point_id', accessPoint.accessPointId).delete()
      await db.from('assists').where('assist_terminal_sn', SERIAL).delete()
      await db
        .from('access_point_stamps')
        .where('access_point_id', accessPoint.accessPointId)
        .delete()
      await AccessPointProfile.query().where('access_point_id', accessPoint.accessPointId).delete()
      await db.from('adms_raw_messages').where('adms_raw_message_serial', SERIAL).delete()
      await db.from('access_points').where('access_point_id', accessPoint.accessPointId).delete()
    }, 'limpieza del enrolamiento')
  })

  /** Encola sin pasar por HTTP: aqui interesa el canal, no la autorizacion. */
  async function enqueueEnrollment(fingerId: number): Promise<DeviceCommand> {
    return TenantContext.run([businessUnitId], async () => {
      const service = new DeviceCommandService()
      const result = await service.enqueue({
        accessPointId: accessPoint.accessPointId,
        businessUnitId,
        kind: DEVICE_COMMAND_KIND.ENROLL_FP,
        fields: { pin: PIN, fid: fingerId },
        employeeId: employee.employeeId,
        accessPointEmployeeId: pivotId,
        correlationKey: `enroll_fp:${PIN}:${fingerId}`,
      })
      return result.command
    })
  }

  test('el sondeo entrega la orden de capturar con la gramatica del equipo', async ({
    assert,
  }) => {
    await enqueueEnrollment(3)
    const pending = await get(`/iclock/getrequest?SN=${SERIAL}`)
    const line = await pending.text()

    assert.match(line, /^C:\d+:ENROLL_FP PIN=667788\tFID=3\tRETRY=3\tOVERWRITE=1$/)
  })

  test('el acuse deja el enrolamiento acusado, NO ejecutado', async ({ assert }) => {
    const command = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('device_command_kind', 'enroll_fp')
          .orderBy('device_command_id', 'desc')
          .firstOrFail(),
      'lectura del comando'
    )
    await postText(
      `/iclock/devicecmd?SN=${SERIAL}`,
      `ID=${command.deviceCommandWireId}&Return=0&CMD=ENROLL_FP`,
      'application/octet-stream'
    )

    const acked = await TenantContext.runUnscoped(
      () => DeviceCommand.query().where('device_command_id', command.deviceCommandId).firstOrFail(),
      'relectura del comando'
    )
    // Return=0 es RECIBIDO. La bateria en hardware midio un Return=0 con la
    // foto descartada: dar esto por hecho seria mentirle al operador.
    assert.equal(acked.deviceCommandStatus, 'acked')
    assert.isNull(acked.deviceCommandExecutedAt)
    // Y se guarda la linea base de contadores para poder comparar despues.
    assert.equal(acked.deviceCommandCountersSnapshot?.fpCount, 10)
  })

  test('la huella que sube el equipo es la que cierra el enrolamiento', async ({ assert }) => {
    const body =
      `BIODATA Pin=${PIN}\tNo=3\tIndex=0\tValid=1\tDuress=0\t` +
      `Type=1\tMajorVer=12\tMinorVer=0\tFormat=0\tTmp=${TEMPLATE}\n`
    const response = await postText(`/iclock/cdata?SN=${SERIAL}&table=BIODATA&Stamp=1`, body)
    assert.equal(response.status, 200)

    const executed = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('device_command_kind', 'enroll_fp')
          .orderBy('device_command_id', 'desc')
          .firstOrFail(),
      'lectura del comando cerrado'
    )
    assert.equal(executed.deviceCommandStatus, 'executed')
    assert.equal(executed.deviceCommandExecutionEvidence, 'biometric_upload')

    const template = await TenantContext.runUnscoped(
      () =>
        db
          .from('biometric_templates')
          .where('employee_id', employee.employeeId)
          .where('biometric_template_bio_no', 3)
          .first(),
      'lectura de la boveda'
    )
    assert.isNotNull(template)
  })

  test('una checada con huella tambien cierra un enrolamiento vivo', async ({ assert }) => {
    const command = await enqueueEnrollment(5)
    await get(`/iclock/getrequest?SN=${SERIAL}`)

    const local = DateTime.utc().minus({ minutes: 5 }).startOf('second').toFormat('yyyy-MM-dd HH:mm:ss')
    // verify=1 es huella en la gramatica del equipo.
    await postText(
      `/iclock/cdata?SN=${SERIAL}&table=ATTLOG&Stamp=2`,
      `${PIN}\t${local}\t0\t1\t0\t0\t0\t255\t0\t0\t\n`
    )

    const executed = await TenantContext.runUnscoped(
      () => DeviceCommand.query().where('device_command_id', command.deviceCommandId).firstOrFail(),
      'lectura del comando por checada'
    )
    assert.equal(executed.deviceCommandStatus, 'executed')
    assert.equal(executed.deviceCommandExecutionEvidence, 'attlog_verify')
  })

  /**
   * La puerta, contra la base real. Se llama al servicio y no al endpoint a
   * proposito: el usuario del fixture no tiene el permiso de biometricos, asi
   * que por HTTP la peticion muere en la autorizacion y nunca llegaria aqui.
   *
   * El colaborador se elige con una consulta propia, no preguntandole a la
   * puerta que se esta probando: si la puerta se rompiera y dijera que nadie ha
   * firmado, elegir con ella haria que la prueba siguiera pasando.
   */
  test('sin la firma del documento vigente no se encola ninguna captura', async ({ assert }) => {
    const firmas = await TenantContext.runUnscoped(
      () =>
        db
          .from('user_consents as uc')
          .where('uc.legal_document_id', currentLegalDocumentId)
          .where((clause) => {
            clause.where('uc.employee_id', employee.employeeId).orWhereExists((inner) => {
              inner
                .from('users as u')
                .where('u.person_id', employee.personId)
                .whereRaw('uc.user_id = u.user_id')
            })
          })
          .count('* as total'),
      'firmas del colaborador por cualquiera de sus dos anclajes'
    )
    assert.equal(firmas[0].total, 0)

    const antes = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('device_command_kind', 'enroll_fp')
          .count('* as total'),
      'conteo previo'
    )

    let key: string | null = null
    await TenantContext.run([businessUnitId], async () => {
      const service = new FingerprintEnrollmentService()
      try {
        await service.request({
          accessPointId: accessPoint.accessPointId,
          businessUnitId,
          employeeId: employee.employeeId,
          fingerId: 7,
          requestedByUserId: null,
        })
      } catch (error) {
        key = (error as BiometricVaultError).key ?? null
      }
    })
    assert.equal(key, 'consentimiento-faltante')

    const despues = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('device_command_kind', 'enroll_fp')
          .count('* as total'),
      'conteo posterior'
    )
    assert.equal(despues[0].$extras.total, antes[0].$extras.total)
  })

  /**
   * Y el endpoint, que ademas exige permiso. Con el usuario del fixture cierra
   * en la autorizacion; lo que se comprueba aqui es que ninguna de las dos
   * puertas deja pasar una captura de huella.
   */
  test('el endpoint no encola nada sin permiso ni consentimiento', async ({
    client,
    assert,
  }) => {
    const antes = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('device_command_kind', 'enroll_fp')
          .count('* as total'),
      'conteo previo'
    )

    const response = await client
      .post(`/api/v1/employees/${employee.employeeId}/device-biometrics/fingerprint-enrollment`)
      .json({ accessPointId: accessPoint.accessPointId, fingerId: 7 })
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)

    assert.notEqual(response.status(), 200)
    // Sin firma cierra la puerta; sin permiso ni se llega a ella. Lo que NUNCA
    // puede pasar es que se encole una captura de huella.
    assert.include(['sin-permiso', 'consentimiento-faltante'], response.body().key)

    const despues = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('device_command_kind', 'enroll_fp')
          .count('* as total'),
      'conteo posterior'
    )
    assert.equal(despues[0].$extras.total, antes[0].$extras.total)
  })
})
