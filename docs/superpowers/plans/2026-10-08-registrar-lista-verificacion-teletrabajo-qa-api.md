# Prueba manual API — Listas de verificación de teletrabajo (NOM-037)

**Problema:** la NOM-037 obliga a revisar las condiciones del lugar donde trabaja cada persona que hace teletrabajo, pero no había dónde dejar constancia de esa revisión. Cuando llega una inspección no hay forma de mostrar qué se revisó, quién lo revisó y cuándo, ni de saber si la revisión sigue vigente o ya toca repetirla; tampoco hay historial por teletrabajador.

**Solución:** ahora el sistema guarda, por cada teletrabajador, una **lista de verificación** con siete puntos. Se registra la visita de la Comisión de Seguridad e Higiene con la fecha, quién la hizo, el lugar y el resultado punto por punto; el sistema calcula si quedó aprobada o no y cuándo vuelve a tocar revisarla, según la periodicidad que la empresa tenga configurada. Se puede consultar el historial de cada teletrabajador y el detalle de cada revisión. La revisión que se registra nueva sustituye a la anterior, que queda como reemplazada.

Ejemplo: es como el sello de la revisión de la instalación de gas en la casa; anotas la fecha, quién la hizo y qué encontró. Sirve para demostrar que está al día y para saber cuándo toca otra vez.

## Glosario

- **Lista de verificación**: la revisión de las condiciones del lugar de teletrabajo, punto por punto.
- **Punto**: cada condición que se revisa (iluminación, ventilación, mobiliario, etc.).
- **Lista registrada**: una revisión ya guardada, con su fecha, resultado y vencimiento.
- **Visita de la Comisión**: la revisión que hace la Comisión de Seguridad e Higiene (CSH) de la empresa.
- **Teletrabajador**: quien trabaja desde casa (modalidad Híbrido o Home Office).
- **Vigente**: la lista que rige hoy para el teletrabajador.
- **Periodicidad de revalidación**: cada cuántos meses hay que volver a revisar.
- **Autor**: la persona con sesión que registró la lista.

Se prueba con un cliente de API (Postman, Insomnia, Bruno).

## Preparar

Prerrequisito de ambiente: la base de pruebas (`sae_pruebas`) al día, es decir, con las migraciones y las semillas oficiales ya corridas (`NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`). Eso deja los siete puntos de la lista y el módulo declarados en el catálogo. Sin eso, el Escenario 1 sale con la lista de puntos vacía.

Ejecutar el seeder compartido **contra la misma base del API local de pruebas**:

```bash
NODE_ENV=test DB_DATABASE=sae_pruebas node ace db:seed --files="database/seeders/_tmp_do_not_commit_qa_seeder.ts"
```

Al terminar debe aparecer en consola la línea `[qa-seeder] QA Lista de verificación:` (sin avisos de permisos faltantes). Deja:

- **`QA TWC Empresa A`**: sin ajustes de teletrabajo guardados; con **Pedro** (Híbrido, con un lugar de teletrabajo vivo y otro dado de baja) y **Rosa** (Presencial, con un lugar vivo que no es el suyo).
- **`QA TWC Empresa B`**: con su propio teletrabajador (**Bruno**, Híbrido) y su propia cuenta.
- Cuatro cuentas (tabla más abajo) con la contraseña `password`.

Volver a correrlo deja todo otra vez como al inicio: sin listas registradas y sin ajustes guardados en las dos empresas.

**Datos que resuelve la base.** Cópialos aquí; no los escribas de memoria. Los números internos cambian de una base a otra. En los cuerpos y respuestas de más abajo, lo que va entre `<...>` se resuelve con estas consultas o se calcula para el día de la corrida.

Empresas y su código público (el código público es el que va en el header `X-Business-Unit-Id`):

```sql
SELECT business_unit_slug,
       business_unit_id,
       business_unit_public_id
FROM business_units
WHERE business_unit_slug IN ('qa-twc-empresa-a', 'qa-twc-empresa-b')
ORDER BY business_unit_slug;
```

Resultado: 2 filas. El `business_unit_id` es el número interno (para las consultas); el `business_unit_public_id` es el código que va en el header.

Colaboradores:

```sql
SELECT employee_payroll_code,
       employee_id,
       employee_work_schedule,
       business_unit_id
FROM employees
WHERE employee_payroll_code IN ('QA-TWC-PEDRO', 'QA-TWC-ROSA', 'QA-TWC-BRUNO')
  AND employee_deleted_at IS NULL
ORDER BY employee_payroll_code;
```

