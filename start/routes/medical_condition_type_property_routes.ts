import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import MedicalConditionTypePropertyController from '#controllers/medical_condition_type_property_controller'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

const medicalConditionTypePropertyController = new MedicalConditionTypePropertyController()

// Propiedades de los tipos de condición médica: mismas casillas de la pestaña
// Condición médica que el catálogo de tipos.
router
  .group(() => {
    router
      .get('/', medicalConditionTypePropertyController.index)
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexMedicalConditionTypeProperties)
      )
    router
      .post('/', medicalConditionTypePropertyController.store)
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createMedicalConditionTypeProperty)
      )
    router
      .get('/type/:medicalConditionTypeId', medicalConditionTypePropertyController.getByType)
      .use(
        middleware.permissionGate(
          EMPLOYEES_READ_PERMISSION_DECLARATIONS.getMedicalConditionTypePropertiesByType
        )
      )
    router
      .get('/:medicalConditionTypePropertyId', medicalConditionTypePropertyController.show)
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showMedicalConditionTypeProperty)
      )
    router
      .put('/:medicalConditionTypePropertyId', medicalConditionTypePropertyController.update)
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateMedicalConditionTypeProperty)
      )
    router
      .delete('/:medicalConditionTypePropertyId', medicalConditionTypePropertyController.delete)
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteMedicalConditionTypeProperty)
      )
  })
  .prefix('/api/medical-condition-type-properties')
  .use(middleware.auth())
  .use(middleware.businessScope())
