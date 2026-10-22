import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Department from '#models/department'
import Position from '#models/position'
import EmployeeStructureService from '#services/employee_structure_service'
import type { EmployeeStructureResolution } from '#services/employee_structure_service'
import { TenantContext } from '#utils/tenant_context'
import { linkDepartmentPositionFixture } from '#tests/helpers/org_chart_fixtures'

/**
 * USRH1788466831270 — la verificación de "existe, vigente y de la empresa del
 * empleado" (regla 3) sobre la base de desarrollo. Inexistente, eliminado y
 * de otra empresa devuelven exactamente lo mismo (regla 6). Sin middleware:
 * no hay TenantContext, así que lo único que acota es el `where` explícito.
 * Todo lo que crea lo borra en teardown.
 */

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Estructura ${label} ${s}`,
    businessUnitSlug: `estructura-${label}-${s}`,
    businessUnitLegalName: `Estructura ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createDepartment(unit: BusinessUnit, label: string): Promise<Department> {
  const s = stamp()
  return Department.create({
    departmentSyncId: Date.now() + Math.floor(Math.random() * 1000),
    departmentCode: `EST-${s}`.slice(0, 50),
    departmentName: `Estructura ${label} ${s}`,
    departmentAlias: '',
    departmentIsDefault: false,
    departmentActive: 1,
    businessUnitId: unit.businessUnitId,
    companyId: unit.businessUnitId,
  })
}

async function createPosition(unit: BusinessUnit, label: string): Promise<Position> {
  const s = stamp()
  return Position.create({
    positionSyncId: Date.now() + Math.floor(Math.random() * 1000),
    positionCode: `EST-${s}`.slice(0, 50),
    positionName: `Estructura ${label} ${s}`.slice(0, 100),
    positionActive: 1,
    businessUnitId: unit.businessUnitId,
    companyId: unit.businessUnitId,
  })
}

async function cleanupUnits(units: BusinessUnit[]): Promise<void> {
  const unitIds = units.map((unit) => unit.businessUnitId)
  const positionRows = await db.from('positions').whereIn('business_unit_id', unitIds).select('position_id')
  const positionIds = positionRows.map((row) => Number(row.position_id))
  if (positionIds.length > 0) {
    await db.from('department_position').whereIn('position_id', positionIds).delete()
  }
  await db.from('department_position').whereIn('business_unit_id', unitIds).delete()
  for (const unit of units) {
    await Position.query().withTrashed().where('business_unit_id', unit.businessUnitId).delete()
    await Department.query().withTrashed().where('business_unit_id', unit.businessUnitId).delete()
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
  }
}

/** Resolución "ya decidida": solo importa qué se verifica y contra qué empresa. */
function resolution(
  businessUnitId: number,
  toVerify: { departmentId?: number; positionId?: number }
): EmployeeStructureResolution {
  return {
    departmentId: toVerify.departmentId ?? null,
    positionId: toVerify.positionId ?? null,
    businessUnitId,
    departmentIdToVerify: toVerify.departmentId ?? null,
    positionIdToVerify: toVerify.positionId ?? null,
  }
}

const NONEXISTENT_ID = 2_000_000_000

