import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import Alliance from '#models/alliance'
import DiscountCode from '#models/discount_code'
import UploadService from '#services/upload_service'
import { ALLIANCE_ERROR_CODES } from '#constants/alliance_error_codes'
import { QR_URL_EXPIRE_SECONDS } from '#helpers/alliance_code_generator'

/**
 * Tests funcionales — imagen QR de la alianza (USRH1788505941895).
 * La subida se stubbea: no exige MinIO. El stub persiste la key
 * *devuelta*, no la compuesta.
 */

const TEST_PASSWORD = 'AllianceQrTest123!'
const BASE = '/api/platform/alliances'

interface TestActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'Alliance',
    personLastname: 'Qr',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Alliance QR BU ${stamp}`,
    businessUnitSlug: `alliance-qr-bu-${stamp}`,
    businessUnitLegalName: `Alliance QR Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })

  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return { user, person, businessUnit }
}

async function cleanupActor(actor: TestActor | null) {
  if (!actor) return
  await actor.user.related('businessUnits').detach([actor.businessUnit.businessUnitId])
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

async function cleanupAlliances(ids: number[]) {
  if (ids.length === 0) return
  await DiscountCode.query().whereIn('discount_code_alliance_id', ids).delete()
  await Alliance.query().whereIn('alliance_id', ids).delete()
}

/**
 * Superagent trata 5xx como error; sin esto Japa lanza el body y no
 * hay `ApiResponse` (mismo truco que el spec de acuñación).
 */
function acceptServerErrors<T extends { setup: (fn: (request: { request: { ok: (cb: () => boolean) => void } }) => void) => T }>(
  request: T
): T {
  return request.setup((req) => {
    req.request.ok(() => true)
  })
}

/**
 * Un solo parche al prototipo por grupo. Cambiar `mode` no reasigna
 * métodos: evita que el teardown de otro grupo restaure a mitad del caso.
 */

function stubUploads(modeRef: { current: 'ok' | 'fail' | 'bad-sign' }) {
  const originalUpload = UploadService.prototype.uploadPrivateBuffer
  const originalLink = UploadService.prototype.getDownloadLink

  UploadService.prototype.uploadPrivateBuffer = async function (relativeKey: string) {
    if (modeRef.current === 'fail') return null
    return `returned-files/${relativeKey}`
  }
  UploadService.prototype.getDownloadLink = async function (
    filePath: string,
    expireSeconds = 60 * 60 * 24
  ) {
    if (modeRef.current === 'bad-sign') {
      return { status: 500, data: null, message: 'get_url_failed' }
    }
    return `https://signed.example/${filePath}?X-Amz-Expires=${expireSeconds}`
  }

  return () => {
    UploadService.prototype.uploadPrivateBuffer = originalUpload
    UploadService.prototype.getDownloadLink = originalLink
  }
}

test.group('GET /api/platform/alliances/:id/code/qr-url', (group) => {
  let admin: TestActor | null = null
  const allianceIds: number[] = []
  let restore: (() => void) | null = null
  const modeRef: { current: 'ok' | 'fail' | 'bad-sign' } = { current: 'ok' }

  group.setup(async () => {
    admin = await createActor('alliance-qr-admin', true)
    restore = stubUploads(modeRef)
  })

  group.teardown(async () => {
    restore?.()
    await cleanupAlliances(allianceIds)
    await cleanupActor(admin)
  })

  test('1. el alta guarda la key devuelta y qr-url entrega 300 s', async ({ client, assert }) => {
    modeRef.current = 'ok'
    const created = await client.post(BASE).loginAs(admin!.user).json({
      allianceName: `QR listo ${Date.now()}`,
      allianceDefaultCommissionPercent: 6,
    })
    created.assertStatus(201)
    const allianceId = created.body().data.allianceId
    allianceIds.push(allianceId)

    const view = created.body().data.allianceDiscountCode
    assert.equal(view.qrUrlPath, `/platform/alliances/${allianceId}/code/qr-url`)
    assert.isTrue(view.allianceQrReady)

    const persisted = await Alliance.query().where('alliance_id', allianceId).firstOrFail()
    assert.isString(persisted.allianceQrStorageKey)
    assert.include(persisted.allianceQrStorageKey ?? '', 'returned-files/')
    assert.notEqual(persisted.allianceQrStorageKey?.startsWith('alliances/'), true)

    const qr = await acceptServerErrors(client.get(`${BASE}/${allianceId}/code/qr-url`)).loginAs(
      admin!.user
    )
    qr.assertStatus(200)
    assert.equal(qr.headers()['cache-control'], 'no-store')
    assert.equal(qr.body().data.expiresIn, QR_URL_EXPIRE_SECONDS)
    assert.isString(qr.body().data.url)
    assert.include(qr.body().data.url, 'X-Amz-Expires=300')
    assert.isFalse(qr.body().data.url.startsWith('/'))

    const code = await client.get(`${BASE}/${allianceId}/code`).loginAs(admin!.user)
    assert.isTrue(code.body().data.allianceQrReady)
    assert.equal(code.body().data.qrUrlPath, `/platform/alliances/${allianceId}/code/qr-url`)
  })

  test('2. S3 caído no tumba el alta; qr-url repara o responde 503; 404s tipados', async ({
    client,
    assert,
  }) => {
    modeRef.current = 'fail'
    const created = await client.post(BASE).loginAs(admin!.user).json({
      allianceName: `QR pendiente ${Date.now()}`,
      allianceDefaultCommissionPercent: 4,
    })
    created.assertStatus(201)
    const allianceId = created.body().data.allianceId
    allianceIds.push(allianceId)
    assert.isFalse(created.body().data.allianceDiscountCode.allianceQrReady)

    const unavailable = await acceptServerErrors(
      client.get(`${BASE}/${allianceId}/code/qr-url`)
    ).loginAs(admin!.user)
    unavailable.assertStatus(503)
    unavailable.assertBodyContains({
      key: 'qr-no-disponible',
      code: ALLIANCE_ERROR_CODES.QR_UNAVAILABLE,
    })

    modeRef.current = 'ok'
    const repaired = await acceptServerErrors(
      client.get(`${BASE}/${allianceId}/code/qr-url`)
    ).loginAs(admin!.user)
    repaired.assertStatus(200)
    assert.equal(repaired.body().data.expiresIn, 300)
    const after = await Alliance.query().where('alliance_id', allianceId).firstOrFail()
    assert.isString(after.allianceQrStorageKey)

    const ready = await client.get(`${BASE}/${allianceId}/code`).loginAs(admin!.user)
    assert.isTrue(ready.body().data.allianceQrReady)

    modeRef.current = 'bad-sign'
    const badSign = await acceptServerErrors(
      client.get(`${BASE}/${allianceId}/code/qr-url`)
    ).loginAs(admin!.user)
    badSign.assertStatus(503)
    badSign.assertBodyContains({ code: ALLIANCE_ERROR_CODES.QR_UNAVAILABLE })
    assert.notEqual(typeof badSign.body().data?.url, 'object')

    const unknown = await acceptServerErrors(
      client.get(`${BASE}/999999994/code/qr-url`)
    ).loginAs(admin!.user)
    unknown.assertStatus(404)
    unknown.assertBodyContains({ code: ALLIANCE_ERROR_CODES.NOT_FOUND })

    const bare = await Alliance.create({
      allianceName: `Sin código QR ${Date.now()}`,
      allianceContactName: null,
      allianceContactEmail: null,
      allianceContactPhone: null,
      allianceDefaultCommissionPercent: 3,
      allianceDefaultTermPeriods: null,
      allianceActive: 1,
    })
    allianceIds.push(bare.allianceId)
    const noCode = await acceptServerErrors(
      client.get(`${BASE}/${bare.allianceId}/code/qr-url`)
    ).loginAs(admin!.user)
    noCode.assertStatus(404)
    noCode.assertBodyContains({ code: ALLIANCE_ERROR_CODES.CODE_NOT_FOUND })

    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const routes = await readFile(join(process.cwd(), 'start/routes/platform_alliance_routes.ts'), 'utf8')
    assert.notInclude(routes, 'regenerate')
    assert.notInclude(routes, 'qr.png')
  })
})
