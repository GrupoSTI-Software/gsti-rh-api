import factory from '@adonisjs/lucid/factories'
import User from '#models/user'

/**
 * Usuarios root extra que crea el DEMO — replica exactamente extraRootEmails
 * de createExtraRootUsersDemo() en user_service.ts.
 */
export interface DemoRootUserData {
  email: string
  firstname: string
  lastname: string
}

export const DEMO_ROOT_USERS: DemoRootUserData[] = [
  { email: 'desarrollo-software@gruposti.com', firstname: 'Desarrollo', lastname: 'Software' },
  { email: 'demo1@gruposti.com', firstname: 'Demo', lastname: 'Uno' },
  { email: 'demo2@gruposti.com', firstname: 'Demo', lastname: 'Dos' },
  { email: 'demo3@gruposti.com', firstname: 'Demo', lastname: 'Tres' },
  { email: 'demo4@gruposti.com', firstname: 'Demo', lastname: 'Cuatro' },
  { email: 'demo5@gruposti.com', firstname: 'Demo', lastname: 'Cinco' },
  { email: 'demo6@gruposti.com', firstname: 'Demo', lastname: 'Seis' },
  { email: 'demo7@gruposti.com', firstname: 'Demo', lastname: 'Siete' },
  { email: 'demo8@gruposti.com', firstname: 'Demo', lastname: 'Ocho' },
  { email: 'demo9@gruposti.com', firstname: 'Demo', lastname: 'Nueve' },
  { email: 'demo10@gruposti.com', firstname: 'Demo', lastname: 'Diez' },
  { email: 'demo11@gruposti.com', firstname: 'Demo', lastname: 'Once' },
  { email: 'demo12@gruposti.com', firstname: 'Demo', lastname: 'Doce' },
  { email: 'demo13@gruposti.com', firstname: 'Demo', lastname: 'Trece' },
  { email: 'demo14@gruposti.com', firstname: 'Demo', lastname: 'Catorce' },
  { email: 'demo15@gruposti.com', firstname: 'Demo', lastname: 'Quince' },
]

/** Contraseña por defecto para todos los usuarios DEMO */
export const DEMO_DEFAULT_PASSWORD = 'GrupoSTI'

/**
 * Asignación de roles por posición/departamento — replica la lógica
 * de createUsersDemo() en user_service.ts.
 *
 * Reglas:
 *  - Director general           → super-administrador
 *  - Departamento Recursos Humanos → rh-manager
 *  - Todos los demás            → empleado
 *  - Usuarios root extra        → root
 */
export const DEMO_ROLE_RULES = {
  directorPositionAlias: 'Director general',
  hrDepartmentAlias: 'Recursos Humanos',
  roles: {
    director: 'super-administrador',
    hr: 'rh-manager',
    employee: 'empleado',
    root: 'root',
  },
} as const

/**
 * Factory de User para datos DEMO.
 *
 * Los campos que dependen del contexto (userEmail, roleId, personId) deben
 * pasarse con .merge() desde el seeder. El acceso multi-tenant ya NO se inyecta
 * por este factory: las asociaciones a `business_units` se hacen vía la pivote
 * `business_unit_users` después del create.
 *
 * Uso desde el seeder:
 *   const user = await UserFactory.merge({
 *     userEmail: person.personEmail,
 *     roleId:    role.roleId,
 *     personId:  person.personId,
 *   }).create()
 *
 *   await user.related('businessUnits').attach(businessUnitIds)
 */
export const UserFactory = factory
  .define(User, () => {
    return {
      userEmail: 'demo@example.com',
      userPassword: DEMO_DEFAULT_PASSWORD,
      userActive: 1,
      roleId: 1,
      personId: 0,
      userBusinessAccess: null,
      userToken: '',
      userEmailType: 'institutional',
    }
  })
  .build()
