import LaborLawHour from '#models/labor_law_hour'
import { DateTime } from 'luxon'

export default class LaborLawHoursService {

  async index() {
    const laborLawHours = await LaborLawHour.query()
      .whereNull('labor_law_hours_deleted_at')
      .orderBy('labor_law_hours_apply_since', 'desc')

    return { data: laborLawHours }
  }

  async create(laborLawHour: LaborLawHour) {
    const newLaborLawHour = new LaborLawHour()
    newLaborLawHour.laborLawHoursHoursPerWeek = laborLawHour.laborLawHoursHoursPerWeek
    newLaborLawHour.laborLawHoursActive = laborLawHour.laborLawHoursActive
    newLaborLawHour.laborLawHoursApplySince = laborLawHour.laborLawHoursApplySince
    newLaborLawHour.laborLawHoursDescription = laborLawHour.laborLawHoursDescription
    await newLaborLawHour.save()
    return newLaborLawHour
  }

  async update(currentLaborLawHour: LaborLawHour, laborLawHour: LaborLawHour) {
    currentLaborLawHour.laborLawHoursHoursPerWeek = laborLawHour.laborLawHoursHoursPerWeek
    currentLaborLawHour.laborLawHoursActive = laborLawHour.laborLawHoursActive
    currentLaborLawHour.laborLawHoursApplySince = laborLawHour.laborLawHoursApplySince
    currentLaborLawHour.laborLawHoursDescription = laborLawHour.laborLawHoursDescription
    await currentLaborLawHour.save()
    return currentLaborLawHour
  }

  async delete(currentLaborLawHour: LaborLawHour) {
    await currentLaborLawHour.delete()
    return currentLaborLawHour
  }

  async show(laborLawHoursId: number) {
    const laborLawHour = await LaborLawHour.query()
      .whereNull('labor_law_hours_deleted_at')
      .where('labor_law_hours_id', laborLawHoursId)
      .first()
    return laborLawHour ? laborLawHour : null
  }

  async getActive() {
    const now = DateTime.now().toISODate()
    const laborLawHour = await LaborLawHour.query()
      .whereNull('labor_law_hours_deleted_at')
      .where('labor_law_hours_active', 1)
      .where('labor_law_hours_apply_since', '<=', now || '')
      .orderBy('labor_law_hours_apply_since', 'desc')
      .first()

    return laborLawHour
  }

}

