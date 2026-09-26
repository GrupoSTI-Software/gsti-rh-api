import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import MedicalConditionTypeController from '#controllers/medical_condition_type_controller'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

const medicalConditionTypeController = new MedicalConditionTypeController()

// Catálogo que solo usa la pestaña Condición médica del expediente: cada ruta
// exige la casilla de esa pestaña según su verbo (read, write o delete).
router
  .group(() => {
    router
      .get('/', medicalConditionTypeController.index)
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexMedicalConditionTypes))
    router
      .post('/', medicalConditionTypeController.store)
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createMedicalConditionType))
    router
      .get('/:medicalConditionTypeId', medicalConditionTypeController.show)
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showMedicalConditionType))
    router
      .put('/:medicalConditionTypeId', medicalConditionTypeController.update)
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateMedicalConditionType))
    router
      .delete('/:medicalConditionTypeId', medicalConditionTypeController.delete)
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteMedicalConditionType))
  })
  .prefix('/api/medical-condition-types')
  .use(middleware.auth())
  .use(middleware.businessScope())
