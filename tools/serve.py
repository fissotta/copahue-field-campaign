#!/usr/bin/env python3
"""Servidor local para probar el juego: python3 tools/serve.py  ->  http://localhost:8000
Sirve la carpeta del proyecto, sin caché y con soporte de Range (necesario para saltar dentro de los mp3)."""
import os, re, sys, http.server, socketserver

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.js': 'text/javascript'}
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()
    def do_GET(self):
        rng = self.headers.get('Range'); path = self.translate_path(self.path)
        m = re.match(r'bytes=(\d*)-(\d*)$', rng or '')
        if not (m and os.path.isfile(path)): return super().do_GET()
        size = os.path.getsize(path)
        a, b = m.group(1), m.group(2)
        start = int(a) if a else max(0, size - int(b or 0)); end = int(b) if (a and b) else size - 1
        end = min(end, size - 1)
        if start > end: self.send_error(416); return
        self.send_response(206); self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}'); self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        with open(path, 'rb') as f:
            f.seek(start); left = end - start + 1
            while left > 0:
                chunk = f.read(min(65536, left))
                if not chunk: break
                try: self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError): break
                left -= len(chunk)
    def log_message(self, *a): pass

socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('', PORT), H) as s:
    print(f'Juego en http://localhost:{PORT}   (Ctrl+C para detener)')
    try: s.serve_forever()
    except KeyboardInterrupt: print('\nListo.')
