"""Serve the panel locally and forward its API calls to Spring Boot."""

import os
from functools import partial
from http.client import HTTPConnection
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class PanelHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/v1/"):
            self.forward_api()
        else:
            super().do_GET()

    def do_POST(self):
        self.forward_api()

    def do_PUT(self):
        self.forward_api()

    def do_DELETE(self):
        self.forward_api()

    def forward_api(self):
        if not self.path.startswith("/api/v1/"):
            self.send_error(404)
            return

        connection = HTTPConnection("127.0.0.1", BACKEND_PORT, timeout=30)
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        headers = {
            name: self.headers[name]
            for name in ("Authorization", "Content-Type", "Accept")
            if name in self.headers
        }
        try:
            connection.request(self.command, self.path, body=body, headers=headers)
            response = connection.getresponse()
            data = response.read()
            status = response.status
            response_headers = {
                name: response.getheader(name)
                for name in ("Content-Type", "Content-Disposition")
            }
        except OSError:
            status = 502
            data = b'{"message":"No se pudo conectar con el backend de ALIADO."}'
            response_headers = {"Content-Type": "application/json"}
        finally:
            connection.close()

        self.send_response(status)
        for name, value in response_headers.items():
            if value:
                self.send_header(name, value)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    BACKEND_PORT = int(os.getenv("ALIADO_BACKEND_PORT", "8080"))
    port = int(os.getenv("PANEL_ADMIN_PORT", "5173"))
    directory = Path(__file__).resolve().parent / "dist"
    handler = partial(PanelHandler, directory=str(directory))
    print(f"ALIADO Admin: http://127.0.0.1:{port}", flush=True)
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        server.serve_forever()
