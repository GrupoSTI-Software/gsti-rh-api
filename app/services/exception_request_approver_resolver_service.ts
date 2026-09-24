import Employee from '#models/employee'
import User from '#models/user'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import {
  EXCEPTION_REQUEST_APPROVER_LINK,
  EXCEPTION_REQUEST_ROLE_CHAIN,
  type ExceptionRequestApproverLink,
} from '#constants/exception_request_notification'
import {
  pickRecipientEmail,
  type RecipientEmailKind,
} from '#helpers/pick_recipient_email'

/** Persona a la que se le manda el aviso. */
export interface ExceptionRequestRecipient {
  /** Cuenta con la que entra al sistema. */
  userId: number
  /** Nombre con el que se le saluda en el correo. */
  fullName: string
  /** Correo elegido. */
  email: string
  /** Si el correo es el institucional, el personal o el de la cuenta. */
  emailKind: RecipientEmailKind
}

/** Eslabon que recibio el aviso y quienes lo componen. */
export interface ExceptionRequestApproverAudience {
  link: ExceptionRequestApproverLink
  recipients: ExceptionRequestRecipient[]
}

/**
 * A quien le toca enterarse de una solicitud de permiso.
 *
 * ## La cadena
 * El aviso busca al jefe directo del colaborador. Si no tiene uno asignado
 * —que es el estado normal de un cliente recien arrancado, donde los empleados
 * nacen sin jerarquia— el aviso sube: Recursos Humanos, despues administracion
 * y al final el dueno de la cuenta. Se detiene en el primer eslabon que tenga
 * al menos una persona alcanzable: no se notifica "por si acaso" a los de
 * arriba cuando el de abajo si existe.
 *
 * ## Que correo se usa
 * Primero el institucional del expediente (`employee_business_email`), porque
 * es el que la empresa controla. Si el expediente no lo tiene, el personal de
 * la persona (`person_email`). Y si tampoco, el de la cuenta con la que entra
 * al sistema, que es el ultimo lugar donde queda un correo suyo: perder el
 * aviso por no tener capturado el institucional seria dejar la solicitud sin
 * dueno.
 *
 * ## Alcance
 * Todo se busca dentro de la empresa del colaborador que pide. Un jefe o un
 * administrador de otra empresa no es un destinatario valido aunque comparta
 * instalacion.
 */
export default class ExceptionRequestApproverResolverService {
  /**
   * Resuelve a quien avisarle del permiso que pidio un colaborador.
   *
   * @param employee - Colaborador que levanta la solicitud.
   * @returns El eslabon alcanzado y sus destinatarios, o `null` si la cadena
   *   completa se quedo sin nadie con correo.
   */
  async resolveForEmployee(employee: Employee): Promise<ExceptionRequestApproverAudience | null> {
    const jefes = await this.resolveDirectBosses(employee)

    if (jefes.length > 0) {
      return { link: EXCEPTION_REQUEST_APPROVER_LINK.DIRECT_BOSS, recipients: jefes }
    }

    for (const eslabon of EXCEPTION_REQUEST_ROLE_CHAIN) {
      const destinatarios = await this.resolveByRoleSlugs(employee.businessUnitId, eslabon.slugs)

      if (destinatarios.length > 0) {
        return { link: eslabon.link, recipients: destinatarios }
      }
    }

    return null
  }

  /**
   * Correo con el que se alcanza al propio colaborador que pidio el permiso.
   *
   * Misma preferencia que para los aprobadores —institucional, personal, cuenta—
   * porque la pregunta es la misma: cual de los correos que la empresa tiene
   * capturados de esta persona llega.
   *
   * @param employee - Colaborador que pidio el permiso.
   * @param fallbackUser - Cuenta que levanto la solicitud, para el ultimo
   *   recurso cuando el expediente no tiene ningun correo capturado.
   * @returns El destinatario, o `null` si no hay ningun correo suyo.
   */
  async resolveEmployeeRecipient(
    employee: Employee,
    fallbackUser: User | null
  ): Promise<ExceptionRequestRecipient | null> {
    if (!employee.person) {
      await employee.load('person')
    }

    const elegido = pickRecipientEmail({
      business: employee.employeeBusinessEmail,
      personal: employee.person?.personEmail,
      account: fallbackUser?.userEmail,
    })

    if (!elegido) {
      return null
    }

    const persona = employee.person

    const nombre = persona
      ? [persona.personFirstname, persona.personLastname, persona.personSecondLastname]
          .map((parte) => `${parte ?? ''}`.trim())
          .filter((parte) => parte.length > 0)
          .join(' ')
      : ''

    return {
      userId: fallbackUser?.userId ?? 0,
      fullName: nombre,
      email: elegido.email,
      emailKind: elegido.emailKind,
    }
  }

