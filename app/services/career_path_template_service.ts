import BusinessUnit from '#models/business_unit'
import CareerPathTemplate from '#models/career_path_template'
import Position from '#models/position'
import { I18n } from '@adonisjs/i18n'
import { CareerPathTemplateFilterSearchInterface } from 'app/interfaces/career_path_template_filter_search_interface.js'

export default class CareerPathTemplateService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  async index(filters: CareerPathTemplateFilterSearchInterface) {
    const careerPathTemplates = await CareerPathTemplate.query()
      .whereNull('career_path_template_deleted_at')
      .if(filters.originPositionId, (query) => {
        query.where('origin_position_id', filters.originPositionId)
      })
      .if(filters.targetPositionId, (query) => {
        query.where('target_position_id', filters.targetPositionId)
      })
      .preload('company')
      .preload('originPosition')
      .preload('targetPosition')
      .orderBy('career_path_template_id', 'desc')
    return careerPathTemplates
  }

  async create(careerPathTemplate: CareerPathTemplate) {
    const newCareerPathTemplate = new CareerPathTemplate()
    newCareerPathTemplate.companyId = careerPathTemplate.companyId
    newCareerPathTemplate.originPositionId = careerPathTemplate.originPositionId
    newCareerPathTemplate.targetPositionId = careerPathTemplate.targetPositionId
    newCareerPathTemplate.createdBy = careerPathTemplate.createdBy
    newCareerPathTemplate.updatedBy = careerPathTemplate.updatedBy
    await newCareerPathTemplate.save()
    return newCareerPathTemplate
  }

  async update(
    currentCareerPathTemplate: CareerPathTemplate,
    careerPathTemplate: CareerPathTemplate,
  ) {
    currentCareerPathTemplate.companyId = careerPathTemplate.companyId
    currentCareerPathTemplate.originPositionId = careerPathTemplate.originPositionId
    currentCareerPathTemplate.targetPositionId = careerPathTemplate.targetPositionId
    currentCareerPathTemplate.updatedBy = careerPathTemplate.updatedBy
    await currentCareerPathTemplate.save()
    return currentCareerPathTemplate.careerPathTemplateId
  }

  async delete(currentCareerPathTemplate: CareerPathTemplate) {
    await currentCareerPathTemplate.delete()
    return currentCareerPathTemplate
  }

  async show(careerPathTemplateId: number) {
    const careerPathTemplate = await CareerPathTemplate.query()
      .whereNull('career_path_template_deleted_at')
      .where('career_path_template_id', careerPathTemplateId)
      .first()
    return careerPathTemplate
  }

  async verifyInfoExist(careerPathTemplate: CareerPathTemplate) {
    const existCompany = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .where('business_unit_id', careerPathTemplate.companyId)
      .first()

    if (!existCompany && careerPathTemplate.companyId) {
      const entity = this.t('company')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...careerPathTemplate },
      }
    }

    const existPosition = await Position.query()
      .whereNull('position_deleted_at')
      .where('position_id', careerPathTemplate.originPositionId)
      .first()

    if (!existPosition && careerPathTemplate.originPositionId) {
      const entity = this.t('position')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...careerPathTemplate },
      }
    }

    const existTargetPosition = await Position.query()
      .whereNull('position_deleted_at')
      .where('position_id', careerPathTemplate.targetPositionId)
      .first()

    if (!existTargetPosition && careerPathTemplate.targetPositionId) {
      const entity = this.t('position')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...careerPathTemplate },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...careerPathTemplate },
    }
  }

  async verifyInfo(careerPathTemplate: CareerPathTemplate) {
    const action = careerPathTemplate.careerPathTemplateId > 0 ? 'updated' : 'created'
    if (careerPathTemplate.originPositionId === careerPathTemplate.targetPositionId) {
      return {
        status: 400,
        type: 'warning',
        title: this.t('the_origin_and_target_positions_cannot_be_the_same'),
        message: this.t('the_origin_and_target_positions_cannot_be_the_same'),
        data: { ...careerPathTemplate },
      }
    }
    const existCareerPathTemplate = await CareerPathTemplate.query()
      .whereNull('career_path_template_deleted_at')
      .if(careerPathTemplate.careerPathTemplateId > 0, (query) => {
        query.whereNot('career_path_template_id', careerPathTemplate.careerPathTemplateId)
      })
      .where('company_id', careerPathTemplate.companyId)
      .where('origin_position_id', careerPathTemplate.originPositionId)
      .where('target_position_id', careerPathTemplate.targetPositionId)
      .first()
    if (existCareerPathTemplate) {
      const entity = `${this.t('relation')} ${this.t('company')} - ${this.t('origin')} ${this.t('position')} - ${this.t('target')} ${this.t('position')}`
      return {
        status: 400,
        type: 'warning',
        title: this.t('the_value_of_entity_already_exists_for_another_register', { entity  }),
        message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_relation_is_already_assigned_to_another_register')}`,
        data: { ...careerPathTemplate },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...careerPathTemplate },
    }
  }
}
