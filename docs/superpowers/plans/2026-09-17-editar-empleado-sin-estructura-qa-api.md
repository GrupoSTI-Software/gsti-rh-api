# Prueba manual API — Editar y dar de baja a un empleado sin departamento ni puesto

**Problema:** Antes de esta historia, para editar o dar de baja a un colaborador que nunca tuvo departamento ni puesto asignado, la pantalla exigía capturar los dos aunque no vinieran al caso: no se le podía ni corregir un dato tan simple como el correo, ni registrar su baja. Además, si alguien intentaba asignarle un departamento o un puesto que en realidad era de otra empresa, o que ya se había dado de baja, el rechazo no siempre traía un mensaje claro; y un dato mal formado en la petición terminaba en la pantalla de error general, con el riesgo de perder lo ya capturado.

**Solución:** Ahora, al editar a un colaborador, el departamento y el puesto dejan de ser obligatorios: si la petición no los trae, se conserva lo que ya tenía guardado (aunque esté vacío); si trae `null` explícito, queda sin asignar. Solo cuando se le asigna un departamento o un puesto DISTINTO al que ya tenía —o cuando cambia de empresa— el sistema verifica que exista, esté vigente y sea de la empresa del colaborador; si no lo es, rechaza la operación con un mensaje claro, sea porque no existe, porque se dio de baja o porque es de otra empresa (los tres casos se ven igual desde afuera). Reenviar el mismo dato que ya tenía nunca bloquea, aunque apunte a algo ya eliminado. Dar de baja a un colaborador tampoco exige tener departamento ni puesto. Y un dato mal formado en la petición ahora se rechaza con un mensaje claro, no con la pantalla de error general.

Ejemplo: es como la lista de alumnos de una escuela — a un alumno que todavía no tiene salón asignado se le puede corregir el nombre y darlo de baja sin pedirle primero que tenga salón; y si alguien intenta ponerle uno, ese salón tiene que existir DE VERDAD en SU escuela: no vale ponerle uno de la escuela de al lado, ni uno que ya se cerró.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

**Header obligatorio en toda petición de este manual.** Además del token, cada endpoint exige el header `X-Business-Unit-Id` con el identificador público de la empresa desde la que actúa el usuario. En los doce escenarios de este manual el usuario actúa siempre desde la empresa de prueba — incluso cuando el cuerpo mueve al colaborador a la empresa ajena (Escenarios 11 y 12). Quien captura es el usuario **A**, que tiene acceso a las dos; el header no cambia: en Preparar está la consulta para resolverlo.

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Deja lista la empresa de prueba y la ajena, el departamento y el puesto activos y el departamento dado de baja de la empresa de prueba, el departamento y el puesto de la empresa ajena, los cinco colaboradores de esta prueba y el usuario que los edita.

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-edicion-principal@gsti-tests.local` | `password` | Usuario principal (`root`), con acceso a la empresa de prueba **y** a la ajena |

| Código de nómina | Estructura |
|---|---|
| `QA-EDI-01` | Sin departamento ni puesto |
| `QA-EDI-02` | Sin departamento ni puesto |
| `QA-EDI-03` | Apunta al departamento dado de baja; con el puesto activo |
| `QA-EDI-04` | Sin departamento ni puesto |
| `QA-EDI-05` | Sin departamento ni puesto |

Los identificadores que van en las peticiones no se inventan ni se hardcodean: resuélvelos con estas consultas.

El `id` de cada colaborador (sustituye el código de nómina; se usa en la URL de cada escenario):

```sql
SELECT employee_id AS id FROM employees
WHERE employee_payroll_code = 'QA-EDI-01' AND employee_deleted_at IS NULL;
-- repite cambiando el código: QA-EDI-02, QA-EDI-03, QA-EDI-04, QA-EDI-05
```

El identificador público de la empresa de prueba, para el header `X-Business-Unit-Id` de todos los escenarios:

```sql
SELECT business_unit_public_id FROM business_units WHERE business_unit_slug = 'qa-edicion-prueba';
```

El identificador interno de la misma empresa, para los campos `businessUnitId` y `payrollBusinessUnitId` del cuerpo de cada petición (es un número, distinto del identificador público de arriba):

```sql
SELECT business_unit_id FROM business_units WHERE business_unit_slug = 'qa-edicion-prueba';
```

El identificador interno de la empresa ajena, para los campos `businessUnitId` y `payrollBusinessUnitId` cuando el Escenario 11 o el 12 mueven al colaborador de empresa:

```sql
SELECT business_unit_id FROM business_units WHERE business_unit_slug = 'qa-edicion-ajena';
```

El departamento y el puesto activos de la empresa de prueba, el departamento dado de baja de la empresa de prueba, y el departamento y el puesto de la empresa ajena:

```sql
SELECT department_id FROM departments WHERE department_code = 'QA-EDI-DEPT-ACTIVO';
SELECT position_id FROM positions WHERE position_code = 'QA-EDI-POS-ACTIVO';
SELECT department_id FROM departments WHERE department_code = 'QA-EDI-DEPT-BAJA';
SELECT department_id FROM departments WHERE department_code = 'QA-EDI-DEPT-AJENO';
SELECT position_id FROM positions WHERE position_code = 'QA-EDI-POS-AJENO';
```

## 2. Escenario 1 — Se corrige el correo de un colaborador sin departamento ni puesto; siguen vacíos

Usuario: **A**.

**Endpoint:** `PUT /api/employees/<id de QA-EDI-01, resuelto en Preparar>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

