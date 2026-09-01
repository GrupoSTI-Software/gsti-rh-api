import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import Assist from '#models/assist'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import EmployeeAssistCalendar from '#models/employee_assist_calendar'
import User from '#models/user'
import { TenantContext } from '#utils/tenant_context'

/**
 * USRH1788135907804 — el calendario muestra la hora que quedó registrada.
 *
 * Invariante: para toda checada que el calendario devuelve, el instante de la
 * respuesta es igual, al milisegundo, al que está guardado en la base — dentro y
 * fuera del antiguo periodo de horario de verano, y venga de donde venga la checada.
 * Se compara por instante y nunca por cadena: el ajuste retirado reescribía el campo
 * con `.toISO()` y la representación textual puede diferir sin que difiera el momento.
 */

const CALENDAR_SERVICE = join(process.cwd(), 'app/services/employee_assist_calendar_service.ts')

/** Ventana del antiguo horario de verano, con el mismo algoritmo que tenía el repo. */
function isLegacySummerWindow(day: DateTime): boolean {
  const year = day.year
  const startDST = new Date(year, 3, 1)
  startDST.setDate(1 + ((7 - startDST.getDay()) % 7))
  const endDST = new Date(year, 9, 31)
  endDST.setDate(endDST.getDate() - endDST.getDay())
  const evaluated = day.toJSDate()
  return evaluated >= startDST && evaluated < endDST
}

interface CalendarProbe {
  employeeId: number
  businessUnitId: number
  publicId: string
  day: string
  assistId: number
  persistedMillis: number
}

const MARK_KEYS = ['checkIn', 'checkEatIn', 'checkEatOut', 'checkOut'] as const

async function resolveProbes(limit: number): Promise<CalendarProbe[]> {
  const rows = await TenantContext.runUnscoped(async () => {
    return EmployeeAssistCalendar.query().whereNotNull('check_in_assist_id').limit(limit)
  }, 'calendarios con marca asignada para la prueba de hora real')

  const probes: CalendarProbe[] = []

  for (const row of rows) {
    const raw = row.serialize() as Record<string, unknown>
    const assistId = Number(raw.checkInAssistId)
    const employeeId = Number(raw.employeeId)
    if (!assistId || !employeeId) continue

    const assist = await TenantContext.runUnscoped(
      async () => Assist.query().withTrashed().where('assist_id', assistId).first(),
      'checada asignada para la prueba de hora real'
    )
    if (!assist?.assistPunchTimeUtc) continue

    const employee = await TenantContext.runUnscoped(
      async () => Employee.query().withTrashed().where('employee_id', employeeId).first(),
      'empleado de la prueba de hora real'
    )
    if (!employee?.businessUnitId) continue

    const businessUnit = await BusinessUnit.query()
      .where('businessUnitId', employee.businessUnitId)
      .first()
    const pivot = await BusinessUnitUser.query()
      .where('businessUnitId', employee.businessUnitId)
      .first()
    if (!businessUnit || !pivot) continue

    probes.push({
      employeeId,
      businessUnitId: employee.businessUnitId,
      publicId: String(businessUnit.businessUnitPublicId),
      day: String(raw.day).slice(0, 10),
      assistId,
      persistedMillis: assist.assistPunchTimeUtc.toUTC().toMillis(),
    })
  }

  return probes
}

async function getUserForBusinessUnit(businessUnitId: number): Promise<User> {
  const pivot = await BusinessUnitUser.query().where('businessUnitId', businessUnitId).firstOrFail()
  return User.query().whereNull('user_deleted_at').where('user_id', pivot.userId).firstOrFail()
}

test.group('Calendario de asistencia — hora real de la checada (USRH1788135907804)', () => {
  test('el servicio ya no aplica ningún ajuste de horario de verano', ({ assert }) => {
    const content = readFileSync(CALENDAR_SERVICE, 'utf-8')
    assert.notInclude(content, 'SummerTime')
    assert.notInclude(content, 'getMexicoDSTChangeDates')
    assert.notMatch(content, /plus\(\s*\{\s*hour:\s*1\s*\}\s*\)/)
  })

  test('la marca asignada devuelve el instante que quedó registrado', async ({
    client,
    assert,
  }) => {
    const probes = await resolveProbes(8)
    assert.isAbove(probes.length, 0, 'se requiere al menos un día con marca asignada en la base')

    let checkedInsideWindow = 0

    for (const probe of probes) {
      const user = await getUserForBusinessUnit(probe.businessUnitId)
      const response = await client
        .get(
          `/api/v1/employee-assist-calendars?employeeId=${probe.employeeId}&date=${probe.day}&date-end=${probe.day}`
        )
        .loginAs(user)
        .header('X-Business-Unit-Id', probe.publicId)

      response.assertStatus(200)

      const [calendarDay] = response.body().data.employeeCalendar as Array<{
        assist: Record<string, { assistId?: number; assistPunchTimeUtc?: string } | null>
      }>
      assert.exists(calendarDay, `el calendario del ${probe.day} debe traer su día`)

      const checkIn = calendarDay.assist.checkIn
      assert.exists(checkIn, `el ${probe.day} debe traer su marca de entrada asignada`)
      if (!checkIn?.assistPunchTimeUtc) continue

      assert.equal(
        DateTime.fromISO(checkIn.assistPunchTimeUtc, { zone: 'utc' }).toMillis(),
        probe.persistedMillis,
        `la entrada del ${probe.day} debe mostrarse con su instante registrado`
      )

      if (isLegacySummerWindow(DateTime.fromISO(probe.day, { zone: 'utc' }))) {
        checkedInsideWindow += 1
      }
    }

    assert.isAbove(
      checkedInsideWindow,
      0,
      'la prueba sólo detecta la regresión si cubre un día del antiguo periodo de verano'
    )
  })

  test('la marca asignada y el listado del día dicen la misma hora', async ({
    client,
    assert,
  }) => {
    const probes = await resolveProbes(8)
    let compared = 0

    for (const probe of probes) {
      const user = await getUserForBusinessUnit(probe.businessUnitId)
      const response = await client
        .get(
          `/api/v1/employee-assist-calendars?employeeId=${probe.employeeId}&date=${probe.day}&date-end=${probe.day}`
        )
        .loginAs(user)
        .header('X-Business-Unit-Id', probe.publicId)

      response.assertStatus(200)

      const [calendarDay] = response.body().data.employeeCalendar as Array<{
        assist: Record<string, unknown>
      }>
      if (!calendarDay) continue

      const flatList = (calendarDay.assist.assitFlatList ?? []) as Array<{
        assistId?: number
        assistPunchTimeUtc?: string
      }>
      if (flatList.length === 0) continue

      for (const key of MARK_KEYS) {
        const mark = calendarDay.assist[key] as
          | { assistId?: number; assistPunchTimeUtc?: string }
          | null
        if (!mark?.assistId || !mark.assistPunchTimeUtc) continue

        const flat = flatList.find((entry) => entry.assistId === mark.assistId)
        if (!flat?.assistPunchTimeUtc) continue

        assert.equal(
          DateTime.fromISO(mark.assistPunchTimeUtc, { zone: 'utc' }).toMillis(),
          DateTime.fromISO(flat.assistPunchTimeUtc, { zone: 'utc' }).toMillis(),
          `la misma checada ${mark.assistId} no puede tener dos horas en la misma pantalla`
        )
        compared += 1
      }
    }

    assert.isAbove(compared, 0, 'se requiere al menos un día con listado plano poblado')
  })
})
