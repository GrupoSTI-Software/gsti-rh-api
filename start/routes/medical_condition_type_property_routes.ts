import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import MedicalConditionTypePropertyController from '#controllers/medical_condition_type_property_controller'

const medicalConditionTypePropertyController = new MedicalConditionTypePropertyController()

router
  .group(() => {
    router.get('/', medicalConditionTypePropertyController.index)
    router.post('/', medicalConditionTypePropertyController.store)
    router.get('/type/:medicalConditionTypeId', medicalConditionTypePropertyController.getByType)
    router.get('/:medicalConditionTypePropertyId', medicalConditionTypePropertyController.show)
    router.put('/:medicalConditionTypePropertyId', medicalConditionTypePropertyController.update)
    router.delete('/:medicalConditionTypePropertyId', medicalConditionTypePropertyController.delete)
  })
  .prefix('/api/medical-condition-type-properties')
  .use(middleware.auth())
  .use(middleware.businessScope())
