import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import db from '@adonisjs/lucid/services/db'
import OnboardingError from '#exceptions/onboarding_error'
import OnboardingUserState from '#models/onboarding_user_state'
import Person from '#models/person'
import User from '#models/user'
import DemoSeedService from '#modules/onboarding/demo_seed/demo_seed.service'
import DemoWipeService from '#modules/onboarding/demo_seed/services/demo_wipe.service'

/**
 * Cadena demo del onboarding contra la BD real de desarrollo (BU 1):
 * siembra idempotente (USRH1785438246847) → limpieza todo-o-nada
 * (USRH1785438246903) → re-siembra fresca → limpieza en modo purga
 * (USRH1785438247062: sin outcome, el status no cambia). El grupo deja la
 * BD sin rastro demo: el wipe final limpia el último paquete.
 */

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
const BUSINESS_UNIT_ID = 1

function seedService(): DemoSeedService {
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

async function countDemoLeftovers(employeeId: number, userId: number) {
  const [employees, assists, exceptions, users, states] = await Promise.all([
    db.from('employees').where('employee_id', employeeId).count('* as total'),
    db.from('assists').where('assist_emp_code', 'like', 'DEMO-%').count('* as total'),
    db.from('shift_exceptions').where('employee_id', employeeId).count('* as total'),
    db.from('users').where('user_id', userId).count('* as total'),
    db.from('onboarding_seeded_records').count('* as total'),
  ])
  return {
    employees: Number(employees[0].total),
    assists: Number(assists[0].total),
    exceptions: Number(exceptions[0].total),
    users: Number(users[0].total),
    trackedRecords: Number(states[0].total),
  }
}

test.group('Onboarding demo — cadena siembra/limpieza/purga', (group) => {
  let adminUserId = 0
  let adminPersonId = 0
  let firstEmployeeId = 0
  let firstDemoUserId = 0

  group.setup(async () => {
    const { user, person } = await createAdminUser()
    adminUserId = user.userId
    adminPersonId = person.personId
  })

  group.teardown(async () => {
    // Al llegar aquí el wipe final ya limpió el paquete; solo se retira el
    // admin de prueba y su estado.
    await db.from('onboarding_user_states').where('user_id', adminUserId).delete()
    await db.from('users').where('user_id', adminUserId).delete()
    await db.from('people').where('person_id', adminPersonId).delete()
  })

  test('la siembra crea el paquete completo con tracking y credencial en claro una vez', async ({
    assert,
  }) => {
    const { result, created } = await seedService().seed(adminUserId, BUSINESS_UNIT_ID)
    firstEmployeeId = result.package.employee.employeeId

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

    const state = await OnboardingUserState.query().where('user_id', adminUserId).firstOrFail()
    assert.isNotNull(state.demoSeededAt)
    assert.isNull(state.demoCleanedAt)
    const records = await db
      .from('onboarding_seeded_records')
      .where('onboarding_user_state_id', state.onboardingUserStateId)
    assert.isTrue(records.length >= 10)
    assert.isTrue(records.every((row) => row.business_unit_id === BUSINESS_UNIT_ID))

    const demoUserRecord = records.find(
      (row) => row.onboarding_seeded_record_entity_type === 'user'
    )
    firstDemoUserId = Number(demoUserRecord?.onboarding_seeded_record_entity_id ?? 0)

    // La persona demo no lleva RFC/CURP/NSS (regla 8).
    const personRecord = records.find(
      (row) => row.onboarding_seeded_record_entity_type === 'person'
    )
    const personRow = await db
      .from('people')
      .where('person_id', Number(personRecord?.onboarding_seeded_record_entity_id ?? 0))
      .select('person_rfc', 'person_curp', 'person_imss_nss')
      .first()
    assert.isNull(personRow.person_rfc)
    assert.isNull(personRow.person_curp)
    assert.isNull(personRow.person_imss_nss)
  })

  test('repetir la siembra es idempotente: mismo paquete, sin contraseña, sin duplicar', async ({
    assert,
  }) => {
    const second = await seedService().seed(adminUserId, BUSINESS_UNIT_ID)

    assert.isFalse(second.created)
    assert.isTrue(second.result.alreadySeeded)
    assert.isNull(second.result.credentials.password)
    assert.isFalse(second.result.credentials.passwordAvailable)
    assert.equal(second.result.package.employee.employeeId, firstEmployeeId)

    const state = await OnboardingUserState.query().where('user_id', adminUserId).firstOrFail()
    const employeeRecords = await db
      .from('onboarding_seeded_records')
      .where('onboarding_user_state_id', state.onboardingUserStateId)
      .where('onboarding_seeded_record_entity_type', 'employee')
      .count('* as total')
    assert.equal(Number(employeeRecords[0].total), 1)
  })

  test('con otra unidad de negocio la siembra responde siembra-demo-unidad-invalida', async ({
    assert,
  }) => {
    try {
      await seedService().seed(adminUserId, 999999)
      assert.fail('Debió rechazar la siembra con BU distinta al snapshot')
    } catch (error) {
      assert.instanceOf(error, OnboardingError)
      assert.equal((error as OnboardingError).key, 'siembra-demo-unidad-invalida')
    }
  })

  test('la regeneración entrega contraseña nueva y revoca las sesiones del demo', async ({
    assert,
  }) => {
    const regenerated = await seedService().regenerateCredentials(adminUserId, BUSINESS_UNIT_ID)
    assert.isString(regenerated.password)
    assert.lengthOf(regenerated.password ?? '', 14)
    assert.isTrue(regenerated.passwordAvailable)

    const tokens = await db
      .from('api_tokens')
      .where('tokenable_id', firstDemoUserId)
      .count('* as total')
    assert.equal(Number(tokens[0].total), 0)
  })

  test('el wipe con BU distinta al snapshot responde 409 sin borrar nada', async ({ assert }) => {
    try {
      await new DemoWipeService().wipeDemoSeed({
        adminUserId,
        expectedBusinessUnitId: 999999,
        outcome: 'completed',
      })
      assert.fail('Debió rechazar el wipe con BU distinta al snapshot')
    } catch (error) {
      assert.instanceOf(error, OnboardingError)
      assert.equal((error as OnboardingError).key, 'siembra-demo-unidad-invalida')
    }

    const leftovers = await countDemoLeftovers(firstEmployeeId, firstDemoUserId)
    assert.equal(leftovers.employees, 1)
    assert.equal(leftovers.users, 1)
  })

  test('el wipe con outcome completed deja la cuenta sin rastro y cierra el recorrido', async ({
    assert,
  }) => {
    const result = await new DemoWipeService().wipeDemoSeed({
      adminUserId,
      expectedBusinessUnitId: BUSINESS_UNIT_ID,
      outcome: 'completed',
    })

    assert.isFalse(result.alreadyWiped)
    assert.equal(result.wiped.employees, 1)
    assert.equal(result.wiped.users, 1)
    assert.equal(result.wiped.people, 1)
    assert.equal(result.wiped.departments, 1)
    assert.equal(result.wiped.positions, 1)
    assert.equal(result.wiped.shifts, 1)
    assert.isTrue(result.wiped.assists >= 8)
    assert.equal(result.wiped.shiftExceptions, 2)

    const leftovers = await countDemoLeftovers(firstEmployeeId, firstDemoUserId)
    assert.equal(leftovers.employees, 0)
    assert.equal(leftovers.assists, 0)
    assert.equal(leftovers.exceptions, 0)
    assert.equal(leftovers.users, 0)
    assert.equal(leftovers.trackedRecords, 0)

    const state = await OnboardingUserState.query().where('user_id', adminUserId).firstOrFail()
    assert.equal(state.onboardingUserStateStatus, 'completed')
    assert.isNotNull(state.demoCleanedAt)
  })

  test('repetir el wipe es inofensivo: alreadyWiped y el outcome pedido se aplica', async ({
    assert,
  }) => {
    const result = await new DemoWipeService().wipeDemoSeed({
      adminUserId,
      expectedBusinessUnitId: BUSINESS_UNIT_ID,
      outcome: 'dismissed',
    })

    assert.isTrue(result.alreadyWiped)
    assert.equal(result.wiped.employees, 0)

    const state = await OnboardingUserState.query().where('user_id', adminUserId).firstOrFail()
    assert.equal(state.onboardingUserStateStatus, 'dismissed')
  })

  test('tras la limpieza, una nueva siembra prepara un juego fresco y el wipe en modo purga no toca el status', async ({
    assert,
  }) => {
    const fresh = await seedService().seed(adminUserId, BUSINESS_UNIT_ID)
    assert.isTrue(fresh.created)
    assert.notEqual(fresh.result.package.employee.employeeId, firstEmployeeId)
    assert.isString(fresh.result.credentials.password)

    const stateBefore = await OnboardingUserState.query()
      .where('user_id', adminUserId)
      .firstOrFail()
    assert.equal(stateBefore.onboardingUserStateStatus, 'in_progress')

    // Modo purga (USRH1785438247062): sin outcome — borra y marca la limpieza
    // pero NUNCA cierra el recorrido del administrador.
    const purge = await new DemoWipeService().wipeDemoSeed({
      onboardingUserStateId: stateBefore.onboardingUserStateId,
    })
    assert.isFalse(purge.alreadyWiped)
    assert.isNull(purge.outcome)
    assert.equal(purge.wiped.employees, 1)

    const stateAfter = await OnboardingUserState.query()
      .where('user_id', adminUserId)
      .firstOrFail()
    assert.equal(stateAfter.onboardingUserStateStatus, 'in_progress')
    assert.isNotNull(stateAfter.demoCleanedAt)

    const leftovers = await countDemoLeftovers(
      fresh.result.package.employee.employeeId,
      firstDemoUserId
    )
    assert.equal(leftovers.employees, 0)
    assert.equal(leftovers.trackedRecords, 0)
  })
})
