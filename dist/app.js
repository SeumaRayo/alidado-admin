const $ = (selector) => document.querySelector(selector);
const heading = $('#title');
const content = $('#content');
const dialog = $('#dialog');
const loginForm = $('#login-form');
let token = sessionStorage.getItem('aliado.admin.token');
let email = sessionStorage.getItem('aliado.admin.email');
let page;
let revision = 0;

const sections = {
  inicio: ['Dashboard', 'Resumen de reportes, catálogo y actividad administrativa.', '▦', dashboard],
  reportes: ['Reportes', 'Revisa casos, descarga evidencias y registra una resolución.', '⚑', reports],
  busqueda: ['Usuarios y solicitudes', 'Busca cuentas y solicitudes para revisar sus datos o tomar medidas.', '⌕', search],
  moderacion: ['Moderación', 'Gestiona bloqueos, contenido, verificaciones y servicios de alto riesgo.', '◇', moderation],
  categorias: ['Categorías', 'Administra las categorías del catálogo de servicios.', '▤', () => catalog('categorias')],
  zonas: ['Zonas', 'Administra las zonas y su cobertura geográfica.', '⌖', () => catalog('zonas')],
  formalizacion: ['Formalización', 'Actualiza los enlaces institucionales por su identificador.', '↔', formalization],
  auditoria: ['Auditoría', 'Consulta las operaciones administrativas recientes.', '≡', audit],
};
const reportStates = ['PENDIENTE', 'EN_REVISION', 'RESUELTO', 'DESCARTADO'];
const activeStates = ['ACTIVO', 'INACTIVO'];

function el(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name.startsWith('on')) element.addEventListener(name.slice(2), value);
    else element.setAttribute(name, value);
  }
  element.append(...children.filter((child) => child !== null && child !== undefined));
  return element;
}

function button(label, onclick, className = '') {
  return el('button', { type: 'button', class: className, onclick }, label);
}

function message(value, error = false) {
  const notice = $('#notice');
  notice.textContent = value;
  notice.hidden = !value;
  notice.classList.toggle('error', error);
}

async function api(path, { method = 'GET', body, binary = false } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/v1' + path, { method, headers, body: body && JSON.stringify(body) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== '/auth/login') clearSession('Tu sesión terminó. Vuelve a ingresar.');
    throw new Error(error.mensaje || error.message || error.detail || 'La solicitud falló (HTTP ' + response.status + ').');
  }
  if (binary) return { blob: await response.blob(), filename: response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)/)?.[1] };
  return response.status === 204 ? undefined : response.json();
}

function clearSession(error = '') {
  revision++;
  token = email = null;
  sessionStorage.removeItem('aliado.admin.token');
  sessionStorage.removeItem('aliado.admin.email');
  if (dialog.open) dialog.close();
  content.replaceChildren();
  $('#panel').hidden = true;
  $('#login').hidden = false;
  $('#login-error').textContent = error;
  $('#login-error').hidden = !error;
}

function openPanel() {
  $('#login').hidden = true;
  $('#panel').hidden = false;
  $('#account').textContent = email;
  navigate(location.hash.slice(1) || 'inicio');
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = loginForm.querySelector('button');
  const credentials = Object.fromEntries(new FormData(loginForm));
  submit.disabled = true;
  $('#login-error').hidden = true;
  try {
    const session = await api('/auth/login', { method: 'POST', body: credentials });
    if (session.rol !== 'ADMINISTRADOR') {
      token = session.sessionToken;
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      throw new Error('Esta cuenta no tiene acceso administrativo.');
    }
    token = session.sessionToken;
    email = credentials.email;
    sessionStorage.setItem('aliado.admin.token', token);
    sessionStorage.setItem('aliado.admin.email', email);
    loginForm.reset();
    openPanel();
  } catch (error) {
    clearSession(error.message);
  } finally {
    submit.disabled = false;
  }
});

$('#logout').addEventListener('click', async (event) => {
  const control = event.currentTarget;
  control.disabled = true;
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {
    // Clear the local session even if the backend is unavailable.
  } finally {
    clearSession();
    control.disabled = false;
  }
});
$('#close-dialog').addEventListener('click', () => dialog.close());
window.addEventListener('hashchange', () => {
  const destination = location.hash.slice(1);
  if (token && destination !== page) navigate(destination);
});

