import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import BusinessUnitUser from '#models/business_unit_user'
import Person from '#models/person'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import User from '#models/user'
import type BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import ContratoServicioEspecializado from '#models/contrato_servicio_especializado'
import EmpresaContratante from '#models/empresa_contratante'
import { attachBusinessUnitsWithRole } from '#helpers/attach_business_units_with_role'
import {
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import {
  asRecord,
  buHeader,
  grantAdditionally,
} from '../employees/sensitive_read_by_category_support.js'
import {
  cleanupContratoImportFixture,
  createContratoImportFixture,
  createContratoInTenant,
  type ContratoImportTestFixture,
  uniqueStamp,
} from '../helpers/contrato_import_excel_fixture.js'

export const REPSE_MODULE = 'repse-registrations'
export const REPSE_PERMISSIONS = ['read', 'create', 'update', 'gestion'] as const
export const CONTRATOS_BASE = '/api/contratos-servicios-especializados'

const DEFAULT_OBJETO_SERVICIO =
  'Prestación de servicios especializados de limpieza industrial en planta y áreas administrativas.'
const DEFAULT_ANEXO_OBJETO =
  'Limpieza profunda de áreas productivas, sanitarios, pasillos y zonas comunes con personal capacitado, insumos y supervisión en sitio.'
const DEFAULT_RESPONSABILIDAD =
  'Las partes reconocen la responsabilidad solidaria prevista en el artículo 15-D de la Ley Federal del Trabajo cuando el prestador incumpla obligaciones laborales o de seguridad social.'
const TEST_PASSWORD = 'TenantActorGate123!'

export interface RepseEmployeeFixture {
  employee: Employee
  person: Person
  departmentId: number
  positionId: number
  nssClaro: string | null
}

export interface RepseSensitiveMaskFixture extends ContratoImportTestFixture {
  contratoId: number
  contratoNumero: string
  employeeConNss: RepseEmployeeFixture
  employeeSinNss: RepseEmployeeFixture
}

export interface RepseSensitiveMaskActors {
  sin: TenantActor
  con: TenantActor
}

export { buHeader, asRecord }

async function createRepseEmployee(
  businessUnitId: number,
  prefix: string,
  nss: string | null
): Promise<RepseEmployeeFixture> {
  const stamp = uniqueStamp()
  const now = new Date()
  const person = await Person.create({
    personFirstname: 'Repse',
    personLastname: prefix,
    personSecondLastname: stamp.slice(-12),
    personEmail: `repse-${prefix}-${stamp}@gsti-tests.local`,
    personImssNss: nss,
    businessUnitId,
  })
  const departmentInsert = await db.table('departments').insert({
    department_sync_id: stamp,
    department_code: `DEP-${stamp}`,
    department_name: `Departamento ${prefix}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_active: 1,
    department_created_at: now,
  })
  const departmentId = Number(departmentInsert[0])
  const positionInsert = await db.table('positions').insert({
    position_sync_id: stamp,
    position_code: `POS-${stamp}`,
    position_name: `Puesto ${prefix}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    position_active: 1,
    position_created_at: now,
  })
  const positionId = Number(positionInsert[0])
  const employeeInsert = await db.table('employees').insert({
    employee_slug: opaqueEmployeeSlug(),
    employee_sync_id: `EMP-${stamp}`,
    employee_code: `EMP-${stamp}`,
    employee_first_name: 'Repse',
    employee_last_name: prefix,
    employee_second_last_name: stamp.slice(-12),
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    payroll_business_unit_id: businessUnitId,
    department_id: departmentId,
    position_id: positionId,
    person_id: person.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `work-${prefix}-${stamp}@gsti-tests.local`,
    employee_created_at: now,
  })
  const employee = await TenantContext.runUnscoped(
    () => Employee.findOrFail(Number(employeeInsert[0])),
    TENANT_UNSCOPED_REASON.TEST_FIXTURE
  )
  return { employee, person, departmentId, positionId, nssClaro: nss }
}

async function createContratoVigenteInTenant(params: {
  fixture: ContratoImportTestFixture
  numeroContrato: string
}): Promise<number> {
  const contratoId = await createContratoInTenant(params)
  const contrato = await TenantContext.run(
    [params.fixture.businessUnit.businessUnitId],
    () => ContratoServicioEspecializado.findOrFail(contratoId)
  )
  contrato.estatus = 'vigente'
  contrato.fechaInicio = DateTime.fromISO('2026-01-01')
  contrato.fechaFin = DateTime.fromISO('2027-12-31')
  await TenantContext.run([params.fixture.businessUnit.businessUnitId], async () => {
    await contrato.save()
  })
  return contratoId
}

export async function createRepseSensitiveMaskFixture(
  businessUnit: BusinessUnit,
  prefix: string
): Promise<RepseSensitiveMaskFixture> {
  const fixture = await createContratoImportFixture(businessUnit, { repseStatus: 'active' })
  const contratoNumero = `CSE-MASK-${prefix}-${uniqueStamp()}`
  const contratoId = await createContratoVigenteInTenant({ fixture, numeroContrato: contratoNumero })
  const employeeConNss = await createRepseEmployee(
    businessUnit.businessUnitId,
    `${prefix}-nss`,
    '12345678901'
  )
  const employeeSinNss = await createRepseEmployee(
    businessUnit.businessUnitId,
    `${prefix}-nonss`,
    null
  )

  return {
    ...fixture,
    contratoId,
    contratoNumero,
    employeeConNss,
    employeeSinNss,
  }
}

export async function createRepseSensitiveMaskActors(prefix: string): Promise<RepseSensitiveMaskActors> {
  const sin = await createTenantActor(`${prefix}-sin`)
  await grantModulePermissions(sin, REPSE_MODULE, REPSE_PERMISSIONS)
  const con = await createRepseActorConIdentificacion(sin, prefix)
  return { sin, con }
}

async function createRepseActorConIdentificacion(
  base: TenantActor,
  prefix: string
): Promise<TenantActor> {
  const stamp = uniqueStamp()
  const email = `${prefix}-con-${stamp}@gsti-tests.local`
  const role = await Role.create({
    roleName: `Repse mask con ${stamp}`,
    roleSlug: `repse-mask-con-${stamp}`,
    roleDescription: 'Rol temporal REPSE con identificación',
    roleActive: 1,
    roleManagementDays: 10,
    businessUnitId: base.businessUnit.businessUnitId,
  })
  const person = await Person.create({
    personFirstname: 'RepseMask',
    personLastname: 'Con',
    personSecondLastname: prefix,
    personEmail: email,
    businessUnitId: base.businessUnit.businessUnitId,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await attachBusinessUnitsWithRole(user, [base.businessUnit.businessUnitId], role.roleId)
  const actor: TenantActor = {
    user,
    person,
    businessUnit: base.businessUnit,
    role,
    ownsRole: true,
  }
  await grantModulePermissions(actor, REPSE_MODULE, REPSE_PERMISSIONS)
  await grantAdditionally(role.roleId, ['sensitive-identificacion-read'])
  return actor
}

export function buildContratoCreatePayload(
  fixture: RepseSensitiveMaskFixture,
  numeroContrato: string
) {
  return {
    empresaContratanteId: fixture.contratante.empresaContratanteId,
    numeroContrato,
    fechaInicio: '2026-02-01',
    fechaFin: '2026-12-31',
    objetoServicio: DEFAULT_OBJETO_SERVICIO,
    montoTotal: 250000,
    moneda: 'MXN',
    estatus: 'borrador',
    anexo15d: {
      objetoDetallado: DEFAULT_ANEXO_OBJETO,
      numeroTrabajadoresAprox: 8,
      fechaInicioServicio: '2026-02-01',
      fechaFinServicio: '2026-12-31',
      compromisosDocumentales: [
        {
          tipo: 'cfdi_nomina',
          descripcion: 'Entrega mensual de CFDI de nómina',
          periodicidad: 'mensual',
        },
      ],
      responsabilidadSolidariaAceptada: true,
      textoResponsabilidadSolidaria: DEFAULT_RESPONSABILIDAD,
    },
    serviciosRegistradosIds: [fixture.servicioA.repseSpecializedServiceId],
  }
}

export function contratoFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const data = asRecord(body.data)
  const single = asRecord(data.contratoServicioEspecializado)
  if (single.id !== undefined) {
    return single
  }
  throw new Error('Contrato no encontrado en la respuesta.')
}

export function contratoFromListBody(body: Record<string, unknown>): Record<string, unknown> {
  const bundle = asRecord(asRecord(body.data).contratosServiciosEspecializados)
  const rows = bundle.data
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Listado de contratos vacío.')
  }
  return asRecord(rows[0])
}

export function contratoFromVersionBody(body: Record<string, unknown>): Record<string, unknown> {
  const data = asRecord(body.data)
  for (const value of Object.values(data)) {
    const record = asRecord(value)
    const contrato = asRecord(record.contrato)
    if (contrato.empresaContratante !== undefined) {
      return contrato
    }
  }
  throw new Error('Contrato de versión no encontrado en la respuesta.')
}

export function asignacionesFromBody(body: Record<string, unknown>): Record<string, unknown>[] {
  const bundle = asRecord(asRecord(body.data).asignaciones)
  const rows = bundle.data
  if (!Array.isArray(rows)) {
    throw new Error('Listado de asignaciones inválido.')
  }
  return rows.map((row) => asRecord(row))
}

export function asignacionFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const data = asRecord(body.data)
  const single = asRecord(data.asignacion)
  if (single.id !== undefined) {
    return single
  }
  const created = data.asignaciones
  if (Array.isArray(created) && created.length > 0) {
    return asRecord(created[0])
  }
  const paginated = asRecord(data.asignaciones)
  const rows = paginated.data
  if (Array.isArray(rows) && rows.length > 0) {
    return asRecord(rows[0])
  }
  throw new Error('Asignación no encontrada en la respuesta.')
}

