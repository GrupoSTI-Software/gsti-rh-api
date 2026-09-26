import db from '@adonisjs/lucid/services/db'
import Department from '#models/department'
import Position from '#models/position'
import { uniqueTestName } from '#tests/helpers/tenant_actor'

/**
 * Departamentos y puestos de prueba dentro de la unidad de negocio de un actor
 * de `tenant_actor`. Existe porque los specs del organigrama necesitan nodos
 * propios en una BD recién sembrada: los de desarrollo no existen ahí y, con
 * la exigencia encendida, tampoco se sabe qué rol los ve.
 *
 * `cleanupOrgChartFixtures` borra en físico todo lo que cuelga de la unidad,
 * incluido lo que un caso haya creado por API (KPIs, historial, ligas), para
 * que el borrado de la unidad no choque con llaves foráneas.
 */

const uniqueCode = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100_000)}`.slice(0, 50)

export async function createDepartmentFixture(businessUnitId: number, label: string): Promise<Department> {
  return Department.create({
    departmentSyncId: Date.now() + Math.floor(Math.random() * 1000),
    departmentCode: uniqueCode('ORG'),
    departmentName: uniqueTestName(label).slice(0, 100),
    departmentAlias: '',
    departmentIsDefault: false,
    departmentActive: 1,
    businessUnitId,
    companyId: 1,
  })
}

export async function createPositionFixture(businessUnitId: number, label: string): Promise<Position> {
  const position = new Position()
  position.positionSyncId = 0
  position.positionCode = uniqueCode('PUE')
  position.positionName = uniqueTestName(label).slice(0, 100)
  position.positionActive = 1
  position.businessUnitId = businessUnitId
  await position.save()
  return position
}

export async function cleanupOrgChartFixtures(businessUnitId: number): Promise<void> {
  const departments: { department_id: number }[] = await db
    .from('departments')
    .where('business_unit_id', businessUnitId)
    .select('department_id')
  const departmentIds = departments.map((row) => row.department_id)

  if (departmentIds.length > 0) {
    // El alta de departamento por API liga el nodo a todos los roles activos.
    await db.from('role_departments').whereIn('department_id', departmentIds).delete()
  }
  await db.from('position_kpis').where('business_unit_id', businessUnitId).delete()
  await db.from('position_approval_histories').where('business_unit_id', businessUnitId).delete()
  await db.from('department_position').where('business_unit_id', businessUnitId).delete()
  await db.from('positions').where('business_unit_id', businessUnitId).delete()
  await db.from('departments').where('business_unit_id', businessUnitId).delete()
}
