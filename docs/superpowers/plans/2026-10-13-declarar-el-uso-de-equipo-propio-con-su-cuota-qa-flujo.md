# Prueba manual — Declarar el uso de equipo propio con su cuota

**Problema:** la NOM-037 permite que la empresa cubra una categoría de insumos con el **equipo propio** del colaborador en lugar de entregarle un activo, y que le pague una **cuota mensual** por usarlo. La matriz **Insumos de teletrabajo** de la ficha solo sabía de activos entregados o en camino: si una persona ponía su propia silla, la categoría seguía marcada como **Sin cubrir** y no había dónde registrar la cuota que se le paga por usarla.

**Solución:** los renglones de la matriz que la empresa todavía no cubre ganan la acción **Declarar equipo propio**. Al declararla se captura la **descripción** del equipo, las **condiciones** pactadas, la **fecha de inicio** y la **cuota mensual**; al guardar, la categoría pasa a **Equipo propio declarado** con esos datos —**Desde el …** y **$… al mes**—, la acción desaparece de ese renglón y el resumen del bloque deja de contar ese pendiente. Lo declarado nunca se pinta como **Entregado**, porque no es un bien que la empresa haya entregado.

Ejemplo: es como la lista de lo que hay que llevar a un campamento. Si a alguien le tocaba el casco y dice «el casco lo pongo yo», se anota que ese punto ya está resuelto con lo suyo —y también cuánto se le va a pagar por prestarlo—, en vez de seguir contando el casco entre lo que falta.

## Glosario

- **Insumo de teletrabajo:** bien que la empresa le entrega a quien trabaja desde casa porque la NOM-037 lo exige (silla ergonómica, equipo de cómputo o impresión, aditamentos).
- **Categoría de la norma:** cada uno de los tres grupos que la matriz vigila: **Silla ergonómica**, **Equipo de cómputo o impresión** y **Aditamento**.
- **Equipo propio declarado:** la empresa registra que la persona cubre una categoría con su propio equipo y con una cuota mensual; no es un bien entregado por la empresa.
- **Cuota mensual:** el importe que la empresa paga cada mes por usar ese equipo propio.
- **Aditamento:** accesorio que complementa el puesto en casa (monitor, teclado, diadema, reposapiés). La norma no obliga a entregarlo, por eso nunca se cuenta como un faltante.
- **Resguardo:** el vale con el que la persona recibe un activo.
- **Folio:** el número que identifica al activo en el inventario (por ejemplo `QA-TEL-ACT-SILLA-05`).
- **Listado de teletrabajadores:** el registro obligatorio de la NOM-037 con los colaboradores cuyo teletrabajo representa el 40% o más de su jornada.

## 1. Preparar

Prerrequisito: esta rama del API y la del backoffice están levantadas, y la base ya trae los módulos **Empleados** y **Activos e insumos**.

Ejecuta una vez el sembrador de QA compartido:

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Qué deja listo para esta prueba:

- **QA Fundadora**: la empresa donde se hace todo el recorrido.
- Los **cuatro colaboradores** de la tabla de abajo, cada uno con el estado que prueba un escenario.
- Los **tipos de activo** con su categoría de la norma: **Silla QA Insumos** (categoría *Silla ergonómica*), **Computo QA Insumos** (categoría *Equipo de cómputo o impresión*) y **Celular QA Insumos** (sin categoría).
- La silla **`QA-TEL-ACT-SILLA-05`**, del tipo **Silla QA Insumos**, **en almacén**: sin resguardo. Se usa una sola vez, en el Escenario 4.4, para cubrir una categoría mientras hay un alta empezada.
- Las **dos cuentas** de la §2.

**Señal para reconocer lo nuestro:** los colaboradores de esta prueba son `QA-TEL-02`, `QA-TEL-03`, `QA-TEL-04` y `QA-TEL-05`; cualquier otro colaborador con código `QA-TEL-` es de otra historia y no se toca. Los activos de esta prueba llevan folio `QA-TEL-ACT-…`: la silla `QA-TEL-ACT-SILLA-05` (Escenario 4.4) y la laptop `QA-TEL-ACT-LAP-02` del cómputo de `QA-TEL-05` (Escenario 4.6); cualquier otro activo de la empresa es de otra historia. El tipo de la silla termina en `QA Insumos`.

Estado de cada colaborador (lo que deja el sembrador):

| Código | Nombre | Modalidad y % | Con qué arranca | Escenario |
|---|---|---|---|---|
| `QA-TEL-02` | Ulises Pardo Gil | Híbrido, 20% | Ningún activo (registro preventivo) | 4.5 |
| `QA-TEL-03` | Vera Quintero Lira | Híbrido, 40% | Ningún activo | 4.1, 4.2, 4.3, 4.7 |
| `QA-TEL-04` | Walter Rivas Mota | Home Office, 100% | Monitor secundario entregado y Laptop de trabajo en envío | 4.4 |
| `QA-TEL-05` | Ximena Sosa Pena | Home Office, 100% | Laptop de trabajo en envío | 4.6 |

