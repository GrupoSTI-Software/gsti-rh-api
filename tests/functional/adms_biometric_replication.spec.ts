import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointEmployee from '#models/access_point_employee'
import EmployeeAssignmentService from '#modules/access-point/employee-assignment/employee_assignment.service'
import type { I18n } from '@adonisjs/i18n'

/** El i18n real no aporta nada aqui: la prueba mira comandos, no textos. */
const i18nFake = { formatMessage: (key: string) => key } as unknown as I18n
import AccessPointProfile from '#models/access_point_profile'
import BiometricTemplate from '#models/biometric_template'
import BusinessUnitUser from '#models/business_unit_user'
import AdmsIncident from '#models/adms_incident'
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

  async function replicate(dryRun: boolean, targets?: number[]) {
    return TenantContext.run([businessUnitId], () =>
      new ReplicationService().replicate({
        employeeId: employee.employeeId,
        businessUnitId,
        sourceAccessPointId: source.accessPointId,
        targetAccessPointIds: targets ?? [compatible.accessPointId, incompatible.accessPointId],
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

    /**
     * Una vista previa es una pregunta, no un hecho: si asentara incidentes,
     * consultar a que equipos cabe una huella ensuciaria la bitacora del
     * equipo sin que nadie haya intentado copiar nada.
     */
    const incidents = await TenantContext.runUnscoped(
      () =>
        AdmsIncident.query()
          .where('access_point_id', incompatible.accessPointId)
          .where('adms_incident_kind', 'template_version_mismatch'),
      'incidentes tras la vista previa'
    )
    assert.lengthOf(incidents, 0)
  })

  /**
   * Se mira el template DEL FIXTURE, no todos los del colaborador.
   *
   * El spec corre sobre la base de desarrollo y toma al primer colaborador de
   * la empresa: si alguien enrolo un dedo real con el hardware --paso el
   * 2026-09-10-- su template queda en la misma boveda y con otra version. El
   * conteo global convertia ese dato ajeno en un fallo del corte por version.
   */
  test('el template solo sale hacia el equipo con la misma version mayor', async ({ assert }) => {
    await replicate(false)

    const commands = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .whereIn('access_point_id', [compatible.accessPointId, incompatible.accessPointId])
          .where('device_command_kind', 'biodata_write')
          .where('biometric_template_id', templateId),
      'comandos encolados'
    )

    assert.lengthOf(commands, 1)
    assert.equal(commands[0].accessPointId, compatible.accessPointId)
    // 13 y 13.2 son la misma version mayor; 10 no.
    assert.equal(commands[0].deviceCommandPin, PIN_COMPAT)
  })

  /**
   * Saltarse el equipo incompatible es correcto; callarlo no.
   *
   * Sin este asiento, el equipo se queda con gente dada de alta que no puede
   * identificarse con el dedo y nadie lo sabe hasta que alguien se queda
   * parado en la puerta.
   */
  test('el equipo que no puede recibir ninguna huella queda asentado', async ({ assert }) => {
    /**
     * Version inventada a proposito: ningun template, ni del fixture ni de un
     * enrolamiento real que ande por la boveda, la alcanza. Es la unica forma
     * de que el escenario sea "no cruzo NADA" corriendo sobre datos vivos.
     */
    const ajeno = await makeDevice(`TEST-REPL-VER-${STAMP}`, '5152', '99')

    await replicate(false, [ajeno.accessPointId])

    const incidents = await TenantContext.runUnscoped(
      () =>
        AdmsIncident.query()
          .where('access_point_id', ajeno.accessPointId)
          .where('adms_incident_kind', 'template_version_mismatch'),
      'incidentes de version incompatible'
    )

    assert.lengthOf(incidents, 1)
    assert.equal(incidents[0].admsIncidentSeverity, 'warning')
    assert.equal(incidents[0].admsIncidentStatus, 'open')
    assert.equal(incidents[0].admsIncidentContext?.deviceVersion, '99')
    assert.include(incidents[0].admsIncidentContext?.vaultVersions ?? '', '13')
    assert.equal(incidents[0].admsIncidentContext?.modality, 'fingerprint')

    const commands = await TenantContext.runUnscoped(
      () => DeviceCommand.query().where('access_point_id', ajeno.accessPointId),
      'comandos hacia el equipo ajeno'
    )
    assert.lengthOf(commands, 0)

    /** El equipo que si recibio la copia no tiene por que salir senalado. */
    const clean = await TenantContext.runUnscoped(
      () =>
        AdmsIncident.query()
          .where('access_point_id', compatible.accessPointId)
          .where('adms_incident_kind', 'template_version_mismatch'),
      'incidentes del equipo compatible'
    )
    assert.lengthOf(clean, 0)

    await TenantContext.runUnscoped(async () => {
      await db.from('adms_incidents').where('access_point_id', ajeno.accessPointId).delete()
      await db.from('access_point_employees').where('access_point_id', ajeno.accessPointId).delete()
      await AccessPointProfile.query().where('access_point_id', ajeno.accessPointId).delete()
      await db.from('access_points').where('access_point_id', ajeno.accessPointId).delete()
    }, 'limpieza del equipo ajeno')
  })

  /**
   * El fixture corre sobre `ZAM180_TFT`, la plataforma del SpeedFace V5L.
   *
   * Ahi la huella NO se escribe con `BIODATA`: medido el 2026-09-10 entre dos
   * V5L de la misma version, el equipo respondio `Return=0` y el dedo no quedo
   * dentro. La unica escritura de huella medida funcionando en esa plataforma
   * es `FINGERTMP`.
   */
  test('en el V5L la huella viaja por FINGERTMP, con el PIN del destino', async ({ assert }) => {
    const command = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', compatible.accessPointId)
          .where('device_command_kind', 'biodata_write')
          .firstOrFail(),
      'comando de copia'
    )

    const payload = command.deviceCommandPayload ?? ''
    assert.include(payload, 'DATA UPDATE FINGERTMP')
    assert.include(payload, `PIN=${PIN_COMPAT}`)
    assert.include(payload, `TMP=${TEMPLATE}`)
    assert.include(payload, 'Size=')
    assert.equal(command.biometricTemplateId, templateId)
  })

  /**
   * El SenseFace tambien escribe la huella por `FINGERTMP`.
   *
   * Su control positivo del spike se habia hecho con un template PROPIO del
   * equipo; escribirle uno ajeno nunca se probo. Medido el 2026-09-10 con el
   * aparato puesto en VX10 para igualarlo a los V5L: `BIODATA` respondio
   * `Return=0`, el equipo reporto cero huellas y el dedo no marcaba.
   */
  test('el SenseFace tambien recibe la huella por FINGERTMP', async ({ assert }) => {
    const zam70 = await makeDevice(`TEST-REPL-ZAM70-${STAMP}`, '5150', '13')
    await TenantContext.runUnscoped(async () => {
      const profile = await AccessPointProfile.query()
        .where('access_point_id', zam70.accessPointId)
        .firstOrFail()
      profile.accessPointProfilePlatform = 'ZAM70_TFT'
      await profile.save()
    }, 'plataforma del destino')

    await replicate(false, [zam70.accessPointId])

    const command = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', zam70.accessPointId)
          .where('device_command_kind', 'biodata_write')
          .firstOrFail(),
      'comando hacia el ZAM70'
    )

    const payload = command.deviceCommandPayload ?? ''
    assert.include(payload, 'DATA UPDATE FINGERTMP')
    assert.include(payload, 'PIN=5150')
    assert.include(payload, 'Size=')

    await TenantContext.runUnscoped(async () => {
      await DeviceCommand.query().where('access_point_id', zam70.accessPointId).delete()
      await AccessPointEmployee.query().where('access_point_id', zam70.accessPointId).delete()
      await AccessPointProfile.query().where('access_point_id', zam70.accessPointId).delete()
      await AccessPoint.query().where('access_point_id', zam70.accessPointId).delete()
    }, 'limpieza del ZAM70')
  })

  /**
   * Una plataforma que nadie ha medido conserva la regla canonica: `BIODATA`
   * con `MajorVer`, que al menos rechaza de frente si la version no cuadra en
   * vez de tragarse el dato en silencio.
   */
  test('una plataforma sin medir conserva BIODATA con su version', async ({ assert }) => {
    const otra = await makeDevice(`TEST-REPL-OTRA-${STAMP}`, '5151', '13')
    await TenantContext.runUnscoped(async () => {
      const profile = await AccessPointProfile.query()
        .where('access_point_id', otra.accessPointId)
        .firstOrFail()
      profile.accessPointProfilePlatform = 'PLATAFORMA_NUEVA'
      await profile.save()
    }, 'plataforma sin medir')

    await replicate(false, [otra.accessPointId])

    const command = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', otra.accessPointId)
          .where('device_command_kind', 'biodata_write')
          .firstOrFail(),
      'comando hacia la plataforma nueva'
    )

    const payload = command.deviceCommandPayload ?? ''
    assert.include(payload, 'DATA UPDATE BIODATA')
    assert.include(payload, 'Pin=5151')
    assert.include(payload, 'MajorVer=13')
    assert.include(payload, 'MinorVer=2')
    // El dedo de coaccion se repite del registro: inventarlo cambiaria lo que
    // significa ese dedo para quien lo usa.
    assert.include(payload, 'Duress=1')

    await TenantContext.runUnscoped(async () => {
      await DeviceCommand.query().where('access_point_id', otra.accessPointId).delete()
      await AccessPointEmployee.query().where('access_point_id', otra.accessPointId).delete()
      await AccessPointProfile.query().where('access_point_id', otra.accessPointId).delete()
      await AccessPoint.query().where('access_point_id', otra.accessPointId).delete()
    }, 'limpieza de la plataforma nueva')
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
  /**
   * Lo que motivo el automatismo: al dar de alta a alguien en un equipo nuevo
   * compatible, sus huellas tienen que viajar solas. La boveda existe para que
   * nadie vuelva al lector a poner el mismo dedo.
   */
  test('dar de alta en un equipo compatible copia los biometricos sin pedirlo', async ({
    assert,
  }) => {
    const nuevo = new AccessPoint()
    nuevo.accessPointName = 'Checador recien llegado'
    nuevo.businessUnitId = businessUnitId
    nuevo.accessPointActive = 1
    nuevo.accessPointSerialNumber = `TEST-REPL-AUTO-${Date.now()}`
    nuevo.accessPointStatus = 0
    await TenantContext.run([businessUnitId], () => nuevo.save())

    const profile = new AccessPointProfile()
    profile.accessPointId = nuevo.accessPointId
    profile.businessUnitId = businessUnitId
    profile.accessPointProfileDialect = 'ta'
    profile.accessPointProfileLayoutKnown = 1
    profile.accessPointProfilePlatform = 'ZAM180_TFT'
    // La misma version mayor que el template guardado: aqui si sirve.
    profile.accessPointProfileFpVersion = '13'
    await TenantContext.run([businessUnitId], () => profile.save())

    const service = new EmployeeAssignmentService(i18nFake)
    await TenantContext.run([businessUnitId], () =>
      service.assign(nuevo.accessPointId, employee.employeeId, [businessUnitId], userId, {
        ip: '127.0.0.1',
      })
    )

    const copias = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', nuevo.accessPointId)
          .where('device_command_kind', 'biodata_write'),
      'copias hacia el equipo nuevo'
    )

    assert.isAtLeast(copias.length, 1)
    assert.equal(copias[0].employeeId, employee.employeeId)

    await TenantContext.runUnscoped(async () => {
      await DeviceCommand.query().where('access_point_id', nuevo.accessPointId).delete()
      await AccessPointEmployee.query().where('access_point_id', nuevo.accessPointId).delete()
      await AccessPointProfile.query().where('access_point_id', nuevo.accessPointId).delete()
      await AccessPoint.query().where('access_point_id', nuevo.accessPointId).delete()
    }, 'limpieza del equipo nuevo')
  })

  /**
   * El otro lado del automatismo, y el que costo caro el 2026-09-10: el alta si
   * entra al equipo aunque la huella no pueda seguirla. La persona queda dada
   * de alta en un lector donde no puede identificarse.
   *
   * El operador esta frente a la pantalla en ese momento: es cuando puede
   * mandarla al lector, en vez de enterarse el dia que se quede parada en la
   * puerta.
   */
  test('el alta avisa cuando el equipo no puede recibir la huella', async ({ assert }) => {
    const ajeno = await makeDevice(`TEST-REPL-ALTA-${STAMP}`, '5153', '99')
    await TenantContext.runUnscoped(
      () => db.from('access_point_employees').where('access_point_id', ajeno.accessPointId).delete(),
      'el alta la hace el servicio, no el fixture'
    )

    const service = new EmployeeAssignmentService(i18nFake)
    const asignacion = await TenantContext.run([businessUnitId], () =>
      service.assign(ajeno.accessPointId, employee.employeeId, [businessUnitId], userId, {
        ip: '127.0.0.1',
      })
    )

    assert.isTrue(asignacion.fingerprintVersionMismatch)
    assert.equal(asignacion.queuedBiometrics, 0)

    /** El alta si viaja: lo que no puede ir es la huella. */
    const comandos = await TenantContext.runUnscoped(
      () => DeviceCommand.query().where('access_point_id', ajeno.accessPointId),
      'comandos del alta ajena'
    )
    assert.isAtLeast(comandos.length, 1)
    assert.isTrue(comandos.every((command) => command.deviceCommandKind !== 'biodata_write'))

    await TenantContext.runUnscoped(async () => {
      await DeviceCommand.query().where('access_point_id', ajeno.accessPointId).delete()
      await db.from('adms_incidents').where('access_point_id', ajeno.accessPointId).delete()
      await AccessPointEmployee.query().where('access_point_id', ajeno.accessPointId).delete()
      await AccessPointProfile.query().where('access_point_id', ajeno.accessPointId).delete()
      await AccessPoint.query().where('access_point_id', ajeno.accessPointId).delete()
    }, 'limpieza del alta ajena')
  })

})
