import factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import PositionSalaryRange from '#models/position_salary_range'

export const PositionSalaryRangeFactory = factory
  .define(PositionSalaryRange, ({ faker }) => {
    const minSalaryDaily = faker.number.float({ min: 200, max: 500, fractionDigits: 2 })
    const maxSalaryDaily = faker.number.float({ min: minSalaryDaily + 1, max: 1500, fractionDigits: 2 })
    const validFrom = DateTime.fromJSDate(faker.date.past({ years: 1 }))

    return {
      businessUnitId: faker.number.int({ min: 1, max: 5 }),
      positionId: faker.number.int({ min: 1, max: 50 }),
      minSalaryDaily,
      maxSalaryDaily,
      validFrom,
      validTo: null,
      createdBy: faker.number.int({ min: 1, max: 10 }),
    }
  })
  .build()
