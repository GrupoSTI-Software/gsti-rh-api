import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointEmployee, {
  ACCESS_POINT_EMPLOYEE_PIN_SOURCE,
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
} from '#models/access_point_employee'
import AdmsHeldBiometric from '#models/adms_held_biometric'
import AdmsHeldPunch, { ADMS_HELD_PUNCH_REASON } from '#models/adms_held_punch'
import AdmsUnmappedPin from '#models/adms_unmapped_pin'
import Assist from '#models/assist'
import BiometricTemplate from '#models/biometric_template'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import Person from '#models/person'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { ASSIST_ORIGIN } from '#constants/assist_origin'
import { AdmsError } from '#exceptions/adms_error'
import { BIO_TYPE } from '#modules/biometric-vault/biometric_vault.constants'
import UnmappedPinsService from '#modules/access-point/unmapped-pins/unmapped_pins.service'
import { TenantContext } from '#utils/tenant_context'

/**
 * Spec ADMS 9.4, el servicio detras de la cola de PINs sin dueno.
 *
 * Lo que hay que demostrar: que lo retenido (checadas y biometricos) se cuenta
 * y se acredita al vincular, que las sugerencias no cruzan empresas y que
 * ninguna operacion llega a una fila fuera del alcance. Los endpoints ya
 * tienen cobertura en `adms_operations_endpoints.spec.ts`; aqui se llama al
 * servicio directo.
 */
const STAMP = `${Date.now()}`
const S6 = STAMP.slice(-6)
const SERIAL = `TEST-ADMS-UP-${STAMP}`
const PIN_MAIN = `7${S6}`
const PIN_TAKEN = `8${S6}`
const PIN_DISMISS = `9${S6}`
/** Apellido estampado: la busqueda por nombre solo puede pegar con lo de esta corrida. */
const SURNAME = `Up${S6}`
const DEVICE_NAME = 'PERSONA DEL APARATO'
const FINGER_BLOB = 'A'.repeat(1120)

