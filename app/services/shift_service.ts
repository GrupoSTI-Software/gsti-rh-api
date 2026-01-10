import Shift from '#models/shift'
import env from '#start/env'

export default class ShiftService {
  async create(shift: Shift) {
    const newShift = new Shift()
    newShift.shiftName = shift.shiftName
    newShift.shiftAlias = shift.shiftAlias?.trim() || null
    newShift.shiftCalculateFlag = shift.shiftCalculateFlag
    newShift.shiftDayStart = shift.shiftDayStart
    newShift.shiftTimeStart = shift.shiftTimeStart
    newShift.shiftActiveHours = shift.shiftActiveHours
    newShift.shiftRestDays = shift.shiftRestDays
    newShift.shiftAccumulatedFault = shift.shiftAccumulatedFault
    newShift.shiftBusinessUnits = shift.shiftBusinessUnits
    newShift.shiftTemp = shift.shiftTemp
    if (shift.shiftColor !== undefined && shift.shiftColor !== null) {
      newShift.shiftColor = shift.shiftColor
    }
    await newShift.save()

    return newShift
  }

  async verifyInfo(shift: Shift, shiftId?: number) {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const action = shiftId ? 'updated' : 'created'
    const existCode = await Shift.query()
      .if(shiftId, (query) => {
        query.whereNot('shift_id', shiftId as number)
      })
      .where('shift_temp', 0)
      .whereNull('shift_deleted_at')
      .where('shift_name', shift.shiftName)
      .andWhere((subQuery) => {
        businessList.forEach((business) => {
          subQuery.orWhereRaw(
            'FIND_IN_SET(?, shift_business_units)',
            [business.trim()]
          )
        })
      })
      .first()

    if (existCode && shift.shiftName) {
      return {
        status: 400,
        type: 'warning',
        title: 'The shift name already exists for another shift',
        message: `The shift resource cannot be ${action} because the code is already assigned to another shift`,
        data: { ...shift },
      }
    }

    if (shift.shiftAlias && shift.shiftAlias.trim() !== '') {
      const existAlias = await Shift.query()
        .if(shiftId, (query) => {
          query.whereNot('shift_id', shiftId as number)
        })
        .where('shift_temp', 0)
        .whereNull('shift_deleted_at')
        .where('shift_alias', shift.shiftAlias.trim())
        .andWhere((subQuery) => {
          businessList.forEach((business) => {
            subQuery.orWhereRaw(
              'FIND_IN_SET(?, shift_business_units)',
              [business.trim()]
            )
          })
        })
        .first()

      if (existAlias) {
        return {
          status: 400,
          type: 'warning',
          title: 'The shift alias already exists for another active shift',
          message: `The shift resource cannot be ${action} because the alias is already assigned to another active shift in the same business unit`,
          data: { ...shift },
        }
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...shift },
    }
  }
}