Orden del recorrido: los escenarios se recorren **en orden**. Los Escenarios 4.1 a 4.3 escriben declaraciones sobre **Vera Quintero Lira** y el Escenario 4.7 las revisa, así que hay que llegar al 4.7 con esos tres hechos. El **Escenario 4.4** pide asignar y luego devolver una silla; su último paso deja todo como estaba. El **Escenario 4.5** deja una declaración vigente en **Ulises Pardo Gil**.

## 2. Usuarios

Las dos cuentas entran por el backoffice con el mismo flujo: en `http://127.0.0.1:3000`, botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña**, botón **Entrar**. Las dos usan la contraseña de prueba `password`.

| | Correo | Contraseña | Login | Permisos (variante) | Para qué se usa |
|---|---|---|---|---|---|
| **A** | `qa-own-equipment-full@gsti-tests.local` | `password` | Backoffice | lectura de **Empleados** y de **Activos e insumos** + administrar los suministros del colaborador (declara equipo propio) | Escenarios 4.1 a 4.5 y 4.7 |
| **B** | `qa-own-equipment-readonly@gsti-tests.local` | `password` | Backoffice | lectura de **Empleados** y de **Activos e insumos**, **sin** administrar los suministros del colaborador | Escenario 4.6 (no ve la acción) |

Las dos cuentas pueden abrir la pantalla con la que arranca el backoffice (**Monitor de asistencia**): el sembrador concede la lectura de ese módulo a todos los roles de QA, así que la sesión no empieza en un aviso de permisos.

## 3. Dónde probar

La declaración vive dentro de la **matriz Insumos de teletrabajo** de la ficha del colaborador, en la sección **Activos**.

Para entrar: en `http://127.0.0.1:3000`, botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña** con la cuenta que toque, botón **Entrar**. Al entrar, el backoffice abre siempre la pantalla **Monitor de asistencia**, que no es donde se prueba: del menú lateral entra a **Empleados**.

Para elegir la empresa (si el usuario tiene más de una): arriba a la derecha abre **Mi cuenta** (el avatar) y en el campo **Empresa** elige **QA Fundadora**.

Para llegar a la ficha: menú lateral → **Empleados**; busca a la persona por su código de nómina (por ejemplo `QA-TEL-03`) y, en su tarjeta, pulsa **Ver detalles**. La ficha abre en la sección **Información del empleado**.

La sección es **Activos**: está en el submenú lateral de la ficha, **al final**, con el icono de un portátil. Dentro, arriba, está la tarjeta **Insumos de teletrabajo**.

Cómo se lee la matriz, de arriba a abajo: el título; la leyenda que dice si el registro es obligatorio o preventivo; los chips de resumen; y las tres categorías de la norma, **cada una en su renglón** —el rótulo de la categoría, su chip de estado al extremo derecho y, debajo, lo que la cubre: los activos con su folio y sus chips, o la **declaración de equipo propio** (su descripción, sus condiciones si las hay y la línea con **Desde el …** y **$… al mes**), o la acción **Declarar equipo propio** cuando la categoría está pendiente y la cuenta puede escribir. Las tres categorías salen siempre en el mismo orden: silla, cómputo, aditamento.

URL directa de la sección: `http://127.0.0.1:3000/employees/` seguida del identificador propio de la ficha abierta y de `/assets`; la dirección **no** lleva `/es`.

Para el **Escenario 4.4**, la pantalla del catálogo de activos: menú lateral, grupo **Empresa** → **Activos e insumos**; ahí está el buscador **Buscar activo** y el filtro de **Estado**. URL directa: `http://127.0.0.1:3000/supplies`.

---

## 4. Escenarios que se recorren

Entra con el Usuario A (`qa-own-equipment-full@gsti-tests.local`) y elige la empresa **QA Fundadora**.

### 4.1 Declarar la silla con cuota

Objetivo: comprobar que en una categoría pendiente se puede declarar el equipo propio con su descripción, sus condiciones, su fecha de inicio y su cuota, y que al guardar la categoría pasa a **Equipo propio declarado** con esos datos, la acción desaparece de ese renglón y el resumen del bloque deja de contarla como pendiente.

