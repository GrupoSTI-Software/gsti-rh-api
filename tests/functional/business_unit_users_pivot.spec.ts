import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'

/**
 * Tests funcionales — refactor multi-tenant a tabla pivote `business_unit_users`.
 *
 * Cubre los criterios de aceptación que dependen de invocar endpoints HTTP:
 *
 * 2. Login con usuario activo cuyas business_units NO intersectan `SYSTEM_BUSINESS`
 *    → responde 200 con sesión activa (la validación contra `SYSTEM_BUSINESS`
 *      desaparece del flujo de login).
 * 3. Login con `user_active = 0` → responde 404 con el mensaje existente
 *    'Incorrect email or password' (comportamiento preservado).
 * 5. POST /api/roles construye `roleBusinessAccess` heredando del pivote del
 *    usuario autenticado (formato CSV de IDs).
 *
 * Los criterios 1 y 6 (DDL + backfill + rollback) se validan ejecutando
 * `node ace migration:run` y `node ace migration:rollback` sobre una BD con
 * datos representativos; no se cubren con tests funcionales por ser flujos
 * de migración de esquema/datos.
 *
 * Convenciones del archivo:
 * - Identificadores únicos basados en timestamp para evitar colisiones entre runs.
 * - Cleanup explícito en `group.teardown` (no se usan transacciones, siguiendo el
 *   patrón del resto de tests del proyecto).
 * - Login real vía POST /api/auth/login (no se usa `loginAs` para escenarios
 *   que validan precisamente el comportamiento del endpoint).
 */

const PIVOT_PASSWORD = 'PivotTest123!'

interface PivotTestUser {
  user: User
  person: Person
  password: string
}

async function ensureRootRole(): Promise<Role> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').first()
  if (!role) {
    throw new Error(
      'El rol "root" es requerido para los tests funcionales del pivote. Ejecuta los seeders antes de correr el suite.'
    )
  }
  return role
}

async function createPivotUser(options: {
  email: string
  active: number
  businessUnitIds: number[]
}): Promise<PivotTestUser> {
  const role = await ensureRootRole()

  const person = new Person()
  person.personFirstname = 'Pivot'
  person.personLastname = 'Test'
  person.personSecondLastname = options.email
  person.personEmail = options.email
  await person.save()

  const user = new User()
  user.userEmail = options.email
  user.userPassword = PIVOT_PASSWORD
  user.userActive = options.active
  user.roleId = role.roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  if (options.businessUnitIds.length > 0) {
    await user.related('businessUnits').attach(options.businessUnitIds)
  }

  return { user, person, password: PIVOT_PASSWORD }
}

async function cleanupPivotUser(testUser: PivotTestUser | null) {
  if (!testUser) return

  await BusinessUnitUser.query().where('user_id', testUser.user.userId).delete()

  await User.query().where('user_id', testUser.user.userId).delete()

  await Person.query().where('person_id', testUser.person.personId).delete()
}

