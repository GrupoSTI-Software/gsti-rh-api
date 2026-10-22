# Prueba manual API — Invalidar la lista de verificación vigente al cambiar el domicilio de teletrabajo (NOM-037)

**Problema:** la NOM-037 obliga a revisar las condiciones del lugar donde trabaja cada persona que hace teletrabajo. Esa revisión —la lista de verificación— ya se registraba, ya sabía vencer por tiempo y ya traía el estado «invalidada», pero nada la anulaba cuando el teletrabajador cambiaba de domicilio: la lista seguía contando como vigente sobre una casa que ya no era la suya y RH no tenía forma de enterarse de que la revisión había quedado sin efecto.

**Solución:** ahora, al registrar, editar o dar de baja un lugar de teletrabajo, el sistema compara el domicilio que se está tocando con el que la lista vigente verificó —o con el del lugar fijo pactado, cuando la lista no tiene lugar ligado— y, si el domicilio cambió, deja la lista como **invalidada** con su motivo, la fecha y quién lo hizo, todo dentro de la misma operación que guarda el lugar. La respuesta de la operación dice si esa petición anuló la lista. Si algo falla por dentro, no queda nada a medias: ni el lugar ni la anulación.

Ejemplo: es como la revisión de la instalación de gas de la casa. Si te mudas, la revisión que tenías ya no sirve para la casa nueva: queda tachada como anulada y hay que pedir otra para el domicilio nuevo.

Se prueba con un cliente de API (Postman, Insomnia, Bruno).

## Preparar

Prerrequisito de ambiente: la base de pruebas (`sae_pruebas`) al día, es decir, con las migraciones y las semillas oficiales ya corridas. Eso deja los siete puntos de la lista y el módulo declarados en el catálogo. Sin eso, el registro de la visita sale con la lista de puntos vacía.

Ejecutar el seeder compartido **contra la misma base del API local de pruebas**:

```bash
NODE_ENV=test DB_DATABASE=sae_pruebas node ace db:seed --files="database/seeders/_tmp_do_not_commit_qa_seeder.ts"
```

Al terminar debe aparecer en consola la línea `[qa-seeder] QA Lista de verificación:` (sin avisos de permisos faltantes). Deja:

- **`QA TWC Empresa A`**: sin ajustes de teletrabajo y **sin ninguna lista registrada**; con **Pedro** (Híbrido, con dos lugares vivos —uno marcado como fijo pactado y otro secundario no fijo— y un tercero dado de baja) y **Rosa** (Presencial, con un lugar vivo que nunca tiene lista, porque a ella no se le puede registrar ninguna).
- **`QA TWC Empresa B`**: con su propio teletrabajador (**Bruno**, Híbrido) y su propia cuenta; sirve para comprobar el aislamiento.
- La cuenta del manual (tabla más abajo), con la contraseña de pruebas del proyecto.

Volver a correrlo deja todo otra vez como al inicio: sin listas registradas en las dos empresas, sin ajustes guardados y con los lugares de Pedro en su estado de partida (el domicilio que el recorrido haya editado vuelve a su valor).

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

Lugares de teletrabajo de la empresa A (por la calle distingues cuál es cuál):

```sql
SELECT employee_id,
       employee_telework_location_id,
       employee_telework_location_street,
       employee_telework_location_is_fixed_agreed,
       employee_telework_location_active
FROM employee_telework_locations
WHERE business_unit_id = <id interno de la empresa A>
ORDER BY employee_id, employee_telework_location_id;
```

Resultado: 4 filas. De Pedro: `Calle QA TWC Pedro Vivo` (la única con la marca de fijo pactado en 1 y `active` en 1), `Calle QA TWC Pedro Secundaria` (`active` en 1, sin la marca de fijo) y `Calle QA TWC Pedro Baja` (`active` en 0). De Rosa: `Calle QA TWC Rosa Viva`.

Lugar de teletrabajo de la empresa B (el que edita el Escenario 9, Paso 1):

```sql
SELECT employee_id,
       employee_telework_location_id,
       employee_telework_location_street
FROM employee_telework_locations
WHERE business_unit_id = <id interno de la empresa B>
ORDER BY employee_id, employee_telework_location_id;
```

Resultado: 1 fila: `Calle QA TWC Bruno Viva`.

Puntos de la lista (sus ids son los que van en los cuerpos):

```sql
SELECT telework_checklist_item_id,
       telework_checklist_item_code
FROM telework_checklist_items
WHERE telework_checklist_item_is_active = 1
ORDER BY telework_checklist_item_order;
```

Resultado: 7 filas, en este orden: `iluminacion`, `ventilacion_temperatura`, `mobiliario`, `instalacion_electrica`, `orden_y_limpieza`, `ruido`, `primeros_auxilios_emergencia`.

Id de la cuenta (es el autor que queda en la lista al anularse):

```sql
SELECT user_id
FROM users
WHERE user_email = 'qa-twc-full@gsti-tests.local';
```

Resultado: 1 fila.

**URL base:** `http://127.0.0.1:3333`

**Headers de todas las peticiones:** `Accept-Language: es` (los textos salen en español), `X-Business-Unit-Id: <código público de la empresa>` y `Authorization: Bearer <token>`. Todas las peticiones de este manual llevan el código público de la **empresa A**, salvo el Escenario 9, que prueba justo lo contrario.

### Login por producto

- **Backoffice** — `POST /api/auth/login`

Cuerpo (el correo es el de la cuenta del manual):

```json
{ "userEmail": "qa-twc-full@gsti-tests.local", "userPassword": "password" }
```

El token sale en `data.token` y se envía en `Authorization: Bearer <token>`. La cuenta de este manual entra por el backoffice.

### Usuarios

| | Correo | Contraseña | Login (producto) | Variante |
|---|---|---|---|---|
| **A** | `qa-twc-full@gsti-tests.local` | `password` | Backoffice | RH de la empresa A con el módulo de listas de verificación completo: consulta y registra listas —lo que el recorrido necesita para preparar la lista de cada escenario— y también guarda los ajustes de teletrabajo |

Los lugares de teletrabajo no piden permiso del módulo: basta una sesión de la empresa. Los escenarios que además consultan o registran la lista de verificación usan la cuenta **A**, que sí tiene ese módulo.

## Escenarios

### 1. Cambiar el domicilio del lugar verificado anula la lista vigente

Objetivo: comprobar que si la lista vigente se levantó sobre un lugar y después cambia la calle de ese lugar, la lista queda anulada con su motivo, su fecha y su autor, sus respuestas quedan intactas, y la respuesta de esa petición avisa que anuló la lista.

Paso 1 — registra la visita de la Comisión sobre el lugar vivo de Pedro:

**Endpoint:** `POST /api/nom037/telework-checklists`

Cuerpo (`appliedAt` es la fecha de hoy en la zona de la Ciudad de México, en formato `AAAA-MM-DD`):

```json
{
  "employeeId": <id de Pedro>,
  "appliedAt": "<hoy>",
  "inspectorName": "Lic. Marta Solis",
  "teleworkLocationId": <id del lugar vivo de Pedro>,
  "answers": [
    { "itemId": <id de iluminacion>, "result": "cumple" },
    { "itemId": <id de ventilacion_temperatura>, "result": "cumple" },
    { "itemId": <id de mobiliario>, "result": "cumple" },
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
    "overallResult": "aprobada",
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
      { "itemId": <id de ventilacion_temperatura>, "code": "ventilacion_temperatura", "label": "Ventilación y temperatura adecuadas", "result": "cumple", "observation": null },
      { "itemId": <id de mobiliario>, "code": "mobiliario", "label": "Silla y mesa adecuadas", "result": "cumple", "observation": null },
      { "itemId": <id de instalacion_electrica>, "code": "instalacion_electrica", "label": "Instalación eléctrica sin riesgos visibles", "result": "cumple", "observation": null },
      { "itemId": <id de orden_y_limpieza>, "code": "orden_y_limpieza", "label": "Espacio ordenado y libre de obstáculos", "result": "cumple", "observation": null },
      { "itemId": <id de ruido>, "code": "ruido", "label": "Nivel de ruido que permite trabajar", "result": "cumple", "observation": null },
      { "itemId": <id de primeros_auxilios_emergencia>, "code": "primeros_auxilios_emergencia", "label": "Medios para atender una emergencia", "result": "cumple", "observation": null }
    ]
  }
}
```

Paso 2 — cambia la calle de ese lugar (solo la calle):

**Endpoint:** `PUT /api/nom037/telework-locations/<id del lugar vivo de Pedro>`

Cuerpo (los demás datos del lugar se repiten tal como están; aquí solo cambia `employeeTeleworkLocationStreet`. Los dos últimos campos se mandan a propósito: no existen en el formulario del lugar y el paso más abajo comprueba que se ignoran; en los cuerpos que repitan este en los escenarios siguientes puedes mandarlos o no):