1. Con el Usuario A, abre la ficha de **Vera Quintero Lira** (`QA-TEL-03`, Híbrido 40%) y entra a la sección **Activos**.
2. La tarjeta **Insumos de teletrabajo** trae la leyenda **Obligatorio: este colaborador está en el listado de teletrabajadores (NOM-037 5.7, LFT 330-E)** y el chip de resumen **2 sin cubrir**. El renglón **Silla ergonómica** muestra el chip **Sin cubrir** y, debajo de su rótulo, el botón **Declarar equipo propio**.
3. Pulsa **Declarar equipo propio** en el renglón **Silla ergonómica**. Se abre por la derecha un cajón titulado **Declarar equipo propio: Silla ergonómica**, con los campos **Descripción del equipo**, **Condiciones pactadas**, **Fecha de inicio** y **Cuota mensual (MXN)**, y los botones **Cancelar** y **Guardar**.
4. Llena **Descripción del equipo** con `Silla de oficina con respaldo ajustable` y **Condiciones pactadas** con `Buen estado; uso exclusivo para trabajo`.
5. En **Fecha de inicio** elige el 1 de noviembre de 2026 (el campo queda como `2026-11-01`).
6. En **Cuota mensual (MXN)** captura `350`: el campo acepta el importe tal como se teclea, sin ceros ni decimales forzados. El formato con dos decimales y el símbolo de peso aparecen en la etiqueta ya guardada.
7. Pulsa **Guardar**.

**Qué debe verse:**

- El cajón se cierra y aparece el aviso de guardado: **Silla ergonómica** con **Declaración guardada.**
- En el renglón **Silla ergonómica**, el chip **Sin cubrir** se cambió por **Equipo propio declarado**; la categoría sigue sin activos debajo y el botón **Declarar equipo propio** ya no está en ese renglón.
- Debajo del rótulo, la declaración en una sola columna: **Silla de oficina con respaldo ajustable**; en tono apagado y recortadas a dos líneas si son más largas, las condiciones **Buen estado; uso exclusivo para trabajo**; y en la línea de abajo **Desde el 01/11/2026** y **$350.00 al mes**.
- El chip de resumen de la tarjeta pasó de **2 sin cubrir** a **1 sin cubrir**: la silla ya no se cuenta como pendiente.
- **Negativo a comprobar a propósito:** en ningún momento la categoría se pinta como **Entregado**.

**Qué significa cada cosa que se ve:**

- **Insumos de teletrabajo**: el nombre de la tarjeta; agrupa las tres categorías que la norma obliga a vigilar.
- **Obligatorio: este colaborador está en el listado de teletrabajadores (NOM-037 5.7, LFT 330-E)**: el registro es exigible; la persona teletrabaja el 40% o más de su jornada y por eso aparece en el listado obligatorio.
- **Silla ergonómica / Equipo de cómputo o impresión / Aditamento**: las tres categorías de la norma, siempre en este orden.
- **Estado de la categoría** (el chip de cada renglón): puede valer **Entregado** (la empresa ya le entregó cuando menos un activo de esa categoría), **En envío** (lo tiene en camino, todavía no en sus manos), **Equipo propio declarado** (no es un bien entregado por la empresa: registra que la persona pone su equipo y la cuota que se le paga por usarlo), **Sin cubrir** (falta y así cuenta como pendiente) o **Sin entregar** (no se le ha entregado; solo aplica al Aditamento, que la norma no exige cubrir).
- **Declaración guardada.**: el aviso de que el alta se registró; arriba aparece el nombre de la categoría declarada.
- **Desde el 01/11/2026**: la fecha desde la que rige el uso del equipo propio y su cuota.
- **$350.00 al mes**: la cuota mensual capturada, en pesos y con dos decimales.
- **Declarar equipo propio**: la acción que ofrece una categoría pendiente; al declararla desaparece de ese renglón.
- **2 sin cubrir / 1 sin cubrir**: cuántas categorías obligatorias están pendientes. Cuenta solo las que están **Sin cubrir** y las que están **En envío**; lo declarado como equipo propio y lo que no aplica (el aditamento) no se cuentan.

### 4.2 La cuota cero se registra tal cual

Objetivo: comprobar que una cuota de `0` es válida —el equipo propio puede declararse sin compensación— y que se guarda y se muestra como cero, sin quedar en blanco ni confundirse con una cuota sin capturar.

1. Con el Usuario A, en la misma ficha de **Vera Quintero Lira** (`QA-TEL-03`), sección **Activos**.
2. En el renglón **Equipo de cómputo o impresión** (chip **Sin cubrir**) pulsa **Declarar equipo propio**.
3. Llena **Descripción del equipo** con `Laptop propia` y deja **Condiciones pactadas** vacío.
4. En **Fecha de inicio** elige el 1 de noviembre de 2026.
5. En **Cuota mensual (MXN)** captura `0`: el campo acepta el cero tal como se teclea, sin forzarle decimales.
6. Pulsa **Guardar**.
7. **Negativo a comprobar a propósito:** abre otra vez un cajón del alta (el del renglón **Aditamento**, que sigue pendiente) y pulsa **Guardar** con todo vacío: los tres campos obligatorios marcan su aviso y no se guarda nada. Cierra ese cajón con **Cancelar**.

**Qué debe verse:**

