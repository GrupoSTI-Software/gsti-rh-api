import { I18n } from '@adonisjs/i18n'
import CompetencyDescriptor from '#models/competency_descriptor'
import CompetencyBracket from '#models/competency_bracket'

export default class CompetencyBracketService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  async create(competencyBracket: CompetencyBracket) {
    const newCompetencyBracket = new CompetencyBracket()
    newCompetencyBracket.competencyDescriptorId = competencyBracket.competencyDescriptorId
    newCompetencyBracket.competencyBracketDescription = competencyBracket.competencyBracketDescription
    newCompetencyBracket.competencyBracketRangeMin = competencyBracket.competencyBracketRangeMin
    newCompetencyBracket.competencyBracketRangeMax = competencyBracket.competencyBracketRangeMax
    newCompetencyBracket.competencyBracketPosition = competencyBracket.competencyBracketPosition
    await newCompetencyBracket.save()
    return newCompetencyBracket
  }

  async update(currentCompetencyBracket: CompetencyBracket, competencyBracket: CompetencyBracket) {
    currentCompetencyBracket.competencyBracketDescription = competencyBracket.competencyBracketDescription
    currentCompetencyBracket.competencyBracketRangeMin = competencyBracket.competencyBracketRangeMin
    currentCompetencyBracket.competencyBracketRangeMax = competencyBracket.competencyBracketRangeMax
    currentCompetencyBracket.competencyBracketPosition = competencyBracket.competencyBracketPosition
    await currentCompetencyBracket.save()
    return currentCompetencyBracket
  }

  async delete(currentCompetencyBracket: CompetencyBracket) {
    await currentCompetencyBracket.delete()
    return currentCompetencyBracket
  }

  async show(competencyBracketId: number) {
    const competencyBracket = await CompetencyBracket.query()
      .whereNull('competency_bracket_deleted_at')
      .where('competency_bracket_id', competencyBracketId)
      .first()
    return competencyBracket ? competencyBracket : null
  }

  async verifyInfoExist(competencyBracket: CompetencyBracket) {
    if (!competencyBracket.competencyBracketId) {
      const existCompetencyDescriptor = await CompetencyDescriptor.query()
        .whereNull('competency_descriptor_deleted_at')
        .where('competency_descriptor_id', competencyBracket.competencyDescriptorId)
        .first()

      if (!existCompetencyDescriptor && competencyBracket.competencyDescriptorId) {
        const entity = this.t('competency_descriptor')
        return {
          status: 400,
          type: 'warning',
          title: this.t('entity_was_not_found', { entity }),
          message: this.t('entity_was_not_found_with_entered_id', { entity }),
          data: { ...competencyBracket },
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...competencyBracket },
    }
  }

  async getByCompetencyDescriptorId(competencyDescriptorId: number) {
    const competencyBrackets = await CompetencyBracket.query()
      .whereNull('competency_bracket_deleted_at')
      .where('competency_descriptor_id', competencyDescriptorId)
      .orderBy('competency_bracket_position', 'asc')
    return competencyBrackets
  }
}