```json
{
  "employeeCode": "QA-EDI-01",
  "employeeFirstName": "Edicion",
  "employeeLastName": "Uno",
  "employeeSecondLastName": "QA",
  "companyId": 1,
  "departmentId": null,
  "positionId": null,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeBusinessEmail": "qa-edi-01-corregido@gsti-tests.local",
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null
}
```

**Response — 201:**

```json
{
  "type": "success",
  "title": "Employees",
  "message": "The employee was updated successfully",
  "data": {
    "employee": {
      "employeeId": <id de QA-EDI-01, resuelto en Preparar>,
      "departmentId": null,
      "positionId": null,
      "employeeBusinessEmail": "qa-edi-01-corregido@gsti-tests.local",
      "...": "..."
    }
  }
}
```

Qué significa cada dato:

- `type`: qué tan bien salió la petición. Puede valer `success` (se guardó — el que se prueba en este escenario), `warning` (no se guardó porque un dato no cuadra; el mensaje explica por qué — se prueba desde el Escenario 5) o `error` (no se guardó por un dato que no cuadra con el puesto del colaborador — se prueba en el Escenario 8).
- `title` / `message`: el encabezado y la frase de la respuesta.
- `data.employee`: el colaborador ya editado, con sus datos actualizados.
- `employeeId`: el identificador único del colaborador.
- `departmentId` / `positionId`: el departamento y el puesto que le quedan asignados al colaborador. Vacíos (`null`) quiere decir que el colaborador sigue sin departamento y sin puesto — no se le inventa ninguno solo por editarlo.
- `employeeBusinessEmail`: el correo del colaborador; aquí se ve el corregido, prueba de que la edición sí se aplicó aunque no se haya tocado su estructura.

## 3. Escenario 2 — Se registra la baja desde la ficha (PUT), sin pedir estructura

Usuario: **A**.

**Endpoint:** `PUT /api/employees/<id de QA-EDI-01, resuelto en Preparar>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

```json
{
  "employeeCode": "QA-EDI-01",
  "employeeFirstName": "Edicion",
  "employeeLastName": "Uno",
  "employeeSecondLastName": "QA",
  "companyId": 1,
  "departmentId": null,
  "positionId": null,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeBusinessEmail": "qa-edi-01-corregido@gsti-tests.local",
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null,
  "employeeTerminatedDate": "2026-09-17",
  "employeeTerminationModality": "Renuncia",
  "employeeTerminationType": "Cambio de Residencia"
}
```

**Response — 201:**

```json
{
  "type": "success",
  "title": "Employees",
  "message": "The employee was updated successfully",
  "data": {
    "employee": {
      "employeeId": <id de QA-EDI-01, resuelto en Preparar>,
      "departmentId": null,
      "positionId": null,
      "employeeTerminatedDate": "2026-09-17 00:000:00",
      "employeeTerminationModality": "Renuncia",
      "employeeTerminationType": "Cambio de Residencia",
      "...": "..."
    }
  }
}
```

Qué significa lo nuevo aquí:

- `employeeTerminatedDate`: la fecha en la que se le da de baja al colaborador.
- `employeeTerminationModality`: la manera en que terminó la relación laboral. Puede valer `Renuncia` (el colaborador decide irse — la que se prueba en este escenario), `Retiro`, `Baja Administrativa`, `Despido`, `Rescisión`, `Mutuo Acuerdo` o `Transferencia` (ninguna de estas seis se provoca en este manual).
- `employeeTerminationType`: el motivo puntual de la baja, ligado a la modalidad. Puede valer `Cambio de Residencia` (el colaborador se mudó fuera del alcance de la organización — la que se prueba en este escenario), o cualquiera de estos otros motivos del catálogo, ninguno de los cuales se provoca en este manual: `Jubilación`, `Fallecimiento o Incapacidad Permanente`, `Causas Familiares de Fuerza Mayor`, `Retorno a Formación Académica`, `Bajo Desempeño Operativo`, `Falta de Alineación Cultural`, `Promoción Interna (Ascenso)`, `Renovación de Competencias`, `Fuga de Talento Clave (HiPo)`, `Desajuste de Compensación (Mercado)`, `Oportunidad de Mejora en Clima Laboral`, `Fatiga Laboral (Burnout)`, `Limitación de Plan de Carrera`.

`departmentId` y `positionId` siguen en `null`: dar de baja a un colaborador tampoco le exige tener departamento ni puesto. (El resto de los datos son los ya explicados en el Escenario 1.)

## 4. Escenario 3 — Se asigna a un colaborador el departamento y el puesto activos de su empresa

Usuario: **A**.

**Endpoint:** `PUT /api/employees/<id de QA-EDI-02, resuelto en Preparar>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

