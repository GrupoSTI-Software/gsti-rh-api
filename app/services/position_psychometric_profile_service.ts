import PositionPsychometricProfile from '#models/position_psychometric_profile'
import { PositionPsychometricProfileFilterSearchInterface } from '../interfaces/position_psychometric_profile_filter_search_interface.js'

export default class PositionPsychometricProfileService {

  async index(filters: PositionPsychometricProfileFilterSearchInterface) {
    const items = await PositionPsychometricProfile.query()
      .whereNull('position_psychometric_profile_deleted_at')
      .if(filters.positionId, (query) => {
        query.where('position_id', filters.positionId!)
      })
      .if(filters.psychometricTestDimensionId, (query) => {
        query.where('psychometric_test_dimension_id', filters.psychometricTestDimensionId!)
      })
      .preload('psychometricTestDimension')
      .preload('position')
      .orderBy('position_psychometric_profile_created_at', 'desc')
      .paginate(filters.page, filters.limit)

    return items
  }

  async create(profile: PositionPsychometricProfile) {
    const newProfile = new PositionPsychometricProfile()
    newProfile.positionId = profile.positionId
    newProfile.psychometricTestDimensionId = profile.psychometricTestDimensionId
    newProfile.positionPsychometricProfileMinimumValue =
      profile.positionPsychometricProfileMinimumValue
    newProfile.positionPsychometricProfileMaximumValue =
      profile.positionPsychometricProfileMaximumValue
    await newProfile.save()
    return newProfile
  }

  async update(
    currentProfile: PositionPsychometricProfile,
    profile: PositionPsychometricProfile
  ) {
    currentProfile.positionPsychometricProfileMinimumValue =
      profile.positionPsychometricProfileMinimumValue
    currentProfile.positionPsychometricProfileMaximumValue =
      profile.positionPsychometricProfileMaximumValue
    await currentProfile.save()
    return currentProfile
  }

  async delete(currentProfile: PositionPsychometricProfile) {
    await currentProfile.delete()
    return currentProfile
  }

  async show(positionPsychometricProfileId: number) {
    const profile = await PositionPsychometricProfile.query()
      .whereNull('position_psychometric_profile_deleted_at')
      .where('position_psychometric_profile_id', positionPsychometricProfileId)
      .preload('psychometricTestDimension')
      .preload('position')
      .first()
    return profile ?? null
  }

  async getByPositionId(positionId: number) {
    return await PositionPsychometricProfile.query()
      .whereNull('position_psychometric_profile_deleted_at')
      .where('position_id', positionId)
      .preload('psychometricTestDimension')
      .orderBy('position_psychometric_profile_created_at', 'asc')
  }
}
