# Prueba manual API — Alta de colaborador con departamento y puesto obligatorios

**Problema:** Antes de esta historia, al dar de alta a un colaborador nuevo el sistema podía aceptar el alta sin departamento ni puesto, o rellenarlos con valores genéricos; si alguien elegía un departamento o un puesto de otra unidad de trabajo, o uno que ya no existía, el rechazo no siempre traía un mensaje claro; y un dato mal formado en la petición podía terminar en la pantalla de error general, con riesgo de dejar la ficha de la persona a medias.

**Solución:** Ahora, al dar de alta, el departamento y el puesto son obligatorios: si faltan los dos, o solo uno, la petición se rechaza diciendo qué falta; nunca se inventa un departamento ni un puesto por defecto. Si se elige un departamento o un puesto, tiene que existir, estar vigente y ser de la unidad de trabajo del colaborador; si no (incluido uno de otra unidad, uno dado de baja o un identificador inexistente), se rechaza con el mismo mensaje claro, sin revelar detalles internos. Un dato mal formado se rechaza con un mensaje de validación, no con error de servidor. Si el alta falla, la persona no queda bloqueada: se puede volver a registrar con el mismo correo y completar el alta. La importación por Excel no cambia en esta historia (sigue su comportamiento actual).

Ejemplo: es como inscribir a un alumno nuevo en SU escuela: tienes que elegir salón y grado de esa escuela; si no los pones, te dicen cuál falta; no te lo anotan en un salón “sin salón” ni en uno de la escuela de al lado, y si algo va mal en el formulario no te echan de la ventanilla con un error que borra la ficha — puedes volver con el mismo correo.

Un alta desde la app u otra integración sin departamento no se puede provocar con el ambiente sembrado (supuesto a validar con Wilvardo).

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

**Header obligatorio en toda petición de este manual.** Además del token, cada endpoint exige el header `X-Business-Unit-Id` con el identificador público de la empresa de prueba. En los ocho escenarios el usuario actúa siempre desde la empresa de prueba — incluso cuando el cuerpo trae un departamento de la empresa ajena.

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Deja lista la empresa de prueba y la ajena, el departamento y el puesto activos y el departamento dado de baja en la de prueba, el departamento y el puesto de la ajena, y el usuario que da de alta. **No** crea colaboradores: cada escenario los crea con `POST /api/persons` y `POST /api/employees`.

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-alta-principal@gsti-tests.local` | `password` | Usuario principal (`root`), con acceso a la empresa de prueba **y** a la ajena |

Los identificadores que van en las peticiones no se inventan ni se hardcodean: resuélvelos con estas consultas.

Identificador público de la empresa de prueba, para el header `X-Business-Unit-Id` de todos los escenarios:

```sql
SELECT business_unit_public_id FROM business_units WHERE business_unit_slug = 'qa-alta-prueba';
```

Identificador interno de la misma empresa, para `companyId`, `businessUnitId` y `payrollBusinessUnitId` en el cuerpo de cada alta:

```sql
SELECT business_unit_id FROM business_units WHERE business_unit_slug = 'qa-alta-prueba';
```

Identificador interno de la empresa ajena (solo referencia; el alta siempre es en la de prueba):

```sql
SELECT business_unit_id FROM business_units WHERE business_unit_slug = 'qa-alta-ajena';
```

Departamento y puesto activos de la empresa de prueba, departamento dado de baja de la empresa de prueba, y departamento y puesto de la empresa ajena:

```sql
SELECT department_id FROM departments WHERE department_code = 'QA-ALT-DEPT-ACTIVO';
SELECT position_id FROM positions WHERE position_code = 'QA-ALT-POS-ACTIVO';
SELECT department_id FROM departments WHERE department_code = 'QA-ALT-DEPT-BAJA';
SELECT department_id FROM departments WHERE department_code = 'QA-ALT-DEPT-AJENO';
SELECT position_id FROM positions WHERE position_code = 'QA-ALT-POS-AJENO';
```

Tras cada escenario, el `personId` y si hubo alta el colaborador se resuelven así (sustituye el correo de esa corrida):

```sql
SELECT person_id FROM people WHERE person_email = 'qa-alta-s1@gsti-tests.local';
SELECT employee_id, department_id, position_id FROM employees
WHERE employee_business_email = 'qa-alta-s1@gsti-tests.local' AND employee_deleted_at IS NULL;
```

## 2. Escenario 1 — Alta sin departamento ni puesto (envío Pilotos/Sobrecargos)

Usuario: **A**. Correo de la persona y del colaborador: `qa-alta-s1@gsti-tests.local`.

**Paso 1 — Crear la persona**

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de la empresa de prueba, resuelto en Preparar>`

