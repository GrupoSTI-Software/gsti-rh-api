import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import MedicalConditionTypePropertyValueController from '#controllers/medical_condition_type_property_value_controller'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

const medicalConditionTypePropertyValueController = new MedicalConditionTypePropertyValueController()

// Valores de propiedad de la condición médica de un colaborador: dato de salud,
// con las casillas de la pestaña Condición médica según el verbo.
router
  .group(() => {
    router
      .get('/', medicalConditionTypePropertyValueController.index)
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexMedicalConditionPropertyValues))
    router
      .post('/', medicalConditionTypePropertyValueController.store)
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createMedicalConditionPropertyValue)
      )
    router
      .get('/:medicalConditionTypePropertyValueId', medicalConditionTypePropertyValueController.show)
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showMedicalConditionPropertyValue))
    router
      .put('/:medicalConditionTypePropertyValueId', medicalConditionTypePropertyValueController.update)
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateMedicalConditionPropertyValue)
      )
    router
      .delete('/:medicalConditionTypePropertyValueId', medicalConditionTypePropertyValueController.delete)
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteMedicalConditionPropertyValue)
      )
  })
  .prefix('/api/medical-condition-type-property-values')
  .use(middleware.auth())
  .use(middleware.businessScope())