export function contratanteFromContrato(contrato: Record<string, unknown>) {
  return asRecord(contrato.empresaContratante)
}

export function empleadoFromAsignacion(asignacion: Record<string, unknown>) {
  return asRecord(asignacion.empleado)
}

export function stripSensitiveContratoFields(contrato: Record<string, unknown>) {
  const clone = structuredClone(contrato)
  const contratante = asRecord(clone.empresaContratante)
  delete contratante.rfc
  clone.empresaContratante = contratante
  return clone
}

export function stripSensitiveAsignacionFields(asignacion: Record<string, unknown>) {
  const clone = structuredClone(asignacion)
  const empleado = asRecord(clone.empleado)
  delete empleado.nss
  clone.empleado = empleado
  return clone
}

export async function cleanupRepseEmployeeFixture(employeeFixture: RepseEmployeeFixture | null) {
  if (!employeeFixture) return
  await db
    .from('asignaciones_contrato_especializado')
    .where('employee_id', employeeFixture.employee.employeeId)
    .delete()
  await Employee.query().where('employee_id', employeeFixture.employee.employeeId).delete()
  await db.from('positions').where('position_id', employeeFixture.positionId).delete()
  await db.from('departments').where('department_id', employeeFixture.departmentId).delete()
  await Person.query().where('person_id', employeeFixture.person.personId).delete()
}

