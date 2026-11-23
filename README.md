# Préstamos

App para el iPhone (PWA) para registrar la plata que prestás y la que te prestaron: fechas, intereses (porcentaje o interés diario), mora y pagos parciales.

**Los datos quedan solo en tu teléfono.** En internet solo está el código de la app; no hay servidor ni base de datos.

## Instalarla en el iPhone

1. Abrí la URL de la app en **Safari** (GitHub Pages del repo).
2. Tocá **Compartir** → **Agregar a pantalla de inicio**.
3. Abrila desde el ícono: funciona a pantalla completa y sin conexión.

> Usala siempre desde el ícono. iOS guarda los datos de la app instalada aparte de Safari, y no los borra por falta de uso.

## Qué hace

- **Dos direcciones:** *Me deben* (lo que prestaste) y *Debo* (lo que te prestaron), con totales separados.
- **Pesos y dólares:** cada préstamo tiene su moneda y los totales se muestran por moneda.
- **Dos modalidades:**
  - **Con porcentaje:** total = capital + %, a devolver en la fecha acordada. Ej.: $100.000 al 20 % → $120.000.
  - **Interés diario:** un interés fijo por día, desde el día siguiente al préstamo hasta la fecha de pago (inclusive). Total = capital + interés diario × días, y se devuelve todo junto en la fecha de pago. Ej.: $600.000 del 5/11 al 11/11 a $25.000 por día → 6 días, $150.000 de interés, total $750.000.
- **Mora:** corre después de la fecha acordada, mientras quede saldo, y deja de correr cuando se paga todo. En cada préstamo se elige:
  - **Monto fijo** o **% del capital** (el porcentaje se calcula siempre sobre el capital, aunque haya pagos parciales).
  - **Por día, por semana o por mes.** Se cobra proporcional a los días: semana = 7 días, mes = 30 días. Ej.: 7 % semanal sobre $200.000 → $2.000 por día de atraso.
- **Cambiar la mora:** desde el detalle, *Cambiar mora* tiene dos opciones (y se puede pasar de monto fijo a porcentaje):
  - **Desde una fecha** (por ejemplo, hoy): lo que ya se generó queda igual y la nueva tarifa corre desde ese día. El detalle muestra la mora separada por tramos.
  - **Todo el préstamo:** recalcula toda la mora con la nueva tarifa, también la de los días pasados.
- **Préstamos viejos:** se cargan con fechas pasadas. El campo opcional *Cobrar mora desde* sirve para empezar a contar la mora desde una fecha posterior al vencimiento.
- **Pagos parciales:** con fecha, monto y nota. Se pueden editar o borrar.
- **Estados automáticos:** Al día · Vence pronto (3 días o menos) · Vencido (corre mora) · Pagado · Condonado (manual, se puede revertir).
- **Personas:** nombre, teléfono y notas, con accesos para llamar y abrir WhatsApp.
- **Resumen por WhatsApp** de cualquier préstamo.
- **Reportes** (por moneda):
  - Ganancia cobrada y rendimiento sobre el capital prestado.
  - Capital en la calle, total cobrado, saldo por cobrar, ganancia por cobrar y rendimiento esperado.
  - Mora generada y lo que se condonó.
  - Cobros por mes (últimos 6 meses) y quién te debe más.
  - Resumen de lo que debés.

  La ganancia se calcula considerando que cada pago cubre primero el capital.
- **Backup:** exportar e importar en JSON desde *Ajustes*. La app avisa si pasaron más de 14 días sin backup.
- Modo claro y oscuro según el sistema.

### Cómo se calcula la mora

Por cada día de atraso (desde el día siguiente al vencimiento, o desde *Cobrar mora desde*), si al empezar ese día queda saldo, se suma la mora diaria vigente ese día (la tarifa del período dividida por 1, 7 o 30, redondeada a centavos). El "saldo a hoy" ya incluye la mora de hoy: si la persona paga ese monto hoy, la deuda queda en cero y la mora deja de correr.

## Desarrollo

No tiene dependencias ni paso de build: es HTML, CSS y JavaScript (módulos ES).

```bash
# Servir en local (http://localhost:8080)
python -m http.server 8080

# Tests de la lógica de cálculo (Node 20+)
node --test tests/

# Regenerar los íconos
python scripts/generar_iconos.py
```

Para probarla en el iPhone antes de publicarla, serví la carpeta en la PC y abrí `http://<IP-de-la-PC>:8080` desde el teléfono, en la misma red Wi-Fi. Sin HTTPS no se activa el modo sin conexión, pero se puede probar todo lo demás.

### Estructura

```
index.html            Shell de la app y barra de pestañas
css/styles.css        Estilos (tokens claro/oscuro, listas agrupadas estilo iOS)
js/calc.js            Lógica pura: totales, mora, estados (testeada)
js/format.js          Formato de moneda/fechas en es-AR y parseo de montos
js/store.js           Persistencia en localStorage, validación de backups
js/app.js             Vistas, router por hash y acciones
sw.js                 Service worker (funciona sin conexión)
manifest.webmanifest  Metadatos de la PWA
tests/                Tests con node:test
scripts/              Generador de íconos
```

### Publicar cambios

GitHub Pages publica cada push a `main` (tarda 1–2 minutos). El service worker busca primero la versión publicada y usa la copia guardada solo sin internet, así que los cambios se ven al reabrir la app. En cada publicación subí `CACHE` en `sw.js` y `APP_VERSION` en `js/app.js`. Si el teléfono queda con una versión vieja: *Ajustes → Buscar actualización* (no borra los datos).
