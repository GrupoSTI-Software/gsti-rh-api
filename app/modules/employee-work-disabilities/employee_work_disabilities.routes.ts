import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

/**
 * Incapacidades del colaborador desde su ficha.
 *
 * Leer usa el mismo permiso que el listado por empleado; registrar el de alta
 * de incapacidad y ampliar el de alta de periodo. Borrar periodos, gastos y
 * notas, y agregar gastos y notas, siguen en sus rutas de siempre.
 */
router
  .group(() => {
    router
      .get(
        '/:employeeId/work-disabilities',
        '#modules/employee-work-disabilities/employee_work_disabilities.controller.index'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_READ_PERMISSION_DECLARATIONS.getWorkDisabilitiesByEmployee
        )
      )
    router
      .post(
        '/:employeeId/work-disabilities',
        '#modules/employee-work-disabilities/employee_work_disabilities.controller.store'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createWorkDisability))
    router
      .post(
        '/:employeeId/work-disabilities/:workDisabilityId/extensions',
        '#modules/employee-work-disabilities/employee_work_disabilities.controller.extend'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createWorkDisabilityPeriod
        )
      )
  })
  .prefix('/api/v1/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