- Al guardar la cuota cero: el aviso **Equipo de cómputo o impresión** con **Declaración guardada.** y el cajón cerrado.
- El renglón **Equipo de cómputo o impresión** muestra el chip **Equipo propio declarado** y, debajo, la declaración **Laptop propia** —sin línea de condiciones, porque no se capturaron— con **Desde el 01/11/2026** y **$0.00 al mes**.
- El chip de resumen de la tarjeta cambió: ya no aparece **1 sin cubrir**; en su lugar se ve **Completo**.
- En el paso del negativo: bajo **Descripción del equipo**, bajo **Fecha de inicio** y bajo **Cuota mensual (MXN)** aparece **Este campo es obligatorio.**; el cajón sigue abierto y no aparece **Declaración guardada.** El campo de condiciones no marca nada.

**Qué significa lo nuevo aquí:**

- **$0.00 al mes**: la cuota cero es una cuota declarada y válida; quiere decir que la persona cubre la categoría con su equipo y sin pago mensual. No es lo mismo que una cuota sin capturar, que el cajón no deja guardar.
- **Completo**: ya no queda ninguna categoría pendiente ni en camino.
- **Este campo es obligatorio.**: el aviso del propio cajón cuando falta la descripción, la fecha o la cuota; con ese aviso el alta ni siquiera sale del navegador.

### 4.3 Declarar el aditamento que estaba Sin entregar

Objetivo: comprobar que la categoría del aditamento —la única que la norma no exige cubrir y que la matriz muestra como **Sin entregar**— también se puede declarar como equipo propio, y que una cuota con centavos se guarda y se muestra exacta.

1. Con el Usuario A, en la ficha de **Vera Quintero Lira** (`QA-TEL-03`), sección **Activos**.
2. El renglón **Aditamento** muestra el chip **Sin entregar** y su botón **Declarar equipo propio**.
3. Pulsa **Declarar equipo propio** en el renglón **Aditamento**.
4. Llena **Descripción del equipo** con `Monitor propio de 27 pulgadas`.
5. En **Fecha de inicio** elige el 15 de noviembre de 2026.
6. En **Cuota mensual (MXN)** captura `0.29`: el campo acepta la cantidad con centavos tal como se teclea.
7. Pulsa **Guardar**.

**Qué debe verse:**

- El aviso **Aditamento** con **Declaración guardada.** y el cajón cerrado.
- El renglón **Aditamento** muestra el chip **Equipo propio declarado** y, debajo, la declaración **Monitor propio de 27 pulgadas** con **Desde el 15/11/2026** y **$0.29 al mes**.
- El chip de resumen sigue siendo **Completo**.
- **Negativo a comprobar a propósito:** el importe con centavos no se redondea ni se recorta: se lee **$0.29 al mes**, no `$0` ni `$0.3`.

**Qué significa lo nuevo aquí:**

- **Sin entregar** → **Equipo propio declarado** en el aditamento: que la norma no exija entregarlo no impide declararlo; deja de contarse como algo por entregar y pasa a registrarse como equipo propio con su cuota.
- **$0.29 al mes**: la cuota se guarda con sus centavos tal como se capturó.
- **Que el resumen siga en Completo**: el aditamento nunca suma pendientes; lo que cambia es cómo se cubre, no cuánto falta.

### 4.4 El servidor rechaza la categoría que ya cubre un activo

Objetivo: comprobar que si la categoría queda cubierta por un activo mientras hay un alta empezada, el servidor rechaza la declaración: el cajón muestra el aviso del servidor, no guarda nada y no se cierra.

1. Con el Usuario A, abre la ficha de **Walter Rivas Mota** (`QA-TEL-04`, Home Office 100%) y entra a **Activos**.
2. El renglón **Silla ergonómica** muestra el chip **Sin cubrir** y su botón **Declarar equipo propio**; su **Equipo de cómputo o impresión** se ve **Entregado** (monitor entregado con resguardo firmado y laptop en envío) y el resumen es **1 sin cubrir**.
3. Pulsa **Declarar equipo propio** en **Silla ergonómica** y llena el cajón: **Descripción del equipo** `Silla propia`, **Fecha de inicio** 1 de noviembre de 2026 y **Cuota mensual (MXN)** `350`. **No pulses Guardar todavía: deja el cajón abierto.**
4. En **otra pestaña** del mismo navegador, con la misma sesión: menú lateral, grupo **Empresa** → **Activos e insumos**. En **Buscar activo** escribe el folio `QA-TEL-ACT-SILLA-05` y en **Estado** deja **Disponibles**.
5. En la tarjeta de esa silla (chip **Disponible**, «En almacén, listo para asignar») pulsa **Asignar**. Se abre su ficha en la pestaña **Resguardo** con el formulario **Asignar este activo**.
6. En **Empleado responsable** escribe `Walter Rivas` y elige a **Walter Rivas Mota**; deja la **Fecha de asignación** en el día de hoy.
7. Pulsa **Asignar el activo** y espera el aviso de que el resguardo quedó registrado.
8. Vuelve a la primera pestaña (la del cajón abierto) y pulsa **Guardar**.

