import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

/**
 * Asignación de empleados a puntos de acceso.
 *
 * Cubre el hueco que el backoffice ya invocaba sin contraparte: la sección de
 * biométricos llamaba a estas dos rutas y recibía 404.
 *
 * Van en su propio grupo y no en `access_point_routes.ts` porque el permiso que
 * exigen es el de biométricos del empleado, no el del catálogo de puntos: la
 * operación es sobre el colaborador, no sobre la terminal.
 */
router
  .group(() => {
    router
      .post(
        '/:accessPointId/employee/:employeeId',
        '#modules/access-point/employee-assignment/employee_assignment.controller.store'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.assignEmployeeAccessPoint
        )
      )
    router
      .delete(
        '/:accessPointId/employee/:employeeId',
        '#modules/access-point/employee-assignment/employee_assignment.controller.destroy'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.removeEmployeeAccessPoint
        )
      )
  })
  .prefix('/api/access-points')
  .use(middleware.auth())
  .use(middleware.businessScope())