Resultado: 3 filas. `QA-TWC-PEDRO` y `QA-TWC-BRUNO` con modalidad `Hybrid`; `QA-TWC-ROSA` con `Onsite`; Bruno con el número interno de la empresa B.

Lugares de teletrabajo de la empresa A:

```sql
SELECT employee_id,
       employee_telework_location_id,
       employee_telework_location_street,
       employee_telework_location_active
FROM employee_telework_locations
WHERE business_unit_id = <id interno de la empresa A>
ORDER BY employee_id, employee_telework_location_id;
```

Resultado: 3 filas. Por la calle distingues cuál es cuál: la de **Pedro** viva (`Calle QA TWC Pedro Vivo`, `active` en 1), la de **Pedro** dada de baja (`Calle QA TWC Pedro Baja`, `active` en 0) y la de **Rosa** viva (`Calle QA TWC Rosa Viva`).

Puntos de la lista (sus ids son los que van en los cuerpos):

```sql
SELECT telework_checklist_item_id,
       telework_checklist_item_code
FROM telework_checklist_items
WHERE telework_checklist_item_is_active = 1
ORDER BY telework_checklist_item_order;
```

Resultado: 7 filas, en este orden: `iluminacion`, `ventilacion_temperatura`, `mobiliario`, `instalacion_electrica`, `orden_y_limpieza`, `ruido`, `primeros_auxilios_emergencia`.

Cuenta de la empresa A (su número va en `appliedByUserId`):

```sql
SELECT user_id
FROM users
WHERE user_email = 'qa-twc-full@gsti-tests.local';
```

Resultado: 1 fila.

**URL base:** `http://127.0.0.1:3333`

**Headers de todas las peticiones:** `Accept-Language: es` (los textos salen en español), `X-Business-Unit-Id: <código público de la empresa>` y `Authorization: Bearer <token>`.

### Login por producto

- **Backoffice** — `POST /api/auth/login`

Cuerpo (el correo lo indica cada escenario):

```json
{ "userEmail": "<correo>", "userPassword": "password" }
```

El token sale en `data.token` y se envía en `Authorization: Bearer <token>`. Todas las cuentas de este manual entran por el backoffice.

### Usuarios

| | Correo | Contraseña | Login (producto) | Variante |
|---|---|---|---|---|
| **A** | `qa-twc-full@gsti-tests.local` | `password` | Backoffice | RH de la empresa A con el módulo completo: consulta y registra listas, y también guarda los ajustes de teletrabajo |
| **B** | `qa-twc-lector@gsti-tests.local` | `password` | Backoffice | RH de la empresa A que **solo consulta** (no registra) |
| **C** | `qa-twc-none@gsti-tests.local` | `password` | Backoffice | RH de la empresa A **sin acceso** al módulo |
| **D** | `qa-twc-empresa-b@gsti-tests.local` | `password` | Backoffice | RH de la **empresa B** (otra empresa), con el módulo completo |

En cada escenario el header `X-Business-Unit-Id` lleva el código público de la empresa de la cuenta: **A**, **B** y **C** → empresa A; **D** → empresa B.

## Escenarios

### 1. Cualquier persona con sesión ve los puntos de la lista

Objetivo: comprobar que los siete puntos de la lista, con su texto, los ve cualquier persona con sesión de la empresa, aunque no tenga permiso del módulo.

Usuario: **C** (sin acceso al módulo), para probar que mirar la lista de puntos no exige un permiso especial.

