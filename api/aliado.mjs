const methods = new Set(['GET', 'POST', 'PUT', 'DELETE']);
const route = /^(?:auth\/(?:login|logout)|admin\/[\w/-]+)$/;

function error(message, status) {
  return Response.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const path = incoming.searchParams.get('__aliado_path') ?? incoming.pathname.slice('/api/v1/'.length);
    if (!methods.has(request.method) || !route.test(path)) {
      return error('Ruta no disponible.', 404);
    }

    let upstream;
    try {
      upstream = new URL(process.env.ALIADO_API_ORIGIN);
      if (upstream.protocol !== 'https:' || upstream.username || upstream.password) {
        throw new Error('Invalid backend origin');
      }
    } catch {
      return error('Configura la URL HTTPS del backend de ALIADO en Vercel.', 503);
    }

    incoming.searchParams.delete('__aliado_path');
    upstream.pathname = '/api/v1/' + path;
    upstream.search = incoming.searchParams.toString();

    const headers = new Headers();
    for (const name of ['authorization', 'content-type', 'accept']) {
      if (request.headers.has(name)) headers.set(name, request.headers.get(name));
    }

    try {
      const response = await fetch(upstream, {
        method: request.method,
        headers,
        body: request.method === 'GET' ? undefined : await request.arrayBuffer(),
        redirect: 'error',
        signal: AbortSignal.timeout(25_000),
      });
      const outgoing = new Headers({ 'Cache-Control': 'no-store' });
      for (const name of ['content-type', 'content-disposition']) {
        if (response.headers.has(name)) outgoing.set(name, response.headers.get(name));
      }
      return new Response(response.body, { status: response.status, headers: outgoing });
    } catch {
      return error('El backend de ALIADO no está disponible.', 502);
    }
  },
};
