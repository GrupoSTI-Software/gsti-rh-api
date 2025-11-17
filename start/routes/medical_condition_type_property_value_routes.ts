import router from '@adonisjs/core/services/router'
import MedicalConditionTypePropertyValueController from '#controllers/medical_condition_type_property_value_controller'

const medicalConditionTypePropertyValueController = new MedicalConditionTypePropertyValueController()

router.group(() => {
  router.get('/', medicalConditionTypePropertyValueController.index)
  router.post('/', medicalConditionTypePropertyValueController.store)
  router.get('/:medicalConditionTypePropertyValueId', medicalConditionTypePropertyValueController.show)
  router.put('/:medicalConditionTypePropertyValueId', medicalConditionTypePropertyValueController.update)
  router.delete('/:medicalConditionTypePropertyValueId', medicalConditionTypePropertyValueController.delete)
}).prefix('/api/medical-condition-type-property-values')
