import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1784259058555 — "endurecimiento a 404" de `position_approval_history`:
 * a diferencia de `PositionCertificationRequirementService` (que ya
 * validaba el puesto padre), `create()`/`getLast()` no validaban el padre
 * en absoluto. Sin esa validación, un puesto ajeno terminaría cayendo en el
 * catch genérico del controlador (500), no en un 404 uniforme.
 */

const SERVICE_FILE = join(process.cwd(), 'app/services/position_approval_history_service.ts')
const CONTROLLER_FILE = join(
  process.cwd(),
  'app/controllers/position_approval_history_controller.ts'
)
const ERROR_FILE = join(process.cwd(), 'app/exceptions/position_approval_history_error.ts')

test.group('PositionApprovalHistoryService — valida el puesto padre en scope', () => {
  test('create() y getLast() llaman ensurePositionExists antes de operar', ({ assert }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(content, 'private async ensurePositionExists(')
    assert.include(content, "import Position from '#models/position'")

    const createIndex = content.indexOf('async create(')
    const createEnsureIndex = content.indexOf('this.ensurePositionExists(', createIndex)
    assert.isAbove(createEnsureIndex, createIndex, 'create() debe validar el puesto padre')

    const getLastIndex = content.indexOf('async getLast(')
    const getLastEnsureIndex = content.indexOf('this.ensurePositionExists(', getLastIndex)
    assert.isAbove(getLastEnsureIndex, getLastIndex, 'getLast() debe validar el puesto padre')
  })

  test('ensurePositionExists consulta Position (ya scoped) y lanza 404, nunca 403', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.match(
      content,
      /Position\.query\(\)\s*\.whereNull\('position_deleted_at'\)\s*\.where\('positionId', positionId\)/
    )
    assert.include(content, 'throw new PositionApprovalHistoryError(')
    assert.match(content, /PositionApprovalHistoryError\([^)]*404\)/)
  })
})

test.group('PositionApprovalHistoryError — contrato de error de dominio', () => {
  test('expone httpStatus por defecto 404', ({ assert }) => {
    const content = readFileSync(ERROR_FILE, 'utf-8')
    assert.include(content, 'readonly httpStatus: number')
    assert.include(content, 'httpStatus: number = 404')
  })
})

test.group('PositionApprovalHistoryController — responde 404 uniforme, no 500 genérico', () => {
  test('store y getLast capturan PositionApprovalHistoryError antes del catch genérico', ({
    assert,
  }) => {
    const content = readFileSync(CONTROLLER_FILE, 'utf-8')

    assert.include(
      content,
      "import { PositionApprovalHistoryError } from '#exceptions/position_approval_history_error'"
    )

    const occurrences = content.match(/instanceof PositionApprovalHistoryError/g) ?? []
    assert.lengthOf(occurrences, 2, 'store y getLast deben manejar el error de dominio')

    // La respuesta nunca debe ser 403 ("prohibido"): usa error.httpStatus (404).
    assert.notMatch(content, /response\.status\(403\)/)
  })
})
