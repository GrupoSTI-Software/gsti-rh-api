/**
 * Limites del alta de solicitudes de permiso que levanta el propio colaborador
 * desde la app.
 *
 * El alta es la unica entrada del modulo exenta de `permissionGate` (D-08):
 * la comparten el backoffice, donde Recursos Humanos levanta solicitudes a
 * nombre de terceros, y la app, donde cada quien pide lo suyo. Por eso los
 * topes viven aqui y no en la ruta: valen para las dos ramas.
 */

/**
 * Dias consecutivos maximos por peticion.
 *
 * Cada dia se guarda como una solicitud propia, asi que este numero es tambien
 * el tope de filas que una sola llamada puede crear. Treinta y uno cubre el mes
 * natural mas largo, que es el horizonte real de un permiso; una incapacidad
 * larga se captura desde el backoffice, no desde la app.
 */
export const MAX_DAYS_TO_APPLY = 31

/**
 * Comprobantes que el colaborador puede subir a su propia solicitud.
 *
 * Tres alcanzan para una constancia de dos hojas fotografiadas mas un extra;
 * sin tope, el adjunto opcional se vuelve almacenamiento ilimitado por cuenta.
 */
export const MAX_SELF_ATTACHMENTS = 3

/**
 * Estatus con el que nace toda solicitud levantada por el propio colaborador.
 *
 * El alta acepta `exceptionRequestStatus` del cliente porque el backoffice
 * registra permisos ya autorizados. En la rama de autoservicio ese campo se
 * ignora y se fuerza este valor: quien pide no resuelve.
 */
export const SELF_SERVICE_INITIAL_STATUS = 'pending' as const
