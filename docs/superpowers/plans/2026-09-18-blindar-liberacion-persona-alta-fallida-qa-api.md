# Prueba manual API — La limpieza del alta fallida solo borra el expediente recién creado

**Problema:** Cuando un alta de colaborador falla a medio camino, el sistema borra el expediente de la persona que se acababa de crear para que se pueda volver a capturar sin chocar con "este correo ya está registrado". Hasta esta historia ese borrado confiaba en el identificador que le mandaban, sin comprobar de quién era: cualquier usuario con permiso de alta podía provocar un alta fallida a propósito, mandar el identificador de otro expediente y lograr que se borrara. Y trataba como desechable a quien ya no tiene vínculo vigente, así que el expediente de un ex-colaborador, un ex-usuario o un ex-cliente —justo el que la empresa está obligada a conservar— era el más expuesto.

**Solución:** La limpieza sigue funcionando igual para el capturista: si el alta falla sobre un expediente recién creado y sin ninguna historia, se borra y se puede volver a capturar a la misma persona. Pero ya no puede tocar un expediente que haya sido de un empleado, de un usuario o de un cliente —aunque esté dado de baja—, ni uno creado hace más de una hora. Cuando se niega, la respuesta que recibe quien captura es exactamente la misma de siempre, y el sistema deja un registro interno de qué expediente se intentó borrar y quién lo intentó. Este manual no cubre el alta que llega desde el equipo biométrico: ese camino tiene la misma protección, pero no se puede provocar en el ambiente sembrado (necesita el equipo).

Ejemplo: es como la papelera de un salón de clases: si acabas de escribir tu nombre en una hoja y te equivocaste, la puedes tirar y empezar de nuevo. Lo que ya no puedes hacer es tirar la hoja de otro compañero diciendo "me equivoqué": el maestro la deja donde estaba, te contesta lo mismo de siempre y apunta en su libreta quién lo intentó.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

**Header obligatorio en toda petición de este manual.** Además del token, cada endpoint exige el header `X-Business-Unit-Id` con el identificador público de la empresa de prueba.

**El registro interno** vive en la base de registros (Mongo) del ambiente local, colección `log_scope_denieds`. Si tu ambiente no tiene esa base configurada, los pasos marcados *(registro interno)* no son observables aquí: la decisión de borrar o no **no depende** de que el registro se guarde.

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Deja lista la empresa de prueba, el usuario capturista y cuatro expedientes protegidos: uno que fue empleado y está dado de baja, uno que fue usuario del sistema y está dado de baja, uno que fue cliente y está dado de baja, y uno sin ninguna historia pero creado hace dos días. **No** crea la persona del reintento legítimo: la crea el Escenario 1. Si un escenario borrara por error un expediente protegido, volver a correr el seeder lo restaura.

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-liberacion-capturista@gsti-tests.local` | `password` | Capturista con permiso de alta, con acceso a la empresa de prueba |

Los identificadores que van en las peticiones no se inventan ni se hardcodean: resuélvelos con estas consultas.

Identificador público de la empresa de prueba, para el header `X-Business-Unit-Id` de todos los escenarios:

```sql
SELECT business_unit_public_id FROM business_units WHERE business_unit_slug = 'qa-liberacion-prueba';
```

Identificador interno de la misma empresa, para `companyId`, `businessUnitId` y `payrollBusinessUnitId` en el cuerpo de cada alta:

```sql
SELECT business_unit_id FROM business_units WHERE business_unit_slug = 'qa-liberacion-prueba';
```

Identificadores de los cuatro expedientes protegidos (uno por escenario, del 2 al 5). El correo de estos expedientes no sirve como filtro de esta consulta porque el sistema lo guarda cifrado; el apellido sí es una columna de texto plano y es único para cada uno:

```sql
SELECT person_id, person_lastname FROM people
WHERE person_lastname IN ('ExColaborador', 'ExUsuario', 'ExCliente', 'Antigua')
  AND person_second_lastname = 'Liberacion';
```

Identificador del usuario capturista, para reconocerlo en el registro interno:

```sql
SELECT user_id FROM users WHERE user_email = 'qa-liberacion-capturista@gsti-tests.local';
```

## 2. Escenario 1 — Reintento legítimo: el expediente recién creado sí se libera

Usuario: **A**. Correo de la persona: `qa-lib-s1@gsti-tests.local`.

**Paso 1 — Crear la persona**

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de la empresa de prueba, resuelto en Preparar>`

