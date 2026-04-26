import CareerPathOverrideReason from '#models/career_path_override_reason'

export default class CareerPathOverrideReasonService {
  async index() {
    const careerPathOverrideReasons = await CareerPathOverrideReason.query()
      .whereNull('career_path_override_reason_deleted_at')
      .orderBy('career_path_override_reason_id')
    return careerPathOverrideReasons
  }
}