```json
{
  "employeeCode": "QA-EDI-02",
  "employeeFirstName": "Edicion",
  "employeeLastName": "Dos",
  "employeeSecondLastName": "QA",
  "companyId": 1,
  "departmentId": <id de QA-EDI-DEPT-ACTIVO, resuelto en Preparar>,
  "positionId": <id de QA-EDI-POS-ACTIVO, resuelto en Preparar>,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeBusinessEmail": "qa-edi-02@gsti-tests.local",
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null
}
```

**Response — 201:**

```json
{
  "type": "success",
  "title": "Employees",
  "message": "The employee was updated successfully",
  "data": {
    "employee": {
      "employeeId": <id de QA-EDI-02, resuelto en Preparar>,
      "departmentId": <id de QA-EDI-DEPT-ACTIVO, resuelto en Preparar>,
      "positionId": <id de QA-EDI-POS-ACTIVO, resuelto en Preparar>,
      "...": "..."
    }
  }
}
```

Qué significa lo nuevo aquí: `departmentId` / `positionId` con un valor (no `null`) es el departamento y el puesto que le quedaron asignados al colaborador — aquí se le asignan por primera vez, y el sistema lo permite porque los dos son de SU empresa y están vigentes. (Los demás datos son los ya explicados en el Escenario 1.)

## 5. Escenario 4 — Reenviar el mismo departamento, aunque ya esté dado de baja, no bloquea y se conserva

Usuario: **A**.

**Endpoint:** `PUT /api/employees/<id de QA-EDI-03, resuelto en Preparar>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

```json
{
  "employeeCode": "QA-EDI-03",
  "employeeFirstName": "Edicion",
  "employeeLastName": "Tres",
  "employeeSecondLastName": "QA",
  "companyId": 1,
  "departmentId": <id de QA-EDI-DEPT-BAJA, resuelto en Preparar>,
  "positionId": <id de QA-EDI-POS-ACTIVO, resuelto en Preparar>,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeBusinessEmail": "qa-edi-03-corregido@gsti-tests.local",
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null
}
```

**Response — 201:**

```json
{
  "type": "success",
  "title": "Employees",
  "message": "The employee was updated successfully",
  "data": {
    "employee": {
      "employeeId": <id de QA-EDI-03, resuelto en Preparar>,
      "departmentId": <id de QA-EDI-DEPT-BAJA, resuelto en Preparar>,
      "positionId": <id de QA-EDI-POS-ACTIVO, resuelto en Preparar>,
      "employeeBusinessEmail": "qa-edi-03-corregido@gsti-tests.local",
      "...": "..."
    }
  }
}
```

`departmentId` conserva el mismo id que ya tenía guardado, aunque ese departamento esté dado de baja: reenviar exactamente lo que el colaborador ya tenía nunca se verifica ni bloquea. (Los demás datos son los ya explicados en el Escenario 1 y en el Escenario 3.)

## 6. Escenario 5 — Se rechaza el departamento de otra empresa, aunque quien captura tenga acceso a las dos

Usuario: **A**.

**Endpoint:** `PUT /api/employees/<id de QA-EDI-04, resuelto en Preparar>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

