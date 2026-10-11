import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Person from '#models/person'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import AnnouncementSlide from '#models/announcement_slide'
import UserAnnouncementState from '#models/user_announcement_state'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import AnnouncementSlideRepositoryMysql from '#modules/announcements/announcement_slide.repository.mysql'
import type { AnnouncementSlideContent } from '#modules/announcements/announcement_slide.repository'
import { ensureRole } from '#tests/helpers/ensure_role'

/**
 * Tests funcionales — deck de anuncios del usuario (`GET /api/announcements/me/deck`).
 *
 * El deck lee TODOS los slides publicados de la BD. Para que el resultado dependa solo
 * de los fixtures, el grupo archiva los publicados que ya existían (los del seeder
 * 0066) y los devuelve a `published` al terminar.
 *
 * Permisos: un rol propio con la concesión del listado de empleados, otro sin
 * concesiones y `owner` (salvoconducto `standard`), resueltos por el mismo
 * `PermissionGateService` que usa `permissionGate`.
 */

const TEST_PASSWORD = 'AnnouncementsDeck123!'
const MARK = '2026-01-01T00:00:00.000Z'
const repository = new AnnouncementSlideRepositoryMysql()

interface TestActor {
  user: User
  person: Person
}

function employeesListDeclaration() {
  const { module, action } = EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexEmployees
  return { moduleSlug: module, permissionSlug: String(action), key: `${module}:${String(action)}` }
}