```json
{
  "personFirstname": "Alta",
  "personLastname": "Uno",
  "personEmail": "qa-alta-s1@gsti-tests.local"
}
```

**Response — 201:**

```json
{
  "type": "success",
  "title": "Persons",
  "message": "The person was created successfully",
  "data": {
    "person": {
      "personId": <person_id de este paso>,
      "...": "..."
    }
  }
}
```

**Paso 2 — Intentar el alta del colaborador**

**Endpoint:** `POST /api/employees`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de la empresa de prueba, resuelto en Preparar>`

```json
{
  "employeeFirstName": "Alta",
  "employeeLastName": "Uno",
  "employeeSecondLastName": "QA",
  "companyId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "departmentId": 0,
  "positionId": "",
  "personId": <person_id del Paso 1>,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null,
  "employeeBusinessEmail": "qa-alta-s1@gsti-tests.local"
}
```

**Response — 400:**

```json
{
  "type": "warning",
  "title": "Departamento y puesto obligatorios",
  "message": "Faltan el departamento y el puesto",
  "detail": "Faltan el departamento y el puesto",
  "key": "alta-empleado-invalida"
}
```

Qué significa cada dato:

- `type`: qué tan bien salió la petición. Puede valer `success` (sí se dio de alta — se prueba en el Escenario 3) o `warning` (no se dio de alta y el mensaje dice qué corregir — el que se prueba aquí).
- `title` / `message`: el encabezado y la frase del rechazo; aquí indican que faltan los dos datos de estructura.
- `departmentId`: el departamento del colaborador dentro de su unidad de trabajo. En este escenario va en `0`, que cuenta como “no enviado”.
- `positionId`: el puesto del colaborador dentro de su unidad de trabajo. En este escenario va vacío (`""`), que cuenta como “no enviado”.

Confirma que no se creó colaborador (la consulta no debe devolver filas):

```sql
SELECT employee_id FROM employees
WHERE employee_business_email = 'qa-alta-s1@gsti-tests.local' AND employee_deleted_at IS NULL;
```

**Paso 3 — Volver a registrar la persona con el mismo correo**

Repite el **Paso 1** con el mismo cuerpo y correo.

**Response — 201:** mismo envelope que el Paso 1 (`The person was created successfully`). Comprueba que el alta puede reintentarse sin quedar la ficha a medias.

## 3. Escenario 2 — Alta con solo el departamento activo de su unidad

Usuario: **A**. Correo: `qa-alta-s2@gsti-tests.local`.

**Paso 1 —** `POST /api/persons` (misma forma que el Escenario 1, con `personLastname`: `"Dos"` y `personEmail`: `qa-alta-s2@gsti-tests.local`).

**Response — 201:** (Los datos de persona son los ya explicados en el Escenario 1.)

**Paso 2 —** `POST /api/employees`

Headers: iguales al Escenario 1.

```json
{
  "employeeFirstName": "Alta",
  "employeeLastName": "Dos",
  "employeeSecondLastName": "QA",
  "companyId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "departmentId": <id de QA-ALT-DEPT-ACTIVO, resuelto en Preparar>,
  "positionId": "",
  "personId": <person_id del Paso 1>,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null,
  "employeeBusinessEmail": "qa-alta-s2@gsti-tests.local"
}
```

**Response — 400:**

```json
{
  "type": "warning",
  "title": "Puesto obligatorio",
  "message": "Falta el puesto",
  "detail": "Falta el puesto",
  "key": "alta-empleado-invalida"
}
```

Qué significa lo nuevo aquí: `message` indica que esta vez sí viajó el departamento, pero falta el puesto. (`type` y el resto son los ya explicados en el Escenario 1.)

## 4. Escenario 3 — Alta con departamento y puesto activos de su unidad

Usuario: **A**. Correo: `qa-alta-s3@gsti-tests.local`.

**Paso 1 —** `POST /api/persons` (`personLastname`: `"Tres"`, correo `qa-alta-s3@gsti-tests.local`).

**Response — 201:** (Los datos de persona son los ya explicados en el Escenario 1.)

**Paso 2 —** `POST /api/employees`

```json
{
  "employeeFirstName": "Alta",
  "employeeLastName": "Tres",
  "employeeSecondLastName": "QA",
  "companyId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "departmentId": <id de QA-ALT-DEPT-ACTIVO, resuelto en Preparar>,
  "positionId": <id de QA-ALT-POS-ACTIVO, resuelto en Preparar>,
  "personId": <person_id del Paso 1>,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null,
  "employeeBusinessEmail": "qa-alta-s3@gsti-tests.local"
}
```

**Response — 201:**

```json
{
  "type": "success",
  "title": "Employees",
  "message": "The employee was created successfully",
  "data": {
    "employee": {
      "departmentId": <id de QA-ALT-DEPT-ACTIVO, resuelto en Preparar>,
      "positionId": <id de QA-ALT-POS-ACTIVO, resuelto en Preparar>,
      "...": "..."
    }
  }
}
```

Qué significa lo nuevo aquí: `data.employee` es el colaborador ya dado de alta; `departmentId` y `positionId` deben coincidir con los ids activos de la empresa de prueba — no debe aparecer en la respuesta ningún nombre tipo “Sin Departamento” ni “Sin Puesto”. (El envelope `type` / `title` / `message` de éxito es el ya descrito en el Escenario 1 para `success`.)

## 5. Escenario 4 — Departamento de la otra unidad de trabajo

Usuario: **A**. Correo: `qa-alta-s4@gsti-tests.local`.

**Paso 1 —** `POST /api/persons` (`personLastname`: `"Cuatro"`, correo `qa-alta-s4@gsti-tests.local`).

**Response — 201:** (Los datos de persona son los ya explicados en el Escenario 1.)

**Paso 2 —** `POST /api/employees` (colaborador en la empresa de prueba, departamento de la ajena, puesto activo de la de prueba)

```json
{
  "employeeFirstName": "Alta",
  "employeeLastName": "Cuatro",
  "employeeSecondLastName": "QA",
  "companyId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "departmentId": <id de QA-ALT-DEPT-AJENO, resuelto en Preparar>,
  "positionId": <id de QA-ALT-POS-ACTIVO, resuelto en Preparar>,
  "personId": <person_id del Paso 1>,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null,
  "employeeBusinessEmail": "qa-alta-s4@gsti-tests.local"
}
```

**Response — 400:**

```json
{
  "type": "warning",
  "title": "Departamento no disponible",
  "message": "El departamento no existe en la empresa del empleado",
  "detail": "El departamento no existe en la empresa del empleado",
  "key": "alta-empleado-invalida"
}
```

Qué significa lo nuevo aquí: `message` explica que el departamento elegido no pertenece a la unidad de trabajo del colaborador que se está dando de alta (aunque quien capture tenga acceso a las dos unidades).

Confirma que no hay colaborador:

```sql
SELECT employee_id FROM employees
WHERE employee_business_email = 'qa-alta-s4@gsti-tests.local' AND employee_deleted_at IS NULL;
```

## 6. Escenario 5 — Departamento inexistente

Usuario: **A**. Correo: `qa-alta-s5@gsti-tests.local`.

**Paso 1 —** `POST /api/persons` (`personLastname`: `"Cinco"`, correo `qa-alta-s5@gsti-tests.local`).

**Response — 201:** (Los datos de persona son los ya explicados en el Escenario 1.)

**Paso 2 —** `POST /api/employees`

```json
{
  "employeeFirstName": "Alta",
  "employeeLastName": "Cinco",
  "employeeSecondLastName": "QA",
  "companyId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "departmentId": 2000000000,
  "positionId": <id de QA-ALT-POS-ACTIVO, resuelto en Preparar>,
  "personId": <person_id del Paso 1>,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null,
  "employeeBusinessEmail": "qa-alta-s5@gsti-tests.local"
}
```

**Response — 400:**

```json
{
  "type": "warning",
  "title": "Departamento no disponible",
  "message": "El departamento no existe en la empresa del empleado",
  "detail": "El departamento no existe en la empresa del empleado",
  "key": "alta-empleado-invalida"
}
```

(Los datos son los ya explicados en el Escenario 4: a propósito el mismo texto que para un departamento ajeno — no se distingue si no existe, ya no está o es de otra unidad.)

## 7. Escenario 6 — Departamento dado de baja

Usuario: **A**. Correo: `qa-alta-s6@gsti-tests.local`.

**Paso 1 —** `POST /api/persons` (`personLastname`: `"Seis"`, correo `qa-alta-s6@gsti-tests.local`).

**Response — 201:** (Los datos de persona son los ya explicados en el Escenario 1.)

**Paso 2 —** `POST /api/employees`

```json
{
  "employeeFirstName": "Alta",
  "employeeLastName": "Seis",
  "employeeSecondLastName": "QA",
  "companyId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "departmentId": <id de QA-ALT-DEPT-BAJA, resuelto en Preparar>,
  "positionId": <id de QA-ALT-POS-ACTIVO, resuelto en Preparar>,
  "personId": <person_id del Paso 1>,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null,
  "employeeBusinessEmail": "qa-alta-s6@gsti-tests.local"
}
```

**Response — 400:** mismo cuerpo que el Escenario 4 (`message`: `El departamento no existe en la empresa del empleado`).

(Los datos son los ya explicados en el Escenario 4.)

## 8. Escenario 7 — Tipo de colaborador mal formado

Usuario: **A**. Correo: `qa-alta-s7@gsti-tests.local`.

**Paso 1 —** `POST /api/persons` (`personLastname`: `"Siete"`, correo `qa-alta-s7@gsti-tests.local`).

**Response — 201:** (Los datos de persona son los ya explicados en el Escenario 1.)

**Paso 2 —** `POST /api/employees`

```json
{
  "employeeFirstName": "Alta",
  "employeeLastName": "Siete",
  "employeeSecondLastName": "QA",
  "companyId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "departmentId": <id de QA-ALT-DEPT-ACTIVO, resuelto en Preparar>,
  "positionId": <id de QA-ALT-POS-ACTIVO, resuelto en Preparar>,
  "personId": <person_id del Paso 1>,
  "employeeTypeId": "no-es-numero",
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null,
  "employeeBusinessEmail": "qa-alta-s7@gsti-tests.local"
}
```

**Response — 400:**

```json
{
  "type": "warning",
  "title": "Error de validación",
  "message": "El campo employeeTypeId debe ser numérico",
  "errors": [
    {
      "message": "El campo employeeTypeId debe ser numérico",
      "rule": "number",
      "field": "employeeTypeId"
    }
  ],
  "key": "alta-empleado-invalida"
}
```

Qué significa lo nuevo aquí: `title: "Error de validación"` señala que lo que falló fue un dato de la petición, no el servidor — nunca debe salir `500` con `"Server error"` por este caso. `errors` detalla el campo; no hace falta leerlo, `message` ya lo resume.

Confirma que no se creó colaborador:

```sql
SELECT employee_id FROM employees
WHERE employee_business_email = 'qa-alta-s7@gsti-tests.local' AND employee_deleted_at IS NULL;
```

## 9. Escenario 8 — Importación Excel sin columna de departamento

Usuario: **A**.

**Paso 1 — Descargar plantilla**

**Endpoint:** `GET /api/employees/template-excel`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de la empresa de prueba, resuelto en Preparar>`