```json
{
  "employeeCode": "QA-EDI-04",
  "employeeFirstName": "Edicion",
  "employeeLastName": "Cuatro",
  "employeeSecondLastName": "QA",
  "companyId": 1,
  "departmentId": <id de QA-EDI-DEPT-AJENO, resuelto en Preparar>,
  "positionId": null,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeBusinessEmail": "qa-edi-04@gsti-tests.local",
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null
}
```

**Response — 400:**

```json
{
  "type": "warning",
  "title": "Departamento no disponible",
  "message": "El departamento no existe en la empresa del empleado",
  "data": { "...": "..." }
}
```

Qué significa lo nuevo aquí: `message` explica por qué no se guardó — el departamento que se intentó asignar no es de la empresa del colaborador (así se vea la empresa ajena desde la sesión de quien captura, porque tiene acceso a las dos).

Ahora confirma que el colaborador sigue sin departamento:

**Endpoint:** `GET /api/employees/<id de QA-EDI-04, resuelto en Preparar>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

**Response — 200:**

```json
{
  "type": "success",
  "title": "Employees",
  "message": "The employee was found successfully",
  "data": {
    "employee": {
      "employeeId": <id de QA-EDI-04, resuelto en Preparar>,
      "departmentId": null,
      "positionId": null,
      "...": "..."
    }
  }
}
```

## 7. Escenario 6 — Se rechaza el puesto de otra empresa, con el mensaje de puesto

Usuario: **A**.

**Endpoint:** `PUT /api/employees/<id de QA-EDI-04, resuelto en Preparar>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

```json
{
  "employeeCode": "QA-EDI-04",
  "employeeFirstName": "Edicion",
  "employeeLastName": "Cuatro",
  "employeeSecondLastName": "QA",
  "companyId": 1,
  "departmentId": null,
  "positionId": <id de QA-EDI-POS-AJENO, resuelto en Preparar>,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeBusinessEmail": "qa-edi-04@gsti-tests.local",
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null
}
```

**Response — 400:**

```json
{
  "type": "warning",
  "title": "Puesto no disponible",
  "message": "El puesto no existe en la empresa del empleado",
  "data": { "...": "..." }
}
```

Qué significa lo nuevo aquí: `message` explica que esta vez lo rechazado fue el puesto, no el departamento — mismo motivo que el Escenario 5, para el otro dato de la estructura.

## 8. Escenario 7 — Un departamento dado de baja de otra empresa se rechaza con el mismo mensaje

Usuario: **A**.

**Endpoint:** `PUT /api/employees/<id de QA-EDI-04, resuelto en Preparar>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

```json
{
  "employeeCode": "QA-EDI-04",
  "employeeFirstName": "Edicion",
  "employeeLastName": "Cuatro",
  "employeeSecondLastName": "QA",
  "companyId": 1,
  "departmentId": <id de QA-EDI-DEPT-BAJA, resuelto en Preparar>,
  "positionId": null,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeBusinessEmail": "qa-edi-04@gsti-tests.local",
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null
}
```

**Response — 400:**

```json
{
  "type": "warning",
  "title": "Departamento no disponible",
  "message": "El departamento no existe en la empresa del empleado",
  "data": { "...": "..." }
}
```

(Los datos son los ya explicados en el Escenario 5: un departamento dado de baja y uno de otra empresa se ven exactamente igual desde afuera — el mismo mensaje, para que nadie adivine cuál de los dos motivos fue.)

## 9. Escenario 8 — No se le puede asignar un nivel de puesto a quien no tiene puesto

Usuario: **A**.

**Endpoint:** `PUT /api/employees/<id de QA-EDI-04, resuelto en Preparar>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

```json
{
  "employeeCode": "QA-EDI-04",
  "employeeFirstName": "Edicion",
  "employeeLastName": "Cuatro",
  "employeeSecondLastName": "QA",
  "companyId": 1,
  "departmentId": null,
  "positionId": null,
  "positionLevelConfigId": 999999999,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeBusinessEmail": "qa-edi-04@gsti-tests.local",
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null
}
```

`positionLevelConfigId` es cualquier número que no exista como nivel del puesto del colaborador — como este colaborador no tiene puesto, ningún nivel le pertenece.

**Response — 422:**

```json
{
  "type": "error",
  "title": "Nivel no válido para el puesto",
  "message": "El nivel indicado no pertenece a los niveles configurados del puesto del empleado.",
  "detail": "El nivel indicado no pertenece a los niveles configurados del puesto del empleado.",
  "key": "nivel-no-pertenece-al-puesto",
  "code": "ELVL.CONF.001"
}
```

