import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import sharp from 'sharp'
import User from '#models/user'
import Person from '#models/person'
import Role from '#models/role'
import ApiToken from '#models/api_token'
import AnnouncementSlide from '#models/announcement_slide'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { ensureRole } from '#tests/helpers/ensure_role'

/**
 * Tests funcionales — administración de slides del deck de anuncios desde la consola
 * de plataforma (`/api/platform/announcement-slides`).
 *
 * Actor de plataforma: mismo molde que `legal_documents_management.spec.ts`
 * (isPlatformAdmin + token de POST /api/platform/auth/login, origin='platform');
 * `client.loginAs` emite token de BO y el guard lo rechaza con 403.
 *
 * El banner se sube al almacenamiento configurado en `.env` (MinIO local en
 * desarrollo), igual que el resto de specs que suben archivos.
 */

const TEST_PASSWORD = 'AnnouncementSlides123!'
const BASE = '/api/platform/announcement-slides'

interface TestActor {
  user: User
  person: Person
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const email = `slides-${emailPrefix}-${randomUUID()}@gsti-tests.local`
  const role = await ensureRole('root')
  const person = await Person.create({
    personFirstname: 'Slides',
    personLastname: 'Test',
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
  return { user, person }
}

async function createOwner(): Promise<TestActor> {
  const email = `slides-owner-${randomUUID()}@gsti-tests.local`
  const role: Role = await ensureRole('owner')
  const person = await Person.create({
    personFirstname: 'Slides',
    personLastname: 'Owner',
    personSecondLastname: 'owner',
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  return { user, person }
}

async function loginPlatformConsole(client: ApiClient, email: string): Promise<string> {
  const response = await client.post('/api/platform/auth/login').json({
    userEmail: email,
    userPassword: TEST_PASSWORD,
  })
  response.assertStatus(200)
  const token = (response.body() as { data?: { token?: string } }).data?.token
  if (!token) throw new Error('Login de plataforma no devolvió token')
  return token
}

async function cleanupActor(actor: TestActor | null): Promise<void> {
  if (!actor) return
  await ApiToken.query().where('tokenable_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

/** Clave del listado de empleados, tomada de su declaración del gate. */
function employeesListKey(): string {
  const { module, action } = EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexEmployees
  return `${module}:${String(action)}`
}

test.group('Slides de anuncios (plataforma) - 401 sin autenticación', () => {
  test('GET listado responde 401', async ({ client }) => {
    const response = await client.get(BASE)
    response.assertStatus(401)
  })

  test('POST crear responde 401', async ({ client }) => {
    const response = await client
      .post(BASE)
      .json({ type: 'feature', title: 'x', bodyHtml: '<p>x</p>' })
    response.assertStatus(401)
  })

  test('POST publicar responde 401', async ({ client }) => {
    const response = await client.post(`${BASE}/1/publish`)
    response.assertStatus(401)
  })
})

test.group('Slides de anuncios (plataforma) - 403 sin sesión de consola', (group) => {
  let owner: TestActor | null = null
  let platformAdminWithBoToken: TestActor | null = null

  group.setup(async () => {
    owner = await createOwner()
    platformAdminWithBoToken = await createActor('platform-bo', true)
  })

  group.teardown(async () => {
    await cleanupActor(owner)
    await cleanupActor(platformAdminWithBoToken)
  })

  test('owner con token de BO recibe 403 al listar', async ({ client, assert }) => {
    const response = await client.get(BASE).loginAs(owner!.user)
    response.assertStatus(403)
    assert.equal(response.body().key, 'AUTH.PLATFORM.FORBIDDEN')
  })

  test('owner con token de BO recibe 403 al crear', async ({ client, assert }) => {
    const response = await client
      .post(BASE)
      .loginAs(owner!.user)
      .json({ type: 'feature', title: 'x', bodyHtml: '<p>x</p>' })
    response.assertStatus(403)
    assert.equal(response.body().key, 'AUTH.PLATFORM.FORBIDDEN')
  })

  test('isPlatformAdmin con token de BO recibe 403 al publicar', async ({ client, assert }) => {
    const response = await client.post(`${BASE}/1/publish`).loginAs(platformAdminWithBoToken!.user)
    response.assertStatus(403)
    assert.equal(response.body().key, 'AUTH.PLATFORM.FORBIDDEN')
  })
})

test.group('Slides de anuncios (plataforma) - flujo completo', (group) => {
  let admin: TestActor | null = null
  let token = ''
  let slideId = 0
  let firstPublishedAt = ''
  const createdIds: number[] = []

  group.setup(async () => {
    admin = await createActor('platform', true)
  })

  group.teardown(async () => {
    if (createdIds.length > 0) {
      await AnnouncementSlide.query().whereIn('announcement_slide_id', createdIds).delete()
    }
    await cleanupActor(admin)
  })

  test('el actor de plataforma inicia sesión en la consola', async ({ client, assert }) => {
    token = await loginPlatformConsole(client, admin!.user.userEmail)
    assert.isNotEmpty(token)
  })

  test('POST crea en borrador y sanea el HTML (sin script ni on*, enlaces forzados)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(BASE)
      .bearerToken(token)
      .json({
        type: 'feature',
        sortOrder: 3,
        title: 'Novedad de prueba',
        bodyHtml:
          '<p onclick="steal()">Hola <strong>equipo</strong><script>alert(1)</script></p>' +
          '<a href="https://valanserh.com" target="_self" onmouseover="x()">ver</a>' +
          '<a href="javascript:alert(1)">malo</a>',
      })

    response.assertStatus(201)
    const data = response.body().data
    slideId = data.id
    createdIds.push(slideId)

    assert.equal(data.status, 'draft')
    assert.isNull(data.publishedAt)
    assert.isNull(data.permissionKey)
    assert.isNull(data.bannerUrl)
    assert.notInclude(data.bodyHtml, '<script')
    assert.notInclude(data.bodyHtml, 'alert(1)')
    assert.notInclude(data.bodyHtml, 'onclick')
    assert.notInclude(data.bodyHtml, 'onmouseover')
    assert.notInclude(data.bodyHtml, 'javascript:')
    assert.include(
      data.bodyHtml,
      '<a href="https://valanserh.com" target="_blank" rel="noopener noreferrer">ver</a>'
    )
  })

  test('POST con permissionKey inexistente responde 422 permiso-inexistente', async ({
    client,
    assert,
  }) => {
    const response = await client.post(BASE).bearerToken(token).json({
      type: 'feature',
      title: 'x',
      bodyHtml: '<p>x</p>',
      permissionKey: 'modulo-inexistente:leer',
    })
    response.assertStatus(422)
    assert.equal(response.body().key, 'permiso-inexistente')
    assert.isString(response.body().title)
    assert.isString(response.body().detail)
  })

  test('POST sin título responde 422 datos-invalidos con los campos', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(BASE)
      .bearerToken(token)
      .json({ type: 'feature', bodyHtml: '<p>x</p>' })
    response.assertStatus(422)
    assert.equal(response.body().key, 'datos-invalidos')
    assert.include(response.body().data.fields, 'title')
  })

  test('POST con un cuerpo que no deja contenido al sanear responde 422 cuerpo-vacio', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(BASE)
      .bearerToken(token)
      .json({ type: 'feature', title: 'x', bodyHtml: '<script>alert(1)</script>' })
    response.assertStatus(422)
    assert.equal(response.body().key, 'cuerpo-vacio')
  })

  test('PUT con permissionKey inexistente responde 422', async ({ client, assert }) => {
    const response = await client
      .put(`${BASE}/${slideId}`)
      .bearerToken(token)
      .json({ permissionKey: 'empleados' })
    response.assertStatus(422)
    assert.equal(response.body().key, 'permiso-inexistente')
  })

  test('PUT edita y acepta una clave del catálogo', async ({ client, assert }) => {
    const response = await client
      .put(`${BASE}/${slideId}`)
      .bearerToken(token)
      .json({ permissionKey: employeesListKey(), sortOrder: 7 })
    response.assertStatus(200)
    assert.equal(response.body().data.permissionKey, employeesListKey())
    assert.equal(response.body().data.sortOrder, 7)
    assert.equal(response.body().data.title, 'Novedad de prueba')
  })

  test('POST publish publica y fija publishedAt en ISO UTC con milisegundos', async ({
    client,
    assert,
  }) => {
    const response = await client.post(`${BASE}/${slideId}/publish`).bearerToken(token)
    response.assertStatus(200)
    assert.equal(response.body().data.status, 'published')
    firstPublishedAt = response.body().data.publishedAt
    assert.match(firstPublishedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  test('PUT sobre un publicado no cambia publishedAt', async ({ client, assert }) => {
    const response = await client
      .put(`${BASE}/${slideId}`)
      .bearerToken(token)
      .json({ title: 'Novedad editada' })
    response.assertStatus(200)
    assert.equal(response.body().data.title, 'Novedad editada')
    assert.equal(response.body().data.status, 'published')
    assert.equal(response.body().data.publishedAt, firstPublishedAt)
  })

  test('archive conserva publishedAt y republicar no la mueve', async ({ client, assert }) => {
    const archived = await client.post(`${BASE}/${slideId}/archive`).bearerToken(token)
    archived.assertStatus(200)
    assert.equal(archived.body().data.status, 'archived')
    assert.equal(archived.body().data.publishedAt, firstPublishedAt)

    const republished = await client.post(`${BASE}/${slideId}/publish`).bearerToken(token)
    republished.assertStatus(200)
    assert.equal(republished.body().data.status, 'published')
    assert.equal(republished.body().data.publishedAt, firstPublishedAt)

    const row = await AnnouncementSlide.findOrFail(slideId)
    assert.equal(row.announcementSlidePublishedAt?.toUTC().toISO(), firstPublishedAt)
  })

  test('GET por id y listado filtrado', async ({ client, assert }) => {
    const detail = await client.get(`${BASE}/${slideId}`).bearerToken(token)
    detail.assertStatus(200)
    assert.equal(detail.body().data.id, slideId)

    const list = await client
      .get(BASE)
      .qs({ type: 'feature', status: 'published' })
      .bearerToken(token)
    list.assertStatus(200)
    const slides = list.body().data.slides as Array<{ id: number; type: string; status: string }>
    assert.isTrue(slides.some((s) => s.id === slideId))
    assert.isTrue(slides.every((s) => s.type === 'feature' && s.status === 'published'))
  })

  test('GET listado con filtro inválido responde 422', async ({ client, assert }) => {
    const response = await client.get(BASE).qs({ status: 'borrado' }).bearerToken(token)
    response.assertStatus(422)
    assert.equal(response.body().key, 'datos-invalidos')
  })

  test('GET de un id inexistente responde 404 slide-inexistente', async ({ client, assert }) => {
    const response = await client.get(`${BASE}/999999999`).bearerToken(token)
    response.assertStatus(404)
    assert.equal(response.body().key, 'slide-inexistente')
  })

  test('banner: un archivo que no es imagen responde 422', async ({ client, assert }) => {
    const response = await client
      .post(`${BASE}/${slideId}/banner`)
      .bearerToken(token)
      .file('banner', Buffer.from('no soy una imagen'), {
        filename: 'banner.txt',
        contentType: 'text/plain',
      })
    response.assertStatus(422)
    assert.isString(response.body().key)
  })

  test('banner: una imagen se sube privada y la respuesta trae la URL firmada', async ({
    client,
    assert,
  }) => {
    const png = await sharp({
      create: { width: 8, height: 4, channels: 3, background: { r: 30, g: 90, b: 200 } },
    })
      .png()
      .toBuffer()

    const response = await client
      .post(`${BASE}/${slideId}/banner`)
      .bearerToken(token)
      .file('banner', png, { filename: 'banner.png', contentType: 'image/png' })

    response.assertStatus(200)
    const data = response.body().data
    assert.match(data.bannerPath, /\/announcement-slides\/[^/]+\.png$/)
    assert.isString(data.bannerUrl)
    assert.include(data.bannerUrl, 'X-Amz-Signature=')
  })
})
