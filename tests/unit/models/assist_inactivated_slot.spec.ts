import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1786566437097 — entregable 16 / CA-23 / regla 16.
 * Una checada inactivada sigue ocupando su slot de llave natural.
 */

const MODEL_FILE = join(process.cwd(), 'app/models/assist.ts')
const M2_MIGRATION = join(
  process.cwd(),
  'database/migrations/1786566437097001_add_assist_natural_key_to_assists.ts'
)
const INACTIVATE_CONTROLLER = join(process.cwd(), 'app/controllers/assists_controller.ts')
const SYNC_SERVICE = join(process.cwd(), 'app/services/sync_assists_service.ts')
const VERIFY_INFO_SNIPPET = join(process.cwd(), 'app/services/assist_service.ts')

test.group('Assist — slot de llave natural tras inactivación (CA-23 / regla 16)', () => {
  test('M2 · UNIQUE solo sobre assist_natural_key, sin assist_active ni deleted_at', ({
    assert,
  }) => {
    const content = readFileSync(M2_MIGRATION, 'utf-8')
    assert.include(content, "unique(['assist_natural_key']")
    assert.notInclude(content, 'assist_active')
    assert.notInclude(content, 'assist_deleted_at')
  })

  test('modelo · @beforeSave recalcula llave sin mirar assist_active', ({ assert }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')
    assert.include(content, '@beforeSave()')
    assert.include(content, 'computeAssistNaturalKey')
    const hookBlock = content.slice(
      content.indexOf('static assignNaturalKey'),
      content.indexOf('@column.dateTime({ autoCreate: true })', content.indexOf('assignNaturalKey'))
    )
    assert.notInclude(hookBlock, 'assistActive')
  })

  test('Backoffice · inactivate solo pone assist_active=0, no libera la llave', ({ assert }) => {
    const content = readFileSync(INACTIVATE_CONTROLLER, 'utf-8')
    const inactivateBlock = content.slice(
      content.indexOf('async inactivate('),
      content.indexOf('async getAssistFlatList')
    )
    assert.include(inactivateBlock, 'currentAssist.assistActive = 0')
    assert.notInclude(inactivateBlock, 'assistNaturalKey')
    assert.notInclude(inactivateBlock, 'assist_natural_key')
    assert.notInclude(inactivateBlock, 'deletedAt')
  })

  test('sync BioTime · ER_DUP_ENTRY por assists_natural_key_unique se trata como duplicado esperado', ({
    assert,
  }) => {
    const content = readFileSync(SYNC_SERVICE, 'utf-8')
    assert.include(content, 'isNaturalKeyDuplicate')
    assert.include(content, 'ASSIST_NATURAL_KEY_INDEX')
    assert.include(content, 'counters.duplicates++')
  })

  test('verifyInfo · dedupe local no filtra assist_active (inactiva también bloquea re-captura HTTP)', ({
    assert,
  }) => {
    const content = readFileSync(VERIFY_INFO_SNIPPET, 'utf-8')
    const verifyBlock = content.slice(
      content.indexOf('async verifyInfo('),
      content.indexOf('createActionLog(')
    )
    assert.include(verifyBlock, "where('assist_emp_id'")
    assert.include(verifyBlock, "where('assist_punch_time'")
    assert.notMatch(verifyBlock, /where\s*\(\s*['"]assist_active['"]/)
  })
})
