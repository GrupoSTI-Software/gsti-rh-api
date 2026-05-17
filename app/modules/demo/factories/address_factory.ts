import factory from '@adonisjs/lucid/factories'
import Address from '#models/address'

/**
 * Dirección fiscal/domicilio. `addressTypeId` debe unirse vía `.merge()` (p. ej. 1 = residencial).
 */
export const AddressFactory = factory
  .define(Address, ({ faker }) => {
    return {
      addressZipcode: faker.location.zipCode(),
      addressCountry: 'México',
      addressState: faker.location.state(),
      addressTownship: faker.location.city(),
      addressCity: faker.location.city(),
      addressSettlement: faker.location.street(),
      addressSettlementType: 'Colonia',
      addressStreet: faker.location.street(),
      addressInternalNumber: String(faker.number.int({ min: 1, max: 200 })),
      addressExternalNumber: String(faker.number.int({ min: 1, max: 9999 })),
      addressBetweenStreet1: faker.location.street(),
      addressBetweenStreet2: faker.location.street(),
      addressTypeId: 1,
    }
  })
  .build()
