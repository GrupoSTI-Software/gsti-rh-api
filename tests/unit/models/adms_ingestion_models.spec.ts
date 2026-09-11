import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AdmsUnmappedPin from '#models/adms_unmapped_pin'
import AdmsHeldPunch from '#models/adms_held_punch'
import AssistCalendarRecalcJob from '#models/assist_calendar_recalc_job'
import AccessPoint from '#models/access_point'
import BusinessUnit from '#models/business_unit'
import { TenantContext } from '#utils/tenant_context'

/**
 * Tablas de la rebanada 3: el nombre del PIN desconocido viaja cifrado y no se
 * serializa, la retencion rechaza el duplicado por su llave de identidad y la
 * cola de recalculo nace pendiente.
 */
test.group('ADMS ingestion models', (group) => {
  const stamp = `${Date.now()}`
  let accessPointId: number
  let businessUnitId: number

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      const unit = await BusinessUnit.query()
        .whereNull('business_unit_deleted_at')
        .orderBy('business_unit_id', 'asc')
        .firstOrFail()
      businessUnitId = unit.businessUnitId
      const ap = new AccessPoint()
      ap.accessPointName = `Prueba ingesta ADMS ${stamp}`
      ap.businessUnitId = businessUnitId
      ap.accessPointActive = 1
      ap.accessPointSerialNumber = `TEST-ADMS-M-${stamp}`
      ap.accessPointStatus = 0
      await ap.save()
      accessPointId = ap.accessPointId
    }, 'fixture de modelos de ingesta ADMS')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      await AdmsHeldPunch.query().where('access_point_id', accessPointId).delete()
      await AdmsUnmappedPin.query().where('access_point_id', accessPointId).delete()
      await AssistCalendarRecalcJob.query()
        .where('business_unit_id', businessUnitId)
        .where('employee_id', 0)
        .delete()
      await db.from('access_points').where('access_point_id', accessPointId).delete()
    }, 'limpieza de modelos de ingesta ADMS')
  })

  test('el nombre del PIN desconocido se cifra en reposo y no se serializa', async ({
    assert,
  }) => {
    const row = await TenantContext.runUnscoped(async () => {
      const pin = new AdmsUnmappedPin()
      pin.accessPointId = accessPointId
      pin.businessUnitId = businessUnitId
      pin.admsUnmappedPinPin = '9999'
      pin.admsUnmappedPinName = 'NOMBRE EN EL EQUIPO'
      pin.admsUnmappedPinFirstSeenAt = DateTime.utc()
      pin.admsUnmappedPinLastSeenAt = DateTime.utc()
      pin.admsUnmappedPinPunchCount = 1
      await pin.save()
      return pin
    }, 'alta de PIN desconocido')

    const stored = await db
      .from('adms_unmapped_pins')
      .where('adms_unmapped_pin_id', row.admsUnmappedPinId)
      .first()
    assert.notEqual(stored.adms_unmapped_pin_name, 'NOMBRE EN EL EQUIPO')

    const reloaded = await TenantContext.runUnscoped(
      () => AdmsUnmappedPin.findOrFail(row.admsUnmappedPinId),
      'lectura de PIN desconocido'
    )
    assert.equal(reloaded.admsUnmappedPinName, 'NOMBRE EN EL EQUIPO')
    assert.equal(reloaded.admsUnmappedPinStatus, 'pending')
    assert.notProperty(reloaded.serialize(), 'admsUnmappedPinName')
  })

  test('una checada retenida no se duplica por su llave de identidad', async ({ assert }) => {
    const punchTime = DateTime.utc().startOf('second')
    const create = async () =>
      TenantContext.runUnscoped(async () => {
        const held = new AdmsHeldPunch()
        held.accessPointId = accessPointId
        held.businessUnitId = businessUnitId
        held.admsHeldPunchPin = '9999'
        held.admsHeldPunchPunchTimeLocal = punchTime
        held.admsHeldPunchPunchTimeUtc = punchTime
        held.admsHeldPunchVerify = 15
        held.admsHeldPunchReason = 'unknown_pin'
        await held.save()
        return held
      }, 'alta de checada retenida')

    const first = await create()
    // Lucid no rellena las columnas con default de la base tras `save`: se relee.
    const stored = await TenantContext.runUnscoped(
      () => AdmsHeldPunch.findOrFail(first.admsHeldPunchId),
      'lectura de checada retenida'
    )
    assert.equal(stored.admsHeldPunchStatus, 'held')
    await assert.rejects(async () => {
      await create()
    })
  })

  test('la cola de recalculo nace pendiente y sin intentos', async ({ assert }) => {
    const job = await TenantContext.runUnscoped(async () => {
      const row = new AssistCalendarRecalcJob()
      row.businessUnitId = businessUnitId
      row.employeeId = 0
      row.assistCalendarRecalcJobFrom = DateTime.utc().startOf('day')
      row.assistCalendarRecalcJobTo = DateTime.utc().startOf('day')
      await row.save()
      return row
    }, 'alta de trabajo de recalculo')
    const stored = await TenantContext.runUnscoped(
      () => AssistCalendarRecalcJob.findOrFail(job.assistCalendarRecalcJobId),
      'lectura del trabajo de recalculo'
    )
    assert.equal(stored.assistCalendarRecalcJobStatus, 'pending')
    assert.equal(stored.assistCalendarRecalcJobAttempts, 0)
  })
})