**Endpoint:** `GET /api/nom037/telework-checklists/items`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Listas de verificación de teletrabajo",
  "message": "Puntos de la lista de verificación obtenidos correctamente.",
  "data": [
    { "itemId": <id de iluminacion>, "code": "iluminacion", "label": "Iluminación suficiente del área de trabajo" },
    { "itemId": <id de ventilacion_temperatura>, "code": "ventilacion_temperatura", "label": "Ventilación y temperatura adecuadas" },
    { "itemId": <id de mobiliario>, "code": "mobiliario", "label": "Silla y mesa adecuadas" },
    { "itemId": <id de instalacion_electrica>, "code": "instalacion_electrica", "label": "Instalación eléctrica sin riesgos visibles" },
    { "itemId": <id de orden_y_limpieza>, "code": "orden_y_limpieza", "label": "Espacio ordenado y libre de obstáculos" },
    { "itemId": <id de ruido>, "code": "ruido", "label": "Nivel de ruido que permite trabajar" },
    { "itemId": <id de primeros_auxilios_emergencia>, "code": "primeros_auxilios_emergencia", "label": "Medios para atender una emergencia" }
  ]
}
```

Qué significa cada dato:

- `type`: cómo salió la petición. En las que funcionan vale `success`; las que se rechazan traen `error` y se explican en su escenario.
- `title` / `message`: el encabezado y la frase de la respuesta correcta.
- `data`: la lista de puntos, en su orden de presentación.
- `itemId`: el número interno del punto; es el que va en los cuerpos de los demás escenarios.
- `code`: la clave corta del punto.
- `label`: el texto del punto que se le muestra a la persona.

### 2. Registrar la visita de la Comisión con un punto que no cumple

Objetivo: comprobar que al registrar la visita de la Comisión con la fecha de hoy la lista queda vigente, marcada como no aprobada por el punto que no cumple, y con su vencimiento a doce meses.

Usuario: **A**.

**Endpoint:** `POST /api/nom037/telework-checklists`

Cuerpo (`appliedAt` es la fecha de hoy en la zona de la Ciudad de México, en formato `AAAA-MM-DD`; el registro se hace con el punto `mobiliario` que no cumple):

```json
{
  "employeeId": <id de Pedro>,
  "appliedAt": "<hoy>",
  "inspectorName": "Lic. Marta Solis",
  "teleworkLocationId": <id del lugar vivo de Pedro>,
  "answers": [
    { "itemId": <id de iluminacion>, "result": "cumple" },
    { "itemId": <id de ventilacion_temperatura>, "result": "cumple" },
    { "itemId": <id de mobiliario>, "result": "no_cumple" },
    { "itemId": <id de instalacion_electrica>, "result": "cumple" },
    { "itemId": <id de orden_y_limpieza>, "result": "cumple" },
    { "itemId": <id de ruido>, "result": "cumple" },
    { "itemId": <id de primeros_auxilios_emergencia>, "result": "cumple" }
  ]
}
```

Guarda el `applicationId` que devuelve: se usa en los escenarios siguientes.

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Listas de verificación de teletrabajo",
  "message": "Visita de la Comisión registrada correctamente.",
  "data": {
    "applicationId": <id de la lista>,
    "mode": "visita_csh",
    "status": "vigente",
    "overallResult": "no_aprobada",
    "appliedAt": "<hoy>",
    "expiresAt": "<hoy + 12 meses>",
    "revalidationPeriodMonths": 12,
    "appliedByUserId": <id de la cuenta A>,
    "invalidatedAt": null,
    "invalidationReason": null,
    "employeeId": <id de Pedro>,
    "teleworkLocationId": <id del lugar vivo de Pedro>,
    "inspectorName": "Lic. Marta Solis",
    "notes": null,
    "answers": [
      { "itemId": <id de iluminacion>, "code": "iluminacion", "label": "Iluminación suficiente del área de trabajo", "result": "cumple", "observation": null },
      { "itemId": <id de mobiliario>, "code": "mobiliario", "label": "Silla y mesa adecuadas", "result": "no_cumple", "observation": null },
      { "itemId": <id de primeros_auxilios_emergencia>, "code": "primeros_auxilios_emergencia", "label": "Medios para atender una emergencia", "result": "cumple", "observation": null },
      "... las 4 respuestas restantes, con la misma forma y en el orden de la lista ..."
    ]
  }
}
```

Qué significa cada dato:

- `applicationId`: el identificador de esta lista registrada; se usa para pedir el detalle.
- `mode`: cómo se originó la lista. Puede valer `visita_csh` (la registra la Comisión de Seguridad e Higiene; es la que produce esta historia) o `autoaplicada` (la llena el propio colaborador; todavía no se puede provocar aquí).
- `status`: la vigencia de la lista. Puede valer `vigente` (rige hoy), `vencida` (pasó su fecha de revalidación sin que la reemplazaran), `invalidada` (se anuló, por ejemplo por un cambio de domicilio) o `reemplazada` (una lista más nueva la sustituyó).
- `overallResult`: el resultado de la revisión. Puede valer `no_aprobada` (al menos un punto no cumple) o `aprobada` (todos cumplen).
- `appliedAt` / `expiresAt`: el día de la visita y el día en que toca volver a revisar.
- `revalidationPeriodMonths`: cada cuántos meses se revalida; sale de la periodicidad configurada por la empresa (12 por defecto). Queda congelada en la lista: aunque después cambie la periodicidad de la empresa, esta lista conserva la suya.
- `appliedByUserId`: la cuenta que registró la lista.
- `invalidatedAt` / `invalidationReason`: cuándo y por qué se anuló; `null` mientras no se anule.
- `employeeId`: el teletrabajador revisado.
- `teleworkLocationId` / `inspectorName` / `notes`: el lugar revisado, quién hizo la visita y las notas libres (aquí no se mandaron notas).
- `answers`: las respuestas punto por punto. Cada una trae `itemId`, `code`, `label`, `result` y `observation`.
- `result`: cómo salió un punto. Puede valer `cumple` (sí cumple), `no_cumple` (no cumple) o `no_aplica` (esa condición no aplica al lugar).

### 3. El historial del teletrabajador

Objetivo: comprobar que al registrar una segunda visita la nueva queda como la vigente y la anterior pasa a reemplazada, y que el historial muestra las dos, la más nueva primero.

Usuario: **A**.

Paso 1 — registra otra visita: repite el cuerpo del Escenario 2 → `201`, con un `applicationId` nuevo y `"status": "vigente"`.

Paso 2 — pide el historial:

**Endpoint:** `GET /api/nom037/telework-checklists/employees/<id de Pedro>`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Listas de verificación de teletrabajo",
  "message": "Historial de la lista de verificación obtenido correctamente.",
  "data": {
    "employeeId": <id de Pedro>,
    "current": {
      "applicationId": <id de la lista nueva>,
      "mode": "visita_csh",
      "status": "vigente",
      "overallResult": "no_aprobada",
      "appliedAt": "<hoy>",
      "expiresAt": "<hoy + 12 meses>",
      "revalidationPeriodMonths": 12,
      "appliedByUserId": <id de la cuenta A>,
      "invalidatedAt": null,
      "invalidationReason": null
    },
    "history": [
      { "applicationId": <id de la lista nueva>, "status": "vigente", "...": "los demás datos, como en current" },
      { "applicationId": <id de la lista anterior>, "status": "reemplazada", "...": "los demás datos, como en current" }
    ]
  }
}
```

Qué significa cada dato:

- `current`: la lista vigente del teletrabajador, o `null` si no tiene ninguna.
- `history`: todas sus listas, la más nueva primero. Aquí la primera es la vigente y la segunda es la que aquella reemplazó.
- (Los demás datos son los ya explicados en el Escenario 2.)

### 4. La periodicidad se congela al registrar

Objetivo: comprobar que, al cambiar los ajustes de la empresa a seis meses, la visita que se registra después vence a seis meses, mientras la anterior conserva el vencimiento que ya tenía.

Usuario: **A**.

Paso 1 — pon la periodicidad de la empresa A en 6 meses:

**Endpoint:** `PUT /api/nom037/telework-settings`

Cuerpo:

```json
{
  "revalidationPeriodMonths": 6,
  "expirationNoticeDays": 15,
  "electricityAllowanceDefault": null,
  "internetAllowanceDefault": null,
  "ownEquipmentFeeDefault": null
}
```

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Ajustes de teletrabajo",
  "message": "Ajustes de teletrabajo guardados correctamente.",
  "data": {
    "isDefault": false,
    "teleworkComplianceSettingId": <id de los ajustes>,
    "revalidationPeriodMonths": 6,
    "expirationNoticeDays": 15,
    "electricityAllowanceDefault": null,
    "internetAllowanceDefault": null,
    "ownEquipmentFeeDefault": null,
    "updatedAt": "<fecha y hora>",
    "updatedByName": "..."
  }
}
```

Paso 2 — registra otra visita: repite el cuerpo del Escenario 2 → `201`, ahora con `"revalidationPeriodMonths": 6` y `"expiresAt"` a seis meses de hoy. Guarda su `applicationId`.

Paso 3 — comprueba en la base que cada lista conserva su periodicidad y su vencimiento:

```sql
SELECT telework_checklist_application_id,
       telework_checklist_application_revalidation_period_months,
       telework_checklist_application_expires_at,
       telework_checklist_application_status
FROM telework_checklist_applications
WHERE business_unit_id = <id interno de la empresa A>
  AND employee_id = <id de Pedro>
ORDER BY telework_checklist_application_id;
```