```json
{
  "employeeTeleworkLocationType": "home",
  "employeeTeleworkLocationStreet": "Calle QA TWC Pedro Vivo 25",
  "employeeTeleworkLocationExternalNumber": null,
  "employeeTeleworkLocationInternalNumber": null,
  "employeeTeleworkLocationSettlement": null,
  "employeeTeleworkLocationCity": "Ciudad de Mexico",
  "employeeTeleworkLocationState": "Ciudad de Mexico",
  "employeeTeleworkLocationCountry": "México",
  "employeeTeleworkLocationZipcode": null,
  "employeeTeleworkLocationIsFixedAgreed": true,
  "employeeTeleworkLocationHasInternet": false,
  "employeeTeleworkLocationHasAdequateEquipment": false,
  "employeeTeleworkLocationConnectivityNotes": null,
  "actorUserId": 999999,
  "invalidatedByUserId": 999999
}
```

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Lugar de teletrabajo",
  "message": "El lugar de teletrabajo se actualizó correctamente.",
  "data": {
    "teleworkLocation": {
      "employeeTeleworkLocationId": <id del lugar vivo de Pedro>,
      "employeeId": <id de Pedro>,
      "businessUnitId": <id interno de la empresa A>,
      "employeeTeleworkLocationType": "home",
      "employeeTeleworkLocationStreet": "Calle QA TWC Pedro Vivo 25",
      "employeeTeleworkLocationExternalNumber": null,
      "employeeTeleworkLocationInternalNumber": null,
      "employeeTeleworkLocationSettlement": null,
      "employeeTeleworkLocationCity": "Ciudad de Mexico",
      "employeeTeleworkLocationState": "Ciudad de Mexico",
      "employeeTeleworkLocationCountry": "México",
      "employeeTeleworkLocationZipcode": null,
      "employeeTeleworkLocationIsFixedAgreed": true,
      "employeeTeleworkLocationHasInternet": false,
      "employeeTeleworkLocationHasAdequateEquipment": false,
      "employeeTeleworkLocationConnectivityNotes": null,
      "employeeTeleworkLocationActive": true,
      "employeeTeleworkLocationCreatedAt": "<fecha y hora>",
      "employeeTeleworkLocationUpdatedAt": "<fecha y hora>",
      "deletedAt": null
    },
    "teleworkChecklistInvalidated": true
  }
}
```

Paso 3 — comprueba el estado de la lista:

**Endpoint:** `GET /api/nom037/telework-checklists/employees/<id de Pedro>`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Listas de verificación de teletrabajo",
  "message": "Historial de la lista de verificación obtenido correctamente.",
  "data": {
    "employeeId": <id de Pedro>,
    "current": null,
    "history": [
      {
        "applicationId": <applicationId del Paso 1>,
        "mode": "visita_csh",
        "status": "invalidada",
        "overallResult": "aprobada",
        "appliedAt": "<hoy>",
        "expiresAt": "<hoy + 12 meses>",
        "revalidationPeriodMonths": 12,
        "appliedByUserId": <id de la cuenta A>,
        "invalidatedAt": "<fecha y hora del Paso 2>",
        "invalidationReason": "cambio_de_domicilio"
      }
    ]
  }
}
```

Paso 4 — comprueba quién anuló la lista:

```sql
SELECT telework_checklist_application_invalidated_at,
       telework_checklist_application_invalidated_by_user_id
FROM telework_checklist_applications
WHERE telework_checklist_application_id = <applicationId del Paso 1>;
```

Resultado: 1 fila, con la fecha de anulación y el `invalidated_by_user_id` de la cuenta **A** (el `user_id` resuelto en Preparar), **no** `999999`: el autor de la anulación es siempre la cuenta con sesión; los campos de actor que viajaron en el cuerpo se ignoraron.

Paso 5 — comprueba que las respuestas de la lista siguen ahí:

**Endpoint:** `GET /api/nom037/telework-checklists/<applicationId del Paso 1>`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Listas de verificación de teletrabajo",
  "message": "Aplicación de la lista de verificación obtenida correctamente.",
  "data": {
    "applicationId": <applicationId del Paso 1>,
    "mode": "visita_csh",
    "status": "invalidada",
    "overallResult": "aprobada",
    "appliedAt": "<hoy>",
    "expiresAt": "<hoy + 12 meses>",
    "revalidationPeriodMonths": 12,
    "appliedByUserId": <id de la cuenta A>,
    "invalidatedAt": "<fecha y hora del Paso 2>",
    "invalidationReason": "cambio_de_domicilio",
    "employeeId": <id de Pedro>,
    "teleworkLocationId": <id del lugar vivo de Pedro>,
    "inspectorName": "Lic. Marta Solis",
    "notes": null,
    "answers": [
      { "itemId": <id de iluminacion>, "code": "iluminacion", "label": "Iluminación suficiente del área de trabajo", "result": "cumple", "observation": null },
      { "itemId": <id de ventilacion_temperatura>, "code": "ventilacion_temperatura", "label": "Ventilación y temperatura adecuadas", "result": "cumple", "observation": null },
      { "itemId": <id de mobiliario>, "code": "mobiliario", "label": "Silla y mesa adecuadas", "result": "cumple", "observation": null },
      { "itemId": <id de instalacion_electrica>, "code": "instalacion_electrica", "label": "Instalación eléctrica sin riesgos visibles", "result": "cumple", "observation": null },
      { "itemId": <id de orden_y_limpieza>, "code": "orden_y_limpieza", "label": "Espacio ordenado y libre de obstáculos", "result": "cumple", "observation": null },
      { "itemId": <id de ruido>, "code": "ruido", "label": "Nivel de ruido que permite trabajar", "result": "cumple", "observation": null },
      { "itemId": <id de primeros_auxilios_emergencia>, "code": "primeros_auxilios_emergencia", "label": "Medios para atender una emergencia", "result": "cumple", "observation": null }
    ]
  }
}
```

Las respuestas no se tocan al anularse la lista: siguen completas, cada una con `itemId`, `code`, `label`, `result` y `observation`.

Qué significa cada dato:

- `type`: cómo salió la petición. En las que funcionan vale `success`; las que se rechazan traen `warning` o `error` y se explican en su escenario.
- `title` / `message`: el encabezado y la frase de la respuesta.
- Lista de verificación: la revisión de las condiciones del lugar de teletrabajo, punto por punto, que deja registrada cada visita de la Comisión.
- `data.teleworkLocation`: el lugar ya guardado. `employeeTeleworkLocationId`: su número interno. `employeeTeleworkLocationStreet` / `...ExternalNumber` / `...InternalNumber` / `...Settlement` / `...City` / `...State` / `...Country` / `...Zipcode`: los ocho datos del domicilio (los que están en `null` no se capturaron). `employeeTeleworkLocationType`: qué clase de lugar es; puede valer `home` (la casa de la persona), `coworking` (un espacio compartido) u `other` (otro sitio). `employeeTeleworkLocationIsFixedAgreed`: puede valer `true` (sí es el sitio fijo pactado con la empresa) o `false` (no lo es). `employeeTeleworkLocationHasInternet` / `...HasAdequateEquipment`: `true` o `false` según lo declarado. `employeeTeleworkLocationConnectivityNotes`: las notas libres de conectividad, `null` si no hay. `employeeTeleworkLocationActive`: puede valer `true` (el lugar sigue vivo) o `false` (se dio de baja). `employeeTeleworkLocationCreatedAt` / `...UpdatedAt`: cuándo se registró y cuándo se guardó por última vez. `deletedAt`: `null` mientras el lugar está vivo; con fecha, cuando se dio de baja (el registro no se borra, se conserva).
- `data.teleworkChecklistInvalidated`: si **esa** petición anuló la lista vigente. Puede valer `true` (sí: había una lista vigente y este cambio la anuló) o `false` (no: no había lista vigente, ya estaba anulada o el cambio no toca el domicilio verificado). Viene siempre en los éxitos; en los errores no aparece.
- `status`: la vigencia de la lista. Puede valer `vigente` (rige hoy), `vencida` (pasó su fecha de revalidación y nadie la sustituyó), `invalidada` (se anuló, por ejemplo por un cambio de domicilio) o `reemplazada` (una lista más nueva la sustituyó).
- `invalidatedAt` / `invalidationReason`: cuándo y por qué se anuló. `invalidationReason` aquí solo puede valer `cambio_de_domicilio` (el domicilio del lugar que la lista verificó cambió, o el de la persona ya no es el mismo); los dos quedan en `null` mientras la lista no se anule.
- `telework_checklist_application_invalidated_by_user_id`: la cuenta con sesión que provocó la anulación; los campos de actor que viajen en el cuerpo de la petición se ignoran.
- `applicationId`: el número interno de la lista registrada; se usa para pedir su detalle.
- `mode`: cómo se originó la lista: `visita_csh` (la levanta la Comisión de Seguridad e Higiene) o `autoaplicada` (la contesta el propio colaborador; no se recorre aquí).
- `overallResult`: el resultado de la revisión: `aprobada` (todos los puntos cumplen) o `no_aprobada` (al menos uno no cumple).
- `appliedAt` / `expiresAt`: el día de la visita y el día en que toca volver a revisar. `revalidationPeriodMonths`: cada cuántos meses se revalida (12 por defecto).
- `appliedByUserId`: la cuenta que registró la lista.
- `teleworkLocationId`: el lugar que la lista verificó; `null` cuando la lista no quedó ligada a ninguno.
- `result` de cada respuesta: cómo salió el punto: `cumple`, `no_cumple` o `no_aplica` (esa condición no aplica al lugar).
- `current` / `history`: la lista vigente del teletrabajador (o `null` si no tiene ninguna) y todas sus listas, la más nueva primero.

### 2. Escribir el domicilio de otra forma —o tocar campos que no son del domicilio— no anula la lista

Objetivo: comprobar que reescribir el domicilio del lugar verificado con otras mayúsculas, con espacios de más o con un dato vacío donde antes no había nada no cuenta como cambio de domicilio, y que cambiar solo el tipo de lugar, las notas de conectividad, el internet o el equipo tampoco: en los dos casos la lista sigue vigente.

Paso 1 — registra otra visita:

repite el Escenario 1, Paso 1, mismo cuerpo (mismo lugar) → devuelve `201`, con un `applicationId` nuevo y `"status": "vigente"`.

Paso 2 — vuelve a guardar el lugar escribiendo el mismo domicilio de otra forma (mayúsculas, espacios de más y el código postal vacío donde estaba en `null`):

**Endpoint:** `PUT /api/nom037/telework-locations/<id del lugar vivo de Pedro>`

Cuerpo (solo cambian la forma de la calle y el código postal; el resto igual):

```json
{
  "employeeTeleworkLocationType": "home",
  "employeeTeleworkLocationStreet": "  CALLE  QA  twc Pedro Vivo  25  ",
  "employeeTeleworkLocationExternalNumber": null,
  "employeeTeleworkLocationInternalNumber": null,
  "employeeTeleworkLocationSettlement": null,
  "employeeTeleworkLocationCity": "Ciudad de Mexico",
  "employeeTeleworkLocationState": "Ciudad de Mexico",
  "employeeTeleworkLocationCountry": "México",
  "employeeTeleworkLocationZipcode": "",
  "employeeTeleworkLocationIsFixedAgreed": true,
  "employeeTeleworkLocationHasInternet": false,
  "employeeTeleworkLocationHasAdequateEquipment": false,
  "employeeTeleworkLocationConnectivityNotes": null
}
```

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Lugar de teletrabajo",
  "message": "El lugar de teletrabajo se actualizó correctamente.",
  "data": {
    "teleworkLocation": {
      "employeeTeleworkLocationId": <id del lugar vivo de Pedro>,
      "employeeId": <id de Pedro>,
      "businessUnitId": <id interno de la empresa A>,
      "employeeTeleworkLocationType": "home",
      "employeeTeleworkLocationStreet": "CALLE  QA  twc Pedro Vivo  25",
      "employeeTeleworkLocationExternalNumber": null,
      "employeeTeleworkLocationInternalNumber": null,
      "employeeTeleworkLocationSettlement": null,
      "employeeTeleworkLocationCity": "Ciudad de Mexico",
      "employeeTeleworkLocationState": "Ciudad de Mexico",
      "employeeTeleworkLocationCountry": "México",
      "employeeTeleworkLocationZipcode": "",
      "employeeTeleworkLocationIsFixedAgreed": true,
      "employeeTeleworkLocationHasInternet": false,
      "employeeTeleworkLocationHasAdequateEquipment": false,
      "employeeTeleworkLocationConnectivityNotes": null,
      "employeeTeleworkLocationActive": true,
      "employeeTeleworkLocationCreatedAt": "<fecha y hora>",
      "employeeTeleworkLocationUpdatedAt": "<fecha y hora>",
      "deletedAt": null
    },
    "teleworkChecklistInvalidated": false
  }
}
```

