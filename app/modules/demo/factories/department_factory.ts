import factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import Department from '#models/department'

/**
 * Estructura completa de departamentos DEMO con su jerarquía.
 * Replica exactamente createDepartmentDemo() de department_service.ts.
 *
 * El orden importa: los padres deben crearse antes que los hijos.
 * La propiedad `parentKey` referencia la clave del departamento padre en este mismo array.
 * `departmentId: 999` es el caso especial "Sin Departamento" que usa ID fijo.
 */
export interface DemoDepartmentData {
  key: string
  code: string
  name: string
  alias: string
  parentKey: string | null
  /** Cuando está definido, se fuerza ese ID específico (ej. 999 para Sin Departamento) */
  departmentId?: number
}

export const DEMO_DEPARTMENTS: DemoDepartmentData[] = [
  { key: 'GERENCIA',                  code: 'GER-001',  name: '(D101) Dirección General',       alias: 'Dirección General',       parentKey: null,           departmentId: undefined },
  { key: 'Administración',            code: 'ADM-001',  name: '(G101) Administración',           alias: 'Administración',          parentKey: 'GERENCIA',     departmentId: undefined },
  { key: 'Operaciones',               code: 'OPE-001',  name: '(G101) Operaciones',              alias: 'Operaciones',             parentKey: 'GERENCIA',     departmentId: undefined },
  { key: 'Marketing',                 code: 'MAR-001',  name: '(G101) Marketing',                alias: 'Marketing',               parentKey: 'GERENCIA',     departmentId: undefined },
  { key: 'Recursos Humanos',          code: 'RRHH-001', name: '(G101) Recursos Humanos',         alias: 'Recursos Humanos',        parentKey: 'Administración', departmentId: undefined },
  { key: 'Contabilidad',              code: 'CON-001',  name: '(G101) Contabilidad',             alias: 'Contabilidad',            parentKey: 'Administración', departmentId: undefined },
  { key: 'Proyectos',                 code: 'PRO-001',  name: '(G101) Proyectos',                alias: 'Proyectos',               parentKey: 'Administración', departmentId: undefined },
  { key: 'Diseño',                    code: 'DIS-001',  name: '(G101) Diseño',                   alias: 'Diseño',                  parentKey: 'Proyectos',    departmentId: undefined },
  { key: 'Prototipos',                code: 'PROT-001', name: '(G101) Prototipos',               alias: 'Prototipos',              parentKey: 'Proyectos',    departmentId: undefined },
  { key: 'Distribución',              code: 'DIS-002',  name: '(G101) Distribución',             alias: 'Distribución',            parentKey: 'Operaciones',  departmentId: undefined },
  { key: 'Producción',                code: 'PROD-001', name: '(G101) Producción',               alias: 'Producción',              parentKey: 'Operaciones',  departmentId: undefined },
  { key: 'Investigación de Mercados', code: 'INV-001',  name: '(G101) Investigación de Mercados',alias: 'Investigación de Mercados',parentKey: 'Marketing',    departmentId: undefined },
  { key: 'Sin Departamento',          code: 'SIN-001',  name: '(D101) Sin Departamento',         alias: 'Sin Departamento',        parentKey: null,           departmentId: 999 },
]

/**
 * Factory de Department para datos DEMO.
 *
 * Los campos que dependen del contexto (businessUnitId, parentDepartmentId,
 * departmentCode, departmentName, departmentAlias) deben pasarse con .merge()
 * desde el seeder, igual que hace createDepartmentDemo().
 *
 * Uso desde el seeder:
 *   const department = await DepartmentFactory.merge({
 *     departmentCode: 'GER-001',
 *     departmentName: '(D101) Dirección General',
 *     departmentAlias: 'Dirección General',
 *     businessUnitId: businessUnitId,
 *     parentDepartmentId: null,
 *   }).create()
 */
export const DepartmentFactory = factory
  .define(Department, () => {
    return {
      departmentSyncId:               0,
      departmentCode:                 'DEMO-001',
      departmentName:                 'Demo Departamento',
      departmentAlias:                'Demo Departamento',
      departmentIsDefault:            false,
      departmentActive:               1,
      parentDepartmentId:             null,
      parentDepartmentSyncId:         0,
      companyId:                      1,
      businessUnitId:                 0,
      departmentLastSynchronizationAt: DateTime.now().toJSDate(),
    }
  })
  .build()
