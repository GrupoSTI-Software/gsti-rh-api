import factory from '@adonisjs/lucid/factories'
import Shift from '#models/shift'

/**
 * Turnos fijos que crea el DEMO — replica exactamente shiftsData
 * de createShiftDemo() en shift_service.ts.
 *
 * El turno principal asignado a todos los empleados demo es
 * '08:00 to 17:00 - Rest (Sat, Sun)' (shiftRestDays: '6,7').
 */
export interface DemoShiftData {
  shiftName:          string
  shiftTimeStart:     string
  shiftActiveHours:   number
  shiftRestDays:      string
  shiftAccumulatedFault: number
  shiftCalculateFlag: string
  shiftDayStart:      number
  shiftTemp:          number
  shiftColor:         string
}

export const DEMO_SHIFTS: DemoShiftData[] = [
  {
    shiftName:            '00:00 to 00:00 - Rest (NA)',
    shiftTimeStart:       '00:00',
    shiftActiveHours:     24,
    shiftRestDays:        '0',
    shiftAccumulatedFault: 3,
    shiftCalculateFlag:   '',
    shiftDayStart:        1,
    shiftTemp:            0,
    shiftColor:           '#ffffff',
  },
  {
    shiftName:            '08:00 to 17:00 - Rest (NA)',
    shiftTimeStart:       '08:00',
    shiftActiveHours:     9,
    shiftRestDays:        '0',
    shiftAccumulatedFault: 1,
    shiftCalculateFlag:   '',
    shiftDayStart:        1,
    shiftTemp:            0,
    shiftColor:           '#ffffff',
  },
  {
    shiftName:            '08:00 to 17:00 - Rest (Sat, Sun)',
    shiftTimeStart:       '08:00',
    shiftActiveHours:     9,
    shiftRestDays:        '6,7',
    shiftAccumulatedFault: 1,
    shiftCalculateFlag:   '',
    shiftDayStart:        1,
    shiftTemp:            0,
    shiftColor:           '#ffffff',
  },
  {
    shiftName:            '08:00 to 08:00 - Rest (24x48)',
    shiftTimeStart:       '08:00',
    shiftActiveHours:     24,
    shiftRestDays:        '0',
    shiftAccumulatedFault: 3,
    shiftCalculateFlag:   '24x48',
    shiftDayStart:        1,
    shiftTemp:            0,
    shiftColor:           '#ffffff',
  },
  {
    shiftName:            '08:00 to 20:00 - Rest (12x36)',
    shiftTimeStart:       '08:00',
    shiftActiveHours:     12,
    shiftRestDays:        '0',
    shiftAccumulatedFault: 2,
    shiftCalculateFlag:   '12x36',
    shiftDayStart:        1,
    shiftTemp:            0,
    shiftColor:           '#ffffff',
  },
]

/** Nombre del turno que se asigna a todos los empleados demo */
export const DEMO_DEFAULT_SHIFT_NAME = '08:00 to 17:00 - Rest (Sat, Sun)'

/**
 * Factory de Shift para datos DEMO.
 *
 * Los datos de cada turno deben pasarse con .merge() desde el seeder.
 *
 * Uso desde el seeder:
 *   for (const shiftData of DEMO_SHIFTS) {
 *     await ShiftFactory.merge({
 *       shiftName:            shiftData.shiftName,
 *       shiftTimeStart:       shiftData.shiftTimeStart,
 *       shiftActiveHours:     shiftData.shiftActiveHours,
 *       shiftRestDays:        shiftData.shiftRestDays,
 *       shiftAccumulatedFault: shiftData.shiftAccumulatedFault,
 *       shiftCalculateFlag:   shiftData.shiftCalculateFlag,
 *       shiftDayStart:        shiftData.shiftDayStart,
 *       shiftTemp:            shiftData.shiftTemp,
 *       shiftColor:           shiftData.shiftColor,
 *       shiftBusinessUnits:   businessUnits,
 *     }).create()
 *   }
 */
export const ShiftFactory = factory
  .define(Shift, () => {
    return {
      shiftName:            'Demo Turno',
      shiftAlias:           null,
      shiftTimeStart:       '08:00',
      shiftActiveHours:     9,
      shiftRestDays:        '6,7',
      shiftAccumulatedFault: 1,
      shiftCalculateFlag:   '',
      shiftDayStart:        1,
      shiftTemp:            0,
      shiftColor:           '#ffffff',
      shiftBusinessUnits:   '',
      shiftLunchTime:       null,
      shiftCompensableLunchSchedule: null,
    }
  })
  .build()
