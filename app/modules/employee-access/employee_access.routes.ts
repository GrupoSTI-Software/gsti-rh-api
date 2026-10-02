import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

const CONTROLLER = '#modules/employee-access/employee_access.controller'

/**
 * Acceso a personal desde la ficha del colaborador.
 *
 * Leer cada lista usa el mismo permiso que su pestaña anterior: "quién puede
 * consultarlo" el de responsables y "a quién puede consultar" el de
 * asignados. Agregar, cambiar la jefatura directa y quitar usan los permisos
 * de siempre del acceso; los candidatos solo se ofrecen a quien puede agregar.
 */
router
  .group(() => {
    router
      .get('/:employeeId/access/consulted-by', `${CONTROLLER}.consultedBy`)
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getUserResponsible))
    router
      .get('/:employeeId/access/can-consult', `${CONTROLLER}.canConsult`)
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeesAssigned))
    router
      .get('/:employeeId/access/consulted-by/candidates', `${CONTROLLER}.userCandidates`)
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createUserResponsibleEmployee
        )
      )
    router
      .get('/:employeeId/access/can-consult/candidates', `${CONTROLLER}.employeeCandidates`)
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createUserResponsibleEmployee
        )
      )
    router
      .post('/:employeeId/access/consulted-by', `${CONTROLLER}.addConsultedBy`)
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createUserResponsibleEmployee
        )
      )
    router
      .post('/:employeeId/access/can-consult', `${CONTROLLER}.addCanConsult`)
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createUserResponsibleEmployee
        )
      )
    router
      .put(
        '/:employeeId/access/:userResponsibleEmployeeId/direct-boss',
        `${CONTROLLER}.setDirectBoss`
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateUserResponsibleEmployee
        )
      )
    router
      .delete('/:employeeId/access/:userResponsibleEmployeeId', `${CONTROLLER}.remove`)
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteUserResponsibleEmployee
        )
      )
  })
  .prefix('/api/v1/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
