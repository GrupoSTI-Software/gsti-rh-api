import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import Assist from '#models/assist'
import { AssistError } from '#exceptions/assist_error'
import { TenantContext } from '#utils/tenant_context'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'

/**
 * USRH1786566437097 — entregable 14 / bloques B y D del spec funcional.
 */

const MODEL_FILE = join(process.cwd(), 'app/models/assist.ts')
const GUARD_FILE = join(process.cwd(), 'app/helpers/assist_business_unit_guard.ts')
const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')

test.group('Assist — modelo con withBusinessUnitScope (USRH1786566437097)', () => {
  test('B1 · importa y compone withBusinessUnitScope() después de SoftDeletes', ({ assert }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')
    assert.include(
      content,
      "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
    )
    assert.match(content, /compose\([^)]*SoftDeletes[^)]*withBusinessUnitScope\(\)/)
  })

  test('B2 · declara businessUnitId y assistNaturalKey', ({ assert }) => {
    assertModelHasColumns(assert, Assist, ['businessUnitId', 'assistNaturalKey'])
  })

  test('B3 · @beforeCreate fail-closed con guard idempotente', ({ assert }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')
    assert.include(content, '@beforeCreate()')
    assert.match(content, /if \(instance\.businessUnitId\) return/)
    // USRH1786554648211: el fail-closed se extrajo a un guard compartido con el motor
    // de ingesta, para que los dos caminos de escritura emitan el mismo triplete.
    assert.include(content, 'resolveAssistBusinessUnitId()')

    const guard = readFileSync(GUARD_FILE, 'utf-8')
    assert.include(guard, 'TenantContext.getScope()')
    assert.include(guard, 'ASSIST_ERROR_CODES.TENANT_UNRESOLVED')
  })

  test('B4 · la llave natural se calcula en @beforeSave, no en @beforeCreate', ({ assert }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')
    assert.include(content, '@beforeSave()')
    assert.include(content, 'computeAssistNaturalKey')
    const beforeCreateBlock = content.slice(
      content.indexOf('@beforeCreate()'),
      content.indexOf('@beforeSave()')
    )
    assert.notInclude(beforeCreateBlock, 'computeAssistNaturalKey')
  })
})