**Response — 200:** archivo Excel (`.xlsx`).

**Paso 2 — Preparar una fila**

Abre la plantilla. En una fila de datos deja **vacía** la columna de departamento. Completa al menos: identificador de nómina `QA-ALT-IMP-01`, unidad de trabajo con el nombre **QA Alta Prueba** (la empresa sembrada), unidad de nómina coherente con esa unidad, nombre y apellido del colaborador. Guarda el archivo.

El relleno automático de departamento/puesto que el importador todavía pueda aplicar se retira en otra historia; aquí solo se verifica que la importación **no** responda con el `400` de esta HU por faltar departamento en el alta por API.

**Paso 3 — Importar**

**Endpoint:** `POST /api/employees/import-excel`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de la empresa de prueba, resuelto en Preparar>`

Body: `multipart/form-data` con el archivo en el campo `file`.

**Response — 200** (éxito habitual de importación, no `400` con `Faltan el departamento y el puesto`):

```json
{
  "type": "success",
  "title": "Importación completada",
  "message": "Importación exitosa: 1 empleados creados, 0 empleados actualizados.",
  "data": {
    "...": "..."
  }
}
```

Si la fila ya existía de una corrida anterior, el mensaje puede hablar de actualizados en lugar de creados; lo importante es que **no** sea un rechazo `400` de estructura obligatoria de esta historia. (No hay datos nuevos de negocio que explicar: solo se confirma que el camino Excel sigue vivo.)

## 10. Checklist

- [ ] Escenario 1: `400` con `Faltan el departamento y el puesto`; sin colaborador; `POST /api/persons` con el mismo correo → `201`
- [ ] Escenario 2: `400` con `Falta el puesto`
- [ ] Escenario 3: `201` con `departmentId` y `positionId` activos de la empresa de prueba; sin texto “Sin Departamento”
- [ ] Escenario 4: `400` con `El departamento no existe en la empresa del empleado`; sin colaborador
- [ ] Escenario 5: mismo `message` que el Escenario 4 con `departmentId` `2000000000`
- [ ] Escenario 6: mismo `message` que el Escenario 4 con departamento dado de baja
- [ ] Escenario 7: `400` con `title` `Error de validación`, no `500` / `Server error`
- [ ] Escenario 8: importación Excel sin departamento en la fila → éxito habitual (`200`), no el `400` de esta HU
