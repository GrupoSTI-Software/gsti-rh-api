import TraumaticEventType from '#models/traumatic_event_type'
import { TraumaticEventTypeFilterSearchInterface } from '../interfaces/traumatic_event_type_filter_search_interface.js'

export default class TraumaticEventTypeService {
  async index(filters: TraumaticEventTypeFilterSearchInterface) {
    const traumaticEventType = await TraumaticEventType.query()
      .if(filters.search, (query) => {
        query.whereRaw('UPPER(traumatic_event_type_name) LIKE ?', [
          `%${filters.search.toUpperCase()}%`,
        ])
        query.orWhereRaw('UPPER(traumatic_event_type_slug) LIKE ?', [
          `%${filters.search.toUpperCase()}%`,
        ])
      })
      .orderBy('traumatic_event_type_id')
      .paginate(filters.page, filters.limit)
    return traumaticEventType
  }
}
