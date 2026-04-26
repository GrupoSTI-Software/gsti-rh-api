import PositionAssessmentProfile from '#models/position_assessment_profile'
import { PositionAssessmentProfileFilterSearchInterface } from '../interfaces/position_assessment_profile_filter_search_interface.js'

export default class PositionAssessmentProfileService {

  async index(filters: PositionAssessmentProfileFilterSearchInterface) {
    const items = await PositionAssessmentProfile.query()
      .whereNull('position_assessment_profile_deleted_at')
      .if(filters.positionId, (query) => {
        query.where('position_id', filters.positionId!)
      })
      .if(filters.assessmentTemplateDimensionId, (query) => {
        query.where('assessment_template_dimension_id', filters.assessmentTemplateDimensionId!)
      })
      .if(filters.assessmentTemplateId, (query) => {
        query.whereHas('assessmentTemplateDimension', (dimensionQuery) => {
          dimensionQuery.where('assessment_template_id', filters.assessmentTemplateId!)
        })
      })
      .preload('assessmentTemplateDimension')
      .preload('position')
      .orderBy('position_assessment_profile_created_at', 'desc')
      .paginate(filters.page, filters.limit)

    return items
  }

  async create(profile: PositionAssessmentProfile) {
    const newProfile = new PositionAssessmentProfile()
    newProfile.positionId = profile.positionId
    newProfile.assessmentTemplateDimensionId = profile.assessmentTemplateDimensionId
    newProfile.positionAssessmentProfileMinimumValue =
      profile.positionAssessmentProfileMinimumValue
    newProfile.positionAssessmentProfileMaximumValue =
      profile.positionAssessmentProfileMaximumValue
    await newProfile.save()
    return newProfile
  }

  async update(
    currentProfile: PositionAssessmentProfile,
    profile: PositionAssessmentProfile
  ) {
    currentProfile.positionAssessmentProfileMinimumValue =
      profile.positionAssessmentProfileMinimumValue
    currentProfile.positionAssessmentProfileMaximumValue =
      profile.positionAssessmentProfileMaximumValue
    await currentProfile.save()
    return currentProfile
  }

  async delete(currentProfile: PositionAssessmentProfile) {
    await currentProfile.delete()
    return currentProfile
  }

  async show(positionAssessmentProfileId: number) {
    const profile = await PositionAssessmentProfile.query()
      .whereNull('position_assessment_profile_deleted_at')
      .where('position_assessment_profile_id', positionAssessmentProfileId)
      .preload('assessmentTemplateDimension')
      .preload('position')
      .first()
    return profile ?? null
  }

  async getByPositionId(positionId: number) {
    return await PositionAssessmentProfile.query()
      .whereNull('position_assessment_profile_deleted_at')
      .where('position_id', positionId)
      .preload('assessmentTemplateDimension')
      .orderBy('position_assessment_profile_created_at', 'asc')
  }
}