Paso 3 — comprueba que la lista sigue vigente:

**Endpoint:** `GET /api/nom037/telework-checklists/employees/<id de Pedro>` → devuelve `200`

En la respuesta, `current` ya no es `null`: trae el `applicationId` del Paso 1 con `"status": "vigente"`, `"invalidatedAt": null` e `"invalidationReason": null`.

Paso 4 — cambia solo el tipo de lugar, las notas de conectividad, el internet y el equipo (el domicilio se repite tal como quedó):

**Endpoint:** `PUT /api/nom037/telework-locations/<id del lugar vivo de Pedro>`

Cuerpo (solo cambian esos cuatro datos; la calle y el código postal van como quedaron en el Paso 2):

```json
{
  "employeeTeleworkLocationType": "coworking",
  "employeeTeleworkLocationStreet": "CALLE  QA  twc Pedro Vivo  25",
  "employeeTeleworkLocationExternalNumber": null,
  "employeeTeleworkLocationInternalNumber": null,
  "employeeTeleworkLocationSettlement": null,
  "employeeTeleworkLocationCity": "Ciudad de Mexico",
  "employeeTeleworkLocationState": "Ciudad de Mexico",
  "employeeTeleworkLocationCountry": "México",
  "employeeTeleworkLocationZipcode": "",
  "employeeTeleworkLocationIsFixedAgreed": true,
  "employeeTeleworkLocationHasInternet": true,
  "employeeTeleworkLocationHasAdequateEquipment": true,
  "employeeTeleworkLocationConnectivityNotes": "Fibra 500 Mbps simetrica"
}
```

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Lugar de teletrabajo",
  "message": "El lugar de teletrabajo se actualizó correctamente.",
  "data": {
    "teleworkLocation": {
      "employeeTeleworkLocationId": <id del lugar vivo de Pedro>,
      "employeeId": <id de Pedro>,
      "businessUnitId": <id interno de la empresa A>,
      "employeeTeleworkLocationType": "coworking",
      "employeeTeleworkLocationStreet": "CALLE  QA  twc Pedro Vivo  25",
      "employeeTeleworkLocationExternalNumber": null,
      "employeeTeleworkLocationInternalNumber": null,
      "employeeTeleworkLocationSettlement": null,
      "employeeTeleworkLocationCity": "Ciudad de Mexico",
      "employeeTeleworkLocationState": "Ciudad de Mexico",
      "employeeTeleworkLocationCountry": "México",
      "employeeTeleworkLocationZipcode": "",
      "employeeTeleworkLocationIsFixedAgreed": true,
      "employeeTeleworkLocationHasInternet": true,
      "employeeTeleworkLocationHasAdequateEquipment": true,
      "employeeTeleworkLocationConnectivityNotes": "Fibra 500 Mbps simetrica",
      "employeeTeleworkLocationActive": true,
      "employeeTeleworkLocationCreatedAt": "<fecha y hora>",
      "employeeTeleworkLocationUpdatedAt": "<fecha y hora>",
      "deletedAt": null
    },
    "teleworkChecklistInvalidated": false
  }
}
```

Paso 5 — comprueba que la lista sigue vigente:

`GET /api/nom037/telework-checklists/employees/<id de Pedro>` → devuelve `200`, con `current` con el `applicationId` del Paso 1 en `"status": "vigente"`.

Qué significa lo nuevo aquí:

- `employeeTeleworkLocationStreet` / `...Zipcode`: se guardan **solo recortados en los extremos**, no «limpios». La comparación con el domicilio verificado ignora los espacios repetidos, las mayúsculas y el vacío, pero lo guardado no: la calle conserva sus espacios dobles y el código postal queda en `""` (vacío capturado), no en `null`. Por eso el domicilio sigue siendo el mismo y la lista no se anula, aunque el valor guardado no se vea ordenado.
- `teleworkChecklistInvalidated`: el dato ya explicado en el Escenario 1; aquí vale `false` en los Pasos 2 y 4 —la comparación ignora la forma del domicilio, y el tipo de lugar, las notas de conectividad, el internet y el equipo no son domicilio— porque ninguna de esas dos peticiones anuló la lista.
- `current` con datos: el teletrabajador tiene lista vigente; es la que se registró en el Paso 1.

### 3. Dar de baja el lugar verificado anula la lista vigente

Objetivo: comprobar que dar de baja el lugar que verificó la lista vigente la anula igual que un cambio de domicilio, que el lugar queda dado de baja sin borrarse y que repetir esa baja ya no encuentra el lugar.

Paso 1 — registra la visita sobre el otro lugar vivo de Pedro (el secundario, `Calle QA TWC Pedro Secundaria`):

repite el Escenario 1, Paso 1, cambiando solo `teleworkLocationId` por el id de ese lugar → devuelve `201`, con `"status": "vigente"` y ese `teleworkLocationId`.

Paso 2 — da de baja ese lugar:

**Endpoint:** `DELETE /api/nom037/telework-locations/<id del lugar secundario de Pedro>`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Lugar de teletrabajo",
  "message": "El lugar de teletrabajo se dio de baja correctamente.",
  "data": {
    "teleworkLocation": {
      "employeeTeleworkLocationId": <id del lugar secundario de Pedro>,
      "employeeId": <id de Pedro>,
      "businessUnitId": <id interno de la empresa A>,
      "employeeTeleworkLocationType": "home",
      "employeeTeleworkLocationStreet": "Calle QA TWC Pedro Secundaria",
      "employeeTeleworkLocationExternalNumber": null,
      "employeeTeleworkLocationInternalNumber": null,
      "employeeTeleworkLocationSettlement": null,
      "employeeTeleworkLocationCity": "Ciudad de Mexico",
      "employeeTeleworkLocationState": "Ciudad de Mexico",
      "employeeTeleworkLocationCountry": "México",
      "employeeTeleworkLocationZipcode": null,
      "employeeTeleworkLocationIsFixedAgreed": false,
      "employeeTeleworkLocationHasInternet": false,
      "employeeTeleworkLocationHasAdequateEquipment": false,
      "employeeTeleworkLocationConnectivityNotes": null,
      "employeeTeleworkLocationActive": false,
      "employeeTeleworkLocationCreatedAt": "<fecha y hora de la siembra>",
      "employeeTeleworkLocationUpdatedAt": "<fecha y hora de la baja>",
      "deletedAt": "<fecha y hora de la baja>"
    },
    "teleworkChecklistInvalidated": true
  }
}
```

