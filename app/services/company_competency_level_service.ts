import { I18n } from '@adonisjs/i18n'
import CompanyCompetencyLevel from '#models/company_competency_level'
import { CompanyCompetencyLevelFilterInterface } from 'app/interfaces/company_competency_level_filter_interface.js'
import BusinessUnit from '#models/business_unit'

export default class CompanyCompetencyLevelService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  async index(filters: CompanyCompetencyLevelFilterInterface) {
    const companyCompetencyLevels = await CompanyCompetencyLevel.query()
      .whereNull('company_competency_level_deleted_at')
      .if(filters.businessUnitId, (query) => {
        query.where('business_unit_id', filters.businessUnitId)
      })
      .orderBy('company_competency_level_position', 'asc')
    return companyCompetencyLevels
  }

  async create(companyCompetencyLevel: CompanyCompetencyLevel) {
    const newCompanyCompetencyLevel = new CompanyCompetencyLevel()
    newCompanyCompetencyLevel.businessUnitId = companyCompetencyLevel.businessUnitId
    newCompanyCompetencyLevel.companyCompetencyLevelLabel = companyCompetencyLevel.companyCompetencyLevelLabel
    newCompanyCompetencyLevel.companyCompetencyLevelPosition = companyCompetencyLevel.companyCompetencyLevelPosition
    await newCompanyCompetencyLevel.save()
    return newCompanyCompetencyLevel
  }

  async update(currentCompanyCompetencyLevel: CompanyCompetencyLevel, companyCompetencyLevel: CompanyCompetencyLevel) {
    currentCompanyCompetencyLevel.companyCompetencyLevelLabel = companyCompetencyLevel.companyCompetencyLevelLabel
    currentCompanyCompetencyLevel.companyCompetencyLevelPosition = companyCompetencyLevel.companyCompetencyLevelPosition
    await currentCompanyCompetencyLevel.save()
    return currentCompanyCompetencyLevel
  }

  async delete(currentCompanyCompetencyLevel: CompanyCompetencyLevel) {
    await currentCompanyCompetencyLevel.delete()
    return currentCompanyCompetencyLevel
  }

  async show(companyCompetencyLevelId: number) {
    const companyCompetencyLevel = await CompanyCompetencyLevel.query()
      .whereNull('company_competency_level_deleted_at')
      .where('company_competency_level_id', companyCompetencyLevelId)
      .first()
    return companyCompetencyLevel ? companyCompetencyLevel : null
  }

  async verifyInfoExist(companyCompetencyLevel: CompanyCompetencyLevel) {
    if (!companyCompetencyLevel.companyCompetencyLevelId) {
      const existBusinessUnit = await BusinessUnit.query()
        .whereNull('business_unit_deleted_at')
        .where('business_unit_id', companyCompetencyLevel.businessUnitId)
        .first()

      if (!existBusinessUnit && companyCompetencyLevel.businessUnitId) {
        const entity = this.t('business_unit')
        return {
          status: 400,
          type: 'warning',
          title: this.t('entity_was_not_found', { entity }),
          message: this.t('entity_was_not_found_with_entered_id', { entity }),
          data: { ...companyCompetencyLevel },
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...companyCompetencyLevel },
    }
  }

  async verifyInfo(companyCompetencyLevel: CompanyCompetencyLevel) {
    const action = companyCompetencyLevel.companyCompetencyLevelId > 0 ? 'updated' : 'created'
    const existCompanyCompetencyLevelLabel = await CompanyCompetencyLevel.query()
      .if(companyCompetencyLevel.companyCompetencyLevelId > 0, (query) => {
        query.whereNot('company_competency_level_id', companyCompetencyLevel.companyCompetencyLevelId)
      })
      .whereNull('company_competency_level_deleted_at')
      .whereRaw(
        'LOWER(TRIM(REGEXP_REPLACE(company_competency_level_label, \'[^a-zA-Z0-9]+\', \'-\'))) = ?',
        [companyCompetencyLevel.companyCompetencyLevelLabel
          .normalize('NFD')
          .replace(/\p{M}/gu, '')
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')]
      )
      .where('business_unit_id', companyCompetencyLevel.businessUnitId)
      .first()

    if (existCompanyCompetencyLevelLabel && companyCompetencyLevel.businessUnitId) {
      const entity = this.t('company_competency_level')
      const param = this.t('label')
      return {
        status: 400,
        type: 'warning',
        title: this.t('the_value_of_entity_already_exists_for_another_register', { entity: param  }),
        message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_value_of_entity_is_already_assigned_to_another_register', { entity: param })}`,
        data: { ...companyCompetencyLevel },
      }
    }

    const existCompanyCompetencyLevelPosition = await CompanyCompetencyLevel.query()
      .if(companyCompetencyLevel.companyCompetencyLevelId > 0, (query) => {
        query.whereNot('company_competency_level_id', companyCompetencyLevel.companyCompetencyLevelId)
      })
      .whereNull('company_competency_level_deleted_at')
      .where('company_competency_level_position', companyCompetencyLevel.companyCompetencyLevelPosition)
      .where('business_unit_id', companyCompetencyLevel.businessUnitId)
      .first()

    if (existCompanyCompetencyLevelPosition && companyCompetencyLevel.businessUnitId) {
      const entity = this.t('company_competency_level')
      const param = this.t('position')
      return {
        status: 400,
        type: 'warning',
        title: this.t('the_value_of_entity_already_exists_for_another_register', { entity: param  }),
        message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_value_of_entity_is_already_assigned_to_another_register', { entity: param })}`,
        data: { ...companyCompetencyLevel },
      }
    }


    const companyCompetencyLevels = await CompanyCompetencyLevel.query()
      .whereNull('company_competency_level_deleted_at')
      .where('business_unit_id', companyCompetencyLevel.businessUnitId)
    if (companyCompetencyLevels.length >= 5) {
      return {
        status: 400,
        type: 'warning',
        title: this.t('the_number_of_levels_must_be_between_3_and_5'),
        message: this.t('the_number_of_levels_must_be_between_3_and_5'),
        data: { ...companyCompetencyLevel },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...companyCompetencyLevel },
    }
  }
}
