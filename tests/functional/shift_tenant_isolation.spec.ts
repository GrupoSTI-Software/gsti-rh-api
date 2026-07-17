import { test } from '@japa/runner'
import User from '#models/user'
import Shift from '#models/shift'

/**
 * USRH1783821206521 — verificación end-to-end contra BD real con datos
 * representativos (multi-tenant ya poblado): un usuario de la unidad A no
 * debe poder ver ni borrar un turno de la unidad B por acceso directo.
 *
 * BU1 (sae, business_unit_id=1) y BU6 (cima, business_unit_id=6) tienen
 * datos reales y usuarios propios en la BD restablecida.
 */

const BU1_PUBLIC_ID = 'a76db057-2292-49a0-9f1b-911e328d93b0' // sae
const BU6_PUBLIC_ID = '8c3617a4-c942-4ba7-aee6-2ac32d4ab5ef' // cima

const BU1_SHIFT_ID = 1 // '08:00 to 18:00 - Rest (Sat, Sun)', business_unit_id = 1
const BU6_SHIFT_ID = 122 // '08:00 to 17:00 - Rest (Sat,Sun)', business_unit_id = 6

async function getUserByEmail(email: string): Promise<User> {
  return User.query().whereNull('user_deleted_at').where('user_email', email).firstOrFail()
}

test.group('Shift — aislamiento por tenant (BD real)', (group) => {
  let tempShiftId: number

  group.setup(async () => {
    // Turno temporal en BU6, fuera del scope de BU1, para probar destroy cross-tenant
    // sin arriesgar datos reales existentes.
    const shift = new Shift()
    shift.shiftName = `TEST-TENANT-ISOLATION-${Date.now()}`
    shift.shiftCalculateFlag = ''
    shift.shiftDayStart = 1
    shift.shiftTimeStart = '08:00'
    shift.shiftActiveHours = 8
    shift.shiftRestDays = '0'
    shift.shiftAccumulatedFault = 1
    shift.shiftBusinessUnits = 'cima'
    shift.businessUnitId = 6
    shift.shiftTemp = 0
    await shift.save()
    tempShiftId = shift.shiftId
  })

  group.teardown(async () => {
    if (tempShiftId) {
      await Shift.query().where('shiftId', tempShiftId).delete()
    }
  })

  test('usuario de BU1 puede ver un turno propio de BU1', async ({ client, assert }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .get(`/api/shift/${BU1_SHIFT_ID}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(200)
    assert.equal(response.body().data.shiftId, BU1_SHIFT_ID)
  })

  test('usuario de BU1 recibe 404 uniforme al pedir un turno de BU6 por id directo', async ({
    client,
  }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .get(`/api/shift/${BU6_SHIFT_ID}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(404)
    response.assertBodyContains({ key: 'turno-no-encontrado', code: 'SFT.NF.001' })
  })

  test('usuario de BU6 recibe 404 uniforme al pedir un turno de BU1 por id directo', async ({
    client,
  }) => {
    const user = await getUserByEmail('jdsimon@cima-aviacion.com.mx')

    const response = await client
      .get(`/api/shift/${BU1_SHIFT_ID}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU6_PUBLIC_ID)

    response.assertStatus(404)
    response.assertBodyContains({ key: 'turno-no-encontrado', code: 'SFT.NF.001' })
  })

  test('DELETE de un turno ajeno responde 404 y NO lo borra (shiftDeletedAt intacto)', async ({
    client,
    assert,
  }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx') // BU1

    const response = await client
      .delete(`/api/shift/${tempShiftId}`) // turno real de BU6
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(404)
    response.assertBodyContains({ key: 'turno-no-encontrado', code: 'SFT.NF.001' })

    const stillAlive = await Shift.query().where('shiftId', tempShiftId).whereNull('shiftDeletedAt').first()
    assert.isNotNull(stillAlive, 'el turno ajeno no debió borrarse')
  })

  test('index (listado) solo devuelve turnos de la unidad seleccionada', async ({
    client,
    assert,
  }) => {
    const user = await getUserByEmail('jdsimon@cima-aviacion.com.mx') // BU6

    const response = await client
      .get('/api/shift')
      .qs({ limit: 500 })
      .loginAs(user)
      .header('X-Business-Unit-Id', BU6_PUBLIC_ID)

    response.assertStatus(200)
    const ids: number[] = response.body().data.data.map((s: any) => s.shiftId)
    assert.include(ids, BU6_SHIFT_ID)
    assert.include(ids, tempShiftId)
    assert.notInclude(ids, BU1_SHIFT_ID, 'el listado de BU6 no debe incluir turnos de BU1')
  })

  test('store (creación) estampa businessUnitId con la unidad seleccionada', async ({
    client,
    assert,
  }) => {
    const user = await getUserByEmail('jdsimon@cima-aviacion.com.mx') // BU6
    const uniqueName = `TEST-STORE-${Date.now()}`

    const response = await client
      .post('/api/shift')
      .json({
        shiftName: uniqueName,
        shiftTimeStart: '09:00',
        shiftActiveHours: 8,
        shiftRestDays: '0',
        shiftAccumulatedFault: 1,
        shiftTemp: 0,
        shiftCalculateFlag: '',
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', BU6_PUBLIC_ID)

    response.assertStatus(201)
    const createdId = response.body().data.shiftId
    const row = await Shift.query().where('shiftId', createdId).firstOrFail()
    assert.equal(row.businessUnitId, 6)

    // limpieza
    await Shift.query().where('shiftId', createdId).delete()
  })
})
