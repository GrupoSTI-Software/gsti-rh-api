import Customer from '#models/customer'
import vine from '@vinejs/vine'

export const createCustomerValidator = vine.compile(
  vine.object({
    personId: vine
      .number()
      .min(1)
      .unique(async (_db, value) => {
        const existingPersonId = await Customer.query()
          .where('person_id', value)
          .whereNull('customer_deleted_at')
          .first()
        return !existingPersonId
      }),
  })
)
export const updateCustomerValidator = vine.compile(
  vine.object({
    customerHireDate: vine.date({
      formats: ['YYYY-MM-DD', 'x'],
    }),
  })
)