Qué significa lo nuevo aquí: `code` es el identificador estable de este rechazo — no cambia aunque cambie el idioma de la petición. Puede valer `ELVL.CONF.001` (el nivel que se intentó asignar no le pertenece al puesto del colaborador, incluido no tener puesto — el que se prueba aquí y el único que se provoca en este manual). `detail` y `key` acompañan al mismo rechazo con el mismo motivo en otro formato; no aportan nada que `message` y `code` no digan ya.

## 10. Escenario 9 — Un dato mal formado se rechaza con un mensaje, no con la pantalla de error general

Usuario: **A**.

**Endpoint:** `PUT /api/employees/<id de QA-EDI-04, resuelto en Preparar>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

```json
{
  "employeeCode": "QA-EDI-04",
  "employeeFirstName": "Edicion",
  "employeeLastName": "Cuatro",
  "employeeSecondLastName": "QA",
  "companyId": 1,
  "departmentId": 0,
  "positionId": null,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeBusinessEmail": "qa-edi-04@gsti-tests.local",
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null
}
```

`departmentId: 0` es el dato mal formado: no es un identificador de departamento válido (ninguno vale `0`).

**Response — 400:**

```json
{
  "type": "warning",
  "title": "Error de validación",
  "message": "El campo departmentId debe ser mayor o igual a 1",
  "errors": [
    {
      "message": "El campo departmentId debe ser mayor o igual a 1",
      "rule": "min",
      "field": "departmentId",
      "meta": { "min": 1 }
    }
  ]
}
```

Qué significa lo nuevo aquí: `title: "Error de validación"` señala que lo que falló fue un dato de la petición, no el servidor — nunca sale `"Server error"` por esto. `errors` es el detalle de qué campo no pasó y por qué; no hace falta leerlo, `message` ya lo resume.

## 11. Escenario 10 — Se da de baja a un colaborador desde la lista (DELETE), sin pedir estructura

Usuario: **A**.

**Endpoint:** `DELETE /api/employees/<id de QA-EDI-05, resuelto en Preparar>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

```json
{
  "employeeTerminatedDate": "2026-09-17",
  "employeeTerminationModality": "Renuncia",
  "employeeTerminationType": "Cambio de Residencia"
}
```

**Response — 201:**

```json
{
  "type": "success",
  "title": "Employees",
  "message": "The employee was deleted successfully",
  "data": {
    "employee": {
      "employeeId": <id de QA-EDI-05, resuelto en Preparar>,
      "departmentId": null,
      "positionId": null,
      "employeeTerminationModality": "Renuncia",
      "employeeTerminationType": "Cambio de Residencia",
      "...": "..."
    }
  }
}
```

(Los datos son los ya explicados en el Escenario 1 y en el Escenario 2: esta baja se registra desde la lista de colaboradores en vez de desde su ficha, sin pedirle estructura tampoco.)

## 12. Escenario 11 — Al cambiar de empresa, el departamento que ya tenía se revisa contra la nueva y se rechaza

Usuario: **A**. Este escenario usa a `QA-EDI-02` **después** del Escenario 3: ya tiene el departamento y el puesto activos de la empresa de prueba. Aquí se le cambia solo la empresa, sin tocar su estructura: el sistema revisa esos mismos ids contra la empresa ajena y los rechaza.

**Endpoint:** `PUT /api/employees/<id de QA-EDI-02, resuelto en Preparar>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

```json
{
  "employeeCode": "QA-EDI-02",
  "employeeFirstName": "Edicion",
  "employeeLastName": "Dos",
  "employeeSecondLastName": "QA",
  "companyId": 1,
  "departmentId": <id de QA-EDI-DEPT-ACTIVO, resuelto en Preparar>,
  "positionId": <id de QA-EDI-POS-ACTIVO, resuelto en Preparar>,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa ajena, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa ajena, resuelto en Preparar>,
  "employeeBusinessEmail": "qa-edi-02@gsti-tests.local",
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null
}
```

**Response — 400:**

```json
{
  "type": "warning",
  "title": "Departamento no disponible",
  "message": "El departamento no existe en la empresa del empleado",
  "data": { "...": "..." }
}
```

Qué significa lo nuevo aquí: aunque el departamento y el puesto no cambiaron en el cuerpo, al cambiar `businessUnitId` el sistema los revisa contra la empresa **nueva** (la ajena). Como esos ids son de la empresa de prueba, no existen en la ajena: mismo mensaje que el Escenario 5.

Ahora confirma que el colaborador no se movió ni perdió su estructura:

**Endpoint:** `GET /api/employees/<id de QA-EDI-02, resuelto en Preparar>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