Paso 3 — comprueba el lugar y la lista:

```sql
SELECT employee_telework_location_active,
       employee_telework_location_deleted_at
FROM employee_telework_locations
WHERE employee_telework_location_id = <id del lugar secundario de Pedro>;
```

Resultado: 1 fila, con `employee_telework_location_active` en `0` y `employee_telework_location_deleted_at` con fecha: el lugar no se borró, quedó de baja.

**Endpoint:** `GET /api/nom037/telework-checklists/employees/<id de Pedro>` → devuelve `200`

En la respuesta, `current` es `null` y la primera fila de `history` es la lista del Paso 1 con `"status": "invalidada"`, `"invalidationReason": "cambio_de_domicilio"` y su `invalidatedAt`.

Paso 4 — repite la baja del mismo lugar:

**Endpoint:** `DELETE /api/nom037/telework-locations/<id del lugar secundario de Pedro>`

**Response exacto:** `404`

```json
{
  "type": "warning",
  "title": "Lugar de teletrabajo",
  "message": "El lugar de teletrabajo no existe o no pertenece a la empresa seleccionada.",
  "key": "lugar-no-encontrado",
  "code": "TWL.NF.LOC.001",
  "data": null
}
```

El lugar ya estaba dado de baja, así que la segunda vez responde como si no existiera; la lista del Paso 1 sigue `invalidada` con la fecha y el motivo del Paso 2, sin volver a anularse.

Qué significa lo nuevo aquí:

- `employeeTeleworkLocationActive` en `false` y `deletedAt` con fecha: el lugar quedó dado de baja lógica; el registro se conserva para auditoría.
- `key` / `code`: el motivo del rechazo. `lugar-no-encontrado` (`TWL.NF.LOC.001`) quiere decir que no hay tal lugar **vivo** en la empresa del header: un lugar ya dado de baja responde igual que uno que nunca existió. El corte se aplica **antes** de tocar nada.
- `data` con `null`: el aviso no trae más detalle.
- (Los demás datos son los ya explicados en el Escenario 1.)

### 4. Marcar otro lugar como fijo pactado (con lista ligada)

Objetivo: comprobar que, cuando la lista vigente está ligada a un lugar, dejar como fijo pactado a **otro** lugar con domicilio distinto anula la lista, y que dejarlo como fijo con el mismo domicilio escrito de otra forma no la anula.

Paso 1 — registra la visita sobre el lugar vivo que queda (el fijo pactado, `Calle QA TWC Pedro Vivo`):

repite el Escenario 1, Paso 1, cambiando solo `teleworkLocationId` por el id de ese lugar → devuelve `201`, con `"status": "vigente"`.

Paso 2 — registra **otro** lugar ya marcado como fijo pactado, con domicilio distinto al verificado:

**Endpoint:** `POST /api/nom037/telework-locations`

Cuerpo:

```json
{
  "employeeId": <id de Pedro>,
  "employeeTeleworkLocationType": "coworking",
  "employeeTeleworkLocationStreet": "Calle QA TWC Pedro Coworking",
  "employeeTeleworkLocationExternalNumber": null,
  "employeeTeleworkLocationInternalNumber": null,
  "employeeTeleworkLocationSettlement": null,
  "employeeTeleworkLocationCity": "Ciudad de Mexico",
  "employeeTeleworkLocationState": "Ciudad de Mexico",
  "employeeTeleworkLocationCountry": "México",
  "employeeTeleworkLocationZipcode": null,
  "employeeTeleworkLocationIsFixedAgreed": true,
  "employeeTeleworkLocationHasInternet": true,
  "employeeTeleworkLocationHasAdequateEquipment": true,
  "employeeTeleworkLocationConnectivityNotes": null
}
```

Guarda el `employeeTeleworkLocationId` del lugar nuevo: se usa en los escenarios siguientes.

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Lugar de teletrabajo",
  "message": "El lugar de teletrabajo se registró correctamente.",
  "data": {
    "teleworkLocation": {
      "employeeTeleworkLocationId": <id del lugar nuevo>,
      "employeeId": <id de Pedro>,
      "businessUnitId": <id interno de la empresa A>,
      "employeeTeleworkLocationType": "coworking",
      "employeeTeleworkLocationStreet": "Calle QA TWC Pedro Coworking",
      "employeeTeleworkLocationExternalNumber": null,
      "employeeTeleworkLocationInternalNumber": null,
      "employeeTeleworkLocationSettlement": null,
      "employeeTeleworkLocationCity": "Ciudad de Mexico",
      "employeeTeleworkLocationState": "Ciudad de Mexico",
      "employeeTeleworkLocationCountry": "México",
      "employeeTeleworkLocationZipcode": null,
      "employeeTeleworkLocationIsFixedAgreed": true,
      "employeeTeleworkLocationHasInternet": true,
      "employeeTeleworkLocationHasAdequateEquipment": true,
      "employeeTeleworkLocationConnectivityNotes": null,
      "employeeTeleworkLocationActive": true,
      "employeeTeleworkLocationCreatedAt": "<fecha y hora del alta>",
      "employeeTeleworkLocationUpdatedAt": "<fecha y hora del alta>",
      "deletedAt": null
    },
    "teleworkChecklistInvalidated": true
  }
}
```

Paso 3 — comprueba la lista:

`GET /api/nom037/telework-checklists/employees/<id de Pedro>` → devuelve `200`, con `current` en `null` y la primera fila de `history` en `"status": "invalidada"` con motivo `cambio_de_domicilio`.

Paso 4 — registra otra visita sobre el mismo lugar del Paso 1:

repite el Escenario 1, Paso 1, cambiando solo `teleworkLocationId` por el id de ese lugar → devuelve `201`, con `"status": "vigente"`.

Paso 5 — registra un segundo lugar ya marcado como fijo pactado, ahora con **el mismo domicilio** que el lugar verificado, escrito de otra forma:

**Endpoint:** `POST /api/nom037/telework-locations`

Cuerpo:

```json
{
  "employeeId": <id de Pedro>,
  "employeeTeleworkLocationType": "home",
  "employeeTeleworkLocationStreet": "  calle qa twc pedro vivo 25 ",
  "employeeTeleworkLocationExternalNumber": null,
  "employeeTeleworkLocationInternalNumber": null,
  "employeeTeleworkLocationSettlement": null,
  "employeeTeleworkLocationCity": "Ciudad de Mexico",
  "employeeTeleworkLocationState": "Ciudad de Mexico",
  "employeeTeleworkLocationCountry": "México",
  "employeeTeleworkLocationZipcode": null,
  "employeeTeleworkLocationIsFixedAgreed": true,
  "employeeTeleworkLocationHasInternet": true,
  "employeeTeleworkLocationHasAdequateEquipment": true,
  "employeeTeleworkLocationConnectivityNotes": null
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Lugar de teletrabajo",
  "message": "El lugar de teletrabajo se registró correctamente.",
  "data": {
    "teleworkLocation": {
      "employeeTeleworkLocationId": <id del segundo lugar nuevo>,
      "employeeId": <id de Pedro>,
      "businessUnitId": <id interno de la empresa A>,
      "employeeTeleworkLocationType": "home",
      "employeeTeleworkLocationStreet": "calle qa twc pedro vivo 25",
      "employeeTeleworkLocationExternalNumber": null,
      "employeeTeleworkLocationInternalNumber": null,
      "employeeTeleworkLocationSettlement": null,
      "employeeTeleworkLocationCity": "Ciudad de Mexico",
      "employeeTeleworkLocationState": "Ciudad de Mexico",
      "employeeTeleworkLocationCountry": "México",
      "employeeTeleworkLocationZipcode": null,
      "employeeTeleworkLocationIsFixedAgreed": true,
      "employeeTeleworkLocationHasInternet": true,
      "employeeTeleworkLocationHasAdequateEquipment": true,
      "employeeTeleworkLocationConnectivityNotes": null,
      "employeeTeleworkLocationActive": true,
      "employeeTeleworkLocationCreatedAt": "<fecha y hora del alta>",
      "employeeTeleworkLocationUpdatedAt": "<fecha y hora del alta>",
      "deletedAt": null
    },
    "teleworkChecklistInvalidated": false
  }
}
```

La calle queda guardada recortada en los extremos (`calle qa twc pedro vivo 25`): los espacios de más se ignoran al comparar, no al guardar.

Paso 6 — comprueba la lista:

`GET /api/nom037/telework-checklists/employees/<id de Pedro>` → devuelve `200`, con `current` con la lista del Paso 4 en `"status": "vigente"`.

Qué significa lo nuevo aquí:

- `employeeTeleworkLocationIsFixedAgreed` en `true` en el cuerpo: se está pidiendo que ese lugar quede como el sitio fijo pactado. El sistema deja como fijo pactado a un solo lugar del colaborador: al marcarlo, desmarca el que estuviera marcado.
- `teleworkChecklistInvalidated`: el dato ya explicado en el Escenario 1; aquí vale `true` en el Paso 2 y `false` en el Paso 5, porque el domicilio del nuevo fijo es el que decide.

### 5. El fijo pactado manda cuando la lista no tiene lugar ligado

Objetivo: comprobar que cuando la lista vigente no quedó ligada a ningún lugar la referencia es el fijo pactado: cambiar su domicilio, quitarle la marca de fijo, darlo de baja o marcar otro lugar con otro domicilio como fijo anula la lista, mientras que dejar el primer fijo cuando no había ninguno no anula nada.

Paso 1 — deja como fijo pactado al lugar donde el Escenario 1, Paso 1, registró la visita (el lugar vivo de Pedro):

`PUT /api/nom037/telework-locations/<id del lugar vivo de Pedro>`, repite el Escenario 1, Paso 2, mismo cuerpo (mismo lugar, misma calle) → devuelve `200`, con `"teleworkChecklistInvalidated": false` (el domicilio no cambió) y `"employeeTeleworkLocationIsFixedAgreed": true`.

Paso 2 — registra la visita **sin lugar**:

repite el Escenario 1, Paso 1, quitando solo `teleworkLocationId` → devuelve `201`, con `"teleworkLocationId": null` y `"status": "vigente"`.

Paso 3 — cambia la calle del fijo pactado:

`PUT /api/nom037/telework-locations/<id del lugar del Paso 1>`, repite el Escenario 1, Paso 2, cambiando solo `employeeTeleworkLocationStreet` por `Calle QA TWC Pedro Vivo 30` → devuelve `200`, con `"teleworkChecklistInvalidated": true`.

Comprueba la lista: `GET /api/nom037/telework-checklists/employees/<id de Pedro>` → devuelve `200`, con `current` en `null` y la lista del Paso 2 en `"status": "invalidada"` con motivo `cambio_de_domicilio`.

Paso 4 — registra otra visita sin lugar:

repite el Paso 2 de este escenario, mismo cuerpo → devuelve `201`, con `"status": "vigente"`.

Paso 5 — quítale la marca de fijo pactado al mismo lugar (`PUT` que repite el cuerpo del Paso 3 de este escenario, cambiando solo `employeeTeleworkLocationIsFixedAgreed` por `false`) → devuelve `200`, con `"teleworkChecklistInvalidated":