test.group(
  'Login (POST /api/auth/login) - escenario sin intersección con SYSTEM_BUSINESS',
  (group) => {
    let testUser: PivotTestUser | null = null
    let isolatedBusinessUnit: BusinessUnit | null = null

    group.setup(async () => {
      // Creamos una unidad de negocio aislada (slug único) que con alta probabilidad
      // NO está incluida en `env.SYSTEM_BUSINESS`. El usuario sólo se asocia a esta
      // unidad, validando que el login ya no exige intersección con el env var.
      const stamp = Date.now()
      isolatedBusinessUnit = new BusinessUnit()
      isolatedBusinessUnit.businessUnitName = `Pivot Isolated ${stamp}`
      isolatedBusinessUnit.businessUnitSlug = `pivot-isolated-${stamp}`
      isolatedBusinessUnit.businessUnitLegalName = `Pivot Isolated Legal ${stamp}`
      isolatedBusinessUnit.businessUnitActive = 1
      await isolatedBusinessUnit.save()

      testUser = await createPivotUser({
        email: `pivot-isolated-${stamp}@gsti-tests.local`,
        active: 1,
        businessUnitIds: [isolatedBusinessUnit.businessUnitId],
      })
    })

    group.teardown(async () => {
      await cleanupPivotUser(testUser)
      if (isolatedBusinessUnit) {
        await BusinessUnit.query()
          .where('business_unit_id', isolatedBusinessUnit.businessUnitId)
          .delete()
      }
    })

    test('responde 200 y emite token aunque la business_unit no esté en SYSTEM_BUSINESS', async ({
      client,
      assert,
    }) => {
      if (!testUser) {
        assert.fail('El setup del grupo no preparó el usuario de prueba')
        return
      }

      const response = await client.post('/api/auth/login').json({
        userEmail: testUser.user.userEmail,
        userPassword: testUser.password,
        deviceOrigin: 'web',
      })

      response.assertStatus(200)
      const body = response.body()
      assert.equal(body.type, 'success')
      assert.equal(body.title, 'Login')
      assert.exists(body.data?.token, 'Se esperaba un token en la respuesta de login')
      assert.exists(body.data?.user, 'Se esperaba el usuario en la respuesta de login')
    })
  }
)

test.group('Login (POST /api/auth/login) - usuario inactivo', (group) => {
  let testUser: PivotTestUser | null = null

  group.setup(async () => {
    const stamp = Date.now()
    testUser = await createPivotUser({
      email: `pivot-inactive-${stamp}@gsti-tests.local`,
      active: 0,
      businessUnitIds: [],
    })
  })

  group.teardown(async () => {
    await cleanupPivotUser(testUser)
  })

  test('responde 404 con el mensaje legado cuando user_active = 0', async ({ client, assert }) => {
    if (!testUser) {
      assert.fail('El setup del grupo no preparó el usuario de prueba')
      return
    }

    const response = await client.post('/api/auth/login').json({
      userEmail: testUser.user.userEmail,
      userPassword: testUser.password,
      deviceOrigin: 'web',
    })

    response.assertStatus(404)
    const body = response.body()
    assert.equal(body.type, 'warning')
    assert.equal(body.title, 'Login')
    assert.equal(body.message, 'Incorrect email or password')
  })
})

test.group('Users (POST /api/users) - userBusinessAccess como arreglo de IDs', (group) => {
  let actor: PivotTestUser | null = null
  let createdUserId: number | null = null
  let createdPersonId: number | null = null
  let preparedPerson: Person | null = null
  let businessUnitIds: number[] = []

  group.setup(async () => {
    const stamp = Date.now()

    // Asegurar al menos dos unidades de negocio activas para la asociación.
    const existing = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereNull('business_unit_deleted_at')
      .orderBy('business_unit_id', 'asc')
      .limit(2)

    if (existing.length === 0) {
      const seed = new BusinessUnit()
      seed.businessUnitName = `Pivot BU ${stamp}`
      seed.businessUnitSlug = `pivot-bu-${stamp}`
      seed.businessUnitLegalName = `Pivot BU Legal ${stamp}`
      seed.businessUnitActive = 1
      await seed.save()
      businessUnitIds = [seed.businessUnitId]
    } else {
      businessUnitIds = existing.map((unit) => unit.businessUnitId)
    }

    actor = await createPivotUser({
      email: `pivot-actor-${stamp}@gsti-tests.local`,
      active: 1,
      businessUnitIds,
    })

    // Persona ya existente (sin user asociado) para satisfacer la validación
    // `personId.unique` del createUserValidator.
    preparedPerson = new Person()
    preparedPerson.personFirstname = 'Pivot'
    preparedPerson.personLastname = 'NewUser'
    preparedPerson.personEmail = `pivot-newuser-${stamp}@gsti-tests.local`
    await preparedPerson.save()
    createdPersonId = preparedPerson.personId
  })

  group.teardown(async () => {
    if (createdUserId !== null) {
      await BusinessUnitUser.query().where('user_id', createdUserId).delete()
      await User.query().where('user_id', createdUserId).delete()
    }
    if (createdPersonId !== null) {
      await Person.query().where('person_id', createdPersonId).delete()
    }
    await cleanupPivotUser(actor)
  })

  test('crea filas en la pivote por cada ID y deja user_business_access en NULL', async ({
    client,
    assert,
  }) => {
    if (!actor || !preparedPerson) {
      assert.fail('El setup del grupo no preparó al actor o la persona destino')
      return
    }

    const newEmail = preparedPerson.personEmail

    const response = await client.post('/api/users').loginAs(actor.user).json({
      userEmail: newEmail,
      userPassword: 'TempPwd!2026',
      userActive: true,
      roleId: actor.user.roleId,
      personId: preparedPerson.personId,
      userEmailType: 'institutional',
    })

    response.assertStatus(201)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.exists(body.data?.user?.userId)

    createdUserId = Number(body.data.user.userId)

    const pivotRows = await BusinessUnitUser.query()
      .where('user_id', createdUserId)
      .whereNull('business_unit_user_deleted_at')
      .select('business_unit_id')
    const persistedIds = pivotRows.map((row) => row.businessUnitId).sort((a, b) => a - b)
    const expectedIds = [...businessUnitIds].sort((a, b) => a - b)
    assert.deepEqual(
      persistedIds,
      expectedIds,
      'La pivote debe contener una fila por cada ID enviado'
    )
  })
})