**Qué debe verse:**

- El cajón **no se cierra** y, arriba de sus campos, aparece un aviso rojo con el texto **El colaborador tiene un activo asignado o en envío en esta categoría; no se puede declarar equipo propio.**
- Lo capturado sigue en el cajón (la descripción, la fecha y la cuota tal como se escribieron) y no aparece **Declaración guardada.**
- (Dejar como estaba) Cierra el cajón con **Cancelar** y recarga la ficha de **Walter Rivas Mota**: el renglón **Silla ergonómica** ahora se ve **Entregado**, con la silla `QA-TEL-ACT-SILLA-05` y su resguardo, y el resumen pasó a **1 sin cubrir** con la silla ya cubierta.
- (Dejar como estaba) En **Activos e insumos** abre la ficha de esa silla, pestaña **Resguardo**, y pulsa **Registrar devolución**: llena **Fecha de devolución** (el día de hoy) y **Motivo o condición** con `Se devuelve al terminar la prueba`, y guarda. Al recargar la ficha del colaborador, **Silla ergonómica** vuelve a **Sin cubrir**.

**Qué significa lo nuevo aquí:**

- **El colaborador tiene un activo asignado o en envío en esta categoría; no se puede declarar equipo propio.**: lo decide el servidor. Si la empresa ya cubre esa categoría con un activo —entregado o en camino— la declaración no se admite. La pantalla no habría dejado intentarlo por sí sola (la acción desaparece en cuanto la categoría queda cubierta), pero cuando el dato cambia mientras el cajón está abierto el servidor rechaza el alta y el cajón conserva lo capturado para no perder la captura.
- **Disponible** («En almacén, listo para asignar»): el activo no tiene resguardo vigente, así que se puede asignar a una persona.
- **Asignar este activo** / **Empleado responsable** / **Asignar el activo**: el formulario del resguardo con el que un activo pasa a estar en manos de alguien; la persona elegida queda como responsable del activo.
- **Registrar devolución** con su **Fecha de devolución** y su **Motivo o condición**: cierra el resguardo; el activo vuelve a estar disponible y su categoría deja de estar cubierta.
- **Resguardo firmado / Resguardo sin firmar**: si la persona ya subió el vale con el que responde por el activo. Un activo **En envío** todavía no tiene resguardo firmado, y eso es normal.

### 4.5 El servidor rechaza la segunda declaración de la misma categoría

Objetivo: comprobar que una categoría admite una sola declaración vigente: si mientras se llena una segunda declaración ya quedó registrada otra de la misma categoría, el servidor la rechaza, el cajón muestra el aviso y no se cierra, y la categoría se queda con una sola declaración.

1. Con el Usuario A, abre la ficha de **Ulises Pardo Gil** (`QA-TEL-02`, Híbrido 20%) y entra a **Activos**. La leyenda dice **Registro preventivo: no está en el listado de teletrabajadores** y el resumen es **2 sin cubrir**.
2. Pulsa **Declarar equipo propio** en **Silla ergonómica** y llena el cajón: **Descripción del equipo** `Silla prestada`, **Fecha de inicio** 1 de diciembre de 2026 y **Cuota mensual (MXN)** `100`. **No pulses Guardar: deja el cajón abierto.**
3. En **otra pestaña** con la misma sesión, abre la misma ficha de **Ulises Pardo Gil** → **Activos** → **Silla ergonómica** → **Declarar equipo propio**, y llena esa captura con **Descripción del equipo** `Silla propia de casa`, **Fecha de inicio** 1 de octubre de 2026 y **Cuota mensual (MXN)** `200`. Pulsa **Guardar** en esa pestaña.
4. Vuelve a la primera pestaña (la del cajón que quedó abierto) y pulsa **Guardar**.
5. Cierra el cajón con **Cancelar** y recarga la ficha.

**Qué debe verse:**

- En la segunda pestaña, al guardar: el aviso **Silla ergonómica** con **Declaración guardada.**, el renglón **Silla ergonómica** en **Equipo propio declarado** con **Silla propia de casa**, **Desde el 01/10/2026** y **$200.00 al mes**, y el resumen en **1 sin cubrir**.
- En la primera pestaña, al pulsar **Guardar** con el cajón abierto: el cajón **no se cierra** y muestra el aviso rojo **El colaborador ya tiene una declaración de equipo propio vigente en esta categoría.**
- Después de cancelar y recargar: la categoría **Silla ergonómica** sigue con **una sola** declaración, **Silla propia de casa** con **$200.00 al mes**.
- **Negativo a comprobar a propósito:** no aparece un segundo renglón de declaración en la misma categoría, y el chip de resumen se queda en **1 sin cubrir** (lo declarado se descuenta una sola vez).

