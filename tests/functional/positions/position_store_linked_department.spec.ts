/**
 * Tests funcionales del alta atómica de puestos con linkDepartmentId
 * (USRH1789328927625).
 *
 * Verifica:
 *  - CA-6: Alta con linkDepartmentId correcto → 201, departmentPositionId presente.
 *  - CA-7: Sin linkDepartmentId → 201, alta simple (no crea department_position).
 *  - CA-8: linkDepartmentId de otra empresa → 404 POSITION_DEPARTMENT_NOT_FOUND.
 *  - CA-9: linkDepartmentId inexistente → 404 POSITION_DEPARTMENT_NOT_FOUND.
 *  - CA-10: Validación de Vine falla (sin positionCode) → 422 POSITION_VAL_INPUT.
 */
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { ORG_STRUCTURE_ERROR_CODES } from '#constants/org_structure_error_codes'
import {
  cleanupOrgChartFixtures,
  createDepartmentFixture,
} from '#tests/helpers/org_chart_fixtures'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const uniqueCode = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100_000)}`.slice(0, 50)

/** Payload mínimo válido para crear un puesto. */
function minPositionPayload(suffix: string, extra?: Record<string, unknown>) {
  return {
    positionCode: uniqueCode(`PC${suffix}`),
    positionName: `Puesto ${suffix} ${Date.now()}`,
    positionActive: true,
    ...extra,
  }
}

// ─── Specs ───────────────────────────────────────────────────────────────────

test.group('position_store_linked_department — alta atómica de puestos', (group) => {
  let actor: TenantActor | null = null
  let actorB: TenantActor | null = null

  group.setup(async () => {
    actor = await createBypassActor('root', 'pos-store-a')
    actorB = await createBypassActor('root', 'pos-store-b')
  })

  group.teardown(async () => {
    await cleanupOrgChartFixtures(required(actor, 'actor').businessUnit.businessUnitId)
    await cleanupOrgChartFixtures(required(actorB, 'actorB').businessUnit.businessUnitId)
    await cleanupTenantActor(actor)
    await cleanupTenantActor(actorB)
  })

  /**
   * CA-6: Alta con linkDepartmentId correcto → 201 y fila en department_position creada.
   */
  test('CA-6: con linkDepartmentId correcto → 201 y departmentPositionId', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId

    const dept = await createDepartmentFixture(buId, 'pos-CA6-dept')

    const res = await client
      .post('/api/positions')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json(minPositionPayload('CA6', { linkDepartmentId: dept.departmentId }))

    assert.equal(res.status(), 201, JSON.stringify(res.body()))
    assert.equal(res.body()?.type, 'success')

    const positionId: number = res.body()?.data?.position?.positionId
    const dpId: number = res.body()?.data?.departmentPositionId
    assert.isNumber(positionId, 'positionId debe ser un número')
    assert.isNumber(dpId, 'departmentPositionId debe ser un número')

    // Verificar que la fila en department_position existe en BD
    const dpRow = await db
      .from('department_position')
      .where('department_position_id', dpId)
      .where('position_id', positionId)
      .where('department_id', dept.departmentId)
      .where('business_unit_id', buId)
      .whereNull('department_position_deleted_at')
      .first()

    assert.isNotNull(dpRow, 'La fila en department_position debe existir')
  })

  /**
   * CA-7: Alta sin linkDepartmentId → 201, alta simple, no crea fila en department_position.
   */
  test('CA-7: sin linkDepartmentId → 201, alta simple sin department_position', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')

    const res = await client
      .post('/api/positions')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json(minPositionPayload('CA7'))

    assert.equal(res.status(), 201, JSON.stringify(res.body()))
    assert.equal(res.body()?.type, 'success')

    const positionId: number = res.body()?.data?.position?.positionId
    assert.isNumber(positionId)

    // No debe existir ninguna fila de ligado para este puesto
    const dpRow = await db
      .from('department_position')
      .where('position_id', positionId)
      .whereNull('department_position_deleted_at')
      .first()

    assert.isNull(dpRow, 'No debe existir fila en department_position para alta simple')
  })

  /**
   * CA-8: linkDepartmentId pertenece a la empresa B (IDOR) → 404
   * POSITION_DEPARTMENT_NOT_FOUND, sin puesto creado.
   */
  test('CA-8: linkDepartmentId de otra empresa → 404 POSITION_DEPARTMENT_NOT_FOUND', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const b = required(actorB, 'actorB')

    // Creamos un departamento en empresa B
    const deptB = await createDepartmentFixture(b.businessUnit.businessUnitId, 'pos-CA8-dept-B')

    const code = uniqueCode('PCA8x')

    const res = await client
      .post('/api/positions')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({
        positionCode: code,
        positionName: `Puesto CA8 ${Date.now()}`,
        linkDepartmentId: deptB.departmentId,
      })

    assert.equal(res.status(), 404, JSON.stringify(res.body()))
    assert.equal(
      res.body()?.code,
      ORG_STRUCTURE_ERROR_CODES.POSITION_DEPARTMENT_NOT_FOUND
    )

    // El puesto no se creó
    const posRow = await db
      .from('positions')
      .where('position_code', code)
      .whereNull('position_deleted_at')
      .first()
    assert.isNull(posRow, 'El puesto no debe haberse creado')
  })

  /**
   * CA-9: linkDepartmentId inexistente → 404 POSITION_DEPARTMENT_NOT_FOUND,
   * sin puesto creado.
   */
  test('CA-9: linkDepartmentId inexistente → 404 POSITION_DEPARTMENT_NOT_FOUND', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')

    const code = uniqueCode('PCA9x')

    const res = await client
      .post('/api/positions')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({
        positionCode: code,
        positionName: `Puesto CA9 ${Date.now()}`,
        linkDepartmentId: 999999999,
      })

    assert.equal(res.status(), 404, JSON.stringify(res.body()))
    assert.equal(
      res.body()?.code,
      ORG_STRUCTURE_ERROR_CODES.POSITION_DEPARTMENT_NOT_FOUND
    )

    // El puesto no se creó
    const posRow = await db
      .from('positions')
      .where('position_code', code)
      .whereNull('position_deleted_at')
      .first()
    assert.isNull(posRow, 'El puesto no debe haberse creado')
  })

  /**
   * CA-10: Validación de Vine falla (falta positionCode) → 422 POSITION_VAL_INPUT.
   */
  test('CA-10: falta positionCode → 422 POSITION_VAL_INPUT', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')

    const res = await client
      .post('/api/positions')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ positionName: `Puesto CA10 ${Date.now()}` })

    assert.equal(res.status(), 422, JSON.stringify(res.body()))
    assert.equal(res.body()?.code, ORG_STRUCTURE_ERROR_CODES.POSITION_VAL_INPUT)
  })
})
