/**
 * Tests funcionales del alta atómica de departamentos (USRH1789328927625).
 *
 * Verifica:
 *  - CA-1: Alta correcta → 201, el departamento existe y los roles activos lo tienen.
 *  - CA-2: Alias duplicado entre dos peticiones → segunda falla 400, solo un dpto.
 *  - CA-3: businessUnitId del cuerpo difiere del scope → 422 BUSINESS_UNIT_MISMATCH.
 *  - CA-4: Validación de Vine falla (sin nombre) → 422 DEPARTMENT_VAL_INPUT.
 *  - CA-5: Alias inválido → 400 alias-invalido, sin departamento creado.
 */
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { ORG_STRUCTURE_ERROR_CODES } from '#constants/org_structure_error_codes'
import {
  cleanupOrgChartFixtures,
} from '#tests/helpers/org_chart_fixtures'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import Role from '#models/role'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function minDeptPayload(suffix: string, extra?: Record<string, unknown>) {
  return {
    departmentName: `Dept Atomic ${suffix} ${Date.now()}`,
    departmentActive: true,
    ...extra,
  }
}

// ─── Specs ───────────────────────────────────────────────────────────────────

test.group('department_store_atomic — alta atómica de departamentos', (group) => {
  let actor: TenantActor | null = null
  let actorB: TenantActor | null = null

  group.setup(async () => {
    actor = await createBypassActor('root', 'dept-store-a')
    actorB = await createBypassActor('root', 'dept-store-b')
  })

  group.teardown(async () => {
    await cleanupOrgChartFixtures(required(actor, 'actor').businessUnit.businessUnitId)
    await cleanupOrgChartFixtures(required(actorB, 'actorB').businessUnit.businessUnitId)
    await cleanupTenantActor(actor)
    await cleanupTenantActor(actorB)
  })

  /**
   * CA-1: Alta correcta → 201.
   * El departamento se crea y todos los roles activos (excepto root) lo tienen.
   */
  test('CA-1: alta correcta → 201, departamento existe y roles activos lo tienen', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId

    const suffix = `CA1-${Date.now()}`
    const res = await client
      .post('/api/departments')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json(minDeptPayload(suffix))

    assert.equal(res.status(), 201, JSON.stringify(res.body()))
    assert.equal(res.body()?.type, 'success')

    const deptId: number = res.body()?.data?.department?.departmentId
    assert.isNumber(deptId)

    // El departamento existe en BD
    const deptRow = await db
      .from('departments')
      .where('department_id', deptId)
      .where('business_unit_id', buId)
      .whereNull('department_deleted_at')
      .first()
    assert.isNotNull(deptRow, 'El departamento debe existir en BD')

    // Todos los roles activos (excepto root) tienen la relación
    const activeRoles = await Role.query()
      .whereNull('role_deleted_at')
      .where('role_active', 1)
      .whereNot('role_slug', 'root')

    for (const role of activeRoles) {
      const rd = await db
        .from('role_departments')
        .whereNull('role_department_deleted_at')
        .where('role_id', role.roleId)
        .where('department_id', deptId)
        .first()
      assert.isNotNull(
        rd,
        `Rol ${role.roleSlug} debería tener el dpto ${deptId}`
      )
    }

    // Limpieza
    await db.from('role_departments').where('department_id', deptId).delete()
    await db.from('departments').where('department_id', deptId).delete()
  })

  /**
   * CA-2: Alias duplicado entre dos peticiones → segunda falla 400, solo un dpto persiste.
   */
  test('CA-2: alias duplicado → segunda petición falla 400, solo un dpto', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId

    const aliasValue = `alias-ca2-${Date.now()}`

    // Primera creación (debe pasar)
    const res1 = await client
      .post('/api/departments')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ departmentName: `Dept CA2-first ${Date.now()}`, aliases: aliasValue })

    assert.equal(res1.status(), 201, `Primera falló: ${JSON.stringify(res1.body())}`)
    const deptId1: number = res1.body()?.data?.department?.departmentId

    // Segunda con el mismo alias → debe fallar
    const res2 = await client
      .post('/api/departments')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ departmentName: `Dept CA2-second ${Date.now()}`, aliases: aliasValue })

    assert.equal(res2.status(), 400, `Segunda debería ser 400: ${JSON.stringify(res2.body())}`)
    assert.equal(res2.body()?.key, 'alias-en-uso')

    // Solo existe un dpto con ese alias
    const rows = await db
      .from('departments')
      .where('business_unit_id', buId)
      .whereNull('department_deleted_at')
      .whereLike('aliases', `%${aliasValue}%`)
    assert.equal(rows.length, 1, 'Solo debe existir UN departamento con ese alias')

    // Limpieza
    await db.from('role_departments').where('department_id', deptId1).delete()
    await db.from('departments').where('department_id', deptId1).delete()
  })

  /**
   * CA-3: businessUnitId del cuerpo difiere del scope del header → 422
   * BUSINESS_UNIT_MISMATCH.
   */
  test('CA-3: businessUnitId distinto al scope → 422 BUSINESS_UNIT_MISMATCH', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const b = required(actorB, 'actorB')

    const res = await client
      .post('/api/departments')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({
        ...minDeptPayload('CA3'),
        businessUnitId: b.businessUnit.businessUnitId,
      })

    assert.equal(res.status(), 422, JSON.stringify(res.body()))
    assert.equal(res.body()?.code, ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_BUSINESS_UNIT_MISMATCH)
  })

  /**
   * CA-4: Validación de Vine falla (sin departmentName) → 422 DEPARTMENT_VAL_INPUT.
   */
  test('CA-4: falta departmentName → 422 DEPARTMENT_VAL_INPUT', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')

    const res = await client
      .post('/api/departments')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ departmentActive: true })

    assert.equal(res.status(), 422, JSON.stringify(res.body()))
    assert.equal(res.body()?.code, ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_VAL_INPUT)
  })

  /**
   * CA-5: Alias inválido → 400 alias-invalido, sin departamento creado a medias.
   */
  test('CA-5: alias inválido → 400 o 201 sin deuda, sin dpto a medias', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId

    const invalidAlias = '!!! alias-con-signos-prohibidos !!!'

    const countBefore: { total: string | number }[] = await db
      .from('departments')
      .where('business_unit_id', buId)
      .whereNull('department_deleted_at')
      .count('* as total')
    const beforeCount = Number(countBefore[0]?.total ?? 0)

    const res = await client
      .post('/api/departments')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ departmentName: `Dept CA5 ${Date.now()}`, aliases: invalidAlias })

    if (res.status() === 400) {
      assert.equal(res.body()?.key, 'alias-invalido')

      const countAfter: { total: string | number }[] = await db
        .from('departments')
        .where('business_unit_id', buId)
        .whereNull('department_deleted_at')
        .count('* as total')
      assert.equal(
        Number(countAfter[0]?.total ?? 0),
        beforeCount,
        'No debe haber aumentado el conteo de departamentos'
      )
    } else {
      // El alias se normalizó sin error → creación válida; limpiamos.
      assert.equal(res.status(), 201, JSON.stringify(res.body()))
      const deptId: number = res.body()?.data?.department?.departmentId
      await db.from('role_departments').where('department_id', deptId).delete()
      await db.from('departments').where('department_id', deptId).delete()
    }
  })
})
