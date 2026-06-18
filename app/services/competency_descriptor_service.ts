import { I18n } from '@adonisjs/i18n'
import BusinessUnitCompetencyLevel from '#models/business_unit_competency_level'
import CompetencyDescriptor from '#models/competency_descriptor'
import Competency from '#models/competency'

export default class CompetencyDescriptorService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  async create(competencyDescriptor: CompetencyDescriptor) {
    const newCompetencyDescriptor = new CompetencyDescriptor()
    newCompetencyDescriptor.competencyId = competencyDescriptor.competencyId
    newCompetencyDescriptor.businessUnitCompetencyLevelId = competencyDescriptor.businessUnitCompetencyLevelId
    newCompetencyDescriptor.competencyDescriptorDescription = competencyDescriptor.competencyDescriptorDescription
    await newCompetencyDescriptor.save()
    return newCompetencyDescriptor
  }

  async update(currentCompetencyDescriptor: CompetencyDescriptor, competencyDescriptor: CompetencyDescriptor) {
    currentCompetencyDescriptor.competencyDescriptorDescription = competencyDescriptor.competencyDescriptorDescription
    await currentCompetencyDescriptor.save()
    return currentCompetencyDescriptor
  }

  async delete(currentCompetencyDescriptor: CompetencyDescriptor) {
    await currentCompetencyDescriptor.delete()
    return currentCompetencyDescriptor
  }

  async show(competencyDescriptorId: number) {
    const competencyDescriptor = await CompetencyDescriptor.query()
      .whereNull('competency_descriptor_deleted_at')
      .where('competency_descriptor_id', competencyDescriptorId)
      .first()
    return competencyDescriptor ? competencyDescriptor : null
  }

  async verifyInfoExist(competencyDescriptor: CompetencyDescriptor) {
    if (!competencyDescriptor.competencyDescriptorId) {
      const existCompetency = await Competency.query()
        .whereNull('competency_deleted_at')
        .where('competency_id', competencyDescriptor.competencyId)
        .first()

      if (!existCompetency && competencyDescriptor.competencyId) {
        const entity = this.t('competency')
        return {
          status: 400,
          type: 'warning',
          title: this.t('entity_was_not_found', { entity }),
          message: this.t('entity_was_not_found_with_entered_id', { entity }),
          data: { ...competencyDescriptor },
        }
      }
      const existBusinessUnitCompetencyLevel = await BusinessUnitCompetencyLevel.query()
        .whereNull('business_unit_competency_level_deleted_at')
        .where('business_unit_competency_level_id', competencyDescriptor.businessUnitCompetencyLevelId)
        .first()

      if (!existBusinessUnitCompetencyLevel && competencyDescriptor.businessUnitCompetencyLevelId) {
        const entity = this.t('business_unit_competency_level')
        return {
          status: 400,
          type: 'warning',
          title: this.t('entity_was_not_found', { entity }),
          message: this.t('entity_was_not_found_with_entered_id', { entity }),
          data: { ...competencyDescriptor },
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...competencyDescriptor },
    }
  }

 async getByCompetencyId(competencyId: number) {
    const competencyDescriptors = await CompetencyDescriptor.query()
      .whereNull('competency_descriptor_deleted_at')
      .where('competency_id', competencyId)
      .orderBy('competency_descriptor_description', 'asc')
      .preload('businessUnitCompetencyLevel')
      .preload('competency')
      
    return competencyDescriptors
  }
}
