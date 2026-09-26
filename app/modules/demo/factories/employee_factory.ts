import factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import Employee from '#models/employee'
import { EMPLOYEE_WORK_SCHEDULE } from '#constants/employee_work_schedule'

/**
 * Distribución de empleados por posición — misma que usa createEmployeeDemo()
 * en employee_service.ts.  Se exporta para que el seeder pueda iterar sobre ella.
 */
export const DEMO_POSITION_ASSIGNMENTS: Array<{ positionAlias: string; count: number }> = [
  { positionAlias: 'Director general',                   count: 1  },
  { positionAlias: 'Asistente de dirección',             count: 1  },
  { positionAlias: 'Gerente administrativo',             count: 1  },
  { positionAlias: 'Gerente de recursos humanos',        count: 1  },
  { positionAlias: 'Reclutador',                         count: 1  },
  { positionAlias: 'Desarrollador de talento',           count: 2  },
  { positionAlias: 'Gerente de contabilidad',            count: 1  },
  { positionAlias: 'Encargado de nóminas',               count: 1  },
  { positionAlias: 'Tesorería',                          count: 2  },
  { positionAlias: 'Director de operaciones',            count: 1  },
  { positionAlias: 'Auxiliar operativo',                 count: 3  },
  { positionAlias: 'Gerente de proyectos',               count: 1  },
  { positionAlias: 'Project Manager',                    count: 3  },
  { positionAlias: 'Diseñador gráfico',                  count: 1  },
  { positionAlias: 'Diseñador UX',                       count: 2  },
  { positionAlias: 'Líder de proyecto',                  count: 1  },
  { positionAlias: 'Supervisor de distribución',         count: 1  },
  { positionAlias: 'Especialista de logística',          count: 1  },
  { positionAlias: 'Supervisor de producción',           count: 1  },
  { positionAlias: 'Operador de producción',             count: 10 },
  { positionAlias: 'Supervisor de marketing',            count: 1  },
  { positionAlias: 'Content Manager',                    count: 1  },
  { positionAlias: 'Especialista en Relaciones Públicas',count: 1  },
  { positionAlias: 'Analista de mercado',                count: 2  },
]

/**
 * Genera una fecha de contratación aleatoria entre 1 y 5 años atrás.
 * Replica exactamente getRandomPastDate() de employee_service.ts.
 */
function randomHireDate(): DateTime {
  const now            = DateTime.now()
  const oneYearAgo     = now.minus({ years: 1 })
  const fiveYearsAgo   = now.minus({ years: 5 })
  const startTs        = fiveYearsAgo.toMillis()
  const endTs          = oneYearAgo.toMillis()
  return DateTime.fromMillis(startTs + Math.random() * (endTs - startTs))
}

/**
 * Factory de Employee para datos DEMO.
 *
 * Los campos que varían por empleado (personId, positionId, departmentId,
 * businessUnitId, employeeTypeId, código) deben pasarse con .merge() desde
 * el seeder, igual que los servicios originales los calculan en tiempo de ejecución.
 *
 * Uso desde el seeder:
 *   const employee = await EmployeeFactory.merge({
 *     employeeCode: '1001',
 *     employeeFirstName: 'Juan',
 *     employeeLastName: 'Pérez',
 *     employeeSecondLastName: 'López',
 *     personId: person.personId,
 *     positionId: position.positionId,
 *     departmentId: department.departmentId,
 *     businessUnitId: businessUnitId,
 *     employeeTypeId: employeeTypeId,
 *     dailySalary: 1000,
 *   }).create()
 */
export const EmployeeFactory = factory
  .define(Employee, () => {
    const hireDate = randomHireDate()
    return {
      employeeSyncId:                   0,
      employeeCode:                     '0000',
      employeeFirstName:                'Demo',
      employeeLastName:                 'Empleado',
      employeeSecondLastName:           '.',
      employeePayrollNum:               '0000',
      employeePayrollCode:              '0000',
      employeeHireDate:                 hireDate,
      companyId:                        1,
      departmentId:                     null,
      positionId:                       null,
      personId:                         0,
      businessUnitId:                   0,
      dailySalary:                      1000,
      payrollBusinessUnitId:            0,
      employeeAssistDiscriminator:      0,
      employeeWorkSchedule:             EMPLOYEE_WORK_SCHEDULE.ONSITE,
      employeeWorkScheduleHybridMode:   null,
      employeeWorkScheduleHybridConfig: null,
      employeeTeleworkPercentage:       0,
      employeeIgnoreConsecutiveAbsences: 0,
      employeeAuthorizeAnyZones:        0,
      employeeLastSynchronizationAt:    DateTime.now().toJSDate(),
      departmentSyncId:                 0,
      positionSyncId:                   0,
      employeeTypeId:                   1,
    }
  })
  .build()
