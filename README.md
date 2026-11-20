# ALIADO · Panel administrativo

Con el backend iniciado en el puerto 8080, ejecuta desde la raíz del proyecto:

```bash
python3 panel-admin/serve.py
```

Abre http://127.0.0.1:5173 e ingresa con una cuenta de rol `ADMINISTRADOR`.
La sesión se guarda en la pestaña y se envía al backend como token Bearer.

El servidor local sirve el frontend y reenvía las peticiones al backend en el
mismo origen. Puedes ajustar los puertos con `PANEL_ADMIN_PORT` y
`ALIADO_BACKEND_PORT`.

El dashboard muestra registros del backend. Moderación y formalización reciben
identificadores para las operaciones que la API expone por ID.