**Response — 200:**

```json
{
  "type": "success",
  "title": "Employees",
  "message": "The employee was found successfully",
  "data": {
    "employee": {
      "employeeId": <id de QA-EDI-02, resuelto en Preparar>,
      "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
      "departmentId": <id de QA-EDI-DEPT-ACTIVO, resuelto en Preparar>,
      "positionId": <id de QA-EDI-POS-ACTIVO, resuelto en Preparar>,
      "...": "..."
    }
  }
}
```

Qué significa lo nuevo aquí: `businessUnitId` es la empresa del colaborador. Sigue siendo la de prueba: el rechazo dejó todo como estaba (empresa, departamento y puesto).

## 13. Escenario 12 — Se cambia de empresa y se asigna estructura válida de la empresa nueva

Usuario: **A**. Este escenario usa a `QA-EDI-04` **después** de los Escenarios 5 a 9: sigue sin departamento ni puesto y sigue en la empresa de prueba. Aquí sí se permite el cambio porque, en la misma edición, se le asignan el departamento y el puesto de la empresa ajena.

**Endpoint:** `PUT /api/employees/<id de QA-EDI-04, resuelto en Preparar>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

```json
{
  "employeeCode": "QA-EDI-04",
  "employeeFirstName": "Edicion",
  "employeeLastName": "Cuatro",
  "employeeSecondLastName": "QA",
  "companyId": 1,
  "departmentId": <id de QA-EDI-DEPT-AJENO, resuelto en Preparar>,
  "positionId": <id de QA-EDI-POS-AJENO, resuelto en Preparar>,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa ajena, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa ajena, resuelto en Preparar>,
  "employeeBusinessEmail": "qa-edi-04@gsti-tests.local",
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null
}
```

**Response — 201:**

```json
{
  "type": "success",
  "title": "Employees",
  "message": "The employee was updated successfully",
  "data": {
    "employee": {
      "employeeId": <id de QA-EDI-04, resuelto en Preparar>,
      "businessUnitId": <id interno de la empresa ajena, resuelto en Preparar>,
      "payrollBusinessUnitId": <id interno de la empresa ajena, resuelto en Preparar>,
      "departmentId": <id de QA-EDI-DEPT-AJENO, resuelto en Preparar>,
      "positionId": <id de QA-EDI-POS-AJENO, resuelto en Preparar>,
      "...": "..."
    }
  }
}
```

Qué significa lo nuevo aquí: `businessUnitId` / `payrollBusinessUnitId` ya son los de la empresa ajena — el colaborador sí se movió. `departmentId` / `positionId` son los de esa misma empresa ajena: al cambiar de empresa y asignar estructura de la nueva en la misma edición, la verificación pasa.

## 14. Checklist

- [ ] Escenario 1: se corrige el correo de `QA-EDI-01`; `departmentId` y `positionId` quedan en `null`
- [ ] Escenario 2: se registra la baja de `QA-EDI-01` desde la ficha (PUT); su estructura sigue en `null`
- [ ] Escenario 3: se le asigna a `QA-EDI-02` el departamento y el puesto activos de su empresa
- [ ] Escenario 4: `QA-EDI-03` conserva el departamento dado de baja al reenviarlo sin cambiar
- [ ] Escenario 5: se rechaza el departamento ajeno para `QA-EDI-04`, y `QA-EDI-04` sigue sin departamento
- [ ] Escenario 6: se rechaza el puesto ajeno para `QA-EDI-04`, con el mensaje de puesto
- [ ] Escenario 7: el departamento dado de baja se rechaza con el mismo mensaje que el ajeno
- [ ] Escenario 8: no se le puede asignar un nivel de puesto a `QA-EDI-04` porque no tiene puesto (`ELVL.CONF.001`)
- [ ] Escenario 9: `departmentId: 0` se rechaza con un mensaje de validación, no con un error de servidor
- [ ] Escenario 10: se da de baja a `QA-EDI-05` desde la lista (DELETE), sin pedirle estructura
- [ ] Escenario 11: al cambiar a `QA-EDI-02` de empresa sin cambiar su estructura, se rechaza; sigue en la empresa de prueba con su departamento y puesto
- [ ] Escenario 12: se cambia a `QA-EDI-04` a la empresa ajena y se le asignan el departamento y el puesto de esa empresa; se guarda