function navigate(destination, success = '') {
  page = Object.hasOwn(sections, destination) ? destination : 'inicio';
  const [title, description, , render] = sections[page];
  const current = ++revision;
  history.replaceState(null, '', '#' + page);
  heading.textContent = title;
  $('#breadcrumb').textContent = title;
  $('#description').textContent = description;
  $('nav').replaceChildren(...Object.entries(sections).map(([key, [label, , icon]]) =>
    el('button', { type: 'button', 'aria-current': key === page ? 'page' : 'false', onclick: () => navigate(key) },
      el('span', { class: 'nav-icon', 'aria-hidden': 'true' }, icon), label)));
  message(success);
  content.replaceChildren(el('p', { class: 'empty' }, 'Cargando…'));
  Promise.resolve().then(render).then((view) => {
    if (current === revision) content.replaceChildren(view);
  }).catch((error) => {
    if (current === revision) {
      content.replaceChildren(button('Reintentar', () => navigate(page)));
      message(error.message, true);
    }
  });
}

function card(...children) {
  return el('section', { class: 'card' }, ...children);
}

function badge(state) {
  return el('span', { class: 'badge', 'data-state': state ?? '' }, (state || '—').replaceAll('_', ' '));
}

function table(columns, rows, empty = 'No hay registros para mostrar.') {
  if (!rows.length) return el('p', { class: 'empty' }, empty);
  return el('div', { class: 'table-wrap' }, el('table', {},
    el('thead', {}, el('tr', {}, ...columns.map((label) => el('th', { scope: 'col' }, label)))),
    el('tbody', {}, ...rows.map((row) => el('tr', {}, ...row.map((cell) => el('td', {}, cell ?? '—')))))));
}

function field(label, name, options = {}) {
  const { type = 'text', values, value = '', optional = false, ...attributes } = options;
  const attrs = { name, ...(optional ? {} : { required: '' }), ...attributes };
  let control;
  if (values) control = el('select', attrs, ...values.map((item) => el('option', { value: item }, item ? item.replaceAll('_', ' ') : 'Sin cambio')));
  else if (type === 'textarea') control = el('textarea', attrs);
  else control = el('input', { ...attrs, type });
  if (!values || value) control.value = value;
  return el('label', {}, label, control);
}

function form(fields, label, execute, inline = false) {
  const feedback = el('p', { role: 'alert', hidden: '' });
  const submit = el('button', { class: 'primary' }, label);
  return el('form', { class: inline ? 'row-form' : '', onsubmit: async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    submit.disabled = true;
    feedback.hidden = true;
    try {
      await execute(values);
    } catch (error) {
      feedback.textContent = error.message;
      feedback.hidden = false;
    } finally {
      submit.disabled = false;
    }
  } }, ...fields, submit, feedback);
}

function modal(title, body) {
  $('#dialog-title').textContent = title;
  $('#dialog-body').replaceChildren(body);
  if (!dialog.open) dialog.showModal();
}

function mutation(title, fields, request, label = 'Guardar cambios', after) {
  const currentPage = page;
  modal(title, form(fields, label, async (values) => {
    const result = await request(values);
    dialog.close();
    navigate(currentPage, after?.(result) || 'Operación completada.');
  }));
}

