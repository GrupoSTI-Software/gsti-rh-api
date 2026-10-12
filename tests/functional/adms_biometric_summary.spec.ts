import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointEmployee, {
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
} from '#models/access_point_employee'
import AccessPointProfile from '#models/access_point_profile'
import AdmsIncident from '#models/adms_incident'
import DeviceCommand from '#models/device_command'
import Employee from '#models/employee'
import EmployeeBiometric from '#models/employee_biometric'
import EmployeeBiometricFaceId from '#models/employee_biometric_face_id'
import { TenantContext } from '#utils/tenant_context'
import { ADMS_INCIDENT_KIND } from '#modules/adms/adms.constants'
import { BIO_TYPE } from '#modules/biometric-vault/biometric_vault.constants'
import { BIOMETRIC_SLOT_STATE } from '#modules/biometric-vault/device-biometrics/biometric_slot_state'
import type { BiometricSlotState } from '#modules/biometric-vault/device-biometrics/biometric_slot_state'
import EmployeeBiometricSummaryService from '#modules/biometric-vault/device-biometrics/employee_biometric_summary.service'
import type { EmployeeBiometricSummary } from '#modules/biometric-vault/device-biometrics/employee_biometric_summary.service'
import TemplateService from '#modules/biometric-vault/template/template.service'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import type { DeviceCommandStatus } from '#modules/device-commands/device_command.constants'

/**
 * El resumen de biometricos del colaborador: lo que tiene en su expediente y,
 * equipo por equipo, en que situacion esta cada dedo.
 *
 * Lo que hay que demostrar: que las dos fuentes --la boveda del canal y la
 * tabla del conector viejo-- se unen sin contar dos veces el mismo dedo, que
 * un dedo "esta" en un equipo solo cuando se capturo ahi o una copia quedo
 * ejecutada, que el contador del propio aparato manda sobre cualquier acuse,
 * y que un incidente abierto que retiene las copias se dice junto con la
 * respuesta.
 */
const STAMP = `${Date.now()}`
const SERIAL_ONE = `TEST-ADMS-BS1-${STAMP}`
const SERIAL_TWO = `TEST-ADMS-BS2-${STAMP}`
const PIN_ONE = '450011'
const PIN_TWO = '450022'
const FP_VERSION = '13'
const FACE_VERSION = '39'
/** Capturado en el equipo uno. */
const FINGER_ONE = 1
/** Capturado en el equipo dos. */
const FINGER_TWO = 2
/** Version que ningun equipo del fixture alcanza. */
const FINGER_ORPHAN = 3
/** Solo lo conoce el conector viejo. */
const FINGER_LEGACY_ONLY = 7
const FINGER_BLOB = 'Q'.repeat(1200)
const FACE_BLOB = 'R'.repeat(1400)
/**
 * Captura fija y redondeada al segundo: la prueba del contador pone lecturas
 * del equipo antes y despues de ella, y la columna no guarda milisegundos.
 */
const CAPTURED_AT = DateTime.utc().minus({ hours: 2 }).startOf('second')

