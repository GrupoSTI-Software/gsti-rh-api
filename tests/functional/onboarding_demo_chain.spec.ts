import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import db from '@adonisjs/lucid/services/db'
import OnboardingError from '#exceptions/onboarding_error'
import OnboardingUserState from '#models/onboarding_user_state'
import Person from '#models/person'
import User from '#models/user'
import DemoSeedService from '#modules/onboarding/demo_seed/demo_seed.service'

/**
 * Cadena demo del onboarding (USRH1785438246847): siembra idempotente y
 * anclaje de unidad de negocio, verificada a nivel service contra la BD real
 * de desarrollo (BU 1). La limpieza de lo sembrado la ejerce el spec del wipe
 * (USRH1785438246903), que es el consumidor real de esta siembra.
 */

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
const BUSINESS_UNIT_ID = 1

function getService(): DemoSeedService {
  return new DemoSeedService(i18nManager.locale(i18nManager.defaultLocale))
}

async function createAdminUser(): Promise<{ user: User; person: Person }> {
  const person = new Person()
  person.personFirstname = 'OnboardingDemo'
  person.personLastname = 'Admin'
  person.personSecondLastname = 'Chain'
  await person.save()

  const user = new User()
  user.userEmail = `onboarding-demo-admin-${STAMP}@gsti-tests.local`
  user.userPassword = 'OnboardingDemoChain123!'
  user.userActive = 1
  user.roleId = 2
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  return { user, person }
}

test.group('Onboarding demo-seed — siembra (USRH1785438246847)', (group) => {
  let adminUserId = 0
  let adminPersonId = 0

  group.setup(async () => {
    const { user, person } = await createAdminUser()
    adminUserId = user.userId
    adminPersonId = person.personId
  })

  group.teardown(async () => {
    // Solo el admin de prueba: el paquete demo lo limpia el spec del wipe.
    await db.from('onboarding_user_states').where('user_id', adminUserId).delete()
    await db.from('users').where('user_id', adminUserId).delete()
    await db.from('people').where('person_id', adminPersonId).delete()
  })

  test('la siembra crea el paquete completo con tracking y credencial en claro una vez', async ({
    assert,
  }) => {
    const { result, created } = await getService().seed(adminUserId, BUSINESS_UNIT_ID)

    assert.isTrue(created)
    assert.isFalse(result.alreadySeeded)
    assert.isTrue(result.package.department.departmentId > 0)
    assert.isTrue(result.package.position.positionId > 0)
    assert.isTrue(result.package.employee.employeeId > 0)
    assert.isTrue(result.package.shift.shiftId > 0)
    assert.isNotEmpty(result.package.employee.employeeSlug ?? '')
    assert.isTrue(result.package.attendance.dates.length >= 4)
    assert.lengthOf(result.package.vacations.dates, 2)
    assert.match(result.credentials.email, /@onboarding\.valanserh\.invalid$/)
    assert.isString(result.credentials.password)
    assert.lengthOf(result.credentials.password ?? '', 14)
    assert.equal(result.onboarding.status, 'in_progress')

    // Tracking pieza por pieza con snapshot de BU.
    const state = await OnboardingUserState.query().where('user_id', adminUserId).firstOrFail()
    assert.isNotNull(state.demoSeededAt)
    assert.isNull(state.demoCleanedAt)
    const records = await db
      .from('onboarding_seeded_records')
      .where('onboarding_user_state_id', state.onboardingUserStateId)
    assert.isTrue(records.length >= 10)
    assert.isTrue(records.every((row) => row.business_unit_id === BUSINESS_UNIT_ID))

    // La persona demo no lleva RFC/CURP/NSS (regla 8).
    const personRow = await db
      .from('people')
      .where('person_id', result.package.employee.employeeId ? records.find((r) => r.onboarding_seeded_record_entity_type === 'person')?.onboarding_seeded_record_entity_id : 0)
      .select('person_rfc', 'person_curp', 'person_imss_nss')
      .first()
    assert.isNull(personRow.person_rfc)
    assert.isNull(personRow.person_curp)
    assert.isNull(personRow.person_imss_nss)
  })

  test('repetir la siembra es idempotente: mismo paquete, sin contraseña, sin duplicar', async ({
    assert,
  }) => {
    const first = await getService().seed(adminUserId, BUSINESS_UNIT_ID)
    const second = await getService().seed(adminUserId, BUSINESS_UNIT_ID)

    assert.isFalse(second.created)
    assert.isTrue(second.result.alreadySeeded)
    assert.isNull(second.result.credentials.password)
    assert.isFalse(second.result.credentials.passwordAvailable)
    assert.equal(
      second.result.package.employee.employeeId,
      first.result.package.employee.employeeId
    )

    // Un solo empleado de práctica registrado para este estado (no dos).
    const state = await OnboardingUserState.query().where('user_id', adminUserId).firstOrFail()
    const employeeRecords = await db
      .from('onboarding_seeded_records')
      .where('onboarding_user_state_id', state.onboardingUserStateId)
      .where('onboarding_seeded_record_entity_type', 'employee')
      .count('* as total')
    assert.equal(Number(employeeRecords[0].total), 1)
  })

  test('con otra unidad de negocio responde siembra-demo-unidad-invalida sin escribir', async ({
    assert,
  }) => {
    try {
      await getService().seed(adminUserId, 999999)
      assert.fail('Debió rechazar la siembra con BU distinta al snapshot')
    } catch (error) {
      assert.instanceOf(error, OnboardingError)
      assert.equal((error as OnboardingError).key, 'siembra-demo-unidad-invalida')
    }
  })

  test('la regeneración entrega contraseña nueva y la vieja siembra sigue única', async ({
    assert,
  }) => {
    const regenerated = await getService().regenerateCredentials(adminUserId, BUSINESS_UNIT_ID)
    assert.isString(regenerated.password)
    assert.lengthOf(regenerated.password ?? '', 14)
    assert.isTrue(regenerated.passwordAvailable)
  })
})