**Qué significa lo nuevo aquí:**

- **El colaborador ya tiene una declaración de equipo propio vigente en esta categoría.**: el servidor admite una sola declaración vigente por categoría; la que llegó primero es la que queda, sin duplicar el renglón.
- **Registro preventivo: no está en el listado de teletrabajadores**: la persona teletrabaja, así que su cumplimiento se sigue, pero por debajo del 40% no entra al listado obligatorio; su registro es de seguimiento y no exigible.

### 4.6 Sin el permiso de escribir la declaración, la acción no aparece

Objetivo: comprobar que con una cuenta que puede ver la matriz de insumos pero no administrar los suministros del colaborador, la acción para declarar equipo propio no se ofrece en ninguna categoría, ni siquiera en las que están pendientes.

1. Cierra la sesión y entra con el **Usuario B** (`qa-own-equipment-readonly@gsti-tests.local`). Elige la empresa **QA Fundadora**.
2. Abre la ficha de **Ximena Sosa Pena** (`QA-TEL-05`, Home Office 100%) y entra a **Activos**.
3. Deja cargar la tarjeta **Insumos de teletrabajo** y revisa, uno por uno, sus tres renglones.

**Qué debe verse:**

- La tarjeta carga completa, con la leyenda **Obligatorio: este colaborador está en el listado de teletrabajadores (NOM-037 5.7, LFT 330-E)** y los chips de resumen **1 sin cubrir** y **1 en envío**.
- El renglón **Silla ergonómica** en **Sin cubrir**.
- El renglón **Equipo de cómputo o impresión** en **En envío**, con la laptop `QA-TEL-ACT-LAP-02` y su chip **En envío**.
- El renglón **Aditamento** en **Sin entregar**.
- **Negativo a comprobar a propósito:** en ningún renglón está el botón **Declarar equipo propio**; no aparece deshabilitado, ni gris, ni con candado: simplemente no está.

**Qué significa lo nuevo aquí:**

- Que falte la acción no es un fallo de la pantalla: a esta cuenta le falta el permiso con el que se administran los suministros del colaborador, así que la matriz se ve entera pero no ofrece declarar. La falta del permiso no se avisa en pantalla: la acción no se pinta.

### 4.7 Anchos de pantalla

Objetivo: comprobar que el renglón con su declaración y el cajón del alta se adaptan a un teléfono (360 px), a un ancho intermedio (unos 850 px) y a escritorio, sin apretar los datos en dos columnas ni provocar desplazamiento horizontal.

1. Con el Usuario A, abre la ficha de **Vera Quintero Lira** (`QA-TEL-03`) y entra a **Activos**: sus tres categorías quedaron declaradas en los Escenarios 4.1 a 4.3 y la categoría no tiene ningún activo.
2. Estrecha la ventana del navegador a unos **360 px** de ancho (o usa el modo de dispositivo móvil).
3. La página **no se desplaza en horizontal**: no hay barra inferior de desplazamiento y el contenido de la tarjeta no se sale hacia los lados.
4. Cada renglón queda **apilado en una sola columna**, de arriba abajo: primero el rótulo de la categoría, después su chip de estado y al final los datos de la declaración (la descripción, las condiciones y la línea con **Desde el…** y la cuota), cada uno en su propio renglón. El texto no se encabalga ni se parte en dos columnas.
5. Abre un cajón del alta (por ejemplo, con el Usuario A en la ficha de **Walter Rivas Mota**, **Silla ergonómica** → **Declarar equipo propio**): el cajón ocupa **todo el ancho de la pantalla** y sus botones **Cancelar** y **Guardar** van apilados a lo ancho, uno debajo del otro. Ciérralo con **Cancelar**.
6. Vuelve a la ficha de **Vera Quintero Lira** (la de los pasos 2 a 4) y ensancha la ventana a un ancho intermedio, **entre tableta y escritorio** (unos **850 px**): el renglón **sigue apilado en una sola columna** (el chip de estado viaja junto al rótulo) y la declaración se sigue leyendo en una sola columna. Es a propósito: entre tableta y escritorio la ficha deja al bloque un carril angosto.
7. Pon la ventana a **ancho de escritorio** (desde unos **1024 px**), en esa misma ficha: ahí sí el renglón se abre —el rótulo de la categoría a la izquierda y el chip de estado al extremo derecho— y la declaración ocupa el ancho completo del renglón, debajo, sin desbordarse.
8. Con sus tres categorías declaradas y **ningún activo** en la ficha, observa en cualquiera de los tres renglones el espacio entre el rótulo de la categoría y su declaración y compáralo con el de los demás renglones: reporta si se ve igual o si queda un hueco más grande.