Resultado: 3 filas. Las dos visitas más viejas con `12` meses y su vencimiento original; la más nueva con `6` meses y su vencimiento a seis meses.

Qué significa lo nuevo aquí:

- `isDefault`: si los ajustes son los de fábrica (`true`) o los que guardó la empresa (`false`).
- `teleworkComplianceSettingId`: el número interno de los ajustes guardados; `null` cuando son los de fábrica.
- `revalidationPeriodMonths` / `expirationNoticeDays`: cada cuántos meses se revalida y con cuántos días de aviso.
- `electricityAllowanceDefault` / `internetAllowanceDefault` / `ownEquipmentFeeDefault`: los montos mensuales que la empresa propone por luz, internet y uso de equipo propio; `null` quiere decir que no propone monto.
- `updatedAt` / `updatedByName`: cuándo y quién guardó los ajustes.

### 5. Se rechaza lo que está mal y no deja rastro

Objetivo: comprobar que una visita a la que le falta un punto, que repite un punto, que trae un punto inventado, una fecha futura, sin visitador, con un lugar que no es del teletrabajador (o dado de baja) o para alguien que no teletrabaja se rechaza con su aviso propio y no crea ninguna lista.

Usuario: **A**.

Paso 0 — cuenta lo que hay antes, para comparar al final:

```sql
SELECT COUNT(*) AS aplicaciones
FROM telework_checklist_applications
WHERE business_unit_id = <id interno de la empresa A>;

SELECT COUNT(*) AS respuestas
FROM telework_checklist_answers
WHERE business_unit_id = <id interno de la empresa A>;
```

Anota los dos números (tras los Escenarios 2 a 4 deben ser 3 aplicaciones y 21 respuestas).

Luego repite el cuerpo del Escenario 2 cambiando **solo** lo que indica cada caso. Los ocho deben responder `422`.

**5.1 Un punto faltante** (quita una respuesta del arreglo):

```json
{
  "type": "error",
  "title": "Respuestas incompletas",
  "detail": "La lista debe responder todos los puntos activos; en 'data' están los códigos que faltan.",
  "key": "respuestas-incompletas",
  "code": "TWC.VAL.002",
  "data": { "missingItemCodes": ["<code del punto que quitaste>"] }
}
```

**5.2 Un punto repetido** (agrega otra vez la primera respuesta):

```json
{
  "type": "error",
  "title": "Respuesta duplicada",
  "detail": "Un punto de la lista se respondió más de una vez.",
  "key": "respuesta-duplicada",
  "code": "TWC.VAL.003",
  "data": { "itemCode": "<code del punto repetido>" }
}
```

**5.3 Un punto inventado** (agrega `{ "itemId": 999999, "result": "cumple" }`):

```json
{
  "type": "error",
  "title": "Punto no reconocido",
  "detail": "La respuesta incluye un punto que no existe o no está activo.",
  "key": "punto-no-reconocido",
  "code": "TWC.VAL.004",
  "data": { "itemId": 999999 }
}
```

**5.4 Fecha de mañana** (`appliedAt` = fecha de mañana):

```json
{
  "type": "error",
  "title": "Fecha de aplicación inválida",
  "detail": "La fecha de la visita no puede ser futura.",
  "key": "fecha-de-aplicacion-invalida",
  "code": "TWC.VAL.005"
}
```

**5.5 Sin el nombre del visitante** (quita `inspectorName`):

```json
{
  "type": "error",
  "title": "Visitador requerido",
  "detail": "Indica el nombre de quien realizó la visita por parte de la Comisión.",
  "key": "visitador-requerido",
  "code": "TWC.VAL.006"
}
```

**5.6 El lugar de otro colaborador** (`teleworkLocationId` = el lugar vivo de Rosa):

```json
{
  "type": "error",
  "title": "Lugar de teletrabajo inválido",
  "detail": "El lugar indicado no pertenece al colaborador o está dado de baja.",
  "key": "lugar-de-teletrabajo-invalido",
  "code": "TWC.VAL.007"
}
```

**5.7 El lugar dado de baja** (`teleworkLocationId` = el lugar de Pedro dado de baja): el mismo `422` del caso 5.6.

**5.8 Un colaborador presencial** (`employeeId` = el de Rosa):

```json
{
  "type": "error",
  "title": "Solo teletrabajadores",
  "detail": "La lista de verificación solo aplica a colaboradores en Home Office o Híbrido.",
  "key": "solo-teletrabajadores",
  "code": "TWC.VAL.GATING.001"
}
```

