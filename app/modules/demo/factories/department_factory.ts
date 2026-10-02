import factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import Department from '#models/department'

/**
 * Estructura completa de departamentos DEMO con su jerarquía.
 *
 * El orden importa: los padres deben crearse antes que los hijos.
 * La propiedad `parentKey` referencia la clave del departamento padre en este mismo array.
 *
 * Retirado por USRH1789328927671: el catálogo ya no incluye el registro de relleno.
 * "Soporte de plataforma" es el hogar de las cuentas de soporte de la demostración.
 */
export interface DemoDepartmentData {
  key: string
  code: string
  name: string
  alias: string
  parentKey: string | null
}

/** Clave del departamento de soporte de la demostración. */
export const DEMO_SUPPORT_DEPARTMENT_KEY = 'Soporte de plataforma'

export const DEMO_DEPARTMENTS: DemoDepartmentData[] = [
  { key: 'GERENCIA',                   code: 'GER-001',  name: '(D101) Dirección General',        alias: 'Dirección General',        parentKey: null },
  { key: 'Administración',             code: 'ADM-001',  name: '(G101) Administración',            alias: 'Administración',           parentKey: 'GERENCIA' },
  { key: 'Operaciones',                code: 'OPE-001',  name: '(G101) Operaciones',               alias: 'Operaciones',              parentKey: 'GERENCIA' },
  { key: 'Marketing',                  code: 'MAR-001',  name: '(G101) Marketing',                 alias: 'Marketing',                parentKey: 'GERENCIA' },
  { key: 'Recursos Humanos',           code: 'RRHH-001', name: '(G101) Recursos Humanos',          alias: 'Recursos Humanos',         parentKey: 'Administración' },
  { key: 'Contabilidad',               code: 'CON-001',  name: '(G101) Contabilidad',              alias: 'Contabilidad',             parentKey: 'Administración' },
  { key: 'Proyectos',                  code: 'PRO-001',  name: '(G101) Proyectos',                 alias: 'Proyectos',                parentKey: 'Administración' },
  { key: 'Diseño',                     code: 'DIS-001',  name: '(G101) Diseño',                    alias: 'Diseño',                   parentKey: 'Proyectos' },
  { key: 'Prototipos',                 code: 'PROT-001', name: '(G101) Prototipos',                alias: 'Prototipos',               parentKey: 'Proyectos' },
  { key: 'Distribución',               code: 'DIS-002',  name: '(G101) Distribución',              alias: 'Distribución',             parentKey: 'Operaciones' },
  { key: 'Producción',                 code: 'PROD-001', name: '(G101) Producción',                alias: 'Producción',               parentKey: 'Operaciones' },
  { key: 'Investigación de Mercados',  code: 'INV-001',  name: '(G101) Investigación de Mercados', alias: 'Investigación de Mercados', parentKey: 'Marketing' },
  { key: DEMO_SUPPORT_DEPARTMENT_KEY,  code: 'SOP-001',  name: '(G101) Soporte de plataforma',    alias: DEMO_SUPPORT_DEPARTMENT_KEY, parentKey: 'GERENCIA' },
]

/**
 * Factory de Department para datos DEMO.
 *
 * Los campos que dependen del contexto (businessUnitId, parentDepartmentId,
 * departmentCode, departmentName, departmentAlias) deben pasarse con .merge()
 * desde el seeder.
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