test.group('Assist — migraciones de tenant y llave (USRH1786566437097)', () => {
  test('B5 · migración M1 con defer, sin await this.schema y sin filtrar deleted_at', ({
    assert,
  }) => {
    const match = readdirSync(MIGRATIONS_DIR).find((f) =>
      f.includes('add_business_unit_id_to_assists')
    )
    assert.isDefined(match)
    const content = readFileSync(join(MIGRATIONS_DIR, match!), 'utf-8')
    assert.notMatch(content, /await\s+this\.schema/)
    assert.include(content, 'this.defer(')
    assert.notMatch(content, /assist_deleted_at/i)
  })

  test('B6 · migración M2 nullable + UNIQUE sin UPDATE', ({ assert }) => {
    const match = readdirSync(MIGRATIONS_DIR).find((f) =>
      f.includes('add_assist_natural_key_to_assists')
    )
    assert.isDefined(match)
    const content = readFileSync(join(MIGRATIONS_DIR, match!), 'utf-8')
    assert.notMatch(content, /await\s+this\.schema/)
    assert.include(content, 'assist_natural_key')
    assert.include(content, 'unique')
    const upBody = content.slice(content.indexOf('async up()'), content.indexOf('async down()'))
    assert.notMatch(upBody, /\bUPDATE\b/i)
    assert.notMatch(upBody, /\.update\(/i)
  })

  test('B7 · migración M3 con guard de NULLs antes del MODIFY', ({ assert }) => {
    const match = readdirSync(MIGRATIONS_DIR).find((f) =>
      f.includes('enforce_not_null_business_unit_id_on_assists')
    )
    assert.isDefined(match, 'debe existir la migración M3 de assists')
    const content = readFileSync(join(MIGRATIONS_DIR, match!), 'utf-8')
    assert.notMatch(content, /await\s+this\.schema/)
    assert.include(content, 'this.defer(')
    assert.include(content, 'business_unit_id')
    assert.include(content, 'IS NULL')
    assert.match(content, /MODIFY COLUMN.*NOT NULL/i)
    assert.include(content, 'ON DELETE RESTRICT')
  })
})

test.group('Assist — scope fail-closed en BD real (USRH1786566437097 / D1–D5)', (group) => {
  let scopedUnitId: number
  let scopedUnitCount: number
  let secondUnitId: number
  let totalCount: number
  let fixtureIds: number[] = []

  group.setup(async () => {
    const totalRows = await TenantContext.runUnscoped(async () => {
      return Assist.query().count('* as total')
    }, 'conteo total assists ensayo')
    totalCount = Number(totalRows[0].$extras.total)

    const unitRows = await TenantContext.runUnscoped(async () => {
      return Assist.query()
        .whereNotNull('businessUnitId')
        .groupBy('businessUnitId')
        .select('businessUnitId')
        .count('* as total')
    }, 'unidades con checadas ensayo')

    if (unitRows.length < 2) {
      scopedUnitId = Number(unitRows[0]?.businessUnitId ?? 1)
      scopedUnitCount = Number(unitRows[0]?.$extras.total ?? 0)
      secondUnitId = scopedUnitId === 1 ? 6 : 1
      return
    }

    scopedUnitId = Number(unitRows[0].businessUnitId)
    scopedUnitCount = Number(unitRows[0].$extras.total)
    secondUnitId = Number(unitRows[1].businessUnitId)
  })

  group.teardown(async () => {
    if (fixtureIds.length === 0) return
    await TenantContext.runUnscoped(async () => {
      await Assist.query().whereIn('assistId', fixtureIds).delete()
    }, 'limpieza fixtures scope assists')
  })

  test('D1 · TenantContext.run([id]) devuelve solo filas de esa unidad', async ({ assert }) => {
    if (scopedUnitCount === 0) {
      assert.isTrue(true, 'sin checadas con tenant en esta restauración')
      return
    }

    const rows = await TenantContext.run([scopedUnitId], async () =>
      Assist.query().select('businessUnitId')
    )
    assert.isAbove(rows.length, 0)
    assert.isTrue(rows.every((row) => row.businessUnitId === scopedUnitId))
    assert.equal(rows.length, scopedUnitCount)
  })

  test('D2 · TenantContext.run([]) con contexto activo devuelve cero filas', async ({ assert }) => {
    const rows = await TenantContext.run([], async () => Assist.query())
    assert.lengthOf(rows, 0)
  })

  test('D3 · sin contexto activo la query no filtra (caracterización)', async ({ assert }) => {
    assert.isFalse(TenantContext.isActive())
    const rows = await Assist.query()
    assert.equal(rows.length, totalCount)
  })

  test('D4 · runUnscoped no aplica filtro de tenant', async ({ assert }) => {
    const rows = await TenantContext.runUnscoped(async () => Assist.query(), 'D4 ensayo scope')
    assert.equal(rows.length, totalCount)
  })

  test('D5 · runUnscoped + save sin businessUnitId lanza AssistError', async ({ assert }) => {
    const punchTime = DateTime.now().toUTC()
    const maxSyncRow = await TenantContext.runUnscoped(async () => {
      return Assist.query().max('assist_sync_id as maxSyncId').first()
    }, 'max sync id D5')
    const nextSyncId = Number(maxSyncRow?.$extras.maxSyncId ?? 0) + 1

    await assert.rejects(
      async () => {
        await TenantContext.runUnscoped(async () => {
          const assist = new Assist()
          assist.assistEmpCode = `TEST-D5-${Date.now()}`
          assist.assistTerminalSn = 'TEST-D5'
          assist.assistTerminalAlias = 'TEST'
          assist.assistAreaAlias = 'TEST'
          assist.assistLongitude = 0
          assist.assistLatitude = 0
          assist.assistPrecision = 0
          assist.assistUploadTime = punchTime
          assist.assistEmpId = 1
          assist.assistTerminalId = null
          assist.assistSyncId = nextSyncId
          assist.assistActive = 1
          assist.assistType = 'check'
          assist.assistPunchTime = punchTime
          assist.assistPunchTimeUtc = punchTime
          assist.assistPunchTimeOrigin = punchTime
          await assist.save()
        }, 'D5 save sin tenant')
      },
      AssistError as unknown as ErrorConstructor
    )
  })

  test('A8 · mismo código e instante en BU1 y BU6 conviven y el scope las separa', async ({
    assert,
  }) => {
    const sharedCode = `TRIAL-A8-${Date.now()}`
    const punchTime = DateTime.fromISO('2026-07-01T12:00:00', { zone: 'utc' })
    const terminalSn = 'TRIAL-A8-SN'

    const maxSyncRow = await TenantContext.runUnscoped(async () => {
      return Assist.query().max('assist_sync_id as maxSyncId').first()
    }, 'max sync id A8')
    let nextSyncId = Number(maxSyncRow?.$extras.maxSyncId ?? 0) + 1

    const createForBu = async (businessUnitId: number, empId: number) => {
      const assist = new Assist()
      assist.businessUnitId = businessUnitId
      assist.assistEmpCode = sharedCode
      assist.assistTerminalSn = terminalSn
      assist.assistTerminalAlias = 'TRIAL-A8'
      assist.assistAreaAlias = 'TEST'
      assist.assistLongitude = 0
      assist.assistLatitude = 0
      assist.assistPrecision = 0
      assist.assistUploadTime = punchTime
      assist.assistEmpId = empId
      assist.assistTerminalId = null
      assist.assistSyncId = nextSyncId++
      assist.assistActive = 1
      assist.assistType = 'check'
      assist.assistPunchTime = punchTime
      assist.assistPunchTimeUtc = punchTime
      assist.assistPunchTimeOrigin = punchTime
      await assist.save()
      return assist.assistId
    }

    const firstId = await TenantContext.runUnscoped(
      () => createForBu(scopedUnitId, 1),
      'fixture A8 primera unidad'
    )
    const secondId = await TenantContext.runUnscoped(
      () => createForBu(secondUnitId, 1),
      'fixture A8 segunda unidad'
    )
    fixtureIds.push(firstId, secondId)

    const firstRows = await TenantContext.run([scopedUnitId], async () =>
      Assist.query().where('assistEmpCode', sharedCode)
    )
    const secondRows = await TenantContext.run([secondUnitId], async () =>
      Assist.query().where('assistEmpCode', sharedCode)
    )

    assert.lengthOf(firstRows, 1)
    assert.lengthOf(secondRows, 1)
    assert.equal(firstRows[0].assistId, firstId)
    assert.equal(secondRows[0].assistId, secondId)
    assert.notEqual(firstRows[0].assistNaturalKey, secondRows[0].assistNaturalKey)
  })
})