function date(value) {
  return value ? new Date(value).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function details(items) {
  return el('dl', { class: 'detail' }, ...items.flatMap(([label, value]) =>
    [el('dt', {}, label), el('dd', {}, value ?? '—')]));
}

async function dashboard() {
  const [pending, categories, zones, events] = await Promise.all([
    api('/admin/reportes?estado=PENDIENTE'), api('/admin/categorias'),
    api('/admin/zonas'), api('/admin/auditoria?limite=5'),
  ]);
  const metrics = [
    ['Reportes pendientes', pending.length, 'reportes'],
    ['Categorías activas', categories.filter((item) => item.estado === 'ACTIVO').length, 'categorias'],
    ['Zonas activas', zones.filter((item) => item.estado === 'ACTIVO').length, 'zonas'],
  ];
  return el('div', {},
    el('div', { class: 'grid' }, ...metrics.map(([label, count, destination]) =>
      card(el('div', { class: 'metric' }, el('h3', {}, label), el('span', {}, String(count)),
        button('Ver ' + sections[destination][0].toLowerCase(), () => navigate(destination)))))),
    card(el('div', { class: 'section-head' }, el('h2', {}, 'Actividad reciente'), button('Ver auditoría', () => navigate('auditoria'))),
      auditTable(events)));
}

function auditTable(events) {
  return table(['Acción', 'Objetivo', 'Detalle', 'Fecha'], events.map((event) =>
    [event.accion, [event.objetivoTipo, event.objetivoId].filter(Boolean).join(' · '), event.detalle, date(event.fecha)]));
}

async function audit() {
  const results = el('div', {}, auditTable(await api('/admin/auditoria?limite=50')));
  return card(form([field('Cantidad de registros', 'limite', { type: 'number', value: '50', min: '1', max: '200' })],
    'Consultar', async ({ limite }) => {
      results.replaceChildren(auditTable(await api('/admin/auditoria?limite=' + encodeURIComponent(limite))));
    }, true), results);
}

async function catalog(key) {
  const zones = key === 'zonas';
  const singular = zones ? 'zona' : 'categoría';
  const endpoint = '/admin/' + key;
  const items = await api(endpoint);
  const edit = (item) => {
    const fields = [field('Nombre', 'nombre', { value: item?.nombre })];
    if (zones) fields.push(field('Cobertura geográfica', 'coberturaGeografica', { value: item?.coberturaGeografica ?? '', optional: true }));
    if (item) fields.push(field('Estado', 'estado', { values: activeStates, value: item.estado }));
    mutation((item ? 'Editar ' : 'Nueva ') + singular, fields,
      (body) => api(endpoint + (item ? '/' + item.id : ''), { method: item ? 'PUT' : 'POST', body }));
  };
  const rows = items.map((item) => [item.nombre, ...(zones ? [item.coberturaGeografica] : []), badge(item.estado),
    el('div', { class: 'actions' }, button('Editar', () => edit(item)),
      item.estado === 'ACTIVO' ? button('Desactivar', () => mutation('Desactivar ' + item.nombre, [],
        () => api(endpoint + '/' + item.id, { method: 'DELETE' }), 'Confirmar desactivación'), 'danger') : null)]);
  return card(el('div', { class: 'section-head' }, el('h2', {}, sections[key][0]), button('Nueva ' + singular, () => edit(), 'primary')),
    table(['Nombre', ...(zones ? ['Cobertura'] : []), 'Estado', 'Acciones'], rows));
}

function reportTable(items) {
  return table(['Tipo', 'Motivo', 'Estado', 'Fecha', 'Acciones'], items.map((item) =>
    [item.tipo, item.motivo, badge(item.estado), date(item.fechaCreacion), button('Revisar', () => review(item.id))]));
}

async function reports() {
  const results = el('div', {}, reportTable(await api('/admin/reportes?estado=PENDIENTE')));
  return card(form([field('Estado', 'estado', { values: reportStates })], 'Consultar', async ({ estado }) => {
    results.replaceChildren(reportTable(await api('/admin/reportes?estado=' + estado)));
  }, true), results);
}

async function review(id) {
  const rev = revision;
  try {
    const report = await api('/admin/reportes/' + id);
    if (rev !== revision) return;
    const evidence = report.evidencias ?? [];
    const body = el('div', {}, details([
      ['Estado', badge(report.estado)], ['Tipo', report.tipo], ['Objetivo', report.objetivoId],
      ['Motivo', report.motivo], ['Creado', date(report.fechaCreacion)],
    ]), el('h3', {}, 'Evidencias'), table(['Tipo', 'Fecha', 'Acciones'], evidence.map((item) =>
      [item.tipoContenido, date(item.fechaCarga), button('Descargar', async () => {
        try {
          const { blob, filename } = await api('/admin/reportes/' + id + '/evidencias/' + item.id, { binary: true });
          const url = URL.createObjectURL(blob);
          el('a', { href: url, download: filename || item.id }).click();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
        } catch (error) {
          const alert = el('p', { role: 'alert' }, error.message);
          body.prepend(alert);
        }
      })]), 'Este reporte no tiene evidencias.'));
    if (['PENDIENTE', 'EN_REVISION'].includes(report.estado)) {
      body.append(button('Resolver reporte', () => mutation('Resolver reporte', [
        field('Resultado', 'resultado', { values: ['RESUELTO', 'DESCARTADO'] }),
        field('Justificación', 'justificacion', { type: 'textarea' }),
      ], (data) => api('/admin/reportes/' + id + '/resolver', { method: 'POST', body: data }), 'Registrar resolución'), 'primary'));
    }
    modal('Detalle del reporte', body);
  } catch (error) {
    if (rev === revision) message(error.message, true);
  }
}

async function search() {
  const allUsersQuery = '@';
  const results = el('div');

  async function loadResults(query) {
    const term = query.trim();
    const listUsers = !term;
    const data = await api('/admin/busqueda?q=' + encodeURIComponent(listUsers ? allUsersQuery : term));
    results.replaceChildren(
      el('h2', {}, 'Usuarios'), table(['Correo', 'Rol', 'ID', 'Acciones'],
        data.usuarios.map((user) => [user.email, badge(user.rol), user.id, button('Bloquear', () => block(user.id))]),
        listUsers ? 'No hay usuarios para mostrar.' : 'No se encontraron usuarios para «' + term + '».'),
      listUsers ? el('p', { class: 'empty' }, 'Para encontrar solicitudes, busca por descripción o ID.') : null,
      ...(!listUsers ? [el('h2', {}, 'Solicitudes'), table(['Descripción', 'Estado', 'ID'],
        data.solicitudes.map((item) => [item.descripcion, badge(item.estado), item.id]),
        'No se encontraron solicitudes para «' + term + '».')] : []));
  }

  const searchForm = form([
    field('Buscar por correo, descripción o ID', 'q', { type: 'search', optional: true }),
    button('Ver todos los usuarios', () => {
      searchForm.reset();
      searchForm.requestSubmit();
    }),
  ], 'Buscar', ({ q }) => loadResults(q), true);

  await loadResults('');
  return card(searchForm, results);
}

function idField(label, name, value) {
  return field(label, name, { value, pattern: '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
    title: 'Ingresa un identificador UUID.' });
}

function block(userId) {
  mutation('Bloquear cuenta', [
    idField('ID del usuario', 'usuarioId', userId), field('Motivo', 'motivo', { type: 'textarea' }),
  ], ({ usuarioId, motivo }) => api('/admin/usuarios/' + usuarioId + '/bloqueos', { method: 'POST', body: { motivo } }),
  'Confirmar bloqueo', (result) => 'Cuenta bloqueada. ID del bloqueo: ' + result.id);
}

function moderation() {
  const operations = [
    ['Bloquear cuenta', 'Restringe el acceso de un usuario.', () => block()],
    ['Levantar bloqueo', 'Usa el identificador del usuario y el del bloqueo.', () => mutation('Levantar bloqueo', [
      idField('ID del usuario', 'usuario'), idField('ID del bloqueo', 'bloqueo'),
    ], ({ usuario, bloqueo }) => api('/admin/usuarios/' + usuario + '/bloqueos/' + bloqueo + '/levantar', { method: 'POST' }),
    'Confirmar levantamiento')],
    ['Moderar contenido', 'Oculta contenido o solicita una corrección.', () => mutation('Moderar contenido', [
      field('Tipo de objetivo', 'objetivoTipo', { values: ['PERFIL', 'RESENA', 'SERVICIO', 'USUARIO'] }),
      idField('ID del objetivo', 'objetivoId'),
      field('Acción', 'accion', { values: ['OCULTAR_CONTENIDO', 'SOLICITAR_CORRECCION'] }),
      field('Motivo', 'motivo', { type: 'textarea' }),
    ], (body) => api('/admin/moderacion', { method: 'POST', body }))],
    ['Resolver verificación', 'Aprueba o rechaza una solicitud de verificación.', () => mutation('Resolver verificación', [
      idField('ID de la verificación', 'id'), field('Estado', 'estado', { values: ['APROBADA', 'RECHAZADA'] }),
      field('Justificación', 'justificacion', { type: 'textarea', optional: true }),
    ], ({ id, ...body }) => api('/admin/verificaciones/' + id + '/resolver', { method: 'POST', body }))],
    ['Marcar alto riesgo', 'Registra el criterio de riesgo de un servicio.', () => mutation('Marcar servicio de alto riesgo', [
      idField('ID del servicio', 'id'), field('Criterio', 'criterio', { type: 'textarea' }),
    ], ({ id, ...body }) => api('/admin/servicios/' + id + '/alto-riesgo', { method: 'POST', body }))],
  ];
  return el('div', { class: 'grid' }, ...operations.map(([title, description, action]) =>
    card(el('h2', {}, title), el('p', { class: 'empty' }, description), button(title, action))));
}

function formalization() {
  return card(form([
    idField('ID del enlace', 'id'),
    field('Nombre', 'nombre', { optional: true }),
    field('URL', 'url', { type: 'url', optional: true }),
    field('Estado', 'estado', { values: ['', 'DISPONIBLE', 'NO_DISPONIBLE'], optional: true }),
  ], 'Actualizar enlace', async ({ id, ...values }) => {
    const body = Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim()));
    if (!Object.keys(body).length) throw new Error('Completa al menos un campo.');
    const result = await api('/admin/formalizacion/enlaces/' + id, { method: 'PUT', body });
    message('Enlace actualizado: ' + result.nombre);
  }));
}

if (token) openPanel();