Paso final — comprueba que nada se guardó (deben ser los mismos dos números del Paso 0):

```sql
SELECT COUNT(*) AS aplicaciones
FROM telework_checklist_applications
WHERE business_unit_id = <id interno de la empresa A>;

SELECT COUNT(*) AS respuestas
FROM telework_checklist_answers
WHERE business_unit_id = <id interno de la empresa A>;
```

Qué significa cada dato:

- `title` / `detail`: qué salió mal, en palabras.
- `key`: la clave del motivo (cambia en cada caso).
- `code`: el número estable del motivo, para quien lo atiende; `TWC.VAL.002` a `TWC.VAL.007` son motivos de los datos enviados y `TWC.VAL.GATING.001` es el corte que limita la lista a teletrabajadores.
- `data`: el detalle del motivo cuando aplica (`missingItemCodes` con los códigos que faltan, `itemCode` con el punto repetido o `itemId` con el punto inventado).

### 6. Quién solo consulta y quién no tiene el módulo

Objetivo: comprobar que quien solo consulta ve el historial pero no puede registrar, y que quien no tiene el módulo no ve el historial, aunque los dos sí ven la lista de puntos.

Paso 1 — usuario **B** (solo consulta). Header `X-Business-Unit-Id` = código público de la empresa A.

**Endpoint:** `GET /api/nom037/telework-checklists/employees/<id de Pedro>` → `200` (el mismo cuerpo del Escenario 3).

**Endpoint:** `POST /api/nom037/telework-checklists` (cuerpo del Escenario 2) → `403`

```json
{
  "type": "error",
  "title": "Sin permiso",
  "message": "No tienes permiso para registrar listas de verificación de teletrabajo.",
  "key": "sin-permiso",
  "errorCode": "TWC.AUTH.001",
  "data": null
}
```

Paso 2 — usuario **C** (sin acceso al módulo). Header = empresa A.

**Endpoint:** `GET /api/nom037/telework-checklists/employees/<id de Pedro>` → `403`

```json
{
  "type": "error",
  "title": "Sin permiso de consulta",
  "message": "No tienes permiso para consultar las listas de verificación de teletrabajo.",
  "key": "sin-permiso",
  "errorCode": "TWC.AUTH.001",
  "data": null
}
```

**Endpoint:** `GET /api/nom037/telework-checklists/items` → `200`, con los siete puntos igual que en el Escenario 1: mirar la lista de puntos no exige permiso del módulo.

Qué significa cada dato:

- `title` / `message`: el motivo del rechazo, en palabras.
- `key`: `sin-permiso` en los dos casos.
- `errorCode`: el número estable del rechazo de permisos. `TWC.AUTH.001` quiere decir que a esa cuenta le falta el permiso del módulo para esa acción (aquí, registrar o consultar).
- `data`: `null`; este aviso no trae más detalle.

### 7. Una cuenta de otra empresa

Objetivo: comprobar que la cuenta de la empresa B, aun con todos los permisos, no ve ni registra listas de un colaborador de la empresa A: recibe el mismo aviso que con un teletrabajador inventado.

Usuario: **D**. Todas las peticiones con el header `X-Business-Unit-Id` = código público de la empresa B.

**Endpoint:** `GET /api/nom037/telework-checklists/employees/<id de Pedro>` → `404`

```json
{
  "type": "error",
  "title": "Colaborador no encontrado",
  "detail": "El colaborador no existe en esta empresa.",
  "key": "colaborador-no-encontrado",
  "code": "TWC.NF.001"
}
```

**Endpoint:** `GET /api/nom037/telework-checklists/<applicationId de Pedro>` → `404`

```json
{
  "type": "error",
  "title": "Aplicación no encontrada",
  "detail": "La aplicación de la lista no existe en esta empresa.",
  "key": "aplicacion-no-encontrada",
  "code": "TWC.NF.002"
}
```

**Endpoint:** `POST /api/nom037/telework-checklists` para Pedro → `404`, con el mismo cuerpo del primero (`colaborador-no-encontrado` / `TWC.NF.001`).

Para confirmar que no se filtra nada, pide el historial de un teletrabajador inventado:

**Endpoint:** `GET /api/nom037/telework-checklists/employees/999999` → `404` con el **mismo** cuerpo que el de Pedro (`colaborador-no-encontrado`). Lo que se busca es que los dos cuerpos sean idénticos: el de otra empresa no se distingue de uno que no existe.

