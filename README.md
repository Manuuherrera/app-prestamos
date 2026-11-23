# Préstamos

App para el iPhone (PWA) para registrar la plata que prestás y la que te prestaron: fechas, intereses, cuotas diarias, mora y pagos parciales.

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
  - **Cuota diaria:** una cuota fija por día, desde el día siguiente al inicio hasta la fecha de la última cuota. Total = cuota × días.
- **Mora:** un monto fijo por cada día de atraso después de la fecha acordada, mientras quede saldo. Si se paga todo, deja de correr.
- **Préstamos viejos:** se cargan con fechas pasadas. El campo opcional *Cobrar mora desde* sirve para empezar a contar la mora desde una fecha posterior al vencimiento.
- **Pagos parciales:** con fecha, monto y nota. Se pueden editar o borrar.
- **Estados automáticos:** Al día · Vence pronto (3 días o menos) · Atrasado (cuotas diarias impagas) · Vencido (corre mora) · Pagado · Condonado (manual, se puede revertir).
- **Personas:** nombre, teléfono y notas, con accesos para llamar y abrir WhatsApp.
- **Resumen por WhatsApp** de cualquier préstamo.
- **Backup:** exportar e importar en JSON desde *Ajustes*. La app avisa si pasaron más de 14 días sin backup.
- Modo claro y oscuro según el sistema.

### Cómo se calcula la mora

Por cada día de atraso (desde el día siguiente al vencimiento, o desde *Cobrar mora desde*), si al empezar ese día queda saldo, se suma la mora diaria. El "saldo a hoy" ya incluye la mora de hoy: si la persona paga ese monto hoy, la deuda queda en cero y la mora deja de correr.

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

GitHub Pages publica cada push a `main`. El service worker sirve primero la versión en caché y se actualiza en segundo plano, así que los cambios se ven la segunda vez que se abre la app. Si cambiás la lista de archivos, subí `CACHE` en `sw.js` (`prestamos-v2`, …).