export async function cleanupRepseContratoArtifacts(contratoId: number | null) {
  if (!contratoId) return
  await db
    .from('versiones_contrato_especializado')
    .where('contrato_servicio_especializado_id', contratoId)
    .delete()
  await db
    .from('asignaciones_contrato_especializado')
    .where('contrato_servicio_especializado_id', contratoId)
    .delete()
  await db.from('contrato_servicio_repse').where('contrato_servicio_especializado_id', contratoId).delete()
  await db.from('clausulas_15d').where('contrato_servicio_especializado_id', contratoId).delete()
  await ContratoServicioEspecializado.query()
    .where('contrato_servicio_especializado_id', contratoId)
    .delete()
}

export async function cleanupRepseSensitiveMaskFixture(
  fixture: RepseSensitiveMaskFixture | null
) {
  if (!fixture) return
  await cleanupRepseContratoArtifacts(fixture.contratoId)
  await cleanupRepseEmployeeFixture(fixture.employeeConNss)
  await cleanupRepseEmployeeFixture(fixture.employeeSinNss)
  await cleanupContratoImportFixture(fixture)
}

export async function cleanupRepseSensitiveMaskActors(actors: RepseSensitiveMaskActors | null) {
  if (!actors) return
  await BusinessUnitUser.query().where('user_id', actors.con.user.userId).delete()
  await User.query().where('user_id', actors.con.user.userId).delete()
  await Person.query().where('person_id', actors.con.person.personId).delete()
  await RoleSystemPermission.query().where('role_id', actors.con.role.roleId).delete()
  await Role.query().where('role_id', actors.con.role.roleId).delete()
  await cleanupTenantActor(actors.sin)
}

export async function reloadContratanteRfc(
  empresaContratanteId: number,
  businessUnitId: number
): Promise<string | null> {
  const row = await TenantContext.run([businessUnitId], () =>
    EmpresaContratante.findOrFail(empresaContratanteId)
  )
  return row.rfc
}

export async function reloadPersonNss(
  personId: number,
  businessUnitId: number
): Promise<string | null> {
  const row = await TenantContext.run([businessUnitId], () => Person.findOrFail(personId))
  return row.personImssNss
}