test.group('ADMS resumen de biometricos del colaborador', (group) => {
  let one: AccessPoint
  let two: AccessPoint
  let employee: Employee
  let businessUnitId: number
  /** El dedo capturado en el equipo dos: es el que las copias llevan al uno. */
  let templateTwoId: number
  let legacyId: number | null = null
  /** Todo lo que crea el spec: el teardown lo retira aunque una prueba falle. */
  const accessPointIds: number[] = []
  const templateIds: number[] = []
  let wireSeq = 0

  const summaries = new EmployeeBiometricSummaryService()
  const templates = new TemplateService()

  /**
   * Los asientos PII se filtran tambien por modelo: `record_id` solo coincide
   * con registros de cualquier otra tabla, y uno ajeno con sujetos colgando
   * tumbaba la limpieza por llave foranea.
   */
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

  async function makeDevice(serial: string, pin: string, fpVersion: string): Promise<AccessPoint> {
    const ap = new AccessPoint()
    ap.accessPointName = `Checador ${serial}`
    ap.businessUnitId = businessUnitId
    ap.accessPointActive = 1
    ap.accessPointSerialNumber = serial
    ap.accessPointStatus = 0
    await ap.save()
    accessPointIds.push(ap.accessPointId)

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
    pivot.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED
    await pivot.save()

    return ap
  }

  /** Entra por la boveda, como lo haria el canal; devuelve el id del template. */
  async function storeTemplate(input: {
    bioType: number
    bioNo: number
    majorVer: string
    sourceAccessPointId: number | null
    blob: string
  }): Promise<number> {
    const result = await templates.store({
      employeeId: employee.employeeId,
      businessUnitId,
      bioType: input.bioType,
      bioNo: input.bioNo,
      bioIndex: 0,
      bioFormat: 0,
      majorVer: input.majorVer,
      minorVer: '2',
      valid: 1,
      duress: 0,
      template: input.blob,
      sourceAccessPointId: input.sourceAccessPointId,
      capturedAt: CAPTURED_AT,
    })
    if (!result.ok) throw new Error(`La boveda rechazo el biometrico ${input.bioNo}: ${result.reason}`)
    templateIds.push(result.templateId)
    return result.templateId
  }

  async function storeFinger(
    bioNo: number,
    majorVer: string,
    sourceAccessPointId: number | null
  ): Promise<number> {
    return storeTemplate({
      bioType: BIO_TYPE.FINGERPRINT,
      bioNo,
      majorVer,
      sourceAccessPointId,
      blob: FINGER_BLOB,
    })
  }

  /** Una copia hacia el equipo, ya en el estado que la prueba necesita. */
  async function makeCopy(
    accessPointId: number,
    templateId: number,
    status: DeviceCommandStatus,
    at: DateTime
  ): Promise<DeviceCommand> {
    wireSeq += 1
    const command = new DeviceCommand()
    command.deviceCommandWireId = Number(`${STAMP}${String(wireSeq).padStart(2, '0')}`)
    command.accessPointId = accessPointId
    command.businessUnitId = businessUnitId
    command.employeeId = employee.employeeId
    command.deviceCommandKind = DEVICE_COMMAND_KIND.BIODATA_WRITE
    command.deviceCommandPayload = `DATA UPDATE FINGERTMP PIN=${PIN_ONE}`
    command.deviceCommandStatus = status
    command.deviceCommandPriority = 5
    command.deviceCommandAttempts = 1
    command.deviceCommandMaxAttempts = 3
    command.biometricTemplateId = templateId
    command.deviceCommandAckedAt = at
    if (status === DEVICE_COMMAND_STATUS.EXECUTED) command.deviceCommandExecutedAt = at
    await command.save()
    return command
  }

  function summaryOf(accessPointId?: number): Promise<EmployeeBiometricSummary> {
    return TenantContext.run([businessUnitId], () =>
      summaries.of(employee.employeeId, accessPointId)
    )
  }

  function fingerState(
    summary: EmployeeBiometricSummary,
    fingerId: number
  ): BiometricSlotState | undefined {
    return summary.fingers.find((finger) => finger.fingerId === fingerId)?.state
  }

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      /**
       * Un colaborador sin biometricos de ninguna fuente ni equipos asignados.
       * El resumen junta la boveda, la tabla vieja, los vinculos y la foto, y
       * cualquier dato real del elegido se colaria en las cuentas.
       */
      const candidate = await Employee.query()
        .whereNull('employee_deleted_at')
        .whereNotExists((query) => {
          query
            .from('biometric_templates')
            .whereRaw('biometric_templates.employee_id = employees.employee_id')
        })
        .whereNotExists((query) => {
          query
            .from('employee_biometrics')
            .whereRaw('employee_biometrics.employee_id = employees.employee_id')
        })
        .whereNotExists((query) => {
          query
            .from('access_point_employees')
            .whereRaw('access_point_employees.employee_id = employees.employee_id')
        })
        .whereNotExists((query) => {
          query
            .from('employee_biometric_face_ids')
            .whereRaw('employee_biometric_face_ids.employee_id = employees.employee_id')
        })
        .orderBy('employee_id', 'asc')
        .first()
      if (!candidate) {
        throw new Error('Se requiere un colaborador sin biometricos ni equipos asignados.')
      }
      employee = candidate
      businessUnitId = candidate.businessUnitId

      one = await makeDevice(SERIAL_ONE, PIN_ONE, FP_VERSION)
      two = await makeDevice(SERIAL_TWO, PIN_TWO, FP_VERSION)

      await storeFinger(FINGER_ONE, FP_VERSION, one.accessPointId)
      templateTwoId = await storeFinger(FINGER_TWO, FP_VERSION, two.accessPointId)

      /** El conector viejo conoce el MISMO dedo que ya esta en la boveda. */
      const legacy = new EmployeeBiometric()
      legacy.employeeId = employee.employeeId
      legacy.businessUnitId = businessUnitId
      legacy.employeeBiometricData = `Finger:${FINGER_ONE}`
      legacy.employeeBiometricStatus = 'completed_fingers'
      await legacy.save()
      legacyId = legacy.employeeBiometricId
    }, 'fixture del resumen de biometricos')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      /** Los comandos que apuntan a cada template van primero, esten donde esten. */
      for (const id of templateIds) await deleteTemplate(id)
      if (accessPointIds.length > 0) {
        await DeviceCommand.query().whereIn('access_point_id', accessPointIds).delete()
        await db.from('access_point_employees').whereIn('access_point_id', accessPointIds).delete()
        await db.from('adms_incidents').whereIn('access_point_id', accessPointIds).delete()
        await AccessPointProfile.query().whereIn('access_point_id', accessPointIds).delete()
        await db.from('access_points').whereIn('access_point_id', accessPointIds).delete()
      }
      if (legacyId !== null) {
        await db.from('employee_biometrics').where('employee_biometric_id', legacyId).delete()
      }
    }, 'limpieza del resumen de biometricos')
  })

  test('el consolidado cuenta una sola vez el dedo que esta en las dos fuentes', async ({
    assert,
  }) => {
    const summary = await summaryOf()

    // Dos en la boveda y uno en la tabla vieja que repite el primero: son dos.
    assert.deepEqual(summary.fingers, [
      { fingerId: FINGER_ONE, state: BIOMETRIC_SLOT_STATE.REGISTERED },
      { fingerId: FINGER_TWO, state: BIOMETRIC_SLOT_STATE.REGISTERED },
    ])
    assert.isFalse(summary.face.registered)
    assert.isNull(summary.face.state)
    assert.isNull(summary.scopedToAccessPointId)
    assert.isNull(summary.withheldBy)
    assert.isNull(summary.facePhoto)
    assert.deepEqual(summary.orphanFingers, [])
  })

  test('el rostro del consolidado sale registrado cuando la boveda tiene su template', async ({
    assert,
  }) => {
    const faceId = await TenantContext.runUnscoped(
      () =>
        storeTemplate({
          bioType: BIO_TYPE.FACE,
          bioNo: 0,
          majorVer: FACE_VERSION,
          sourceAccessPointId: one.accessPointId,
          blob: FACE_BLOB,
        }),
      'rostro del fixture'
    )

    const summary = await summaryOf()
    assert.isTrue(summary.face.registered)
    assert.equal(summary.face.state, BIOMETRIC_SLOT_STATE.REGISTERED)

    await TenantContext.runUnscoped(() => deleteTemplate(faceId), 'limpieza del rostro')
  })

  /**
   * "Usar tambien para reconocimiento facial en checadores" manda sobre el
   * rostro: apagado, no se ofrece ni como copiable ni como incompatible,
   * porque no va a viajar por ninguna via (decision de Wilvardo 2026-10-12).
   */
  test('con el uso en checadores apagado el rostro no se ofrece; encendido, es copiable', async ({
    assert,
  }) => {
    const faceTemplateId = await TenantContext.runUnscoped(
      () =>
        storeTemplate({
          bioType: BIO_TYPE.FACE,
          bioNo: 0,
          majorVer: FACE_VERSION,
          sourceAccessPointId: one.accessPointId,
          blob: FACE_BLOB,
        }),
      'rostro capturado en el primero'
    )
    const faceRow = await TenantContext.runUnscoped(async () => {
      await AccessPointProfile.query()
        .where('access_point_id', two.accessPointId)
        .update({ access_point_profile_face_version: FACE_VERSION })
      const row = new EmployeeBiometricFaceId()
      row.employeeId = employee.employeeId
      row.businessUnitId = businessUnitId
      row.employeeBiometricFaceIdPhotoUrl = `test/${STAMP}.jpg`
      row.employeeBiometricFaceIdDeviceUse = false
      row.employeeBiometricFaceIdDerivativeVersion = 0
      await row.save()
      return row
    }, 'foto con el interruptor apagado')

    try {
      const off = await summaryOf(two.accessPointId)
      assert.isNull(off.face.state)
      assert.isFalse(off.face.registered)

      await TenantContext.runUnscoped(async () => {
        faceRow.employeeBiometricFaceIdDeviceUse = true
        await faceRow.save()
      }, 'interruptor encendido')

      const on = await summaryOf(two.accessPointId)
      assert.equal(on.face.state, BIOMETRIC_SLOT_STATE.COPYABLE)
    } finally {
      await TenantContext.runUnscoped(async () => {
        await db
          .from('employee_biometric_face_ids')
          .where('employee_biometric_face_id_id', faceRow.employeeBiometricFaceIdId)
          .delete()
        await AccessPointProfile.query()
          .where('access_point_id', two.accessPointId)
          .update({ access_point_profile_face_version: null })
        await deleteTemplate(faceTemplateId)
      }, 'limpieza del rostro')
    }
  })

  /**
   * La boveda guarda un dato por dedo y version, no uno por equipo: el dedo
   * capturado en el otro checador no esta aqui, aunque la version cruce. Lo
   * que si se puede decir es que cabe copiarlo sin traer a la persona.
   */
  test('por equipo, el dedo capturado ahi esta y el del otro equipo se puede copiar', async ({
    assert,
  }) => {
    const fromOne = await summaryOf(one.accessPointId)
    assert.equal(fromOne.scopedToAccessPointId, one.accessPointId)
    assert.equal(fingerState(fromOne, FINGER_ONE), BIOMETRIC_SLOT_STATE.HERE)
    assert.equal(fingerState(fromOne, FINGER_TWO), BIOMETRIC_SLOT_STATE.COPYABLE)

    /** Visto desde el otro equipo la respuesta se invierte. */
    const fromTwo = await summaryOf(two.accessPointId)
    assert.equal(fingerState(fromTwo, FINGER_ONE), BIOMETRIC_SLOT_STATE.COPYABLE)
    assert.equal(fingerState(fromTwo, FINGER_TWO), BIOMETRIC_SLOT_STATE.HERE)
  })

  /**
   * Un acuse solo prueba que la orden llego: el dedo queda "en camino" hasta
   * que el comando se da por ejecutado, y solo entonces esta dentro.
   */
  test('una copia acusada deja el dedo en camino y una ejecutada lo pone dentro', async ({
    assert,
  }) => {
    const copy = await TenantContext.runUnscoped(
      () =>
        makeCopy(one.accessPointId, templateTwoId, DEVICE_COMMAND_STATUS.ACKED, DateTime.utc()),
      'copia acusada hacia el equipo uno'
    )

    const acked = await summaryOf(one.accessPointId)
    assert.equal(fingerState(acked, FINGER_TWO), BIOMETRIC_SLOT_STATE.SENT)

    copy.deviceCommandStatus = DEVICE_COMMAND_STATUS.EXECUTED
    copy.deviceCommandExecutedAt = DateTime.utc()
    await TenantContext.runUnscoped(() => copy.save(), 'la copia se da por ejecutada')

    const executed = await summaryOf(one.accessPointId)
    assert.equal(fingerState(executed, FINGER_TWO), BIOMETRIC_SLOT_STATE.HERE)

    await TenantContext.runUnscoped(
      async () => {
        await DeviceCommand.query().where('device_command_id', copy.deviceCommandId).delete()
      },
      'limpieza de la copia'
    )
  })

  /**
   * El contador del propio aparato es la unica palabra que vale sobre su
   * contenido. Pero se compara contra la fecha de la captura, no de golpe:
   * una lectura ANTERIOR a ella no dice nada de lo que entro despues.
   */
  test('el contador en cero leido despues de la captura desmiente que el dedo este ahi', async ({
    assert,
  }) => {
    const profile = await TenantContext.runUnscoped(
      () => AccessPointProfile.query().where('access_point_id', one.accessPointId).firstOrFail(),
      'perfil del equipo uno'
    )

    try {
      profile.accessPointProfileFpCount = 0
      profile.accessPointProfileOptionsReadAt = CAPTURED_AT.plus({ hours: 1 })
      await TenantContext.runUnscoped(() => profile.save(), 'el equipo se declara vacio')

      // La version sigue cruzando: lo honesto es ofrecer copiarlo, no darlo por dentro.
      const denied = await summaryOf(one.accessPointId)
      assert.equal(fingerState(denied, FINGER_ONE), BIOMETRIC_SLOT_STATE.COPYABLE)

      profile.accessPointProfileOptionsReadAt = CAPTURED_AT.minus({ hours: 1 })
      await TenantContext.runUnscoped(() => profile.save(), 'la lectura es anterior a la captura')

      const stale = await summaryOf(one.accessPointId)
      assert.equal(fingerState(stale, FINGER_ONE), BIOMETRIC_SLOT_STATE.HERE)
    } finally {
      profile.accessPointProfileFpCount = null
      profile.accessPointProfileOptionsReadAt = null
      await TenantContext.runUnscoped(() => profile.save(), 'se deshace la lectura simulada')
    }
  })

  /**
   * El conector viejo no dice en que equipo dejo el dedo ni con que version:
   * su palabra alcanza para saber que existe, no para afirmar que esta aqui.
   */
  test('un dedo que solo conoce el conector viejo queda como desconocido en el equipo', async ({
    assert,
  }) => {
    const legacy = await TenantContext.runUnscoped(
      () => EmployeeBiometric.query().where('employee_id', employee.employeeId).firstOrFail(),
      'registro del conector viejo'
    )

    try {
      legacy.employeeBiometricData = `Finger:${FINGER_ONE}, Finger:${FINGER_LEGACY_ONLY}`
      await TenantContext.runUnscoped(() => legacy.save(), 'el conector viejo suma un dedo')

      const summary = await summaryOf(one.accessPointId)
      assert.equal(fingerState(summary, FINGER_LEGACY_ONLY), BIOMETRIC_SLOT_STATE.UNKNOWN)
      // El que si esta en la boveda no se degrada por aparecer tambien en la tabla vieja.
      assert.equal(fingerState(summary, FINGER_ONE), BIOMETRIC_SLOT_STATE.HERE)
      // Sin template no hay nada que ofrecer borrar: los huerfanos son solo de la boveda.
      assert.notInclude(summary.orphanFingers, FINGER_LEGACY_ONLY)
    } finally {
      legacy.employeeBiometricData = `Finger:${FINGER_ONE}`
      await TenantContext.runUnscoped(() => legacy.save(), 'se deshace el dedo legado')
    }
  })

  /**
   * Huerfano es el dedo que no esta dentro de ningun checador asignado ni
   * puede copiarse a ninguno: es lo unico que tiene sentido ofrecer borrar.
   */
  test('un dedo que ningun equipo asignado puede usar queda como huerfano', async ({
    assert,
  }) => {
    const orphanId = await TenantContext.runUnscoped(
      () => storeFinger(FINGER_ORPHAN, '10', null),
      'dedo de otra generacion de algoritmo'
    )

    // Los dedos que estan dentro de un equipo o pueden copiarse no aparecen.
    const consolidated = await summaryOf()
    assert.deepEqual(consolidated.orphanFingers, [FINGER_ORPHAN])

    const scoped = await summaryOf(one.accessPointId)
    assert.deepEqual(scoped.orphanFingers, [FINGER_ORPHAN])
    assert.equal(fingerState(scoped, FINGER_ORPHAN), BIOMETRIC_SLOT_STATE.INCOMPATIBLE)

    await TenantContext.runUnscoped(() => deleteTemplate(orphanId), 'limpieza del huerfano')
  })

  /**
   * Huerfano es lo que ningun equipo asignado puede usar, no lo que todavia no
   * tiene equipo: a alguien recien dado de alta la ficha no le ofrece borrar
   * todos sus dedos.
   */
  test('sin ningun equipo asignado no hay dedos huerfanos', async ({ assert }) => {
    await TenantContext.runUnscoped(
      () =>
        AccessPointEmployee.query()
          .where('employee_id', employee.employeeId)
          .update({ access_point_employee_sync_status: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED }),
      'se retiran todos los vinculos'
    )
    try {
      const consolidated = await summaryOf()
      assert.deepEqual(consolidated.orphanFingers, [])
      assert.isNotEmpty(consolidated.fingers)
    } finally {
      await TenantContext.runUnscoped(
        () =>
          AccessPointEmployee.query()
            .where('employee_id', employee.employeeId)
            .update({ access_point_employee_sync_status: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED }),
        'se restauran los vinculos'
      )
    }
  })

  /**
   * De nada sirve decir que una huella se puede copiar si el canal no la va a
   * despachar: el incidente que la retiene viaja con la misma respuesta.
   */
  test('un incidente abierto que retiene las copias sale con la respuesta del equipo', async ({
    assert,
  }) => {
    async function openIncident(kind: AdmsIncident['admsIncidentKind']): Promise<AdmsIncident> {
      const row = new AdmsIncident()
      row.accessPointId = one.accessPointId
      row.businessUnitId = businessUnitId
      row.admsIncidentKind = kind
      row.admsIncidentSeverity = 'warning'
      row.admsIncidentCode = 'ADMS.SYS.001'
      row.admsIncidentTitle = `Incidente ${kind} ${STAMP}`
      row.admsIncidentDetail = 'Incidente de prueba del resumen de biometricos.'
      row.admsIncidentKey = 'prueba'
      row.admsIncidentStatus = 'open'
      await row.save()
      return row
    }

    const blocking = await TenantContext.runUnscoped(
      () => openIncident(ADMS_INCIDENT_KIND.IP_ANOMALY),
      'anomalia de IP abierta'
    )

    const withheld = await summaryOf(one.accessPointId)
    assert.equal(withheld.withheldBy?.incidentId, blocking.admsIncidentId)
    assert.equal(withheld.withheldBy?.kind, ADMS_INCIDENT_KIND.IP_ANOMALY)
    assert.isString(withheld.withheldBy?.since)

    /** El otro equipo no carga con el incidente de este. */
    const other = await summaryOf(two.accessPointId)
    assert.isNull(other.withheldBy)

    blocking.admsIncidentStatus = 'resolved'
    blocking.admsIncidentResolvedAt = DateTime.utc()
    await TenantContext.runUnscoped(() => blocking.save(), 'la anomalia se resuelve')

    const released = await summaryOf(one.accessPointId)
    assert.isNull(released.withheldBy)

    /** Un incidente abierto de otra clase no retiene nada. */
    const harmless = await TenantContext.runUnscoped(
      () => openIncident(ADMS_INCIDENT_KIND.CLOCK_DRIFT),
      'deriva de reloj abierta'
    )
    const unaffected = await summaryOf(one.accessPointId)
    assert.isNull(unaffected.withheldBy)

    await TenantContext.runUnscoped(
      async () => {
        await db
          .from('adms_incidents')
          .whereIn('adms_incident_id', [blocking.admsIncidentId, harmless.admsIncidentId])
          .delete()
      },
      'limpieza de los incidentes'
    )
  })
})
