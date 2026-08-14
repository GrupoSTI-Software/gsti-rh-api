import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import MedicalConditionTypePropertyValueController from '#controllers/medical_condition_type_property_value_controller'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'

const medicalConditionTypePropertyValueController = new MedicalConditionTypePropertyValueController()

router
  .group(() => {
    router
      .get('/', medicalConditionTypePropertyValueController.index)
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexMedicalConditionPropertyValues))
    router.post('/', medicalConditionTypePropertyValueController.store)
    router.get(
      '/:medicalConditionTypePropertyValueId',
      medicalConditionTypePropertyValueController.show
    )
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showMedicalConditionPropertyValue))
    router.put(
      '/:medicalConditionTypePropertyValueId',
      medicalConditionTypePropertyValueController.update
    )
    router.delete(
      '/:medicalConditionTypePropertyValueId',
      medicalConditionTypePropertyValueController.delete
    )
  })
  .prefix('/api/medical-condition-type-property-values')
  .use(middleware.auth())
  .use(middleware.businessScope())