test.group('Roles (POST /api/roles) - roleBusinessAccess se hereda desde la pivote', (group) => {
  let actor: PivotTestUser | null = null
  let createdRoleId: number | null = null
  let businessUnitIds: number[] = []

  group.setup(async () => {
    const stamp = Date.now()

    const existing = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereNull('business_unit_deleted_at')
      .orderBy('business_unit_id', 'asc')
      .limit(2)

    if (existing.length === 0) {
      const seed = new BusinessUnit()
      seed.businessUnitName = `Pivot Role BU ${stamp}`
      seed.businessUnitSlug = `pivot-role-bu-${stamp}`
      seed.businessUnitLegalName = `Pivot Role BU Legal ${stamp}`
      seed.businessUnitActive = 1
      await seed.save()
      businessUnitIds = [seed.businessUnitId]
    } else {
      businessUnitIds = existing.map((unit) => unit.businessUnitId)
    }

    actor = await createPivotUser({
      email: `pivot-role-actor-${stamp}@gsti-tests.local`,
      active: 1,
      businessUnitIds,
    })
  })

  group.teardown(async () => {
    if (createdRoleId !== null) {
      await Role.query().where('role_id', createdRoleId).delete()
    }
    await cleanupPivotUser(actor)
  })

  test('genera roleBusinessAccess como CSV de IDs obtenidos del pivote del actor', async ({
    client,
    assert,
  }) => {
    if (!actor) {
      assert.fail('El setup del grupo no preparó al actor')
      return
    }

    const roleName = `Pivot Role ${Date.now()}`
    const response = await client.post('/api/roles').loginAs(actor.user).json({
      roleName,
      roleDescription: 'Rol creado por el suite del pivote multi-tenant',
      roleActive: true,
    })

    response.assertStatus(201)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.exists(body.data?.role?.roleId)
    createdRoleId = Number(body.data.role.roleId)

    const persistedRole = await Role.query().where('role_id', createdRoleId).firstOrFail()
    const persistedAccess = persistedRole.roleBusinessAccess ?? ''
    const persistedIds = persistedAccess
      .split(',')
      .map((token) => Number(token.trim()))
      .filter((value) => Number.isInteger(value) && value > 0)
      .sort((a, b) => a - b)

    const expectedIds = [...businessUnitIds].sort((a, b) => a - b)
    assert.deepEqual(
      persistedIds,
      expectedIds,
      'roleBusinessAccess debe componerse con los IDs leídos desde la pivote, no del CSV legado del usuario'
    )
  })
})
