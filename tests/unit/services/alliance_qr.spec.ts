import { test } from '@japa/runner'
import Alliance from '#models/alliance'
import DiscountCode from '#models/discount_code'
import AllianceService from '#services/alliance_service'
import UploadService from '#services/upload_service'
import { AllianceServiceError } from '#exceptions/alliance_service_error'
import { ALLIANCE_ERROR_CODES } from '#constants/alliance_error_codes'
import { QR_URL_EXPIRE_SECONDS } from '#helpers/alliance_code_generator'

/**
 * USRH1788505941895 — trampas de UploadService: key devuelta, firma no-string
 * y subida nula.
 */

function fakeUploads(overrides: {
  upload?: (relativeKey: string) => Promise<string | null>
  link?: (filePath: string, expireSeconds?: number) => Promise<unknown>
}): UploadService {
  return {
    uploadPrivateBuffer: async (relativeKey: string) =>
      overrides.upload ? overrides.upload(relativeKey) : `returned-files/${relativeKey}`,
    getDownloadLink: async (filePath: string, expireSeconds?: number) =>
      overrides.link
        ? overrides.link(filePath, expireSeconds)
        : `https://signed.example/${filePath}?X-Amz-Expires=${expireSeconds}`,
  } as unknown as UploadService
}

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

test.group('AllianceService — QR (USRH1788505941895)', (group) => {
  const allianceIds: number[] = []
  const codeIds: number[] = []

  group.teardown(async () => {
    if (codeIds.length > 0) {
      await DiscountCode.query().whereIn('discount_code_id', codeIds).delete()
    }
    if (allianceIds.length > 0) {
      await DiscountCode.query().whereIn('discount_code_alliance_id', allianceIds).delete()
      await Alliance.query().whereIn('alliance_id', allianceIds).delete()
    }
  })

  test('persiste la key que devuelve la subida, no la compuesta', async ({ assert }) => {
    const alliance = await createBareAlliance(`QR key ${Date.now()}`)
    allianceIds.push(alliance.allianceId)

    const code = await DiscountCode.create({
      discountCodeCode: 'QRKEYXXXXX',
      discountCodeName: 'QR key',
      discountCodeKind: 'percent',
      discountCodeValue: 0,
      discountCodeRedeemedCount: 0,
      discountCodeActive: 1,
      allianceId: alliance.allianceId,
    })
    codeIds.push(code.discountCodeId)
    alliance.$setRelated('discountCode', code)

    const composed = `alliances/${alliance.allianceId}/qr-QRKEYXXXXX.png`
    const returned = `valanserhfiles/${composed}`
    const service = new AllianceService(
      fakeUploads({
        upload: async (relativeKey) => {
          assert.equal(relativeKey, composed)
          return returned
        },
      })
    )

    const key = await service.ensureAllianceQrUploaded(alliance)
    assert.equal(key, returned)
    assert.equal(alliance.allianceQrStorageKey, returned)
    assert.notEqual(alliance.allianceQrStorageKey, composed)
  })

  test('si la firma no es string responde QR_UNAVAILABLE y no un 200 con objeto', async ({
    assert,
  }) => {
    const alliance = await createBareAlliance(`QR firma ${Date.now()}`)
    allianceIds.push(alliance.allianceId)
    alliance.allianceQrStorageKey = 'already/uploaded.png'
    await alliance.save()

    const code = await DiscountCode.create({
      discountCodeCode: 'QRSIGNXXXX',
      discountCodeName: 'QR firma',
      discountCodeKind: 'percent',
      discountCodeValue: 0,
      discountCodeRedeemedCount: 0,
      discountCodeActive: 1,
      allianceId: alliance.allianceId,
    })
    codeIds.push(code.discountCodeId)

    const service = new AllianceService(
      fakeUploads({
        link: async () => ({ status: 500, data: null, message: 'get_url_failed' }),
      })
    )

    try {
      await service.getAllianceQrUrl(alliance.allianceId)
      assert.fail('Debió rechazar la firma no-string')
    } catch (error) {
      assert.instanceOf(error, AllianceServiceError)
      assert.equal((error as AllianceServiceError).errorCode, ALLIANCE_ERROR_CODES.QR_UNAVAILABLE)
      assert.equal((error as AllianceServiceError).httpStatus, 503)
    }
  })

  test('subida nula no lanza y deja la key vacía', async ({ assert }) => {
    const alliance = await createBareAlliance(`QR null ${Date.now()}`)
    allianceIds.push(alliance.allianceId)
    const code = await DiscountCode.create({
      discountCodeCode: 'QRNULLXXXX',
      discountCodeName: 'QR null',
      discountCodeKind: 'percent',
      discountCodeValue: 0,
      discountCodeRedeemedCount: 0,
      discountCodeActive: 1,
      allianceId: alliance.allianceId,
    })
    codeIds.push(code.discountCodeId)
    alliance.$setRelated('discountCode', code)

    const service = new AllianceService(fakeUploads({ upload: async () => null }))
    const key = await service.ensureAllianceQrUploaded(alliance)
    assert.isNull(key)
    // Lucid no materializa NULL como `null` si el atributo nunca se escribió.
    assert.isNotOk(alliance.allianceQrStorageKey)
    assert.equal(QR_URL_EXPIRE_SECONDS, 300)
  })
})
