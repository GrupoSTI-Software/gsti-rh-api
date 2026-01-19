interface HolidayInterface {
  holidayId: number | null
  holidayName: string
  holidayDate: Date | string
  holidayIcon: string | null
  holidayIconId: number | null
  holidayFrequency: number
  holidayCreatedAt: Date | string
  holidayUpdatedAt: Date | string
  holidayDeletedAt: Date | string | null
  holidayIsOfficialRestDay: boolean
}

export type { HolidayInterface }
