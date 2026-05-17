import factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import Position from '#models/position'

/**
 * Estructura completa de posiciones DEMO.
 * Replica exactamente el array positionsData de createPositionDemo() en position_service.ts.
 *
 * El orden importa: los padres deben crearse antes que los hijos.
 * `positionId: 999` es el caso especial "Sin posición".
 */
export interface DemoPositionData {
  key: string
  code: string
  name: string
  alias: string
  parentKey: string | null
  departmentKey: string
  /** Cuando está definido, se fuerza ese ID específico (ej. 999 para Sin posición) */
  positionId?: number
}

export const DEMO_POSITIONS: DemoPositionData[] = [
  { key: 'Director general',                   code: 'POS-DIR-001', name: '(P101) Director general',                   alias: 'Director general',                   parentKey: null,              departmentKey: 'GERENCIA' },
  { key: 'Asistente de dirección',             code: 'POS-ASD-001', name: '(P101) Asistente de dirección',             alias: 'Asistente de dirección',             parentKey: 'Director general', departmentKey: 'GERENCIA' },
  { key: 'Gerente administrativo',             code: 'POS-GAD-001', name: '(P101) Gerente administrativo',             alias: 'Gerente administrativo',             parentKey: null,              departmentKey: 'Administración' },
  { key: 'Gerente de recursos humanos',        code: 'POS-GRH-001', name: '(P101) Gerente de recursos humanos',        alias: 'Gerente de recursos humanos',        parentKey: null,              departmentKey: 'Recursos Humanos' },
  { key: 'Reclutador',                         code: 'POS-REC-001', name: '(P101) Reclutador',                         alias: 'Reclutador',                         parentKey: null,              departmentKey: 'Recursos Humanos' },
  { key: 'Desarrollador de talento',           code: 'POS-DTA-001', name: '(P101) Desarrollador de talento',           alias: 'Desarrollador de talento',           parentKey: null,              departmentKey: 'Recursos Humanos' },
  { key: 'Gerente de contabilidad',            code: 'POS-GCO-001', name: '(P101) Gerente de contabilidad',            alias: 'Gerente de contabilidad',            parentKey: null,              departmentKey: 'Contabilidad' },
  { key: 'Encargado de nóminas',               code: 'POS-ENO-001', name: '(P101) Encargado de nóminas',               alias: 'Encargado de nóminas',               parentKey: null,              departmentKey: 'Contabilidad' },
  { key: 'Tesorería',                          code: 'POS-TES-001', name: '(P101) Tesorería',                          alias: 'Tesorería',                          parentKey: null,              departmentKey: 'Contabilidad' },
  { key: 'Director de operaciones',            code: 'POS-DOP-001', name: '(P101) Director de operaciones',            alias: 'Director de operaciones',            parentKey: null,              departmentKey: 'Operaciones' },
  { key: 'Auxiliar operativo',                 code: 'POS-AOP-001', name: '(P101) Auxiliar operativo',                 alias: 'Auxiliar operativo',                 parentKey: null,              departmentKey: 'Operaciones' },
  { key: 'Gerente de proyectos',               code: 'POS-GPR-001', name: '(P101) Gerente de proyectos',               alias: 'Gerente de proyectos',               parentKey: null,              departmentKey: 'Proyectos' },
  { key: 'Project Manager',                    code: 'POS-PMA-001', name: '(P101) Project Manager',                    alias: 'Project Manager',                    parentKey: null,              departmentKey: 'Proyectos' },
  { key: 'Diseñador gráfico',                  code: 'POS-DIG-001', name: '(P101) Diseñador gráfico',                  alias: 'Diseñador gráfico',                  parentKey: null,              departmentKey: 'Diseño' },
  { key: 'Diseñador UX',                       code: 'POS-DUX-001', name: '(P101) Diseñador UX',                       alias: 'Diseñador UX',                       parentKey: null,              departmentKey: 'Diseño' },
  { key: 'Líder de proyecto',                  code: 'POS-LPR-001', name: '(P101) Líder de proyecto',                  alias: 'Líder de proyecto',                  parentKey: null,              departmentKey: 'Prototipos' },
  { key: 'Supervisor de distribución',         code: 'POS-SDI-001', name: '(P101) Supervisor de distribución',         alias: 'Supervisor de distribución',         parentKey: null,              departmentKey: 'Distribución' },
  { key: 'Especialista de logística',          code: 'POS-ELO-001', name: '(P101) Especialista de logística',          alias: 'Especialista de logística',          parentKey: null,              departmentKey: 'Distribución' },
  { key: 'Supervisor de producción',           code: 'POS-SPR-001', name: '(P101) Supervisor de producción',           alias: 'Supervisor de producción',           parentKey: null,              departmentKey: 'Producción' },
  { key: 'Operador de producción',             code: 'POS-OPR-001', name: '(P101) Operador de producción',             alias: 'Operador de producción',             parentKey: null,              departmentKey: 'Producción' },
  { key: 'Supervisor de marketing',            code: 'POS-SMA-001', name: '(P101) Supervisor de marketing',            alias: 'Supervisor de marketing',            parentKey: null,              departmentKey: 'Marketing' },
  { key: 'Content Manager',                    code: 'POS-CMA-001', name: '(P101) Content Manager',                    alias: 'Content Manager',                    parentKey: null,              departmentKey: 'Marketing' },
  { key: 'Especialista en Relaciones Públicas',code: 'POS-ERP-001', name: '(P101) Especialista en Relaciones Públicas',alias: 'Especialista en Relaciones Públicas',parentKey: null,              departmentKey: 'Marketing' },
  { key: 'Analista de mercado',                code: 'POS-AME-001', name: '(P101) Analista de mercado',                alias: 'Analista de mercado',                parentKey: null,              departmentKey: 'Investigación de Mercados' },
  { key: 'Sin posición',                       code: 'POS-WOP-001', name: '(P101) Sin posición',                       alias: 'Sin posición',                       parentKey: null,              departmentKey: 'Sin Departamento', positionId: 999 },
]

/**
 * Factory de Position para datos DEMO.
 *
 * Los campos que dependen del contexto (businessUnitId, parentPositionId, código,
 * nombre y alias) deben pasarse con .merge() desde el seeder.
 *
 * Uso desde el seeder:
 *   const position = await PositionFactory.merge({
 *     positionCode:  'POS-DIR-001',
 *     positionName:  '(P101) Director general',
 *     positionAlias: 'Director general',
 *     businessUnitId: businessUnitId,
 *     parentPositionId: null,
 *   }).create()
 */
export const PositionFactory = factory
  .define(Position, () => {
    return {
      positionSyncId:               0,
      positionCode:                 'POS-DEMO-001',
      positionName:                 'Demo Posición',
      positionAlias:                'Demo Posición',
      positionIsDefault:            false,
      positionActive:               1,
      parentPositionId:             null,
      parentPositionSyncId:         0,
      companyId:                    1,
      businessUnitId:               0,
      positionLastSynchronizationAt: DateTime.now().toJSDate(),
    }
  })
  .build()