true`.

Paso 6 — registra otra visita sin lugar:

repite el Paso 2 de este escenario, mismo cuerpo → devuelve `201`, con `"status": "vigente"`. Ya no hay ningún fijo pactado.

Paso 7 — marca ese lugar como fijo pactado otra vez (`PUT` que repite el cuerpo del Paso 3 de este escenario, cambiando solo `employeeTeleworkLocationIsFixedAgreed` por `true`):

ese es el primer fijo desde que la lista no tiene referencia.

**Response exacto:** `200`, con `"teleworkChecklistInvalidated": false`.

Paso 8 — comprueba la lista:

`GET /api/nom037/telework-checklists/employees/<id de Pedro>` → devuelve `200`, con `current` con la lista del Paso 6 en `"status": "vigente"`.

Paso 9 — registra otra visita sin lugar:

repite el Paso 2 de este escenario, mismo cuerpo → devuelve `201`, con `"status": "vigente"`.

Paso 10 — da de baja al fijo pactado:

`DELETE /api/nom037/telework-locations/<id del lugar del Paso 1>` → devuelve `200`, con `"teleworkChecklistInvalidated": true` y el lugar con `"employeeTeleworkLocationActive": false`.

Comprueba la lista: `GET /api/nom037/telework-checklists/employees/<id de Pedro>` → devuelve `200`, con `current` en `null` y la lista del Paso 9 en `"status": "invalidada"` con motivo `"cambio_de_domicilio"`.

Paso 11 — deja como fijo pactado a otro lugar vivo, el creado en el Escenario 4, Paso 2 (`Calle QA TWC Pedro Coworking`):

**Endpoint:** `PUT /api/nom037/telework-locations/<id del lugar creado en el Escenario 4, Paso 2>`

Cuerpo (el del Escenario 1, Paso 2, con la calle de ese lugar y la marca de fijo pactado):

```json
{
  "employeeTeleworkLocationType": "coworking",
  "employeeTeleworkLocationStreet": "Calle QA TWC Pedro Coworking",
  "employeeTeleworkLocationExternalNumber": null,
  "employeeTeleworkLocationInternalNumber": null,
  "employeeTeleworkLocationSettlement": null,
  "employeeTeleworkLocationCity": "Ciudad de Mexico",
  "employeeTeleworkLocationState": "Ciudad de Mexico",
  "employeeTeleworkLocationCountry": "México",
  "employeeTeleworkLocationZipcode": null,
  "employeeTeleworkLocationIsFixedAgreed": true,
  "employeeTeleworkLocationHasInternet": true,
  "employeeTeleworkLocationHasAdequateEquipment": true,
  "employeeTeleworkLocationConnectivityNotes": null
}
```

**Response exacto:** `200`, con `"teleworkChecklistInvalidated": false`: no había lista vigente, así que no había nada que anular.

Paso 12 — registra otra visita **sin lugar**:

repite el Paso 2 de este escenario, mismo cuerpo → devuelve `201`, con `"teleworkLocationId": null` y `"status": "vigente"`.

Paso 13 — marca **otro** lugar, con domicilio distinto al del fijo, como fijo pactado:

**Endpoint:** `POST /api/nom037/telework-locations`

Cuerpo:

```json
{
  "employeeId": <id de Pedro>,
  "employeeTeleworkLocationType": "other",
  "employeeTeleworkLocationStreet": "Calle QA TWC Pedro Fijo Dos",
  "employeeTeleworkLocationExternalNumber": null,
  "employeeTeleworkLocationInternalNumber": null,
  "employeeTeleworkLocationSettlement": null,
  "employeeTeleworkLocationCity": "Ciudad de Mexico",
  "employeeTeleworkLocationState": "Ciudad de Mexico",
  "employeeTeleworkLocationCountry": "México",
  "employeeTeleworkLocationZipcode": null,
  "employeeTeleworkLocationIsFixedAgreed": true,
  "employeeTeleworkLocationHasInternet": false,
  "employeeTeleworkLocationHasAdequateEquipment": false,
  "employeeTeleworkLocationConnectivityNotes": null
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Lugar de teletrabajo",
  "message": "El lugar de teletrabajo se registró correctamente.",
  "data": {
    "teleworkLocation": {
      "employeeTeleworkLocationId": <id del lugar del Paso 13>,
      "employeeId": <id de Pedro>,
      "businessUnitId": <id interno de la empresa A>,
      "employeeTeleworkLocationType": "other",
      "employeeTeleworkLocationStreet": "Calle QA TWC Pedro Fijo Dos",
      "employeeTeleworkLocationExternalNumber": null,
      "employeeTeleworkLocationInternalNumber": null,
      "employeeTeleworkLocationSettlement": null,
      "employeeTeleworkLocationCity": "Ciudad de Mexico",
      "employeeTeleworkLocationState": "Ciudad de Mexico",
      "employeeTeleworkLocationCountry": "México",
      "employeeTeleworkLocationZipcode": null,
      "employeeTeleworkLocationIsFixedAgreed": true,
      "employeeTeleworkLocationHasInternet": false,
      "employeeTeleworkLocationHasAdequateEquipment": false,
      "employeeTeleworkLocationConnectivityNotes": null,
      "employeeTeleworkLocationActive": true,
      "employeeTeleworkLocationCreatedAt": "<fecha y hora del alta>",
      "employeeTeleworkLocationUpdatedAt": "<fecha y hora del alta>",
      "deletedAt": null
    },
    "teleworkChecklistInvalidated": true
  }
}
```

Paso 14 — comprueba la lista:

`GET /api/nom037/telework-checklists/employees/<id de Pedro>` → devuelve `200`, con `current` en `null` y la lista del Paso 12 en `"status": "invalidada"` con motivo `"cambio_de_domicilio"`.

Qué significa lo nuevo aquí:

- `teleworkLocationId` con `null` en la lista: la visita se registró sin lugar, así que la referencia es el **fijo pactado** del colaborador.
- `teleworkChecklistInvalidated`: el dato ya explicado en el Escenario 1; en el Paso 7 vale `false` porque marcar el primer fijo, cuando no había ninguno, no cambia la referencia de la lista, y en el Paso 13 vale `true` porque el fijo nuevo tiene otro domicilio que la referencia: al marcar otro lugar como fijo, la comparación se hace contra el fijo que había antes.
- (Los demás datos son los ya explicados en el Escenario 1.)

### 6. Un lugar secundario que no es el verificado no anula nada

Objetivo: comprobar que los lugares que no son la referencia de la lista —ni el verificado ni el fijo pactado— no la anulan ni al darlos de alta, ni al editarlos, ni al darlos de baja.

Paso 1 — registra la visita sobre el lugar creado en el Escenario 4, Paso 2 (`Calle QA TWC Pedro Coworking`):

repite el Escenario 1, Paso 1, cambiando solo `teleworkLocationId` por el id de ese lugar → devuelve `201`, con `"status": "vigente"`.

Paso 2 — registra un lugar secundario, sin la marca de fijo pactado:

**Endpoint:** `POST /api/nom037/telework-locations`

Cuerpo:

```json
{
  "employeeId": <id de Pedro>,
  "employeeTeleworkLocationType": "coworking",
  "employeeTeleworkLocationStreet": "Calle QA TWC Pedro Secundario Dos",
  "employeeTeleworkLocationExternalNumber": null,
  "employeeTeleworkLocationInternalNumber": null,
  "employeeTeleworkLocationSettlement": null,
  "employeeTeleworkLocationCity": "Ciudad de Mexico",
  "employeeTeleworkLocationState": "Ciudad de Mexico",
  "employeeTeleworkLocationCountry": "México",
  "employeeTeleworkLocationZipcode": null,
  "employeeTeleworkLocationIsFixedAgreed": false,
  "employeeTeleworkLocationHasInternet": true,
  "employeeTeleworkLocationHasAdequateEquipment": true,
  "employeeTeleworkLocationConnectivityNotes": null
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Lugar de teletrabajo",
  "message": "El lugar de teletrabajo se registró correctamente.",
  "data": {
    "teleworkLocation": {
      "employeeTeleworkLocationId": <id del lugar secundario nuevo>,
      "employeeId": <id de Pedro>,
      "businessUnitId": <id interno de la empresa A>,
      "employeeTeleworkLocationType": "coworking",
      "employeeTeleworkLocationStreet": "Calle QA TWC Pedro Secundario Dos",
      "employeeTeleworkLocationExternalNumber": null,
      "employeeTeleworkLocationInternalNumber": null,
      "employeeTeleworkLocationSettlement": null,
      "employeeTeleworkLocationCity": "Ciudad de Mexico",
      "employeeTeleworkLocationState": "Ciudad de Mexico",
      "employeeTeleworkLocationCountry": "México",
      "employeeTeleworkLocationZipcode": null,
      "employeeTeleworkLocationIsFixedAgreed": false,
      "employeeTeleworkLocationHasInternet": true,
      "employeeTeleworkLocationHasAdequateEquipment": true,
      "employeeTeleworkLocationConnectivityNotes": null,
      "employeeTeleworkLocationActive": true,
      "employeeTeleworkLocationCreatedAt": "<fecha y hora del alta>",
      "employeeTeleworkLocationUpdatedAt": "<fecha y hora del alta>",
      "deletedAt": null
    },
    "teleworkChecklistInvalidated": false
  }
}
```

Paso 3 — edita ese lugar secundario, cambiando solo su calle:

**Endpoint:** `PUT /api/nom037/telework-locations/<id del lugar secundario nuevo>`

Cuerpo (el del Paso 2 sin el `employeeId`, cambiando solo la calle):

```json
{
  "employeeTeleworkLocationType": "coworking",
  "employeeTeleworkLocationStreet": "Calle QA TWC Pedro Secundario Dos 2",
  "employeeTeleworkLocationExternalNumber": null,
  "employeeTeleworkLocationInternalNumber": null,
  "employeeTeleworkLocationSettlement": null,
  "employeeTeleworkLocationCity": "Ciudad de Mexico",
  "employeeTeleworkLocationState": "Ciudad de Mexico",
  "employeeTeleworkLocationCountry": "México",
  "employeeTeleworkLocationZipcode": null,
  "employeeTeleworkLocationIsFixedAgreed": false,
  "employeeTeleworkLocationHasInternet": true,
  "employeeTeleworkLocationHasAdequateEquipment": true,
  "employeeTeleworkLocationConnectivityNotes": null
}
```

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Lugar de teletrabajo",
  "message": "El lugar de teletrabajo se actualizó correctamente.",
  "data": {
    "teleworkLocation": {
      "employeeTeleworkLocationId": <id del lugar secundario nuevo>,
      "employeeId": <id de Pedro>,
      "businessUnitId": <id interno de la empresa A>,
      "employeeTeleworkLocationType": "coworking",
      "employeeTeleworkLocationStreet": "Calle QA TWC Pedro Secundario Dos 2",
      "employeeTeleworkLocationExternalNumber": null,
      "employeeTeleworkLocationInternalNumber": null,
      "employeeTeleworkLocationSettlement": null,
      "employeeTeleworkLocationCity": "Ciudad de Mexico",
      "employeeTeleworkLocationState": "Ciudad de Mexico",
      "employeeTeleworkLocationCountry": "México",
      "employeeTeleworkLocationZipcode": null,
      "employeeTeleworkLocationIsFixedAgreed": false,
      "employeeTeleworkLocationHasInternet": true,
      "employeeTeleworkLocationHasAdequateEquipment": true,
      "employeeTeleworkLocationConnectivityNotes": null,
      "employeeTeleworkLocationActive": true,
      "employeeTeleworkLocationCreatedAt": "<fecha y hora del alta>",
      "employeeTeleworkLocationUpdatedAt": "<fecha y hora>",
      "deletedAt": null
    },
    "teleworkChecklistInvalidated": false
  }
}
```