**Qué debe verse:**

- A 360 px: sin desplazamiento horizontal, los renglones en una sola columna y el cajón a todo lo ancho con sus botones apilados.
- A unos 850 px: los renglones **siguen** en una sola columna, con el chip de estado junto al rótulo.
- Desde unos 1024 px: el renglón se abre con el rótulo a la izquierda y el chip de estado al extremo derecho, y la declaración queda debajo a todo lo ancho.

**Qué significa lo nuevo aquí:**

- **Que a 850 px los renglones sigan en una columna**: dentro de la ficha el bloque vive en un carril más angosto que la ventana; con dos columnas el rótulo y los datos se apretarían, así que el renglón solo se abre cuando la ventana es de escritorio.
- **Que el cajón ocupe todo el ancho en el teléfono**: en un panel lateral angosto la fecha y la cuota no caben sin apretarse.
- **La categoría sin activos**: cuando la categoría no tiene ningún activo, su renglón muestra un elemento menos que los demás; por eso conviene fijarse en si el espacio entre el rótulo y la declaración se ve igual que en el resto y reportarlo.

## 5. Escenarios que resuelven las pruebas automatizadas

Estos no se recorren a mano: el ambiente o el producto no pueden provocarlos desde la pantalla. Se dejaron a las pruebas automatizadas de la historia; cada uno se marca contra su objetivo.

### 5.1 El doble envío simultáneo de la misma categoría

Objetivo: comprobar que dos altas de la misma categoría enviadas exactamente al mismo tiempo dejan una sola declaración vigente.

**Qué debe verse:** una de las dos capturas se guarda con su aviso **Declaración guardada.** y la otra recibe **El colaborador ya tiene una declaración de equipo propio vigente en esta categoría.**; al recargar la ficha, la categoría muestra un solo renglón en **Equipo propio declarado**.

**Qué pasó:** no se puede provocar a mano: las dos peticiones deben salir al mismo tiempo y la pantalla bloquea el botón mientras guarda. Lo cubre la prueba automatizada del alta simultánea, que lanza dos capturas de la misma categoría en paralelo y comprueba que una se guarda, la otra se rechaza con el aviso de declaración vigente y la base queda con una sola declaración.

### 5.2 El mismo «no encontrado» para un colaborador ajeno, inexistente o dado de baja

Objetivo: comprobar que el alta de una declaración no deja averiguar qué colaboradores existen: un colaborador de otra empresa, uno inexistente y uno dado de baja se rechazan igual.

**Qué debe verse:** los tres casos devuelven el mismo aviso, con el mismo título y el mismo texto —**Colaborador no encontrado** con **El colaborador no existe o no pertenece a la empresa.**—, sin ninguna pista de cuál de los tres es; y en ninguno se guarda una declaración.

**Qué pasó:** desde el navegador no se puede mandar el alta de un colaborador que no existe, que es de otra empresa o que está dado de baja: la acción solo existe en la ficha de un colaborador vivo al que la sesión puede llegar. Lo cubre la prueba automatizada del aislamiento del alta, que manda los tres casos y compara las respuestas completas entre sí.

### 5.3 El servidor rechaza el alta de una cuenta sin el permiso de escribir

Objetivo: comprobar que el rechazo por falta de permiso lo hace el servidor y no solo la pantalla.

**Qué debe verse:** la captura no se guarda y el aviso es el del sistema para una operación sin permiso —**Sin permiso** con **No tienes permiso para realizar esta operación.**—; en la pantalla esa cuenta no llega ni a ver la acción (Escenario 4.6).

**Qué pasó:** el backoffice solo oculta el botón: no hay forma de provocar el rechazo del servidor desde el navegador. Lo cubre la prueba automatizada del permiso del alta, que con una cuenta sin el permiso de administrar los suministros del colaborador comprueba el rechazo con ese aviso y que no se crea ninguna declaración, y que los superusuarios sí pasan.

### 5.4 La lista blanca: los campos de más se ignoran

Objetivo: comprobar que el alta guarda únicamente lo que le corresponde y que desde el cliente no se puede fijar el origen de la cuota, su estado, su fecha de término, la empresa ni el colaborador.

**Qué debe verse:** la declaración guardada queda con lo capturado y nada más —la cuota como **ajustada**, la declaración **vigente** y sin fecha de término—, con la empresa y el colaborador de la ficha abierta, aunque la captura haya traído de más un origen de cuota, un estado cerrado, una fecha de término, una empresa y un colaborador distintos.

**Qué pasó:** el cajón solo manda los campos que captura, así que estos no se provocan desde la pantalla. Lo cubre la prueba automatizada de la lista blanca del alta, que envía esos campos de más y comprueba que se ignoran, con la excepción de que **el identificador de empresa de OTRA empresa no se puede probar así: el filtro de empresa del servidor responde «no encontrado» antes de llegar a validar los campos**, y por eso esa parte se cubre con el caso del Escenario 5.2.

