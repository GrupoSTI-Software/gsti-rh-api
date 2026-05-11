import { I18n } from '@adonisjs/i18n'
import { BusinessUnitCompetencyLevelFilterInterface } from 'app/interfaces/business_unit_competency_level_filter_interface.js'
import BusinessUnit from '#models/business_unit'
import BusinessUnitCompetencyLevel from '#models/business_unit_competency_level'

export default class BusinessUnitCompetencyLevelService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  async index(filters: BusinessUnitCompetencyLevelFilterInterface) {
    const businessUnitCompetencyLevels = await BusinessUnitCompetencyLevel.query()
      .whereNull('business_unit_competency_level_deleted_at')
      .if(filters.businessUnitId, (query) => {
        query.where('business_unit_id', filters.businessUnitId)
      })
      .orderBy('business_unit_competency_level_position', 'asc')
    return businessUnitCompetencyLevels
  }

  async create(businessUnitCompetencyLevel: BusinessUnitCompetencyLevel) {
    const newBusinessUnitCompetencyLevel = new BusinessUnitCompetencyLevel()
    newBusinessUnitCompetencyLevel.businessUnitId = businessUnitCompetencyLevel.businessUnitId
    newBusinessUnitCompetencyLevel.businessUnitCompetencyLevelLabel = businessUnitCompetencyLevel.businessUnitCompetencyLevelLabel
    newBusinessUnitCompetencyLevel.businessUnitCompetencyLevelPosition = businessUnitCompetencyLevel.businessUnitCompetencyLevelPosition
    await newBusinessUnitCompetencyLevel.save()
    return newBusinessUnitCompetencyLevel
  }

  async update(currentBusinessUnitCompetencyLevel: BusinessUnitCompetencyLevel, businessUnitCompetencyLevel: BusinessUnitCompetencyLevel) {
    currentBusinessUnitCompetencyLevel.businessUnitCompetencyLevelLabel = businessUnitCompetencyLevel.businessUnitCompetencyLevelLabel
    currentBusinessUnitCompetencyLevel.businessUnitCompetencyLevelPosition = businessUnitCompetencyLevel.businessUnitCompetencyLevelPosition
    await currentBusinessUnitCompetencyLevel.save()
    return currentBusinessUnitCompetencyLevel
  }

  async delete(currentBusinessUnitCompetencyLevel: BusinessUnitCompetencyLevel) {
    await currentBusinessUnitCompetencyLevel.delete()
    return currentBusinessUnitCompetencyLevel
  }

  async show(businessUnitCompetencyLevelId: number) {
    const businessUnitCompetencyLevel = await BusinessUnitCompetencyLevel.query()
      .whereNull('business_unit_competency_level_deleted_at')
      .where('business_unit_competency_level_id', businessUnitCompetencyLevelId)
      .first()
    return businessUnitCompetencyLevel ? businessUnitCompetencyLevel : null
  }

  async verifyInfoExist(businessUnitCompetencyLevel: BusinessUnitCompetencyLevel) {
    if (!businessUnitCompetencyLevel.businessUnitCompetencyLevelId) {
      const existBusinessUnit = await BusinessUnit.query()
        .whereNull('business_unit_deleted_at')
        .where('business_unit_id', businessUnitCompetencyLevel.businessUnitId)
        .first()

      if (!existBusinessUnit && businessUnitCompetencyLevel.businessUnitId) {
        const entity = this.t('business_unit')
        return {
          status: 400,
          type: 'warning',
          title: this.t('entity_was_not_found', { entity }),
          message: this.t('entity_was_not_found_with_entered_id', { entity }),
          data: { ...businessUnitCompetencyLevel },
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...businessUnitCompetencyLevel },
    }
  }

  async verifyInfo(businessUnitCompetencyLevel: BusinessUnitCompetencyLevel) {
    const action = businessUnitCompetencyLevel.businessUnitCompetencyLevelId > 0 ? 'updated' : 'created'
    const existBusinessUnitCompetencyLevelLabel = await BusinessUnitCompetencyLevel.query()
      .if(businessUnitCompetencyLevel.businessUnitCompetencyLevelId > 0, (query) => {
        query.whereNot('business_unit_competency_level_id', businessUnitCompetencyLevel.businessUnitCompetencyLevelId)
      })
      .whereNull('business_unit_competency_level_deleted_at')
      .whereRaw(
        'business_unit_competency_level_label COLLATE utf8_general_ci = ?',
        [businessUnitCompetencyLevel.businessUnitCompetencyLevelLabel.trim()]
      )
      .where('business_unit_id', businessUnitCompetencyLevel.businessUnitId)
      .first()

    if (existBusinessUnitCompetencyLevelLabel && businessUnitCompetencyLevel.businessUnitId) {
      const entity = this.t('business_unit_competency_level')
      const param = this.t('label') + ' "' + businessUnitCompetencyLevel.businessUnitCompetencyLevelLabel + '"'
      return {
        status: 400,
        type: 'warning',
        title: this.t('the_value_of_entity_already_exists_for_another_register', { entity: param  }),
        message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_value_of_entity_is_already_assigned_to_another_register', { entity: param })}`,
        data: { ...businessUnitCompetencyLevel },
      }
    }

    if (!businessUnitCompetencyLevel.businessUnitCompetencyLevelId) {
      const businessUnitCompetencyLevels = await BusinessUnitCompetencyLevel.query()
        .whereNull('business_unit_competency_level_deleted_at')
        .where('business_unit_id', businessUnitCompetencyLevel.businessUnitId)
      if (businessUnitCompetencyLevels.length >= 5) {
        return {
          status: 400,
          type: 'warning',
          title: this.t('the_number_of_levels_must_be_between_3_and_5'),
          message: this.t('the_number_of_levels_must_be_between_3_and_5'),
          data: { ...businessUnitCompetencyLevel },
        }
      }
    }
    

    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...businessUnitCompetencyLevel },
    }
  }

  async verifyInfoQuantity(businessUnitCompetencyLevel: BusinessUnitCompetencyLevel) {
    const businessUnitCompetencyLevels = await BusinessUnitCompetencyLevel.query()
      .whereNull('business_unit_competency_level_deleted_at')
      .where('business_unit_id', businessUnitCompetencyLevel.businessUnitId)
    if (businessUnitCompetencyLevels.length <= 3) {
      return {
        status: 400,
        type: 'warning',
        title: this.t('the_number_of_levels_must_be_between_3_and_5'),
        message: this.t('the_number_of_levels_must_be_between_3_and_5'),
        data: { ...businessUnitCompetencyLevel },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...businessUnitCompetencyLevel },
    }
  }
}