Paso 4 — da de baja ese mismo lugar secundario:

`DELETE /api/nom037/telework-locations/<id del lugar secundario nuevo>` → devuelve `200`, con la misma forma del Escenario 3, Paso 2 (el lugar con `"employeeTeleworkLocationActive": false` y su `deletedAt` con fecha), pero con `"teleworkChecklistInvalidated": false`.

Paso 5 — comprueba la lista:

`GET /api/nom037/telework-checklists/employees/<id de Pedro>` → devuelve `200`, con `current` con la lista del Paso 1 en `"status": "vigente"`.

Qué significa lo nuevo aquí:

- `teleworkChecklistInvalidated`: el dato ya explicado en el Escenario 1; aquí vale `false` en los tres pasos porque el lugar secundario no es el verificado ni quedó como fijo pactado —ni al darlo de alta, ni al editarlo, ni al darlo de baja— así que la lista sigue sobre el mismo domicilio de siempre.
- (Los demás datos son los ya explicados en el Escenario 1.)

### 7. Sin lista vigente —o con la última ya vencida— el cambio se guarda igual

Objetivo: comprobar que cuando el colaborador no tiene lista vigente —porque nunca tuvo una o porque la que tenía ya venció— el lugar se guarda igual y no aparece ningún estado nuevo en su lista.

Paso 1 — guarda el lugar vivo de Rosa cambiando su calle (`PUT /api/nom037/telework-locations/<id del lugar vivo de Rosa>` que repite el Escenario 1, Paso 2, cambiando solo `employeeTeleworkLocationStreet` por `Calle QA TWC Rosa Viva 2` y `"employeeTeleworkLocationIsFixedAgreed":

false`).

**Response exacto:** `200`, con `"teleworkChecklistInvalidated": false`.

Paso 2 — comprueba que Rosa no tiene ninguna lista:

```sql
SELECT COUNT(*) AS listas
FROM telework_checklist_applications
WHERE business_unit_id = <id interno de la empresa A>
  AND employee_id = <id de Rosa>;
```

Resultado: `0`: nunca tuvo lista (Rosa es presencial y el sistema no le admite listas de verificación).

Paso 3 — registra una visita de Pedro sobre el lugar creado en el Escenario 4, Paso 2 (`Calle QA TWC Pedro Coworking`):

repite el Escenario 1, Paso 1, cambiando solo `teleworkLocationId` por el id de ese lugar → devuelve `201`, con `"status": "vigente"`. Guarda ese `applicationId`.

Paso 4 — adelanta por la base el vencimiento de esa lista a ayer:

```sql
UPDATE telework_checklist_applications
SET telework_checklist_application_expires_at = '<ayer>'
WHERE telework_checklist_application_id = <applicationId del Paso 3>;
```

Resultado: 1 fila afectada. `<ayer>` es la fecha de ayer (Ciudad de México), en formato `AAAA-MM-DD`.

Paso 5 — cambia la calle de ese mismo lugar (`PUT` que repite el Escenario 1, Paso 2, cambiando solo `employeeTeleworkLocationStreet` por `Calle QA TWC Pedro Coworking 2` y `"employeeTeleworkLocationIsFixedAgreed":

true`).

**Response exacto:** `200`, con `"teleworkChecklistInvalidated": false`: la lista ya venció, así que no había nada que anular.

Paso 6 — comprueba que la lista no cambió de estado por este cambio:

```sql
SELECT telework_checklist_application_status,
       telework_checklist_application_expires_at,
       telework_checklist_application_invalidated_at,
       telework_checklist_application_invalidation_reason
FROM telework_checklist_applications
WHERE telework_checklist_application_id = <applicationId del Paso 3>;
```

Resultado: 1 fila, con el estado que ya tenía (`vigente`), el vencimiento de ayer y **sin** fecha ni motivo de anulación: el cambio no escribió nada en la lista.

Paso 7 — pide el historial:

`GET /api/nom037/telework-checklists/employees/<id de Pedro>` → devuelve `200`, con `current` en `null` y la lista del Paso 3 en `"status": "vencida"`: al consultarla, el sistema la reporta como vencida, no como anulada.

Qué significa lo nuevo aquí:

- `teleworkChecklistInvalidated`: el dato ya explicado en el Escenario 1; en los dos cambios vale `false` porque solo se anula la lista **vigente** y aquí no la hay.
- `status` con `vencida`: el valor ya explicado en el Escenario 1; por eso esta lista no cuenta como la vigente.
- La anulación no aparece: ni fecha ni motivo en la lista del Paso 3.

### 8. Un segundo cambio no vuelve a anular ni cambia la fecha ni el autor

Objetivo: comprobar que, una vez anulada la lista, otro cambio del mismo lugar se guarda sin volver a anularla y sin mover la fecha ni el autor de la primera anulación.

Paso 1 — registra la visita sobre el lugar creado en el Escenario 4, Paso 2 (`Calle QA TWC Pedro Coworking`):

repite el Escenario 1, Paso 1, cambiando solo `teleworkLocationId` por el id de ese lugar → devuelve `201`, con `"status": "vigente"`.

Paso 2 — cambia la calle de ese lugar (`PUT` que repite el Escenario 1, Paso 2, cambiando solo `employeeTeleworkLocationStreet` por `Calle QA TWC Pedro Coworking 3` y `"employeeTeleworkLocationIsFixedAgreed":

true`) → devuelve `200`, con `"teleworkChecklistInvalidated": true`.

Paso 3 — anota quién y cuándo anuló la lista:

```sql
SELECT telework_checklist_application_invalidated_at,
       telework_checklist_application_invalidated_by_user_id
FROM telework_checklist_applications
WHERE telework_checklist_application_id = <applicationId del Paso 1>;
```

Resultado: 1 fila, con la fecha y el `invalidated_by_user_id` de la cuenta **A**.

Paso 4 — cambia otra vez la calle de ese mismo lugar:

 (`PUT` que repite el Escenario 2, Paso 2, cambiando solo `employeeTeleworkLocationStreet` por `Calle QA TWC Pedro Coworking 4`).

**Response exacto:** `200`, con `"teleworkChecklistInvalidated": false`: la lista ya estaba anulada.

Paso 5 — repite el Paso 3 de este escenario.

Resultado: 1 fila, con la **misma** fecha y el **mismo** autor del Paso 3: una lista ya anulada no se vuelve a anular, así que conserva fecha y autor del primer cambio.

Qué significa lo nuevo aquí:

- `teleworkChecklistInvalidated` con `false` en el Paso 4: la anulación es de una sola vez. La lista ya anulada no vuelve a contarse.
- `telework_checklist_application_invalidated_by_user_id`: ya explicado en el Escenario 1 (la cuenta con sesión que provocó la anulación); aquí lo que se comprueba es que la fecha y el autor **no cambian** con el segundo cambio.

### 9. Lugares y colaboradores de otra empresa

Objetivo: comprobar que la cuenta de la empresa A, aun con todos sus permisos, no puede tocar los lugares ni los colaboradores de la empresa B —recibe el mismo aviso que con un lugar o un colaborador que no existen— y que ni siquiera una edición legítima de la empresa A toca a la B cuando manda su número en el cuerpo de la petición: nada de la empresa B cambia.

Usuario: **A**. Todas las peticiones de este escenario llevan el header `X-Business-Unit-Id` con el **código público de la empresa A**.

Paso 1 — edita el lugar de la empresa B (el que tiene la calle `Calle QA TWC Bruno Viva`):

repite el Escenario 1, Paso 2, mismo cuerpo; un `PUT` no lleva `employeeId`.

**Endpoint:** `PUT /api/nom037/telework-locations/<id del lugar de Bruno>`

**Response exacto:** `404`

```json
{
  "type": "warning",
  "title": "Lugar de teletrabajo",
  "message": "El lugar de teletrabajo no existe o no pertenece a la empresa seleccionada.",
  "key": "lugar-no-encontrado",
  "code": "TWL.NF.LOC.001",
  "data": null
}
```

Paso 2 — da de baja ese mismo lugar:

`DELETE /api/nom037/telework-locations/<id del lugar de Bruno>` → devuelve `404` con el mismo cuerpo (`lugar-no-encontrado` / `TWL.NF.LOC.001`).

Paso 3 — registra un lugar para el colaborador de la empresa B:

**Endpoint:** `POST /api/nom037/telework-locations`

Cuerpo: el del Escenario 4, Paso 2, cambiando solo `employeeId` por `<id de Bruno>`.

**Response exacto:** `404`

```json
{
  "type": "warning",
  "title": "Lugar de teletrabajo",
  "message": "El empleado no existe o no pertenece a la empresa seleccionada.",
  "key": "empleado-no-encontrado",
  "code": "TWL.NF.EMP.001",
  "data": null
}
```

Paso 4 — registra una visita de Pedro sobre su lugar de coworking (el creado en el Escenario 4, Paso 2):

repite el Escenario 1, Paso 1, cambiando solo `teleworkLocationId` por el id de ese lugar → devuelve `201`, con `"status": "vigente"`.

Paso 5 — edita ese lugar de la empresa A mandando el número de la empresa B en el cuerpo:

**Endpoint:** `PUT /api/nom037/telework-locations/<id del lugar creado en el Escenario 4, Paso 2>`

Cuerpo (la calle cambia a propósito —para que la petición anule la lista de A— y el último campo es el número de la empresa B, mandado a propósito: el número de empresa solo lo fija el header):

```json
{
  "employeeTeleworkLocationType": "home",
  "employeeTeleworkLocationStreet": "Calle QA TWC Pedro Coworking 5",
  "employeeTeleworkLocationExternalNumber": null,
  "employeeTeleworkLocationInternalNumber": null,
  "employeeTeleworkLocationSettlement": null,
  "employeeTeleworkLocationCity": "Ciudad de Mexico",
  "employeeTeleworkLocationState": "Ciudad de Mexico",
  "employeeTeleworkLocationCountry": "México",
  "employeeTeleworkLocationZipcode": "",
  "employeeTeleworkLocationIsFixedAgreed": true,
  "employeeTeleworkLocationHasInternet": false,
  "employeeTeleworkLocationHasAdequateEquipment": false,
  "employeeTeleworkLocationConnectivityNotes": null,
  "businessUnitId": "<código público de la empresa B>"
}
```

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Lugar de teletrabajo",
  "message": "El lugar de teletrabajo se actualizó correctamente.",
  "data": {
    "teleworkLocation": {
      "employeeTeleworkLocationId": <id del lugar creado en el Escenario 4, Paso 2>,
      "employeeId": <id de Pedro>,
      "businessUnitId": <id interno de la empresa A>,
      "employeeTeleworkLocationType": "home",
      "employeeTeleworkLocationStreet": "Calle QA TWC Pedro Coworking 5",
      "employeeTeleworkLocationExternalNumber": null,
      "employeeTeleworkLocationInternalNumber": null,
      "employeeTeleworkLocationSettlement": null,
      "employeeTeleworkLocationCity": "Ciudad de Mexico",
      "employeeTeleworkLocationState": "Ciudad de Mexico",
      "employeeTeleworkLocationCountry": "México",
      "employeeTeleworkLocationZipcode": "",
      "employeeTeleworkLocationIsFixedAgreed": true,
      "employeeTeleworkLocationHasInternet": false,
      "employeeTeleworkLocationHasAdequateEquipment": false,
      "employeeTeleworkLocationConnectivityNotes": null,
      "employeeTeleworkLocationActive": true,
      "employeeTeleworkLocationCreatedAt": "<fecha y hora>",
      "employeeTeleworkLocationUpdatedAt": "<fecha y hora>",
      "deletedAt": null
    },
    "teleworkChecklistInvalidated": true
  }
}
```

El número de empresa del cuerpo se ignoró: la edición se quedó en la empresa A —el `businessUnitId` de la respuesta es el interno de la empresa A— y lo que se anuló fue la lista de A; la B no aparece.

Paso 6 — comprueba que la empresa B quedó intacta:

```sql
SELECT employee_telework_location_id,
       employee_telework_location_active,
       employee_telework_location_deleted_at