async function createActor(prefix: string, role: Role): Promise<TestActor> {
  const email = `deck-${prefix}-${randomUUID()}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Deck',
    personLastname: 'Test',
    personSecondLastname: prefix,
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

async function cleanupActor(actor: TestActor | null): Promise<void> {
  if (!actor) return
  await UserAnnouncementState.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function createRole(slug: string): Promise<Role> {
  return Role.create({
    roleName: `Deck ${slug}`,
    roleSlug: slug,
    roleDescription: 'Fixture de test',
    roleActive: 1,
    roleManagementDays: 10,
  })
}

/** Crea un slide publicado; con `publishedAt` fija la fecha (milisegundos) a mano. */
async function publishedSlide(
  content: AnnouncementSlideContent,
  publishedAt?: string
): Promise<AnnouncementSlide> {
  const draft = await repository.createDraft(content)
  await repository.publish(draft.announcementSlideId)
  if (publishedAt) {
    await db
      .knexQuery()
      .table(AnnouncementSlide.table)
      .where('announcement_slide_id', draft.announcementSlideId)
      .update({ announcement_slide_published_at: new Date(publishedAt) })
  }
  return AnnouncementSlide.findOrFail(draft.announcementSlideId)
}

async function setMark(actor: TestActor, isoDate: string): Promise<void> {
  await UserAnnouncementState.create({
    userId: actor.user.userId,
    userAnnouncementStateLastSeenAt: DateTime.fromISO(isoDate, { zone: 'utc' }),
  })
}

test.group('Anuncios /api/announcements/me/deck - auth', () => {
  test('GET responde 401 sin autenticación', async ({ client }) => {
    const response = await client.get('/api/announcements/me/deck')
    response.assertStatus(401)
  })
})

test.group('Anuncios /api/announcements/me/deck - selección', (group) => {
  const stamp = randomUUID().slice(0, 8)
  let preexistingPublishedIds: number[] = []
  const fixtureIds: number[] = []
  let grantedRole: Role
  let plainRole: Role
  let granted: TestActor | null = null
  let plain: TestActor | null = null
  let owner: TestActor | null = null
  let grantedWithMark: TestActor | null = null
  let plainWithMark: TestActor | null = null
  let onboardingOpen: AnnouncementSlide
  let onboardingGated: AnnouncementSlide
  let featureOpen: AnnouncementSlide
  let featureGated: AnnouncementSlide
  let expectedLatest: string | null = null

  group.setup(async () => {
    const preexisting = await AnnouncementSlide.query().where(
      'announcement_slide_status',
      'published'
    )
    preexistingPublishedIds = preexisting.map((s) => s.announcementSlideId)
    if (preexistingPublishedIds.length > 0) {
      await db
        .knexQuery()
        .table(AnnouncementSlide.table)
        .whereIn('announcement_slide_id', preexistingPublishedIds)
        .update({ announcement_slide_status: 'archived' })
    }

    const declaration = employeesListDeclaration()
    const systemModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', declaration.moduleSlug)
      .firstOrFail()
    const permission = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', systemModule.systemModuleId)
      .where('system_permission_slug', declaration.permissionSlug)
      .firstOrFail()

    grantedRole = await createRole(`deck-granted-${stamp}`)
    plainRole = await createRole(`deck-plain-${stamp}`)
    await RoleSystemPermission.create({
      roleId: grantedRole.roleId,
      systemPermissionId: permission.systemPermissionId,
    })

    granted = await createActor('granted', grantedRole)
    plain = await createActor('plain', plainRole)
    owner = await createActor('owner', await ensureRole('owner'))
    grantedWithMark = await createActor('granted-mark', grantedRole)
    plainWithMark = await createActor('plain-mark', plainRole)
    await setMark(grantedWithMark, MARK)
    await setMark(plainWithMark, MARK)

    onboardingOpen = await publishedSlide({
      type: 'onboarding',
      sortOrder: 1,
      title: 'Bienvenida abierta',
      bodyHtml: '<p>a</p>',
      permissionKey: null,
    })
    await repository.setBannerPath(onboardingOpen.announcementSlideId, 'valanserh/test/banner.jpg')
    onboardingGated = await publishedSlide({
      type: 'onboarding',
      sortOrder: 2,
      title: 'Bienvenida con permiso',
      bodyHtml: '<p>b</p>',
      permissionKey: declaration.key,
    })
    const onboardingDraft = await repository.createDraft({
      type: 'onboarding',
      sortOrder: 0,
      title: 'Bienvenida en borrador',
      bodyHtml: '<p>c</p>',
      permissionKey: null,
    })
    featureOpen = await publishedSlide(
      {
        type: 'feature',
        sortOrder: 1,
        title: 'Novedad abierta',
        bodyHtml: '<p>d</p>',
        permissionKey: null,
      },
      '2026-02-01T10:00:00.123Z'
    )
    featureGated = await publishedSlide(
      {
        type: 'feature',
        sortOrder: 1,
        title: 'Novedad con permiso',
        bodyHtml: '<p>e</p>',
        permissionKey: declaration.key,
      },
      '2026-02-02T10:00:00.456Z'
    )
    const featureOld = await publishedSlide(
      {
        type: 'feature',
        sortOrder: 1,
        title: 'Novedad vieja',
        bodyHtml: '<p>f</p>',
        permissionKey: null,
      },
      '2025-12-31T23:59:59.999Z'
    )
    const featureArchived = await publishedSlide(
      {
        type: 'feature',
        sortOrder: 1,
        title: 'Novedad archivada',
        bodyHtml: '<p>g</p>',
        permissionKey: null,
      },
      '2026-03-01T00:00:00.000Z'
    )
    await repository.archive(featureArchived.announcementSlideId)

    fixtureIds.push(
      onboardingOpen.announcementSlideId,
      onboardingGated.announcementSlideId,
      onboardingDraft.announcementSlideId,
      featureOpen.announcementSlideId,
      featureGated.announcementSlideId,
      featureOld.announcementSlideId,
      featureArchived.announcementSlideId
    )

    // Máximo de los publicados: las bienvenidas se publicaron "ahora", después de
    // las fechas fijas de las novedades.
    const published = await AnnouncementSlide.query().where(
      'announcement_slide_status',
      'published'
    )
    expectedLatest = published
      .map((s) => s.announcementSlidePublishedAt!)
      .reduce((a, b) => (a.toMillis() >= b.toMillis() ? a : b))
      .toUTC()
      .toISO()
  })

  group.teardown(async () => {
    await AnnouncementSlide.query().whereIn('announcement_slide_id', fixtureIds).delete()
    if (preexistingPublishedIds.length > 0) {
      await db
        .knexQuery()
        .table(AnnouncementSlide.table)
        .whereIn('announcement_slide_id', preexistingPublishedIds)
        .update({ announcement_slide_status: 'published' })
    }
    for (const actor of [granted, plain, owner, grantedWithMark, plainWithMark]) {
      await cleanupActor(actor)
    }
    for (const role of [grantedRole, plainRole]) {
      if (!role) continue
      await RoleSystemPermission.query().where('role_id', role.roleId).delete()
      await Role.query().where('role_id', role.roleId).delete()
    }
  })

  test('sin marca y sin el permiso: solo la bienvenida abierta, con banner firmado', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/announcements/me/deck').loginAs(plain!.user)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')
    const { slides, latestPublishedAt, lastSeenAt } = body.data
    assert.deepEqual(
      slides.map((s: { id: number }) => s.id),
      [onboardingOpen.announcementSlideId]
    )
    assert.deepEqual(Object.keys(slides[0]).sort(), [
      'bannerUrl',
      'bodyHtml',
      'id',
      'title',
      'type',
    ])
    assert.equal(slides[0].type, 'onboarding')
    assert.include(slides[0].bannerUrl, 'X-Amz-Signature=')
    assert.include(slides[0].bannerUrl, 'X-Amz-Expires=3600')
    assert.isNull(lastSeenAt)
    assert.equal(latestPublishedAt, expectedLatest)
    assert.match(latestPublishedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  test('sin marca y con el permiso concedido: ambas bienvenidas por orden', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/announcements/me/deck').loginAs(granted!.user)
    response.assertStatus(200)
    const slides = response.body().data.slides as Array<{ id: number; bannerUrl: string | null }>
    assert.deepEqual(
      slides.map((s) => s.id),
      [onboardingOpen.announcementSlideId, onboardingGated.announcementSlideId]
    )
    assert.isNull(slides[1].bannerUrl)
  })

  test('owner ve los slides con permiso aunque su rol no tenga la concesión', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/announcements/me/deck').loginAs(owner!.user)
    response.assertStatus(200)
    assert.deepEqual(
      response.body().data.slides.map((s: { id: number }) => s.id),
      [onboardingOpen.announcementSlideId, onboardingGated.announcementSlideId]
    )
  })

  test('con marca: solo novedades posteriores, sin las que piden permiso', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/announcements/me/deck').loginAs(plainWithMark!.user)
    response.assertStatus(200)
    const { slides, latestPublishedAt, lastSeenAt } = response.body().data
    assert.deepEqual(
      slides.map((s: { id: number }) => s.id),
      [featureOpen.announcementSlideId]
    )
    assert.equal(lastSeenAt, MARK)
    // latestPublishedAt no se filtra por permiso ni por tipo.
    assert.equal(latestPublishedAt, expectedLatest)
  })

  test('con marca y con el permiso: novedades posteriores por publishedAt asc', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/announcements/me/deck').loginAs(grantedWithMark!.user)
    response.assertStatus(200)
    assert.deepEqual(
      response.body().data.slides.map((s: { id: number }) => s.id),
      [featureOpen.announcementSlideId, featureGated.announcementSlideId]
    )
  })
})
