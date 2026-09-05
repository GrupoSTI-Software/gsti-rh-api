import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Alliance from '#models/alliance'
import DiscountCode from '#models/discount_code'
import AllianceService from '#services/alliance_service'
import { AllianceServiceError } from '#exceptions/alliance_service_error'
import { ALLIANCE_ERROR_CODES } from '#constants/alliance_error_codes'
import { replaceAllianceCodeTextGenerator } from '#helpers/alliance_code_generator'

/**
 * USRH1788505941894 — acuñación: reintento ante colisión y agotamiento.
 */

const OCCUPIED = 'TAKENCODEX'
const FREED = 'FREENNNNNX'

async function createBareAlliance(name: string): Promise<Alliance> {
  return Alliance.create({
    allianceName: name,
    allianceContactName: null,
    allianceContactEmail: null,
    allianceContactPhone: null,
    allianceDefaultCommissionPercent: 5,
    allianceDefaultTermPeriods: null,
    allianceActive: 1,
  })
}

test.group('AllianceService.mintAllianceDiscountCode', (group) => {
  const allianceIds: number[] = []
  const codeIds: number[] = []

  group.teardown(async () => {
    replaceAllianceCodeTextGenerator(null)
    if (codeIds.length > 0) {
      await DiscountCode.query().whereIn('discount_code_id', codeIds).delete()
    }
    if (allianceIds.length > 0) {
      await DiscountCode.query().whereIn('discount_code_alliance_id', allianceIds).delete()
      await Alliance.query().whereIn('alliance_id', allianceIds).delete()
    }
  })

  test('si el primer texto está ocupado, genera otro y el alta no falla', async ({ assert }) => {
    const occupied = await DiscountCode.create({
      discountCodeCode: OCCUPIED,
      discountCodeName: 'Ocupado para colisión',
      discountCodeKind: 'percent',
      discountCodeValue: 0,
      discountCodeRedeemedCount: 0,
      discountCodeActive: 1,
    })
    codeIds.push(occupied.discountCodeId)

    let calls = 0
    replaceAllianceCodeTextGenerator(() => {
      calls += 1
      return calls === 1 ? OCCUPIED : FREED
    })

    const alliance = await createBareAlliance(`Mint retry ${Date.now()}`)
    allianceIds.push(alliance.allianceId)

    const minted = await db.transaction((trx) =>
      new AllianceService().mintAllianceDiscountCode(alliance, trx)
    )

    assert.equal(minted.discountCodeCode, FREED)
    assert.equal(minted.allianceId, alliance.allianceId)
    assert.isAtLeast(calls, 2)
    codeIds.push(minted.discountCodeId)
  })

  test('agotados los intentos lanza CODE_GENERATION_EXHAUSTED y no deja código', async ({
    assert,
  }) => {
    const occupied = await DiscountCode.create({
      discountCodeCode: 'EXHAUSTEDX',
      discountCodeName: 'Ocupado para agotamiento',
      discountCodeKind: 'percent',
      discountCodeValue: 0,
      discountCodeRedeemedCount: 0,
      discountCodeActive: 1,
    })
    codeIds.push(occupied.discountCodeId)

    replaceAllianceCodeTextGenerator(() => 'EXHAUSTEDX')

    const alliance = await createBareAlliance(`Mint exhaust ${Date.now()}`)
    allianceIds.push(alliance.allianceId)

    try {
      await db.transaction((trx) =>
        new AllianceService().mintAllianceDiscountCode(alliance, trx)
      )
      assert.fail('Debió agotar la acuñación')
    } catch (error) {
      assert.instanceOf(error, AllianceServiceError)
      assert.equal((error as AllianceServiceError).errorCode, ALLIANCE_ERROR_CODES.CODE_GENERATION_EXHAUSTED)
      assert.notInclude((error as AllianceServiceError).detail, 'EXHAUSTEDX')
    }

    const leftover = await DiscountCode.query().where('discount_code_alliance_id', alliance.allianceId)
    assert.equal(leftover.length, 0)
  })
})
