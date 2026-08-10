import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../../../app/constants/billing_subscription_error_codes.js'
import { BillingSubscriptionServiceError } from '../../../app/exceptions/billing_subscription_service_error.js'
import { assertBillingOwner } from '../../../app/helpers/billing_owner_guard.js'
import RoleSeeder from '#database/seeders/0006_role_seeder'
import Role from '#models/role'
import Person from '#models/person'
import User from '#models/user'

async function ensureRole(slug: string): Promise<Role> {
  if (slug === 'owner') {
    await new RoleSeeder({} as never).run()
  }
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', slug).first()
  if (!role) {
    throw new Error(`El rol "${slug}" es requerido para este test. Ejecuta los seeders primero.`)
  }
  return role
}

async function createUserWithRole(role: Role): Promise<{ user: User; person: Person }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const person = new Person()
  person.personFirstname = 'BillingOwner'
  person.personLastname = 'Test'
  person.personSecondLastname = stamp
  person.personEmail = `billing-owner-${stamp}@gsti-tests.local`
  await person.save()

  const user = new User()
  user.userEmail = `billing-owner-${stamp}@gsti-tests.local`
  user.userPassword = 'BillingOwnerTest123!'
  user.userActive = 1
  user.roleId = role.roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  return { user, person }
}

async function cleanup(user: User, person: Person) {
  await User.query().where('user_id', user.userId).delete()
  await Person.query().where('person_id', person.personId).delete()
}

function buildCtxStub(user: User): HttpContext {
  return {
    auth: { user },
  } as unknown as HttpContext
}

test.group('assertBillingOwner — USRH1786107870847', () => {
  test('owner, root y super-administrador pasan el gate', async ({ assert }) => {
    const ownerRole = await ensureRole('owner')
    const rootRole = await ensureRole('root')
    const superAdminRole = await ensureRole('super-administrador')

    const owner = await createUserWithRole(ownerRole)
    const root = await createUserWithRole(rootRole)
    const superAdmin = await createUserWithRole(superAdminRole)

    try {
      await assertBillingOwner(buildCtxStub(owner.user))
      await assertBillingOwner(buildCtxStub(root.user))
      await assertBillingOwner(buildCtxStub(superAdmin.user))
      assert.isTrue(true)
    } finally {
      await cleanup(owner.user, owner.person)
      await cleanup(root.user, root.person)
      await cleanup(superAdmin.user, superAdmin.person)
    }
  })

  test('empleado recibe 403 PLT.SUB.FORBIDDEN_ROLE', async ({ assert }) => {
    const employeeRole = await ensureRole('empleado')
    const { user, person } = await createUserWithRole(employeeRole)

    try {
      await assertBillingOwner(buildCtxStub(user))
      assert.fail('debió lanzar BillingSubscriptionServiceError')
    } catch (error) {
      assert.instanceOf(error, BillingSubscriptionServiceError)
      assert.equal(
        (error as BillingSubscriptionServiceError).errorCode,
        BILLING_SUBSCRIPTION_ERROR_CODES.FORBIDDEN_ROLE
      )
      assert.equal((error as BillingSubscriptionServiceError).httpStatus, 403)
      assert.equal((error as BillingSubscriptionServiceError).key, 'solo-el-dueno-de-la-cuenta')
    } finally {
      await cleanup(user, person)
    }
  })
})

test.group('billing_routes — change-preview (USRH1786107870847)', () => {
  test('expone ruta con limitador billing-preview por userId', ({ assert }) => {
    const content = readFileSync(join(process.cwd(), 'start/routes/billing_routes.ts'), 'utf-8')

    assert.include(content, "limiter.define('billing-preview'")
    assert.include(content, 'billing-preview:${userId}')
    assert.include(content, '/subscription/change-preview')
    assert.include(content, 'previewSubscriptionChange')
    assert.include(content, '.use(billingPreviewRateLimit)')
  })

  test('OpenAPI documenta change-preview con schemas PLT.SUB.*', ({ assert }) => {
    const content = readFileSync(join(process.cwd(), 'docs/openapi.yaml'), 'utf-8')
    const sectionStart = content.indexOf('/api/billing/subscription/change-preview:')
    const sectionEnd = content.indexOf('/api/billing/subscription/changes/increase:')
    const section = content.slice(sectionStart, sectionEnd)

    assert.include(section, 'BillingSubscriptionChangePreviewResponse')
    assert.include(section, 'BillingSubscriptionApiError')
    assert.include(section, 'PLT.SUB.FORBIDDEN_ROLE')
    assert.include(section, 'PLT.SUB.NO_LIVE_SUBSCRIPTION')
    assert.include(section, 'PLT.SUB.EMPLOYEES_NOT_BLOCK_OF_TEN')
    assert.include(section, "'429':")
  })
})

test.group('billing_routes — changes/increase (USRH1786107870850)', () => {
  test('expone ruta con limitador billing-change-request por userId', ({ assert }) => {
    const content = readFileSync(join(process.cwd(), 'start/routes/billing_routes.ts'), 'utf-8')

    assert.include(content, "limiter.define('billing-change-request'")
    assert.include(content, 'billing-change-request:${userId}')
    assert.include(content, '/subscription/changes/increase')
    assert.include(content, 'requestSubscriptionIncrease')
    assert.include(content, '.use(billingChangeRequestRateLimit)')
  })

  test('OpenAPI documenta increase con schemas PLT.SUB.*', ({ assert }) => {
    const content = readFileSync(join(process.cwd(), 'docs/openapi.yaml'), 'utf-8')
    const sectionStart = content.indexOf('/api/billing/subscription/changes/increase:')
    const sectionEnd = content.indexOf('/api/billing/subscription/changes/decrease:')
    const section = content.slice(sectionStart, sectionEnd)

    assert.include(section, 'BillingSubscriptionIncreaseRequestResponse')
    assert.include(section, 'PLT.SUB.CHANGE_NOT_AN_INCREASE')
    assert.include(section, 'PLT.SUB.CHANGE_CONFLICT')
    assert.include(section, "'201':")
    assert.include(section, "'409':")
    assert.include(section, "'429':")
  })
})

test.group('billing_routes — changes/decrease y cancel (USRH1786107870853)', () => {
  test('expone rutas con limitador billing-subscription-change por userId', ({ assert }) => {
    const content = readFileSync(join(process.cwd(), 'start/routes/billing_routes.ts'), 'utf-8')

    assert.include(content, "limiter.define('billing-subscription-change'")
    assert.include(content, 'billing-subscription-change:${userId}')
    assert.include(content, '/subscription/changes/decrease')
    assert.include(content, '/subscription/changes/cancel')
    assert.include(content, 'scheduleSubscriptionDecrease')
    assert.include(content, 'cancelSubscriptionChange')
    assert.include(content, '.use(billingSubscriptionChangeRateLimit)')
  })

  test('OpenAPI documenta decrease y cancel con schemas PLT.SUB.*', ({ assert }) => {
    const content = readFileSync(join(process.cwd(), 'docs/openapi.yaml'), 'utf-8')
    const sectionStart = content.indexOf('/api/billing/subscription/changes/decrease:')
    const sectionEnd = content.indexOf('/api/employees/quota:')
    const section = content.slice(sectionStart, sectionEnd)

    assert.include(section, 'BillingSubscriptionChangeRecordResponse')
    assert.include(section, 'PLT.SUB.CHANGE_NOT_A_DECREASE')
    assert.include(section, 'PLT.SUB.NO_LIVE_CHANGE')
    assert.include(section, "'201':")
    assert.include(section, "'200':")
    assert.include(section, "'429':")
  })
})
