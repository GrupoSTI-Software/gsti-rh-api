import Weight from '#models/weight'

export default class WeightService {
  async index() {
    const weights = await Weight.query()
      .whereNull('weight_deleted_at')
      .orderBy('weight_id')
    return weights
  }
}