Qué significa cada dato:

- `key` / `code`: el motivo. `colaborador-no-encontrado` (`TWC.NF.001`) quiere decir que no hay tal colaborador en esa empresa; `aplicacion-no-encontrada` (`TWC.NF.002`), que no hay tal lista en esa empresa.

### 8. Una lista que ya venció

Objetivo: comprobar que una lista cuya fecha de revalidación ya pasó se reporta como vencida y deja de ser la vigente, y que al registrar una nueva la anterior queda vencida (no reemplazada).

Usuario: **A**.

Paso 1 — adelanta por la base la fecha de la lista vigente de Pedro a ayer:

```sql
UPDATE telework_checklist_applications
SET telework_checklist_application_expires_at = '<ayer>'
WHERE business_unit_id = <id interno de la empresa A>
  AND employee_id = <id de Pedro>
  AND telework_checklist_application_status = 'vigente';
```

Resultado: 1 fila afectada. `<ayer>` es la fecha de ayer (Ciudad de México), en formato `AAAA-MM-DD`.

Paso 2 — vuelve a pedir el historial:

**Endpoint:** `GET /api/nom037/telework-checklists/employees/<id de Pedro>` → `200`

En la respuesta, `current` es `null` (ya no hay vigente) y la primera fila de `history` trae `"status": "vencida"`.

Paso 3 — registra otra visita: repite el cuerpo del Escenario 2 → `201`, con `"status": "vigente"`.

Paso 4 — comprueba en la base que la anterior quedó vencida y no reemplazada:

```sql
SELECT telework_checklist_application_id,
       telework_checklist_application_status
FROM telework_checklist_applications
WHERE business_unit_id = <id interno de la empresa A>
  AND employee_id = <id de Pedro>
ORDER BY telework_checklist_application_id;
```

Resultado: la lista que estaba vigente (la que se adelantó) aparece ahora con `vencida`; la nueva, con `vigente`; las demás conservan su estado.

Qué significa lo nuevo aquí:

- `status` con `vencida`: la lista ya pasó su fecha de revalidación y nadie la había sustituido; por eso deja de contar como la vigente.
- `current` con `null`: mientras no se registre una nueva, el teletrabajador no tiene lista vigente.

## Lo que no se revisa aquí

- **Entrar sin sesión (`401`).** Sí responde, pero no aporta nada al objetivo del manual (no hay datos de negocio que mirar); lo cubre la prueba automática de la historia.
- **Dos registros simultáneos del mismo teletrabajador (a la vez, y el candado de la base).** No se puede provocar de forma fiable desde un cliente HTTP a mano; la prueba automática garantiza que nunca quedan dos listas vigentes del mismo teletrabajador (la segunda se rechaza con `409` o queda reemplazada).
- **Anular una lista vigente** (por un cambio de domicilio). No tiene dirección en esta historia: la usan otras historias por dentro; por eso no hay pasos aquí.
- **Adjuntar fotos desde el backoffice.** Esta historia no recibe fotos; subirlas es otra historia. Cualquier intento de mandar fotos queda fuera de este manual.
- **El mapeo a los numerales de la NOM-037 y las historias hermanas** (la pantalla del backoffice, la aplicación del colaborador y los avisos de vencimiento). Cada una se prueba en su propio manual.

## Checklist

Marca cada escenario contra su `Objetivo:`, no contra «se hicieron los pasos».

- [ ] **Escenario 1** — cualquier persona con sesión ve los siete puntos de la lista.
- [ ] **Escenario 2** — la visita de la Comisión queda vigente, no aprobada, con vencimiento a doce meses.
- [ ] **Escenario 3** — la nueva queda vigente, la anterior reemplazada, y el historial muestra las dos.
- [ ] **Escenario 4** — la visita nueva vence a seis meses y la anterior conserva su vencimiento.
- [ ] **Escenario 5** — las ocho variantes se rechazan con su aviso propio y sin dejar lista registrada.
- [ ] **Escenario 6** — quien solo consulta ve pero no registra; quien no tiene el módulo no ve el historial, y los dos ven los puntos.
- [ ] **Escenario 7** — la cuenta de la empresa B recibe el mismo aviso que con un teletrabajador inventado.
- [ ] **Escenario 8** — una lista vencida deja de ser la vigente y la anterior queda vencida al registrar una nueva.