```json
{
  "personFirstname": "Liberacion",
  "personLastname": "Uno",
  "personEmail": "qa-lib-s1@gsti-tests.local"
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

Qué significa cada dato:

- `type`: qué tan bien salió la petición. Puede valer `success` (sí se hizo lo pedido) o `warning` (no se hizo y el mensaje dice qué corregir — se ve en el Paso 2).
- `title` / `message`: el encabezado y la frase del resultado.
- `data.person.personId`: el número con el que el sistema identifica el expediente de la persona recién creada. Es el que se manda en el alta.

**Paso 2 — Provocar un alta fallida sobre esa persona**

**Endpoint:** `POST /api/employees`

Headers: iguales al Paso 1.

```json
{
  "employeeFirstName": "Liberacion",
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
  "employeeBusinessEmail": "qa-lib-s1@gsti-tests.local"
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

Qué significa lo nuevo aquí:

- `departmentId` en `0` y `positionId` vacío: es la forma más sencilla de que el alta falle a propósito. El alta fallida es el disparador; lo que se prueba es qué hace el sistema con el expediente después.
- `detail`: la misma frase que `message`, para pantallas que la muestran aparte.
- `key`: la etiqueta con la que el sistema clasifica este rechazo. Vale `alta-empleado-invalida` (el alta no se hizo por un dato de la captura).

**Guarda este response completo**: los Escenarios 2 a 5 deben devolver exactamente el mismo cuerpo, sin una letra de diferencia.

Confirma que el expediente quedó liberado (la fecha **no** debe ser nula):

```sql
SELECT person_deleted_at FROM people WHERE person_id = <person_id del Paso 1>;
```

*(registro interno)* Confirma que quedó anotada la liberación concedida:

```
db.log_scope_denieds.find({ domain: 'person', requested_id: <person_id del Paso 1> })
```

Debe aparecer un documento:

```json
{
  "domain": "person",
  "action": "release-orphan-granted",
  "requested_id": <person_id del Paso 1>,
  "actor_user_id": <user_id del capturista, resuelto en Preparar>,
  "business_unit_scope": [<id interno de la empresa de prueba>],
  "date": "..."
}
```

Qué significa cada dato:

- `domain`: de qué tipo de registro se habla. Aquí siempre vale `person` (el expediente de una persona).
- `action`: qué decidió el sistema. Puede valer `release-orphan-granted` (sí borró el expediente, porque era recién creado y sin historia — el de este escenario) o `release-orphan` (se negó a borrarlo — se ve en el Escenario 2).
- `requested_id`: el expediente que se intentó borrar.
- `actor_user_id`: quién provocó el alta fallida.
- `business_unit_scope`: a qué empresas tenía acceso quien lo provocó.
- `date`: cuándo ocurrió.
- El documento **no** trae nombre, correo, CURP, RFC ni NSS del expediente: solo su número.

**Paso 3 — Volver a capturar a la misma persona**

Repite el **Paso 1** con el mismo cuerpo y el mismo correo.

**Response — 201:** mismo envelope que el Paso 1 (`The person was created successfully`). (Los datos son los ya explicados en el Paso 1.) Comprueba que el reintento no choca con "el correo ya está registrado".

## 3. Escenario 2 — Ex-colaborador: no se borra

Usuario: **A**. Expediente: el de `qa-lib-excolaborador@gsti-tests.local` (fue empleado, dado de baja).

**Endpoint:** `POST /api/employees`

Headers: iguales al Escenario 1.

```json
{
  "employeeFirstName": "Liberacion",
  "employeeLastName": "Dos",
  "employeeSecondLastName": "QA",
  "companyId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "departmentId": 0,
  "positionId": "",
  "personId": <person_id de qa-lib-excolaborador, resuelto en Preparar>,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null,
  "employeeBusinessEmail": "qa-lib-s2@gsti-tests.local"
}
```

**Response — 400:** exactamente el mismo cuerpo que el Paso 2 del Escenario 1 (`Faltan el departamento y el puesto`). Compáralo con el que guardaste: ni una letra distinta, ni un campo de más. (Los datos son los ya explicados en el Escenario 1.)

Confirma que el expediente sigue intacto (la fecha **debe** ser nula) y que su historia como empleado sigue ahí:

```sql
SELECT person_deleted_at FROM people WHERE person_id = <person_id de qa-lib-excolaborador>;
SELECT employee_code, employee_deleted_at FROM employees WHERE person_id = <person_id de qa-lib-excolaborador>;
```

*(registro interno)* Confirma que quedó anotado el intento negado:

```
db.log_scope_denieds.find({ domain: 'person', requested_id: <person_id de qa-lib-excolaborador> })
```

Debe aparecer un documento con `action: "release-orphan"` y el `actor_user_id` del capturista. Qué significa lo nuevo aquí: `action` con valor `release-orphan` quiere decir que el sistema se negó a borrar ese expediente. El documento **no** dice por qué se negó: eso es a propósito.

## 4. Escenario 3 — Ex-usuario del sistema: no se borra

Usuario: **A**. Expediente: el de `qa-lib-exusuario@gsti-tests.local` (fue usuario del sistema, dado de baja).

**Endpoint:** `POST /api/employees` — mismo cuerpo que el Escenario 2, con `employeeLastName`: `"Tres"`, `personId`: `<person_id de qa-lib-exusuario>` y `employeeBusinessEmail`: `qa-lib-s3@gsti-tests.local`.

**Response — 400:** exactamente el mismo cuerpo que el Paso 2 del Escenario 1. (Los datos son los ya explicados en el Escenario 1.)

Confirma que el expediente sigue intacto:

```sql
SELECT person_deleted_at FROM people WHERE person_id = <person_id de qa-lib-exusuario>;
```

*(registro interno)* `db.log_scope_denieds.find({ domain: 'person', requested_id: <person_id de qa-lib-exusuario> })` → un documento con `action: "release-orphan"`. (Los datos son los ya explicados en el Escenario 2.)

## 5. Escenario 4 — Ex-cliente: no se borra

Usuario: **A**. Expediente: el de `qa-lib-excliente@gsti-tests.local` (fue cliente, dado de baja).

**Endpoint:** `POST /api/employees` — mismo cuerpo que el Escenario 2, con `employeeLastName`: `"Cuatro"`, `personId`: `<person_id de qa-lib-excliente>` y `employeeBusinessEmail`: `qa-lib-s4@gsti-tests.local`.

**Response — 400:** exactamente el mismo cuerpo que el Paso 2 del Escenario 1. (Los datos son los ya explicados en el Escenario 1.)

Confirma que el expediente sigue intacto:

```sql
SELECT person_deleted_at FROM people WHERE person_id = <person_id de qa-lib-excliente>;
```

*(registro interno)* `db.log_scope_denieds.find({ domain: 'person', requested_id: <person_id de qa-lib-excliente> })` → un documento con `action: "release-orphan"`. (Los datos son los ya explicados en el Escenario 2.)

## 6. Escenario 5 — Sin historia pero con antigüedad: no se borra

Usuario: **A**. Expediente: el de `qa-lib-antigua@gsti-tests.local` (sin ningún vínculo, creado hace dos días).

**Endpoint:** `POST /api/employees` — mismo cuerpo que el Escenario 2, con `employeeLastName`: `"Cinco"`, `personId`: `<person_id de qa-lib-antigua>` y `employeeBusinessEmail`: `qa-lib-s5@gsti-tests.local`.

**Response — 400:** exactamente el mismo cuerpo que el Paso 2 del Escenario 1. (Los datos son los ya explicados en el Escenario 1.)

Confirma que el expediente sigue intacto:

```sql
SELECT person_deleted_at FROM people WHERE person_id = <person_id de qa-lib-antigua>;
```

*(registro interno)* `db.log_scope_denieds.find({ domain: 'person', requested_id: <person_id de qa-lib-antigua> })` → un documento con `action: "release-orphan"`. (Los datos son los ya explicados en el Escenario 2.)

## 7. Checklist

- [ ] Escenario 1: `400` con `Faltan el departamento y el puesto`; el expediente recién creado queda liberado; `POST /api/persons` con el mismo correo → `201`; registro `release-orphan-granted`
- [ ] Escenario 2: mismo `400` byte a byte; el ex-colaborador sigue intacto con su historia; registro `release-orphan`
- [ ] Escenario 3: mismo `400` byte a byte; el ex-usuario sigue intacto; registro `release-orphan`
- [ ] Escenario 4: mismo `400` byte a byte; el ex-cliente sigue intacto; registro `release-orphan`
- [ ] Escenario 5: mismo `400` byte a byte; el expediente antiguo sigue intacto; registro `release-orphan`
