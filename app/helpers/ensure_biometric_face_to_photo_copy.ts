import type { HttpContext } from '@adonisjs/core/http'
import type { PermissionGateOptions } from '#constants/permission_gate'
import { respondPermissionGateDenial } from '#helpers/permission_gate_http'
import PermissionGateService from '#services/permission_gate_service'

/**
 * Puerta de la copia del rostro biometrico a la foto de perfil del colaborador.
 *
 * La operacion CRUZA dos categorias: lee un dato biometrico
 * (`tab-biometricos-read`, cifrado en reposo y enmascarado en la API) y escribe
 * una foto de perfil (`tab-foto-write`, que se sirve en claro a quien tenga
 * `tab-trabajo-read` y viaja al gafete, al correo de RH y al DTO de asistencia).
 * Por eso se exigen los DOS permisos, no uno cualquiera de los dos:
 * `PermissionGateService` resuelve un arreglo de acciones con `some`, es decir
 * en OR, asi que declararlas juntas en una sola opcion abriria la copia a quien
 * solo tiene el permiso de foto.
 *
 * Resuelve con `evaluateEnforced` y NO con `evaluate` por el mismo motivo que
 * `ensureEmployeeBiometricRead`: el interruptor de exigencia del modulo
 * `employees` esta apagado, asi que `evaluate` devolveria `module-not-enforced`
 * y concederia la copia a cualquier sesion autenticada de la unidad.
 *
 * Tampoco exime al dueño del registro. Esta es una accion de administracion del
 * Backoffice, no una lectura que el colaborador necesite de si mismo: dejar que
 * una sesion de empleado promueva su propio rostro biometrico a foto publica de
 * su expediente seria darle una via para sacar el dato de su categoria.
 *
 * @param ctx        Contexto HTTP; de el salen la sesion y la respuesta de negacion.
 * @param biometrico Declaracion del permiso de lectura biometrica.
 * @param foto       Declaracion del permiso de escritura de la foto de perfil.
 *
 * @returns `true` si la sesion tiene ambos permisos. Si falta cualquiera,
 *          responde la negacion en `ctx` y devuelve `false`.
 */
export async function ensureBiometricFaceToPhotoCopy(
  ctx: HttpContext,
  biometrico: PermissionGateOptions,
  foto: PermissionGateOptions
): Promise<boolean> {
  const service = ctx.permissionGate ?? (ctx.permissionGate = new PermissionGateService())

  const lecturaBiometrica = await service.evaluateEnforced(ctx.auth.user, biometrico)
  if (!lecturaBiometrica.allowed) {
    respondPermissionGateDenial(ctx, lecturaBiometrica)
    return false
  }

  const escrituraFoto = await service.evaluateEnforced(ctx.auth.user, foto)
  if (!escrituraFoto.allowed) {
    respondPermissionGateDenial(ctx, escrituraFoto)
    return false
  }

  return true
}