test.group('Estructura del empleado — verificación en la empresa del empleado (USRH1788466831270)', (group) => {
  let unit: BusinessUnit
  let foreignUnit: BusinessUnit
  let activeDepartment: Department
  let deletedDepartment: Department
  let foreignDepartment: Department
  let activePosition: Position
  let deletedPosition: Position
  let foreignPosition: Position

  const service = new EmployeeStructureService()

  group.setup(async () => {
    unit = await createUnit('propia')
    foreignUnit = await createUnit('ajena')
    activeDepartment = await createDepartment(unit, 'Activo')
    deletedDepartment = await createDepartment(unit, 'Eliminado')
    foreignDepartment = await createDepartment(foreignUnit, 'Ajeno')
    activePosition = await createPosition(unit, 'Activo')
    deletedPosition = await createPosition(unit, 'Eliminado')
    foreignPosition = await createPosition(foreignUnit, 'Ajeno')
    await deletedDepartment.delete()
    await deletedPosition.delete()
  })

  group.teardown(async () => {
    await cleanupUnits([unit, foreignUnit])
  })

  test('sin nada que verificar responde ok sin consultar', async ({ assert }) => {
    const result = await service.verifyAssignable(resolution(unit.businessUnitId, {}))

    assert.deepEqual(result, { ok: true })
  })

  test('un departamento y un puesto vigentes de la empresa del empleado pasan', async ({
    assert,
  }) => {
    const result = await service.verifyAssignable(
      resolution(unit.businessUnitId, {
        departmentId: activeDepartment.departmentId,
        positionId: activePosition.positionId,
      })
    )

    assert.deepEqual(result, { ok: true })
  })

  test('regla 6: departamento eliminado, de otra empresa o inexistente fallan igual', async ({
    assert,
  }) => {
    for (const requestedId of [
      deletedDepartment.departmentId,
      foreignDepartment.departmentId,
      NONEXISTENT_ID,
    ]) {
      const result = await service.verifyAssignable(
        resolution(unit.businessUnitId, { departmentId: requestedId })
      )
      assert.deepEqual(result, { ok: false, field: 'department', requestedId })
    }
  })

  test('regla 6: puesto eliminado, de otra empresa o inexistente fallan igual', async ({
    assert,
  }) => {
    for (const requestedId of [
      deletedPosition.positionId,
      foreignPosition.positionId,
      NONEXISTENT_ID,
    ]) {
      const result = await service.verifyAssignable(
        resolution(unit.businessUnitId, { positionId: requestedId })
      )
      assert.deepEqual(result, { ok: false, field: 'position', requestedId })
    }
  })

  test('cuenta la empresa del empleado: el mismo departamento pasa en la suya y falla en la ajena', async ({
    assert,
  }) => {
    const own = await service.verifyAssignable(
      resolution(unit.businessUnitId, { departmentId: activeDepartment.departmentId })
    )
    const other = await service.verifyAssignable(
      resolution(foreignUnit.businessUnitId, { departmentId: activeDepartment.departmentId })
    )

    assert.deepEqual(own, { ok: true })
    assert.deepEqual(other, {
      ok: false,
      field: 'department',
      requestedId: activeDepartment.departmentId,
    })
  })

  test('TenantContext activo en otra empresa no oculta un departamento vigente de la empresa del empleado', async ({
    assert,
  }) => {
    const result = await TenantContext.run([foreignUnit.businessUnitId], () =>
      service.verifyAssignable(
        resolution(unit.businessUnitId, { departmentId: activeDepartment.departmentId })
      )
    )

    assert.deepEqual(result, { ok: true })
  })

  test('el departamento se reporta antes que el puesto cuando fallan los dos', async ({ assert }) => {
    const result = await service.verifyAssignable(
      resolution(unit.businessUnitId, {
        departmentId: foreignDepartment.departmentId,
        positionId: foreignPosition.positionId,
      })
    )

    assert.deepEqual(result, {
      ok: false,
      field: 'department',
      requestedId: foreignDepartment.departmentId,
    })
  })

  test('verifyPositionDepartment: null y departamento vacío no consultan', async ({ assert }) => {
    const absent = await service.verifyPositionDepartment(null)
    const requires = await service.verifyPositionDepartment({
      departmentId: null,
      positionId: activePosition.positionId,
      businessUnitId: unit.businessUnitId,
    })

    assert.deepEqual(absent, { ok: true })
    assert.deepEqual(requires, { ok: false, reason: 'position-requires-department' })
  })

  test('CA12: empresa no resoluble rechaza sin usar el vínculo real', async ({ assert }) => {
    const position = await createPosition(unit, 'FailClosed')
    await linkDepartmentPositionFixture(
      activeDepartment.departmentId,
      position.positionId,
      unit.businessUnitId
    )

    const result = await service.verifyPositionDepartment({
      departmentId: activeDepartment.departmentId,
      positionId: position.positionId,
      businessUnitId: unit.businessUnitId + 0.5,
    })

    assert.deepEqual(result, { ok: false, reason: 'position-without-department-link' })
  })

  test('el puesto ligado al departamento de su empresa pasa; sin vínculo o de otra empresa no', async ({
    assert,
  }) => {
    const position = await createPosition(unit, 'Ligado')
    await linkDepartmentPositionFixture(
      activeDepartment.departmentId,
      position.positionId,
      unit.businessUnitId
    )
    await linkDepartmentPositionFixture(
      foreignDepartment.departmentId,
      position.positionId,
      foreignUnit.businessUnitId
    )

    const coherent = await service.verifyPositionDepartment({
      departmentId: activeDepartment.departmentId,
      positionId: position.positionId,
      businessUnitId: unit.businessUnitId,
    })
    const unlinked = await service.verifyPositionDepartment({
      departmentId: activeDepartment.departmentId,
      positionId: deletedPosition.positionId,
      businessUnitId: unit.businessUnitId,
    })

    assert.deepEqual(coherent, { ok: true })
    assert.deepEqual(unlinked, { ok: false, reason: 'position-without-department-link' })
  })

  test('el desajuste nombra el primer departamento de la empresa del empleado', async ({ assert }) => {
    const position = await createPosition(unit, 'DosVinculos')
    const later = await createDepartment(unit, 'Posterior')
    await linkDepartmentPositionFixture(later.departmentId, position.positionId, unit.businessUnitId)
    await linkDepartmentPositionFixture(
      activeDepartment.departmentId,
      position.positionId,
      unit.businessUnitId
    )

    const result = await service.verifyPositionDepartment({
      departmentId: foreignDepartment.departmentId,
      positionId: position.positionId,
      businessUnitId: unit.businessUnitId,
    })

    if (result.ok || result.reason !== 'position-department-mismatch') {
      throw new Error('debía ser desajuste')
    }
    const expectedIds = [activeDepartment.departmentId, later.departmentId].sort(
      (left, right) => left - right
    )
    assert.deepEqual(result.linkedDepartmentIds, expectedIds)
    assert.equal(result.positionName, position.positionName)
    const firstDepartment =
      expectedIds[0] === activeDepartment.departmentId ? activeDepartment : later
    assert.equal(result.linkedDepartmentName, firstDepartment.departmentName)
    assert.notInclude(JSON.stringify(result), foreignDepartment.departmentName)
    assert.notInclude(JSON.stringify(result), String(foreignDepartment.departmentId))
  })
})
