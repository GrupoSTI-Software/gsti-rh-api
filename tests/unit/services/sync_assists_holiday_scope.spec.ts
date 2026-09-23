import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Los festivos del calendario de asistencia se consultaban sin alcance de
 * unidades de negocio. `HolidayService.index` descarta todo cuando la lista
 * llega vacía (`whereRaw('1 = 0')`), así que el caché quedaba vacío y ningún
 * día se marcaba como festivo: un día feriado con descanso oficial se
 * reportaba como falta del empleado.
 */

const SERVICE_FILE = join(process.cwd(), 'app/services/sync_assists_service.ts')
const HOLIDAY_SERVICE_FILE = join(process.cwd(), 'app/services/holiday_service.ts')

function read(file: string): string {
  return readFileSync(file, 'utf-8')
}

test.group('SyncAssistsService — alcance de festivos por unidad de negocio', () => {
  test('HolidayService sigue exigiendo unidades para devolver festivos', ({ assert }) => {
    // Si esta guarda desaparece, el alcance deja de ser obligatorio y el
    // motivo del fix ya no aplica.
    assert.include(read(HOLIDAY_SERVICE_FILE), "query.whereRaw('1 = 0')")
  })

  test('la carga de festivos recibe las unidades de negocio', ({ assert }) => {
    const content = read(SERVICE_FILE)
    assert.include(content, 'businessUnitSlugs: string[]')
    assert.match(
      content,
      /new HolidayService\(this\.i18n as I18n\)\.index\([\s\S]*?businessUnitSlugs\s*\)/,
      'la consulta de festivos debe pasar el alcance de unidades'
    )
  })

  test('el alcance se resuelve desde la unidad del empleado en foco', ({ assert }) => {
    const content = read(SERVICE_FILE)
    assert.include(content, 'private async resolveHolidayScope(employee: Employee | null)')
    assert.include(content, 'employee.businessUnitId')
    assert.include(
      content,
      'await this.loadHolidaysInRange(timeCST, endDate, await this.resolveHolidayScope(employee))'
    )
  })

  test('el caché se invalida cuando cambia el rango o la unidad', ({ assert }) => {
    const content = read(SERVICE_FILE)
    // Una misma instancia calcula calendarios de varios empleados: cachear
    // sin alcance mezclaría los festivos de unidades distintas.
    assert.include(content, 'private holidaysCacheScope: string | null = null')
    assert.include(content, 'if (this.holidaysCacheScope === scope)')
  })
})
