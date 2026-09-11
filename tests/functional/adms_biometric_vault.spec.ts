import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointEmployee from '#models/access_point_employee'
import AccessPointProfile from '#models/access_point_profile'
import AdmsHeldBiometric from '#models/adms_held_biometric'
import AdmsIncident from '#models/adms_incident'
import AdmsUnmappedPin from '#models/adms_unmapped_pin'
import BiometricTemplate from '#models/biometric_template'
import Employee from '#models/employee'
import { TenantContext } from '#utils/tenant_context'
import { admsChannelPost } from '#tests/helpers/adms_channel_request'

/**
 * Rebanada 6 de extremo a extremo: el biometrico que el equipo captura queda
 * custodiado, versionado y cifrado, y lo que no se puede atribuir se conserva
 * en vez de perderse. Volver a pedirle el dedo a alguien cuesta una visita.
 */
const STAMP = `${Date.now()}`
const SERIAL = `TEST-ADMS-B-${STAMP}`
const UNKNOWN_PIN = '8991234'

const FINGER_BLOB = 'A'.repeat(1120)
const FINGER_BLOB_V10 = 'C'.repeat(1120)
const FACE_BLOB = 'B'.repeat(1400)

test.group('ADMS boveda de biometricos (rebanada 6)', (group) => {
  let accessPoint: AccessPoint
  let employee: Employee
  let businessUnitId: number
  let pin: string

  /** La subida viaja por la direccion propia del equipo, como la manda el aparato. */
  const postTable = (table: string, body: string): Promise<Response> =>
    admsChannelPost(
      `/iclock/cdata?SN=${SERIAL}&table=${table}&Stamp=9999`,
      body,
      accessPoint.accessPointChannelSecret
    )

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      employee = await Employee.query()
        .whereNull('employee_deleted_at')
        .whereNotNull('business_unit_id')
        .whereNotNull('employee_code')
        .orderBy('employee_id', 'asc')
        .firstOrFail()
      businessUnitId = employee.businessUnitId as number
      pin = String(employee.employeeCode)

      const ap = new AccessPoint()
      ap.accessPointName = `Checador de boveda ${STAMP}`
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
      profile.accessPointProfilePlatform = 'ZAM70_TFT'
      profile.accessPointProfileFpVersion = '13'
      profile.accessPointProfileFaceVersion = '40'
      await profile.save()
    }, 'fixture de la boveda')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      /**
       * Solo lo que esta corrida creo. Borrar por colaborador se llevaba por
       * delante los biometricos que esa persona ya tenia resguardados de
       * antes -- datos reales, en la base de desarrollo, sin vuelta atras.
       */
      await BiometricTemplate.query()
        .where('employee_id', employee.employeeId)
        .where('source_access_point_id', accessPoint.accessPointId)
        .delete()
      await AdmsHeldBiometric.query().where('access_point_id', accessPoint.accessPointId).delete()
      await AdmsUnmappedPin.query().where('access_point_id', accessPoint.accessPointId).delete()
      await AccessPointEmployee.query()
        .where('access_point_id', accessPoint.accessPointId)
        .delete()
      await AdmsIncident.query().where('access_point_id', accessPoint.accessPointId).delete()
      await db.from('access_point_stamps').where('access_point_id', accessPoint.accessPointId).delete()
      await AccessPointProfile.query().where('access_point_id', accessPoint.accessPointId).delete()
      await db.from('adms_raw_messages').where('adms_raw_message_serial', SERIAL).delete()
      await db.from('access_points').where('access_point_id', accessPoint.accessPointId).delete()
    }, 'limpieza de la boveda')
  })

  test('una huella de un PIN que resuelve queda custodiada y cifrada', async ({ assert }) => {
    const response = await postTable(
      'BIODATA',
      `BIODATA Pin=${pin}\tNo=7\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=13\tMinorVer=0\tFormat=0\tTmp=${FINGER_BLOB}\n`
    )
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'OK: 1')

    const template = await TenantContext.runUnscoped(
      () =>
        BiometricTemplate.query()
          .where('employee_id', employee.employeeId)
          .where('biometric_template_bio_type', 1)
          .where('biometric_template_bio_no', 7)
          .firstOrFail(),
      'lectura del template'
    )
    assert.equal(template.biometricTemplateMajorVer, '13')
    assert.equal(template.biometricTemplateSize, 1120)
    assert.equal(template.sourceAccessPointId, accessPoint.accessPointId)
    assert.equal(template.biometricTemplateTemplate, FINGER_BLOB)
    // El blob nunca sale serializado.
    assert.notProperty(template.serialize(), 'biometricTemplateTemplate')

    const stored = await db
      .from('biometric_templates')
      .where('biometric_template_id', template.biometricTemplateId)
      .first()
    assert.notEqual(stored.biometric_template_template, FINGER_BLOB)
  })

  test('el reenvio del mismo dedo y version no crea una segunda fila', async ({ assert }) => {
    await postTable(
      'BIODATA',
      `BIODATA Pin=${pin}\tNo=7\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=13\tMinorVer=0\tFormat=0\tTmp=${FINGER_BLOB}\n`
    )
    const rows = await TenantContext.runUnscoped(
      () =>
        BiometricTemplate.query()
          .where('employee_id', employee.employeeId)
          .where('biometric_template_bio_type', 1)
          .where('biometric_template_bio_no', 7),
      'conteo de templates'
    )
    assert.lengthOf(rows, 1)
  })

  test('el mismo dedo en otra version SI es otra fila: no son el mismo dato', async ({
    assert,
  }) => {
    await postTable(
      'BIODATA',
      `BIODATA Pin=${pin}\tNo=7\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=10\tMinorVer=0\tFormat=0\tTmp=${FINGER_BLOB_V10}\n`
    )
    const rows = await TenantContext.runUnscoped(
      () =>
        BiometricTemplate.query()
          .where('employee_id', employee.employeeId)
          .where('biometric_template_bio_type', 1)
          .where('biometric_template_bio_no', 7),
      'conteo por version'
    )
    assert.lengthOf(rows, 2)
    assert.includeMembers(
      rows.map((row) => row.biometricTemplateMajorVer),
      ['13', '10']
    )
  })

  test('un rostro sin version en la linea toma la del perfil del equipo', async ({ assert }) => {
    await postTable(
      'BIODATA',
      `BIODATA Pin=${pin}\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=9\tFormat=0\tTmp=${FACE_BLOB}\n`
    )
    const face = await TenantContext.runUnscoped(
      () =>
        BiometricTemplate.query()
          .where('employee_id', employee.employeeId)
          .where('biometric_template_bio_type', 9)
          .firstOrFail(),
      'lectura del rostro'
    )
    assert.equal(face.biometricTemplateMajorVer, '40')
  })

  test('un PIN con doble igual no le cuelga la huella a nadie', async ({ assert }) => {
    const response = await postTable(
      'OPERLOG',
      `FP PIN==1\tFID=0\tSize=1120\tValid=1\tTMP=${FINGER_BLOB}\n`
    )
    assert.equal(response.status, 200)

    const colgada = await TenantContext.runUnscoped(
      () =>
        BiometricTemplate.query()
          .where('employee_id', employee.employeeId)
          .where('biometric_template_bio_no', 0)
          .where('biometric_template_bio_type', 1)
          .first(),
      'busqueda de la huella mal atribuida'
    )
    assert.isNull(colgada)

    const retenida = await TenantContext.runUnscoped(
      () =>
        AdmsHeldBiometric.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_held_biometric_pin', '1')
          .first(),
      'busqueda en retencion'
    )
    assert.isNull(retenida)
  })

  test('una huella de un PIN sin dueno se retiene y entra a la cola de conciliacion', async ({
    assert,
  }) => {
    const response = await postTable(
      'OPERLOG',
      `FP PIN=${UNKNOWN_PIN}\tFID=2\tSize=1120\tValid=1\tTMP=${FINGER_BLOB}\n`
    )
    assert.equal(response.status, 200)

    const held = await TenantContext.runUnscoped(
      () =>
        AdmsHeldBiometric.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_held_biometric_pin', UNKNOWN_PIN)
          .firstOrFail(),
      'lectura de la retencion'
    )
    assert.equal(held.admsHeldBiometricStatus, 'held')
    assert.equal(held.admsHeldBiometricBioType, 1)
    assert.equal(held.admsHeldBiometricBioNo, 2)
    assert.equal(held.admsHeldBiometricTemplate, FINGER_BLOB)
    assert.equal(held.admsHeldBiometricMajorVer, '13')
    assert.isNotNull(held.admsUnmappedPinId)

    const unmapped = await TenantContext.runUnscoped(
      () =>
        AdmsUnmappedPin.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_unmapped_pin_pin', UNKNOWN_PIN)
          .firstOrFail(),
      'lectura del PIN desconocido'
    )
    assert.equal(unmapped.admsUnmappedPinStatus, 'pending')
  })

  test('un blob que no valida no crea fila y deja incidente', async ({ assert }) => {
    const response = await postTable(
      'BIODATA',
      `BIODATA Pin=${pin}\tNo=3\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=13\tMinorVer=0\tFormat=0\tTmp=corto\n`
    )
    assert.equal(response.status, 200)

    const template = await TenantContext.runUnscoped(
      () =>
        BiometricTemplate.query()
          .where('employee_id', employee.employeeId)
          .where('biometric_template_bio_no', 3)
          .first(),
      'busqueda del template invalido'
    )
    assert.isNull(template)

    const incident = await TenantContext.runUnscoped(
      () =>
        AdmsIncident.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_incident_kind', 'invalid_template')
          .first(),
      'lectura del incidente'
    )
    assert.isNotNull(incident)
  })

  test('ninguna respuesta del canal contiene el blob', async ({ assert }) => {
    const response = await postTable(
      'BIODATA',
      `BIODATA Pin=${pin}\tNo=9\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=13\tMinorVer=0\tFormat=0\tTmp=${FINGER_BLOB}\n`
    )
    const text = await response.text()
    assert.equal(text, 'OK: 1')
    assert.notInclude(text, FINGER_BLOB.slice(0, 40))
  })
})