FROM employee_telework_locations
WHERE business_unit_id = <id interno de la empresa B>;
```

Resultado: 1 fila (la de `Calle QA TWC Bruno Viva`), con `employee_telework_location_active` en `1` y `employee_telework_location_deleted_at` en `null`.

```sql
SELECT COUNT(*) AS listas
FROM telework_checklist_applications
WHERE business_unit_id = <id interno de la empresa B>;
```

Resultado: `0`: la empresa B no tiene listas registradas; nada de ella se tocó.

Qué significa cada dato:

- `key` / `code`: el motivo del rechazo, ya explicado en el Escenario 3. Aquí aparece además `empleado-no-encontrado` (`TWL.NF.EMP.001`): no hay tal colaborador en la empresa del header. Los cortes se aplican **antes** de tocar nada.
- `data` con `null`: ya explicado en el Escenario 3. La respuesta de otra empresa no se distingue de la de un lugar o un colaborador que no existen.
- `businessUnitId` en el cuerpo (Paso 5): ignorado. El número de empresa solo lo fija el header; mandarlo en el cuerpo no mueve la operación a esa empresa.

## Escenarios que resuelven las pruebas automatizadas

Lo que no se puede provocar a mano con un cliente de API lo resolvieron las pruebas automáticas de esta historia. Cada bloque dice qué se buscaba, qué tenía que pasar y con qué caso se cubrió.

### 10. Entrar sin sesión

Objetivo: comprobar que ninguna de las tres operaciones de lugares acepta una petición sin sesión, ni con el header de la empresa.

**Endpoint:** `POST`, `PUT` y `DELETE` de `/api/nom037/telework-locations`

**Response exacto:** `401`, el aviso estándar de petición sin sesión, sin datos de negocio. No está comprobado en esta rama: ver abajo.

Qué pasó: **no verificable en esta rama.** No se recorre a mano porque una petición sin sesión no dice nada del negocio, y no hay prueba propia que espere el `401` en las tres operaciones de lugares: ese corte lo aplica el paso de sesión que comparten todas las rutas del API. El grupo «401 sin sesión» que sí existe cubre las rutas de las **listas** de verificación, no las de lugares; la prueba de montaje de la historia hermana solo afirma que el grupo de lugares queda bajo el corte de empresa, no el de sesión.

### 11. Dos registros simultáneos del mismo teletrabajador

Objetivo: comprobar que dos visitas registradas a la vez para el mismo colaborador nunca dejan dos listas vigentes: la base admite una sola por colaborador.

**Endpoint:** `POST /api/nom037/telework-checklists` (las dos peticiones, a la vez)

**Response exacto:** una de las dos devuelve `201` con el cuerpo del Escenario 1, Paso 1 (la lista vigente de ese colaborador); la otra devuelve `409`

```json
{
  "type": "error",
  "title": "Aplicación concurrente",
  "detail": "Otra persona está registrando la lista de este colaborador; inténtalo de nuevo.",
  "key": "aplicacion-concurrente",
  "code": "TWC.CONF.002"
}
```

Nunca quedan dos vigentes.

Qué pasó: no se puede provocar de forma fiable desde un cliente HTTP a mano. Lo cubre la prueba automática CA-11 «dos POST simultáneos del mismo empleado dejan una sola vigente»: la garantía la da la regla de la base de a lo sumo una lista vigente por colaborador.

### 12. Dos registros simultáneos de teletrabajadores distintos

Objetivo: comprobar que el tope de una lista vigente por colaborador no estorba a los demás: dos teletrabajadores distintos registrando a la vez se quedan cada uno con la suya.

**Endpoint:** `POST /api/nom037/telework-checklists` (las dos peticiones, a la vez, una por colaborador)

**Response exacto:** `201` en las dos, cada una con el cuerpo del Escenario 1, Paso 1 y el `employeeId` de su propio colaborador.

Qué pasó: no se puede provocar de forma fiable a mano. Lo cubre la prueba automática Review Focus 4 «dos POST simultáneos de empleados distintos dejan dos vigentes».

### 13. El candado del colaborador (un cambio de lugar que espera)

Objetivo: comprobar que el cambio de un lugar se pone en fila si otro proceso tiene tomado al colaborador, y que al liberarse termina bien: anula la lista una sola vez y sin trabarse.

**Endpoint:** `PUT /api/nom037/telework-locations/<id del lugar vivo de Pedro>`

**Response exacto:** mientras el colaborador está tomado, la respuesta no llega; al liberarlo, `200` con el cuerpo del Escenario 1, Paso 2 (el lugar con la calle cambiada) y `"teleworkChecklistInvalidated": true`, la lista anulada una sola vez y sin error de bloqueo.

Qué pasó: no se puede provocar a mano (haría falta retener a propósito la operación sobre el colaborador). Lo cubre la prueba automática CA-17 «el PUT espera el candado del colaborador y completa sin deadlock».

### 14. Un fallo dentro de la operación (500, y nada a medias)

Objetivo: comprobar que si la anulación de la lista falla por dentro, no queda nada a medias: el domicilio conserva su valor anterior, el fijo pactado anterior sigue igual y la lista sigue vigente, y quien probó recibe el aviso de error inesperado.

**Endpoint:** `PUT /api/nom037/telework-locations/<id del lugar vivo de Pedro>`

**Response exacto:** `500`

```json
{
  "type": "error",
  "title": "Lugar de teletrabajo",
  "message": "Ocurrió un error inesperado al procesar el lugar de teletrabajo.",
  "key": "error-inesperado",
  "code": "TWL.SYS.001",
  "data": null
}
```

Qué pasó: no se puede provocar a mano (habría que hacer fallar por dentro la anulación de la lista, justo lo que no se puede pedir por HTTP). Lo cubre la prueba automática CA-12: la que hace fallar la anulación y comprueba el `500` con la reversión completa del domicilio, del fijo pactado y de la lista, más la del servicio que comprueba lo mismo con un puerto falso que falla.

### 15. Lo que queda registrado del error

Objetivo: comprobar que el registro del error no deja escapar el domicilio: solo ids (lugar y empresa; el del colaborador solo cuando la operación lo conoce), el nombre del error y un texto fijo, nunca el cuerpo enviado, la calle, los números, la colonia, la ciudad, el estado, el país, el código postal ni el texto del error original.

**Endpoint:** `PUT /api/nom037/telework-locations/<id del lugar vivo de Pedro>` (el que hace fallar la anulación)

**Response exacto:** `500`

```json
{
  "type": "error",
  "title": "Lugar de teletrabajo",
  "message": "Ocurrió un error inesperado al procesar el lugar de teletrabajo.",
  "key": "error-inesperado",
  "code": "TWL.SYS.001",
  "data": null
}
```

Qué pasó: no se recorre a mano. Lo cubre la prueba automática CA-18 «el log del 500 lleva solo ids y nombre del error, sin domicilio»: en el camino del `PUT` el registro lleva el id del lugar, el de la empresa y el nombre del error, con el id del colaborador en `null` (esa operación no lo conoce de antemano), y ningún dato del domicilio ni el texto del error original.

### 16. La lista ligada a un lugar que ya estaba dado de baja antes de esta mejora

Objetivo: comprobar que una lista vigente cuyo lugar ligado ya estaba dado de baja —un estado que solo podían dejar las bajas anteriores a esta mejora— deja de mirar ese lugar y toma como referencia el sitio fijo pactado del colaborador, decidiendo igual que si nunca hubiera tenido lugar.

**Endpoint:** `PUT /api/nom037/telework-locations/<id del fijo pactado de Pedro>`

**Response exacto:** `200`, con el cuerpo del Escenario 1, Paso 2 (el lugar editado) y `"teleworkChecklistInvalidated": true`, la lista `invalidada` con motivo `"cambio_de_domicilio"`.

Qué pasó: no se puede provocar con el API: desde esta mejora, dar de baja un lugar anula su lista en el mismo paso, así que ninguna petición deja una lista vigente apuntando a un lugar ya dado de baja; el estado solo existía antes de esta mejora. Lo cubre la prueba automática «lugar ligado muerto: la referencia cae al fijo y decide como CA-07», que siembra ese estado por base y comprueba que la referencia es el fijo pactado, no el lugar muerto.

Marca cada uno de estos contra su `Objetivo:`:

- [ ] **Escenario 10** — no verificable en la rama: no hay prueba de `401` en las rutas de lugares.
- [ ] **Escenario 11** — dos registros a la vez del mismo teletrabajador dejan una sola lista vigente.
- [ ] **Escenario 12** — dos teletrabajadores distintos registrando a la vez se quedan cada uno con la suya.
- [ ] **Escenario 13** — el cambio espera el candado del colaborador, termina bien y anula una sola vez.
- [ ] **Escenario 14** — el fallo por dentro responde `500` y revierte el domicilio, el fijo y la lista.
- [ ] **Escenario 15** — el registro del error lleva solo ids y el nombre del error, sin domicilio.
- [ ] **Escenario 16** — la lista ligada a un lugar ya dado de baja decide contra el fijo pactado, como si nunca hubiera tenido lugar.

## Checklist

Marca cada escenario contra su `Objetivo:`, no contra «se hicieron los pasos».

- [ ] **Escenario 1** — cambiar el domicilio del lugar verificado anula la lista, con su motivo y su autor de sesión, y deja sus respuestas intactas.
- [ ] **Escenario 2** — reescribir el domicilio con otras mayúsculas, acentos o espacios, o tocar solo lo que no es el domicilio, no anula la lista.
- [ ] **Escenario 3** — dar de baja el lugar verificado anula la lista, el lugar queda de baja sin borrarse y repetir la baja responde como si no existiera.
- [ ] **Escenario 4** — marcar otro lugar como fijo pactado con domicilio distinto anula; con el mismo domicilio, no.
- [ ] **Escenario 5** — sin lugar ligado, cambiar, desmarcar o dar de baja al fijo pactado anula; marcar otro lugar con otro domicilio como fijo también; el primer fijo no.
- [ ] **Escenario 6** — dar de alta, editar o dar de baja un lugar que no es la referencia de la lista no anula nada.
- [ ] **Escenario 7** — sin lista vigente, o con la última ya vencida, el cambio se guarda y no aparece estado nuevo.
- [ ] **Escenario 8** — el segundo cambio no vuelve a anular ni mueve la fecha ni el autor.
- [ ] **Escenario 9** — lo de otra empresa recibe el mismo aviso que lo que no existe; una edición legítima con el número de la otra empresa en el cuerpo tampoco la toca.

## Hallazgos de otras historias

Ninguno.
