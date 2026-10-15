import { PLATFORM_DEVICE_ERROR_CODES } from '#constants/platform_device_error_codes'
import { PlatformDeviceServiceError } from '#exceptions/platform_device_service_error'

/**
 * Errores del landlord al otorgar y revocar invitaciones a un checador
 * (VLRH-P0065, 7.1). Son errores de plataforma: el controlador los traduce con
 * `resolvePlatformDeviceApiError` a titulo / detalle / key, igual que el resto
 * del inventario de dispositivos.
 */
export const AccessPointShareErrors = {
  noAssignment(): PlatformDeviceServiceError {
    return new PlatformDeviceServiceError(
      'El checador no tiene entrega vigente',
      PLATFORM_DEVICE_ERROR_CODES.SHARE_NO_ASSIGNMENT,
      409,
      'unidad-sin-asignacion',
      'Solo se puede compartir un checador entregado a una empresa y con su punto de acceso vivo.'
    )
  },

  duplicate(): PlatformDeviceServiceError {
    return new PlatformDeviceServiceError(
      'Invitacion duplicada',
      PLATFORM_DEVICE_ERROR_CODES.SHARE_DUPLICATE,
      409,
      'invitacion-duplicada',
      'La empresa ya es la responsable del checador o ya tiene una invitacion vigente.'
    )
  },

  outsideGroup(): PlatformDeviceServiceError {
    return new PlatformDeviceServiceError(
      'Empresa fuera del grupo',
      PLATFORM_DEVICE_ERROR_CODES.SHARE_OUTSIDE_GROUP,
      422,
      'empresa-fuera-del-grupo',
      'Solo se puede invitar a empresas del mismo grupo que la responsable del checador.'
    )
  },

  notFound(): PlatformDeviceServiceError {
    return new PlatformDeviceServiceError(
      'Invitacion no encontrada',
      PLATFORM_DEVICE_ERROR_CODES.SHARE_NOT_FOUND,
      404,
      'invitacion-no-encontrada',
      'La invitacion no existe o no pertenece a este checador.'
    )
  },
}
