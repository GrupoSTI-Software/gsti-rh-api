import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import { billingGraceSettingCache } from '#services/billing_grace_period_service'

test.group('Platform Billing Settings API (Functional)', (group) => {
  let adminUser: User
  let regularUser: User
  let adminToken: string
  let regularToken: string

  group.each.setup(async () => {
    await db.from('platform_billing_settings').delete()
    await db.from('api_tokens').delete()
    billingGraceSettingCache.invalidate()

    // 1. Obtenemos o creamos la persona base en `people`
    const person = await db.from('people').first()
    let personId = person?.person_id

    if (!personId) {
      const insertedPeople = await db.table('people').insert({ person_first_name: 'Test' })
      personId = insertedPeople[0]
    }

    // 2. Obtenemos o creamos un rol base en `roles`
    const role = await db.from('roles').first()
    let roleId = role?.role_id

    if (!roleId) {
      const insertedRoles = await db.table('roles').insert({ role_name: 'Test Role' })
      roleId = insertedRoles[0]
    }

    // 3. Crear usuario Platform Admin
    adminUser = await User.firstOrCreate(
      { userEmail: 'admin-functional@valanserh.com' },
      {
        userEmail: 'admin-functional@valanserh.com',
        userPassword: 'secretPassword123',
        userActive: 1,
        isPlatformAdmin: true,
        userEmailType: 'institutional',
        personId,
        roleId,
      }
    )

    await db.from('users').where('user_id', adminUser.userId).update({
      is_platform_admin: 1,
      user_active: 1,
    })
    await adminUser.refresh()

    // Generar Access Token real para el Admin
    const createdAdminToken = await User.accessTokens.create(adminUser, ['*'])
    const adminTokenValue = createdAdminToken.value

    if (adminTokenValue) {
      adminToken = adminTokenValue.release()
    }

    // Actualizar el token en BD con origin = 'platform'
    await db
      .from('api_tokens')
      .where('id', String(createdAdminToken.identifier))
      .update({ origin: 'platform' })

    // 4. Crear usuario Regular
    regularUser = await User.firstOrCreate(
      { userEmail: 'regular-functional@valanserh.com' },
      {
        userEmail: 'regular-functional@valanserh.com',
        userPassword: 'secretPassword123',
        userActive: 1,
        isPlatformAdmin: false,
        userEmailType: 'institutional',
        personId,
        roleId,
      }
    )

    await db.from('users').where('user_id', regularUser.userId).update({
      is_platform_admin: 0,
      user_active: 1,
    })
    await regularUser.refresh()

    // Generar Access Token para el usuario regular (origin = 'web' por defecto)
    const createdRegularToken = await User.accessTokens.create(regularUser, ['*'])
    const regularTokenValue = createdRegularToken.value

    if (regularTokenValue) {
      regularToken = regularTokenValue.release()
    }
  })

  group.each.teardown(async () => {
    await db.from('platform_billing_settings').delete()
    billingGraceSettingCache.invalidate()
  })

  test('F-1: GET /api/platform/billing/settings sin autenticación retorna 401', async ({ client }) => {
    const response = await client.get('/api/platform/billing/settings')
    response.assertStatus(401)
  })

  test('F-2: GET /api/platform/billing/settings sin permisos de admin retorna 403', async ({ client }) => {
    const response = await client
      .get('/api/platform/billing/settings')
      .bearerToken(regularToken)

    response.assertStatus(403)
  })

  test('F-3: GET /api/platform/billing/settings con admin retorna la configuración por defecto', async ({ client }) => {
    const response = await client
      .get('/api/platform/billing/settings')
      .bearerToken(adminToken)

    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        graceDays: 10,
        restrictionEnabled: false,
        restrictionEnabledOn: null,
        source: 'default',
        platformBillingSettingId: null,
      },
    })
  })

  test('F-4: PUT /api/platform/billing/settings guarda nueva configuración', async ({ client }) => {
    const response = await client
      .put('/api/platform/billing/settings')
      .bearerToken(adminToken)
      .json({
        graceDays: 15,
        restrictionEnabled: true,
      })

    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        graceDays: 15,
        restrictionEnabled: true,
        source: 'configured',
      },
    })
  })

  test('F-5: PUT /api/platform/billing/settings valida límites de graceDays (1-30)', async ({ client }) => {
    const response = await client
      .put('/api/platform/billing/settings')
      .bearerToken(adminToken)
      .json({
        graceDays: 50,
        restrictionEnabled: false,
      })

    response.assertStatus(422)
  })

  test('F-6: GET /api/platform/billing/settings/history retorna la lista de cambios', async ({ client }) => {
    await client
      .put('/api/platform/billing/settings')
      .bearerToken(adminToken)
      .json({
        graceDays: 12,
        restrictionEnabled: true,
      })

    const response = await client
      .get('/api/platform/billing/settings/history')
      .bearerToken(adminToken)

    response.assertStatus(200)
    response.assertBodyContains({
      meta: { total: 1 },
    })
  })
})