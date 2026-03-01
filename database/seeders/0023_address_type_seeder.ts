import { BaseSeeder } from '@adonisjs/lucid/seeders'
import AddressType from '#models/address_type'

export default class extends BaseSeeder {
  async run() {
    const addressTypes = [
      {
        addressTypeId: 1,
        addressTypeName: 'residential',
        addressTypeDescription: 'residential',
        addressTypeSlug: 'residencia',
        addressTypeActive: 1,
      },
    ]

    for (const addressType of addressTypes) {
      const { addressTypeId, ...addressTypeData } = addressType
      await AddressType.firstOrCreate({ addressTypeId }, addressTypeData)
    }
  }
}

