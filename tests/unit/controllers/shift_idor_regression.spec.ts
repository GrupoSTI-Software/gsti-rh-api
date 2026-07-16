import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1783821206521 — cierra el IDOR de show/destroy en turnos (acceso
 * directo por id sin scope) y retira todo filtro manual FIND_IN_SET sobre
 * `shift_business_units` en favor del mixin del cimiento.
 */

const CONTROLLER_FILE = join(process.cwd(), 'app/controllers/shifts_controller.ts')
const SERVICE_FILE = join(process.cwd(), 'app/services/shift_service.ts')
const QUOTA_SERVICE_FILE = join(process.cwd(), 'app/services/branch_office_shift_quota_service.ts')
const ROUTES_FILE = join(process.cwd(), 'start/routes/shift_routes.ts')

test.group('Shift — 404 uniforme en acceso directo', () => {
  test('show y destroy responden con el shape {title, detail, key, code}', ({ assert }) => {
    const content = readFileSync(CONTROLLER_FILE, 'utf-8')

    assert.include(content, 'code: SHIFT_ERROR_CODES.NOT_FOUND')
    assert.include(content, "key: 'turno-no-encontrado'")
    // Ambos handlers reutilizan el mismo helper — no hay dos formatos distintos.
    const occurrences = content.match(/shiftNotFoundResponse\(response\)/g) ?? []
    assert.isAtLeast(occurrences.length, 2, 'show y destroy deben reutilizar shiftNotFoundResponse')
  })

  test('store estampa businessUnitId con la unidad seleccionada del request', ({ assert }) => {
    const content = readFileSync(CONTROLLER_FILE, 'utf-8')

    assert.include(content, 'businessUnitId: businessUnitScope[0]')
  })

  test('update no reasigna la unidad dueña (ownership inmutable)', ({ assert }) => {
    const content = readFileSync(CONTROLLER_FILE, 'utf-8')

    // El objeto mergeData de update no debe incluir businessUnitId.
    const mergeDataMatch = content.match(/const mergeData: any = \{[\s\S]*?\n\s{6}\}/)
    assert.isNotNull(mergeDataMatch, 'no se encontró el bloque mergeData de update')
    if (mergeDataMatch) {
      assert.notInclude(mergeDataMatch[0], 'businessUnitId')
    }
  })
})

// Patrón SQL real que gobernaba el aislamiento manual (criterio de aceptación 5
// del spec). Los comentarios explicativos pueden mencionar "FIND_IN_SET" en
// prosa; lo que no debe existir es la invocación SQL contra la columna CSV.
const FIND_IN_SET_SQL = /FIND_IN_SET\(\s*\?\s*,\s*shift_business_units\s*\)/

test.group('Shift — filtros manuales retirados', () => {
  test('shift_service.ts ya no ejecuta FIND_IN_SET(?, shift_business_units)', ({ assert }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')
    assert.notMatch(content, FIND_IN_SET_SQL)
  })

  test('shifts_controller.ts index ya no ejecuta FIND_IN_SET(?, shift_business_units)', ({
    assert,
  }) => {
    const content = readFileSync(CONTROLLER_FILE, 'utf-8')
    assert.notMatch(content, FIND_IN_SET_SQL)
  })

  test('branch_office_shift_quota_service.ts ya no ejecuta FIND_IN_SET(?, shift_business_units)', ({
    assert,
  }) => {
    const content = readFileSync(QUOTA_SERVICE_FILE, 'utf-8')
    assert.notMatch(content, FIND_IN_SET_SQL)
  })
})

test.group('Shift — rutas siguen con auth() + businessScope()', () => {
  test('el grupo de rutas de turnos conserva ambos middlewares', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, 'middleware.auth()')
    assert.include(content, 'middleware.businessScope()')
  })
})