test.group('ADMS PINs sin dueno (servicio)', (group) => {
  let accessPoint: AccessPoint
  let businessUnitId: number
  let otherBusinessUnitId: number
  let userId: number
  let codeEmployee: Employee
  let nameEmployee: Employee
  let takenEmployee: Employee
  let foreignEmployee: Employee
  let mainRow: AdmsUnmappedPin
  let takenRow: AdmsUnmappedPin
  let dismissRow: AdmsUnmappedPin
  /** Instantes de las checadas retenidas vivas, para cotejarlas con las acreditadas. */
  const heldPunchTimes: DateTime[] = []
  const employeeIds: number[] = []
  const personIds: number[] = []

  const service = new UnmappedPinsService()

  /**
   * El usuario tiene acceso a las dos empresas: lo que acota cada llamada es
   * `businessUnitIds`, no el mixin. Asi se prueba el filtro del servicio y no
   * el del modelo.
   */
  const inScope = <T>(fn: () => Promise<T>): Promise<T> =>
    TenantContext.run([businessUnitId, otherBusinessUnitId], fn)

  const unscoped = <T>(fn: () => Promise<T>, detail: string): Promise<T> =>
    TenantContext.runUnscoped(fn, 'test-fixture', detail)

  async function expectAdmsError(fn: () => Promise<unknown>): Promise<AdmsError> {
    try {
      await fn()
    } catch (error) {
      if (error instanceof AdmsError) return error
      throw error
    }
    throw new Error('Se esperaba un AdmsError y la llamada no fallo.')
  }

  /**
   * Por tabla y no por modelo, como `tests/helpers/employee_fixture.ts`: el
   * alta por modelo dispara sucursal, bitacora y cuota, que no son asunto de
   * este spec. Departamento y puesto son nulables, asi que no hace falta
   * organigrama.
   */
  async function createEmployee(
    unitId: number,
    input: { code: string; firstName: string; lastName: string }
  ): Promise<Employee> {
    const person = await Person.create({
      personFirstname: input.firstName,
      personLastname: input.lastName,
      personSecondLastname: 'Prueba',
      personEmail: `up-${input.code}-${STAMP}@gsti-tests.local`,
      businessUnitId: unitId,
    })
    personIds.push(person.personId)

    const [employeeId] = await db.table('employees').insert({
      employee_slug: randomUUID(),
      employee_code: input.code,
      employee_first_name: input.firstName,
      employee_last_name: input.lastName,
      employee_second_last_name: 'Prueba',
      company_id: unitId,
      business_unit_id: unitId,
      payroll_business_unit_id: unitId,
      person_id: person.personId,
      employee_type_id: 1,
      employee_work_schedule: 'Onsite',
      employee_business_email: `up-work-${input.code}-${STAMP}@gsti-tests.local`,
      employee_created_at: new Date(),
    })
    const employee = await Employee.query().where('employee_id', Number(employeeId)).firstOrFail()
    employeeIds.push(employee.employeeId)
    return employee
  }

  async function createUnmappedPin(
    pin: string,
    name: string | null,
    bioTypesSeen: string[] | null
  ): Promise<AdmsUnmappedPin> {
    const row = new AdmsUnmappedPin()
    row.accessPointId = accessPoint.accessPointId
    row.businessUnitId = businessUnitId
    row.admsUnmappedPinPin = pin
    row.admsUnmappedPinName = name
    row.admsUnmappedPinFirstSeenAt = DateTime.utc().minus({ days: 1 })
    row.admsUnmappedPinLastSeenAt = DateTime.utc()
    row.admsUnmappedPinPunchCount = 2
    row.admsUnmappedPinBioTypesSeen = bioTypesSeen
    row.admsUnmappedPinStatus = 'pending'
    await row.save()
    return row
  }

  async function createHeldPunch(
    row: AdmsUnmappedPin,
    at: DateTime,
    status: 'held' | 'attributed'
  ): Promise<void> {
    const punch = new AdmsHeldPunch()
    punch.admsUnmappedPinId = row.admsUnmappedPinId
    punch.accessPointId = accessPoint.accessPointId
    punch.businessUnitId = businessUnitId
    punch.admsHeldPunchPin = row.admsUnmappedPinPin
    punch.admsHeldPunchPunchTimeLocal = at
    punch.admsHeldPunchPunchTimeUtc = at
    punch.admsHeldPunchVerify = 1
    punch.admsHeldPunchReason = ADMS_HELD_PUNCH_REASON.UNKNOWN_PIN
    punch.admsHeldPunchStatus = status
    if (status === 'attributed') punch.admsHeldPunchAttributedAt = DateTime.utc()
    await punch.save()
  }

  group.setup(async () => {
    await unscoped(async () => {
      const pivot = await BusinessUnitUser.query().orderBy('business_unit_id', 'asc').first()
      if (!pivot) throw new Error('Se requiere una empresa con usuario.')
      businessUnitId = pivot.businessUnitId
      userId = pivot.userId

      const other = await BusinessUnit.query()
        .whereNull('business_unit_deleted_at')
        .whereNot('business_unit_id', businessUnitId)
        .orderBy('business_unit_id', 'asc')
        .first()
      if (!other) throw new Error('Se requiere una segunda empresa para probar el aislamiento.')
      otherBusinessUnitId = other.businessUnitId

      const ap = new AccessPoint()
      ap.accessPointName = `Checador de PIN suelto ${STAMP}`
      ap.businessUnitId = businessUnitId
      ap.accessPointActive = 1
      ap.accessPointSerialNumber = SERIAL
      ap.accessPointStatus = 0
      await ap.save()
      accessPoint = ap

      codeEmployee = await createEmployee(businessUnitId, {
        code: PIN_MAIN,
        firstName: 'Codigo',
        lastName: SURNAME,
      })
      nameEmployee = await createEmployee(businessUnitId, {
        code: `N${S6}`,
        firstName: 'Nombre',
        lastName: SURNAME,
      })
      takenEmployee = await createEmployee(businessUnitId, {
        code: `T${S6}`,
        firstName: 'Ocupa',
        lastName: `Tk${S6}`,
      })
      /** Mismo codigo que el PIN, pero en otra empresa: no puede salir sugerido. */
      foreignEmployee = await createEmployee(otherBusinessUnitId, {
        code: PIN_MAIN,
        firstName: 'Ajeno',
        lastName: `Aj${S6}`,
      })

      mainRow = await createUnmappedPin(PIN_MAIN, DEVICE_NAME, ['1', '9'])
      takenRow = await createUnmappedPin(PIN_TAKEN, null, null)
      dismissRow = await createUnmappedPin(PIN_DISMISS, DEVICE_NAME, ['1'])

      for (const hoursAgo of [3, 2]) {
        const at = DateTime.utc().minus({ hours: hoursAgo }).startOf('minute')
        heldPunchTimes.push(at)
        await createHeldPunch(mainRow, at, 'held')
      }
      /** Una ya acreditada: ni se cuenta como retenida ni se vuelve a ingerir. */
      await createHeldPunch(
        mainRow,
        DateTime.utc().minus({ hours: 4 }).startOf('minute'),
        'attributed'
      )

      const held = new AdmsHeldBiometric()
      held.admsUnmappedPinId = mainRow.admsUnmappedPinId
      held.accessPointId = accessPoint.accessPointId
      held.businessUnitId = businessUnitId
      held.admsHeldBiometricPin = PIN_MAIN
      held.admsHeldBiometricBioType = BIO_TYPE.FINGERPRINT
      held.admsHeldBiometricBioNo = 2
      held.admsHeldBiometricMajorVer = '13'
      held.admsHeldBiometricMinorVer = '0'
      held.admsHeldBiometricTemplate = FINGER_BLOB
      held.admsHeldBiometricSize = FINGER_BLOB.length
      held.admsHeldBiometricStatus = 'held'
      await held.save()

      /** El PIN del segundo caso ya es de alguien en este mismo equipo. */
      const taken = new AccessPointEmployee()
      taken.accessPointId = accessPoint.accessPointId
      taken.businessUnitId = businessUnitId
      taken.employeeId = takenEmployee.employeeId
      taken.accessPointEmployeePin = PIN_TAKEN
      taken.accessPointEmployeePinSource = ACCESS_POINT_EMPLOYEE_PIN_SOURCE.ASSIGNED
      taken.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED
      await taken.save()
    }, 'fixture de PINs sin dueno')
  })

  group.teardown(async () => {
    await unscoped(async () => {
      if (employeeIds.length > 0) {
        await db.from('assist_calendar_recalc_jobs').whereIn('employee_id', employeeIds).delete()
        await db.from('assists').whereIn('assist_emp_id', employeeIds).delete()

        /** Mismo orden que la replicacion: lo que apunta al template va primero. */
        const templates = await db
          .from('biometric_templates')
          .whereIn('employee_id', employeeIds)
          .select('biometric_template_id')
        for (const template of templates) {
          const id = Number(template.biometric_template_id)
          await db.from('device_commands').where('biometric_template_id', id).delete()
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
      }

      if (accessPoint) {
        const apId = accessPoint.accessPointId
        await db.from('adms_held_biometrics').where('access_point_id', apId).delete()
        await db.from('adms_held_punches').where('access_point_id', apId).delete()
        await db.from('adms_unmapped_pins').where('access_point_id', apId).delete()
        const pivots = await db
          .from('access_point_employees')
          .where('access_point_id', apId)
          .select('access_point_employee_id')
        const pivotIds = pivots.map((row) => Number(row.access_point_employee_id))
        if (pivotIds.length > 0) {
          await db
            .from('access_point_employee_events')
            .whereIn('access_point_employee_id', pivotIds)
            .delete()
        }
        await db.from('access_point_employees').where('access_point_id', apId).delete()
        await db.from('access_points').where('access_point_id', apId).delete()
      }

      if (employeeIds.length > 0) {
        await db.from('employees').whereIn('employee_id', employeeIds).delete()
      }
      if (personIds.length > 0) {
        await db.from('people').whereIn('person_id', personIds).delete()
      }
    }, 'limpieza de PINs sin dueno')
  })

  test('la lista trae la fila pendiente con lo retenido contado y las modalidades traducidas', async ({
    assert,
  }) => {
    const rows = await inScope(() => service.list([businessUnitId]))
    const row = rows.find((item) => item.unmappedPinId === mainRow.admsUnmappedPinId)

    assert.isDefined(row)
    assert.equal(row?.accessPointId, accessPoint.accessPointId)
    assert.equal(row?.pin, PIN_MAIN)
    assert.equal(row?.name, DEVICE_NAME)
    assert.equal(row?.status, 'pending')
    assert.equal(row?.punchCount, 2)
    // Solo las `held`: la ya acreditada no es trabajo pendiente.
    assert.equal(row?.heldPunches, 2)
    assert.equal(row?.heldBiometrics, 1)
    assert.deepEqual(row?.biometricsSeen, ['fingerprint', 'face'])

    const pending = await inScope(() => service.list([businessUnitId], 'pending'))
    assert.isTrue(pending.some((item) => item.unmappedPinId === mainRow.admsUnmappedPinId))
    const dismissed = await inScope(() => service.list([businessUnitId], 'dismissed'))
    assert.isFalse(dismissed.some((item) => item.unmappedPinId === mainRow.admsUnmappedPinId))
  })

  test('la lista no cruza empresas y sin empresas es vacia', async ({ assert }) => {
    const foreign = await inScope(() => service.list([otherBusinessUnitId]))
    assert.isFalse(foreign.some((item) => item.unmappedPinId === mainRow.admsUnmappedPinId))

    const none = await inScope(() => service.list([]))
    assert.deepEqual(none, [])
  })

  test('propone al colaborador cuyo codigo es el PIN, solo de la misma empresa', async ({
    assert,
  }) => {
    const rows = await inScope(() =>
      service.candidates(mainRow.admsUnmappedPinId, [businessUnitId])
    )

    assert.lengthOf(rows, 1)
    assert.equal(rows[0].employeeId, codeEmployee.employeeId)
    assert.equal(rows[0].employeeCode, PIN_MAIN)
    assert.equal(rows[0].fullName, `Codigo ${SURNAME}`)
    assert.equal(rows[0].matchedBy, 'code')
    assert.isFalse(rows.some((row) => row.employeeId === foreignEmployee.employeeId))
  })

  test('con tres letras o mas busca por apellido sin repetir al que ya salio por codigo', async ({
    assert,
  }) => {
    const rows = await inScope(() =>
      service.candidates(mainRow.admsUnmappedPinId, [businessUnitId], ` ${SURNAME} `)
    )

    assert.lengthOf(rows, 2)
    // El que coincide por codigo va primero y con su motivo; el otro entra por nombre.
    assert.equal(rows[0].employeeId, codeEmployee.employeeId)
    assert.equal(rows[0].matchedBy, 'code')
    assert.equal(rows[1].employeeId, nameEmployee.employeeId)
    assert.equal(rows[1].matchedBy, 'name')
    assert.equal(rows[1].fullName, `Nombre ${SURNAME}`)
  })

  test('con menos de tres letras no busca por nombre', async ({ assert }) => {
    const rows = await inScope(() =>
      service.candidates(mainRow.admsUnmappedPinId, [businessUnitId], 'Up')
    )

    assert.lengthOf(rows, 1)
    assert.equal(rows[0].employeeId, codeEmployee.employeeId)
    assert.equal(rows[0].matchedBy, 'code')
  })

  /** Las tres operaciones pasan por `requireRow`: ninguna ve una fila ajena. */
  test('un PIN fuera del alcance responde 404 pin-pendiente-no-encontrado', async ({ assert }) => {
    const attempts: Array<() => Promise<unknown>> = [
      () => inScope(() => service.candidates(mainRow.admsUnmappedPinId, [otherBusinessUnitId])),
      () => inScope(() => service.candidates(mainRow.admsUnmappedPinId, [])),
      () =>
        inScope(() =>
          service.link({
            unmappedPinId: mainRow.admsUnmappedPinId,
            employeeId: codeEmployee.employeeId,
            businessUnitIds: [otherBusinessUnitId],
            userId,
          })
        ),
      () =>
        inScope(() =>
          service.dismiss({
            unmappedPinId: mainRow.admsUnmappedPinId,
            reason: 'ajena',
            businessUnitIds: [otherBusinessUnitId],
            userId,
          })
        ),
    ]

    for (const attempt of attempts) {
      const error = await expectAdmsError(attempt)
      assert.equal(error.httpStatus, 404)
      assert.equal(error.key, 'pin-pendiente-no-encontrado')
      assert.equal(error.code, ADMS_ERROR_CODES.PIN_PENDING_NOT_FOUND)
    }

    const row = await unscoped(
      () => AdmsUnmappedPin.findOrFail(mainRow.admsUnmappedPinId),
      'fila intacta'
    )
    assert.equal(row.admsUnmappedPinStatus, 'pending')
  })

  test('no vincula a un colaborador de otra empresa', async ({ assert }) => {
    const error = await expectAdmsError(() =>
      inScope(() =>
        service.link({
          unmappedPinId: mainRow.admsUnmappedPinId,
          employeeId: foreignEmployee.employeeId,
          businessUnitIds: [businessUnitId],
          userId,
        })
      )
    )

    assert.equal(error.httpStatus, 404)
    assert.equal(error.key, 'colaborador-no-encontrado')
    assert.equal(error.code, ADMS_ERROR_CODES.AUTHZ_OUT_OF_SCOPE)

    const row = await unscoped(
      () => AdmsUnmappedPin.findOrFail(mainRow.admsUnmappedPinId),
      'fila intacta'
    )
    assert.equal(row.admsUnmappedPinStatus, 'pending')
  })

  test('no vincula un PIN que ya es de otro colaborador en el mismo equipo', async ({ assert }) => {
    const error = await expectAdmsError(() =>
      inScope(() =>
        service.link({
          unmappedPinId: takenRow.admsUnmappedPinId,
          employeeId: codeEmployee.employeeId,
          businessUnitIds: [businessUnitId],
          userId,
        })
      )
    )

    assert.equal(error.httpStatus, 409)
    assert.equal(error.key, 'pin-ocupado')
    assert.equal(error.code, ADMS_ERROR_CODES.PIN_TAKEN)

    const pivot = await unscoped(
      () =>
        AccessPointEmployee.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('employee_id', codeEmployee.employeeId)
          .first(),
      'pivote que no debe existir'
    )
    assert.isNull(pivot)
    const row = await unscoped(
      () => AdmsUnmappedPin.findOrFail(takenRow.admsUnmappedPinId),
      'fila intacta'
    )
    assert.equal(row.admsUnmappedPinStatus, 'pending')
  })

  test('vincular acredita las checadas retenidas, mueve los biometricos y cierra la fila', async ({
    assert,
  }) => {
    const result = await inScope(() =>
      service.link({
        unmappedPinId: mainRow.admsUnmappedPinId,
        employeeId: codeEmployee.employeeId,
        businessUnitIds: [businessUnitId],
        userId,
      })
    )

    assert.equal(result.unmappedPinId, mainRow.admsUnmappedPinId)
    assert.equal(result.employeeId, codeEmployee.employeeId)
    assert.equal(result.attributedPunches, 2)
    assert.equal(result.movedBiometrics, 1)

    await unscoped(async () => {
      /** El pivote nace confirmado: el numero ya vive en el aparato, no hay alta que mandar. */
      const pivot = await AccessPointEmployee.query()
        .where('access_point_id', accessPoint.accessPointId)
        .where('employee_id', codeEmployee.employeeId)
        .firstOrFail()
      assert.equal(pivot.accessPointEmployeePin, PIN_MAIN)
      assert.equal(pivot.accessPointEmployeePinSource, ACCESS_POINT_EMPLOYEE_PIN_SOURCE.DEVICE)
      assert.equal(pivot.accessPointEmployeeSyncStatus, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED)
      assert.isNotNull(pivot.accessPointEmployeeSyncConfirmedAt)

      const stillHeld = await AdmsHeldPunch.query()
        .where('adms_unmapped_pin_id', mainRow.admsUnmappedPinId)
        .where('adms_held_punch_status', 'held')
      assert.lengthOf(stillHeld, 0)
      const attributed = await AdmsHeldPunch.query()
        .where('adms_unmapped_pin_id', mainRow.admsUnmappedPinId)
        .where('adms_held_punch_status', 'attributed')
      assert.lengthOf(attributed, 3)
      assert.isTrue(attributed.every((punch) => punch.admsHeldPunchAttributedAt !== null))

      /** Las checadas existen ya a nombre del colaborador, con la serie del equipo. */
      const assists = await Assist.query()
        .where('assist_emp_id', codeEmployee.employeeId)
        .where('assist_terminal_sn', SERIAL)
      assert.lengthOf(assists, 2)
      assert.isTrue(assists.every((assist) => assist.assistOrigin === ASSIST_ORIGIN.ADMS))
      assert.isTrue(assists.every((assist) => assist.assistVerifyMethod === 1))
      assert.sameMembers(
        assists.map((assist) => assist.assistPunchTimeUtc.toMillis()),
        heldPunchTimes.map((at) => at.toMillis())
      )

      /** Con `deferCalendarRecalc` el recalculo se encola, una vez por colaborador. */
      const jobs = await db
        .from('assist_calendar_recalc_jobs')
        .where('employee_id', codeEmployee.employeeId)
      assert.lengthOf(jobs, 1)

      const heldBiometrics = await AdmsHeldBiometric.query().where(
        'adms_unmapped_pin_id',
        mainRow.admsUnmappedPinId
      )
      assert.lengthOf(heldBiometrics, 0)

      const template = await BiometricTemplate.query()
        .where('employee_id', codeEmployee.employeeId)
        .where('biometric_template_bio_type', BIO_TYPE.FINGERPRINT)
        .where('biometric_template_bio_no', 2)
        .firstOrFail()
      assert.equal(template.businessUnitId, businessUnitId)
      assert.equal(template.biometricTemplateMajorVer, '13')
      assert.equal(template.biometricTemplateMinorVer, '0')
      assert.equal(template.biometricTemplateSize, FINGER_BLOB.length)
      assert.equal(template.sourceAccessPointId, accessPoint.accessPointId)
      // El blob viaja tal cual de la retencion a la boveda.
      assert.equal(template.biometricTemplateTemplate, FINGER_BLOB)

      const row = await AdmsUnmappedPin.findOrFail(mainRow.admsUnmappedPinId)
      assert.equal(row.admsUnmappedPinStatus, 'linked')
      assert.isNull(row.admsUnmappedPinName)
      assert.equal(row.admsUnmappedPinResolvedByUserId, userId)
      assert.isNotNull(row.admsUnmappedPinResolvedAt)

      /** En crudo tambien: el modelo devuelve null ante cualquier cosa que no descifre. */
      const raw = await db
        .from('adms_unmapped_pins')
        .where('adms_unmapped_pin_id', mainRow.admsUnmappedPinId)
        .first()
      assert.isNull(raw.adms_unmapped_pin_name)
    }, 'verificacion del vinculo')
  })

  test('la fila vinculada sale de pendientes y ya no cuenta nada retenido', async ({ assert }) => {
    const pending = await inScope(() => service.list([businessUnitId], 'pending'))
    assert.isFalse(pending.some((item) => item.unmappedPinId === mainRow.admsUnmappedPinId))

    const linked = await inScope(() => service.list([businessUnitId], 'linked'))
    const row = linked.find((item) => item.unmappedPinId === mainRow.admsUnmappedPinId)
    assert.isDefined(row)
    assert.isNull(row?.name)
    assert.equal(row?.heldPunches, 0)
    assert.equal(row?.heldBiometrics, 0)
  })

  test('descartar cierra la fila, recorta la razon y olvida el nombre', async ({ assert }) => {
    const reason = 'Persona que ya no trabaja aqui. '.repeat(10)
    assert.isAbove(reason.length, 200)

    const returned = await inScope(() =>
      service.dismiss({
        unmappedPinId: dismissRow.admsUnmappedPinId,
        reason,
        businessUnitIds: [businessUnitId],
        userId,
      })
    )
    assert.equal(returned.admsUnmappedPinStatus, 'dismissed')

    await unscoped(async () => {
      const row = await AdmsUnmappedPin.findOrFail(dismissRow.admsUnmappedPinId)
      assert.equal(row.admsUnmappedPinStatus, 'dismissed')
      assert.equal(row.admsUnmappedPinDismissReason, reason.slice(0, 200))
      assert.lengthOf(row.admsUnmappedPinDismissReason ?? '', 200)
      assert.isNull(row.admsUnmappedPinName)
      assert.equal(row.admsUnmappedPinResolvedByUserId, userId)
      assert.isNotNull(row.admsUnmappedPinResolvedAt)

      const raw = await db
        .from('adms_unmapped_pins')
        .where('adms_unmapped_pin_id', dismissRow.admsUnmappedPinId)
        .first()
      assert.isNull(raw.adms_unmapped_pin_name)
    }, 'verificacion del descarte')
  })
})