  /**
   * Jefes directos del colaborador con correo alcanzable.
   *
   * La jerarquia vive en `user_responsible_employee`: un usuario responsable de
   * un empleado, marcado como jefe directo. Puede haber mas de uno y todos se
   * enteran, porque cualquiera de ellos puede resolver.
   */
  private async resolveDirectBosses(employee: Employee): Promise<ExceptionRequestRecipient[]> {
    const asignaciones = await UserResponsibleEmployee.query()
      .where('employee_id', employee.employeeId)
      .where('user_responsible_employee_direct_boss', 1)
      .whereNull('user_responsible_employee_deleted_at')
      .select('user_id')

    const userIds = [...new Set(asignaciones.map((asignacion) => asignacion.userId))]

    if (userIds.length === 0) {
      return []
    }

    const usuarios = await User.query()
      .whereIn('user_id', userIds)
      .whereNull('user_deleted_at')
      .where('user_active', 1)
      .preload('person')

    return this.toRecipients(usuarios)
  }

  /**
   * Usuarios activos de la empresa cuyo rol cae en alguno de los slugs dados.
   *
   * El slug se compara normalizado porque lo captura cada cliente al crear sus
   * roles y llega con mayusculas o espacios de sobra con la misma facilidad con
   * la que llega limpio.
   */
  private async resolveByRoleSlugs(
    businessUnitId: number,
    slugs: readonly string[]
  ): Promise<ExceptionRequestRecipient[]> {
    const usuarios = await User.query()
      .whereNull('user_deleted_at')
      .where('user_active', 1)
      .whereHas('role', (roleQuery) => {
        roleQuery
          .whereNull('role_deleted_at')
          .where('role_active', 1)
          .whereIn('role_slug', slugs.map((slug) => slug.toLowerCase()))
      })
      .whereHas('businessUnits', (businessUnitQuery) => {
        businessUnitQuery
          .where('business_units.business_unit_id', businessUnitId)
          .where('business_units.business_unit_active', 1)
          .whereNull('business_units.business_unit_deleted_at')
      })
      .preload('person')

    return this.toRecipients(usuarios)
  }

  /**
   * Convierte usuarios en destinatarios, descartando a los que no tienen ningun
   * correo y a los repetidos.
   */
  private async toRecipients(usuarios: User[]): Promise<ExceptionRequestRecipient[]> {
    if (usuarios.length === 0) {
      return []
    }

    const correosInstitucionales = await this.fetchBusinessEmails(
      usuarios.map((usuario) => usuario.personId).filter((personId): personId is number => !!personId)
    )

    const vistos = new Set<string>()
    const destinatarios: ExceptionRequestRecipient[] = []

    for (const usuario of usuarios) {
      const elegido = this.pickEmail(usuario, correosInstitucionales.get(usuario.personId))

      if (!elegido) {
        continue
      }

      const clave = elegido.email.toLowerCase()

      if (vistos.has(clave)) {
        continue
      }

      vistos.add(clave)
      destinatarios.push({
        userId: usuario.userId,
        fullName: this.fullNameOf(usuario),
        email: elegido.email,
        emailKind: elegido.emailKind,
      })
    }

    return destinatarios
  }

  /**
   * Correo institucional por persona, leido del expediente vivo.
   *
   * Se pide en una sola consulta para todos los destinatarios en vez de una por
   * cabeza: la cadena puede resolver a un area completa de Recursos Humanos.
   */
  private async fetchBusinessEmails(personIds: number[]): Promise<Map<number, string>> {
    if (personIds.length === 0) {
      return new Map()
    }

    const empleados = await Employee.query()
      .whereIn('person_id', [...new Set(personIds)])
      .whereNull('employee_deleted_at')
      .select('person_id', 'employee_business_email')

    const porPersona = new Map<number, string>()

    for (const empleado of empleados) {
      const correo = `${empleado.employeeBusinessEmail ?? ''}`.trim()

      if (correo.length > 0 && !porPersona.has(empleado.personId)) {
        porPersona.set(empleado.personId, correo)
      }
    }

    return porPersona
  }

  /** Institucional, personal y al final el de la cuenta. El primero que exista. */
  private pickEmail(
    usuario: User,
    correoInstitucional: string | undefined
  ): { email: string; emailKind: RecipientEmailKind } | null {
    return pickRecipientEmail({
      business: correoInstitucional,
      personal: usuario.person?.personEmail,
      account: usuario.userEmail,
    })
  }

  /** Nombre completo de la persona detras de la cuenta. */
  private fullNameOf(usuario: User): string {
    const persona = usuario.person

    if (!persona) {
      return ''
    }

    return [persona.personFirstname, persona.personLastname, persona.personSecondLastname]
      .map((parte) => `${parte ?? ''}`.trim())
      .filter((parte) => parte.length > 0)
      .join(' ')
  }
}
