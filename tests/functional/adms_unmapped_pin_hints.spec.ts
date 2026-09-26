import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AdmsUnmappedPin from '#models/adms_unmapped_pin'
import BusinessUnit from '#models/business_unit'
import { TenantContext } from '#utils/tenant_context'
import HeldPunchRepositoryMysql from '#modules/adms/ingestion/held_punch.repository.mysql'

/**
 * El equipo sabe cosas del PIN que el sistema no: como se llama esa persona en
 * el aparato y que biometricos tiene cargados. Sin eso, conciliar es mirar un
 * numero pelado y adivinar a quien pertenece.
 */
const STAMP = `${Date.now()}`
const SERIAL = `TEST-ADMS-UP-${STAMP}`
const PIN = '778001'

test.group('Pistas del PIN desconocido', (group) => {
  let accessPoint: AccessPoint
  let businessUnitId: number

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      const unit = await BusinessUnit.query().whereNull('business_unit_deleted_at').firstOrFail()
      businessUnitId = unit.businessUnitId

      const ap = new AccessPoint()
      ap.accessPointName = `Checador de pistas ${STAMP}`
      ap.businessUnitId = businessUnitId
      ap.accessPointActive = 1
      ap.accessPointSerialNumber = SERIAL
      ap.accessPointStatus = 0
      await ap.save()
      accessPoint = ap
    }, 'fixture de pistas')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      await db.from('adms_unmapped_pins').where('access_point_id', accessPoint.accessPointId).delete()
      await db.from('access_points').where('access_point_id', accessPoint.accessPointId).delete()
    }, 'limpieza de pistas')
  })

  async function tocar(name: string | null, bioType: number | null): Promise<number> {
    return TenantContext.runUnscoped(
      () =>
        new HeldPunchRepositoryMysql().touchUnmappedPin({
          accessPointId: accessPoint.accessPointId,
          businessUnitId,
          pin: PIN,
          name,
          bioType,
          now: DateTime.utc(),
        }),
      'toque del PIN'
    )
  }

  async function leer(): Promise<AdmsUnmappedPin> {
    return TenantContext.runUnscoped(
      () =>
        AdmsUnmappedPin.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_unmapped_pin_pin', PIN)
          .firstOrFail(),
      'lectura del PIN'
    )
  }

  test('el nombre que declara el equipo se guarda y sale descifrado', async ({ assert }) => {
    await tocar('JUAN PEREZ LOPEZ', null)
    const row = await leer()
    assert.equal(row.admsUnmappedPinName, 'JUAN PEREZ LOPEZ')

    // En la base va cifrado: quien lea la tabla no ve el nombre.
    const crudo = await TenantContext.runUnscoped(
      () =>
        db
          .from('adms_unmapped_pins')
          .where('adms_unmapped_pin_id', row.admsUnmappedPinId)
          .first(),
      'fila cruda'
    )
    assert.notEqual(crudo.adms_unmapped_pin_name, 'JUAN PEREZ LOPEZ')
  })

  /**
   * Un renombre en el aparato no puede borrar la pista con la que alguien iba a
   * conciliar: se conserva el primero que dio.
   */
  test('el nombre no se sobrescribe una vez puesto', async ({ assert }) => {
    await tocar('OTRO NOMBRE DISTINTO', null)
    const row = await leer()
    assert.equal(row.admsUnmappedPinName, 'JUAN PEREZ LOPEZ')
  })

  test('las modalidades se acumulan: huella hoy y rostro mañana son las dos', async ({
    assert,
  }) => {
    await tocar(null, 1)
    await tocar(null, 9)
    const row = await leer()
    assert.deepEqual(row.admsUnmappedPinBioTypesSeen, ['1', '9'])
  })

  test('ver dos veces la misma modalidad no la duplica', async ({ assert }) => {
    await tocar(null, 1)
    const row = await leer()
    assert.deepEqual(row.admsUnmappedPinBioTypesSeen, ['1', '9'])
  })

  test('cada toque cuenta un marcaje mas', async ({ assert }) => {
    const previa = await leer()
    const antes = previa.admsUnmappedPinPunchCount
    await tocar(null, null)
    const despues = await leer()
    assert.equal(despues.admsUnmappedPinPunchCount, antes + 1)
  })
})