### 5.5 El borrado en duro del colaborador que tiene declaraciones

Objetivo: comprobar que la evidencia de la NOM-037 no se pierde: el sistema impide borrar en duro a un colaborador que tiene declaraciones de equipo propio.

**Qué debe verse:** el intento de borrar en duro al colaborador falla y la persona sigue existiendo con sus declaraciones intactas.

**Qué pasó:** la pantalla no borra colaboradores en duro —la baja de un colaborador es lógica—, así que no hay paso que lo provoque. Lo cubre la prueba automatizada del borrado en duro, que intenta borrar al colaborador con una declaración y comprueba que el borrado se rechaza por la relación que conserva la declaración.

### 5.6 El bloque y su cajón en inglés

Objetivo: comprobar que el bloque de la matriz, la declaración vigente y el cajón del alta tienen sus textos en inglés.

**Qué debe verse:** con el idioma en inglés, la matriz se titula **Telework supplies**, la leyenda dice **Required: this employee is on the teleworkers list (NOM-037 5.7, LFT 330-E)**, las categorías se leen **Ergonomic chair**, **Computing or printing equipment** y **Accessory**, el estado declarado se lee **Own equipment declared** y la acción **Declare own equipment**; el cajón se titula **Declare own equipment: Ergonomic chair** con los campos **Equipment description**, **Agreed conditions**, **Start date** y **Monthly fee (MXN)**, los botones **Cancel** y **Save**, la declaración vigente **Since 01/11/2026** y **$350.00 per month**, y el aviso de guardado **Declaration saved.**

**Qué pasó:** no es recorrible en el ambiente entregado: el backoffice opera **solo en español** mientras el cambio de idioma está oculto —cualquier dirección con otro prefijo de idioma se reescribe al español y el selector de idioma no está en la interfaz—, así que desde el navegador no se puede poner la pantalla en inglés. No se inventan pasos para provocarlo: lo cubren la verificación automática que compara clave por clave los textos en español y en inglés de los dos bloques del panel y el chequeo de idioma del propio backoffice, ambos en verde.

**Checklist de los escenarios automatizados** (una casilla por escenario: se marca si su prueba pasó):

- [ ] 5.1 Dos altas simultáneas de la misma categoría dejan una sola declaración vigente
- [ ] 5.2 Colaborador de otra empresa, inexistente y dado de baja responden el mismo «no encontrado», sin crear declaración
- [ ] 5.3 Sin el permiso de administrar los suministros del colaborador el servidor rechaza el alta, y los superusuarios pasan
- [ ] 5.4 Los campos de más de la captura se ignoran; el identificador de empresa de otra empresa se cubre con el caso del Escenario 5.2
- [ ] 5.5 El borrado en duro del colaborador con declaraciones se rechaza
- [ ] 5.6 Los textos en inglés del bloque y del cajón están completos y no falta ninguna clave

## 6. Checklist del recorrido manual

Cada casilla se marca **contra el objetivo de su escenario**, no contra «se hicieron los pasos»:

- [ ] 4.1 En la ficha de `QA-TEL-03`, declarar la silla con cuota `350` deja la categoría **Equipo propio declarado** con su descripción, sus condiciones, **Desde el 01/11/2026** y **$350.00 al mes**, sin el botón, y el resumen pasa de **2 sin cubrir** a **1 sin cubrir**
- [ ] 4.2 Declarar el cómputo con cuota `0` se guarda tal cual (**$0.00 al mes**), el resumen queda en **Completo**, y con el cajón vacío los campos obligatorios marcan **Este campo es obligatorio.** sin guardar
- [ ] 4.3 El aditamento que estaba **Sin entregar** se declara como equipo propio con **$0.29 al mes**, sin redondear la cuota y sin cambiar el resumen **Completo**
- [ ] 4.4 Con la categoría cubierta por un activo mientras el cajón está abierto, el servidor rechaza el alta con **El colaborador tiene un activo asignado o en envío en esta categoría; no se puede declarar equipo propio.**, el cajón no se cierra y no se guarda nada
- [ ] 4.5 La segunda declaración de la misma categoría se rechaza con **El colaborador ya tiene una declaración de equipo propio vigente en esta categoría.**, el cajón no se cierra y la categoría queda con una sola declaración
- [ ] 4.6 Con el Usuario B la matriz se ve completa y la acción **Declarar equipo propio** no está en ninguna categoría
- [ ] 4.7 A 360 px no hay desplazamiento horizontal y el cajón va a todo lo ancho con los botones apilados; a unos 850 px los renglones siguen en una columna; desde unos 1024 px el renglón se abre con el chip de estado al extremo derecho y la declaración debajo a todo lo ancho

## 7. Hallazgos de otras historias

Ninguno.
