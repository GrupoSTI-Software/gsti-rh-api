import factory from '@adonisjs/lucid/factories'
import Person from '#models/person'

/**
 * Nombres demo fijos que usa el sistema DEMO actualmente en employee_service.ts
 * Se mantiene la misma lista de 40 personas para consistencia con createEmployeeDemo().
 */
const DEMO_PEOPLE = [
  { firstName: 'Juan',      lastName: 'Pérez',      secondLastName: 'López',     gender: 'Hombre', birthday: '1991-02-14', phone: '1234567890', email: 'juan.perez@example.com',           maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'María',     lastName: 'González',   secondLastName: 'Hernández', gender: 'Mujer',  birthday: '1991-11-30', phone: '1234567890', email: 'maria.gonzalez@example.com',        maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'José',      lastName: 'Martínez',   secondLastName: 'Ramírez',   gender: 'Hombre', birthday: '1992-01-08', phone: '1234567890', email: 'jose.martinez@example.com',         maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Ana',       lastName: 'Rodríguez',  secondLastName: 'Cruz',      gender: 'Mujer',  birthday: '1992-06-19', phone: '1234567890', email: 'ana.rodriguez@example.com',         maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Carlos',    lastName: 'López',      secondLastName: 'García',    gender: 'Hombre', birthday: '1992-12-27', phone: '1234567890', email: 'carlos.lopez@example.com',          maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Guadalupe', lastName: 'Sánchez',    secondLastName: 'Flores',    gender: 'Mujer',  birthday: '1993-05-14', phone: '1234567890', email: 'guadalupe.sanchez@example.com',     maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Luis',      lastName: 'Hernández',  secondLastName: 'Torres',    gender: 'Hombre', birthday: '1993-10-22', phone: '1234567890', email: 'luis.hernandez@example.com',        maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Rosa',      lastName: 'Morales',    secondLastName: 'Jiménez',   gender: 'Mujer',  birthday: '1994-02-03', phone: '1234567890', email: 'rosa.morales@example.com',          maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Miguel',    lastName: 'Ortiz',      secondLastName: 'Vega',      gender: 'Hombre', birthday: '1994-07-18', phone: '1234567890', email: 'miguel.ortiz@example.com',          maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Carmen',    lastName: 'Castillo',   secondLastName: 'Reyes',     gender: 'Mujer',  birthday: '1994-12-09', phone: '1234567890', email: 'carmen.castillo@example.com',       maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Jesús',     lastName: 'Ramírez',    secondLastName: 'Pérez',     gender: 'Hombre', birthday: '1995-03-21', phone: '1234567890', email: 'jesus.ramirez@example.com',         maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Laura',     lastName: 'Flores',     secondLastName: 'Mendoza',   gender: 'Mujer',  birthday: '1995-08-02', phone: '1234567890', email: 'laura.flores@example.com',          maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Francisco', lastName: 'Vargas',     secondLastName: 'Soto',      gender: 'Hombre', birthday: '1996-01-17', phone: '1234567890', email: 'francisco.vargas@example.com',      maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Patricia',  lastName: 'Rojas',      secondLastName: 'Navarro',   gender: 'Mujer',  birthday: '1996-06-28', phone: '1234567890', email: 'patricia.rojas@example.com',        maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Jorge',     lastName: 'Medina',     secondLastName: 'Aguilar',   gender: 'Hombre', birthday: '1996-11-12', phone: '1234567890', email: 'jorge.medina@example.com',          maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Teresa',    lastName: 'Luna',       secondLastName: 'Chávez',    gender: 'Mujer',  birthday: '1997-04-05', phone: '1234567890', email: 'teresa.luna@example.com',           maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Pedro',     lastName: 'Herrera',    secondLastName: 'Salas',     gender: 'Hombre', birthday: '1997-09-11', phone: '1234567890', email: 'pedro.herrera@example.com',         maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Alejandra', lastName: 'Núñez',      secondLastName: 'Pineda',    gender: 'Mujer',  birthday: '1998-01-26', phone: '1234567890', email: 'alejandra.nunez@example.com',       maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Manuel',    lastName: 'Cruz',       secondLastName: 'Romero',    gender: 'Hombre', birthday: '1998-06-14', phone: '1234567890', email: 'manuel.cruz@example.com',           maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Verónica',  lastName: 'Campos',     secondLastName: 'Silva',     gender: 'Mujer',  birthday: '1998-10-03', phone: '1234567890', email: 'veronica.campos@example.com',       maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Ricardo',   lastName: 'Mendoza',    secondLastName: 'Fuentes',   gender: 'Hombre', birthday: '1999-02-19', phone: '1234567890', email: 'ricardo.mendoza@example.com',       maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Sofía',     lastName: 'Delgado',    secondLastName: 'Moreno',    gender: 'Mujer',  birthday: '1999-07-07', phone: '1234567890', email: 'sofia.delgado@example.com',         maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Fernando',  lastName: 'Reyes',      secondLastName: 'Cabrera',   gender: 'Hombre', birthday: '2000-01-15', phone: '1234567890', email: 'fernando.reyes@example.com',        maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Adriana',   lastName: 'Pacheco',    secondLastName: 'León',      gender: 'Mujer',  birthday: '2000-04-27', phone: '1234567890', email: 'adriana.pacheco@example.com',       maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Daniel',    lastName: 'Ibarra',     secondLastName: 'Castillo',  gender: 'Hombre', birthday: '2000-08-09', phone: '1234567890', email: 'daniel.ibarra@example.com',         maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Claudia',   lastName: 'Espinoza',   secondLastName: 'Márquez',   gender: 'Mujer',  birthday: '2000-11-21', phone: '1234567890', email: 'claudia.espinoza@example.com',      maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Roberto',   lastName: 'Villanueva', secondLastName: 'Rocha',     gender: 'Hombre', birthday: '2001-03-05', phone: '1234567890', email: 'roberto.villanueva@example.com',    maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Gabriela',  lastName: 'Cárdenas',   secondLastName: 'Bautista',  gender: 'Mujer',  birthday: '2001-06-18', phone: '1234567890', email: 'gabriela.cardenas@example.com',     maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Eduardo',   lastName: 'Acosta',     secondLastName: 'Beltrán',   gender: 'Hombre', birthday: '2001-09-30', phone: '1234567890', email: 'eduardo.acosta@example.com',        maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Daniela',   lastName: 'Zúñiga',     secondLastName: 'Ortega',    gender: 'Mujer',  birthday: '2002-01-12', phone: '1234567890', email: 'daniela.zuniga@example.com',        maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Javier',    lastName: 'Salazar',    secondLastName: 'Cortés',    gender: 'Hombre', birthday: '2002-04-26', phone: '1234567890', email: 'javier.salazar@example.com',        maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Paulina',   lastName: 'Montoya',    secondLastName: 'Rangel',    gender: 'Mujer',  birthday: '2002-08-07', phone: '1234567890', email: 'paulina.montoya@example.com',       maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Antonio',   lastName: 'Galindo',    secondLastName: 'Meza',      gender: 'Hombre', birthday: '2002-11-19', phone: '1234567890', email: 'antonio.galindo@example.com',       maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Elizabeth', lastName: 'Peralta',    secondLastName: 'Trejo',     gender: 'Mujer',  birthday: '2003-03-04', phone: '1234567890', email: 'elizabeth.peralta@example.com',     maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Raúl',      lastName: 'Escobar',    secondLastName: 'Nieto',     gender: 'Hombre', birthday: '2003-06-16', phone: '1234567890', email: 'raul.escobar@example.com',          maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Mónica',    lastName: 'Valdez',     secondLastName: 'Arriaga',   gender: 'Mujer',  birthday: '2003-10-28', phone: '1234567890', email: 'monica.valdez@example.com',         maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Rosa',      lastName: 'Gonzalez',   secondLastName: 'Hernandez', gender: 'Mujer',  birthday: '2004-02-15', phone: '1234567890', email: 'rosa.gonzalez@example.com',         maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Silvia',    lastName: 'Orozco',     secondLastName: 'Sandoval',  gender: 'Mujer',  birthday: '2004-05-29', phone: '1234567890', email: 'silvia.orozco@example.com',         maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Sergio',    lastName: 'Tapia',      secondLastName: 'Calderón',  gender: 'Hombre', birthday: '2004-09-11', phone: '1234567890', email: 'sergio.tapia@example.com',          maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Norma',     lastName: 'Álvarez',    secondLastName: 'Macías',    gender: 'Mujer',  birthday: '2005-01-06', phone: '1234567890', email: 'norma.alvarez@example.com',         maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
  { firstName: 'Víctor',    lastName: 'Peña',       secondLastName: 'Solís',     gender: 'Hombre', birthday: '2005-04-20', phone: '1234567890', email: 'victor.pena@example.com',           maritalStatus: 'Single', birthState: 'México', birthCity: 'México', birthCountry: 'México' },
]

let demoPeopleIndex = 0

/**
 * Reinicia el índice del cursor de personas demo.
 * Llamar antes de cada seed para garantizar idempotencia en el orden.
 */
export function resetDemoPeopleIndex() {
  demoPeopleIndex = 0
}

/**
 * Devuelve el siguiente registro fijo de la lista DEMO_PEOPLE en orden secuencial.
 * Si se agota la lista, faker genera datos aleatorios para no romper el seeder.
 */
export function nextDemoPersonData(faker: any) {
  if (demoPeopleIndex < DEMO_PEOPLE.length) {
    return DEMO_PEOPLE[demoPeopleIndex++]
  }
  // Fallback: datos aleatorios cuando se solicitan más personas de las predefinidas
  const firstName = faker.person.firstName()
  const lastName  = faker.person.lastName()
  return {
    firstName,
    lastName,
    secondLastName: faker.person.lastName(),
    gender: faker.helpers.arrayElement(['Hombre', 'Mujer']),
    birthday: faker.date.birthdate({ min: 18, max: 55, mode: 'age' }).toISOString().split('T')[0],
    phone: faker.phone.number({ style: 'national' }).replace(/\D/g, '').slice(0, 10),
    email: faker.internet.email({ firstName, lastName }).toLowerCase(),
    maritalStatus: faker.helpers.arrayElement(['Single', 'Married', 'Divorced', 'Widowed']),
    birthState: 'México',
    birthCity: 'México',
    birthCountry: 'México',
  }
}

/**
 * Factory de Person.
 * Por defecto genera una persona con los datos fijos del DEMO (misma lista que
 * usa createDemoPerson en person_service.ts), consumiéndolos en orden secuencial.
 *
 * Uso típico desde el seeder:
 *   resetDemoPeopleIndex()
 *   const person = await PersonFactory.create()          // usa siguiente entrada fija
 *   const person = await PersonFactory.merge({ personEmail: 'x@y.com' }).create()
 */
export const PersonFactory = factory
  .define(Person, ({ faker }) => {
    const data = nextDemoPersonData(faker)
    return {
      personFirstname:          data.firstName,
      personLastname:           data.lastName,
      personSecondLastname:     data.secondLastName || '.',
      personGender:             data.gender,
      personPhone:              data.phone,
      personEmail:              data.email,
      personCurp:               '',
      personRfc:                '',
      personImssNss:            '',
      personMaritalStatus:      data.maritalStatus,
      personBirthday:           data.birthday,
      personPlaceOfBirthCountry: data.birthCountry,
      personPlaceOfBirthState:  data.birthState,
      personPlaceOfBirthCity:   data.birthCity,
      personPhoneSecondary:     '',
    }
  })
  .build()
