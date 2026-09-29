import { execSync } from 'node:child_process'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'

/**
 * USRH1790276431885 — línea base neutral (CA-07, CA-08) para backfills y seeder 0007.
 */

function runAce(command: string): string {
  return execSync(command, {
    stdio: 'pipe',
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
}

test.group('Tenant scope — línea base de vías declaradas (USRH1790276431885)', () => {
  test('CA-07: backfill employee-contracts-acl --dry-run termina sin error', async () => {
    runAce('node ace backfill:employee-contracts-acl --dry-run')
  })

  test('CA-07: overtime:backfill-weekly --dry-run termina sin error', async () => {
    runAce(
      'node ace overtime:backfill-weekly --from 2020-01-01 --to 2020-01-07 --dry-run'
    )
  })

  test('CA-07: attendance:reconcile-timezone en ventana acotada termina sin error', async ({
    assert,
  }) => {
    const buRow = await db.from('business_units').select('business_unit_id').first()
    assert.exists(buRow, 'Se requiere al menos una empresa en sae_pruebas')

    runAce(
      `node ace attendance:reconcile-timezone --business-unit=${buRow!.business_unit_id} --from=2020-01-01 --to=2020-01-02`
    )
  })

  test('CA-08: re-seed 0007_person no duplica personas', async ({ assert }) => {
    const beforeRows = await db.from('people').count('* as total')
    const before = Number(beforeRows[0].total)

    runAce('node ace db:seed --files database/seeders/0007_person_seeder.ts')

    const afterRows = await db.from('people').count('* as total')
    assert.equal(Number(afterRows[0].total), before)
  })
})
