#!/usr/bin/env python3
from __future__ import annotations

import html
import sys
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
STREAM_URL = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:18080/stream.mjpg"


class CameraHandler(BaseHTTPRequestHandler):
    server_version = "ITS-CameraGateway/1.0"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[camera-gateway] " + fmt % args + "\n")

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path in {"", "/", "/cam"}:
            self._send_camera_page()
            return
        if path == "/health":
            self._send_text("ok\n", "text/plain; charset=utf-8")
            return
        if path == "/stream.mjpg":
            self._proxy_stream()
            return
        self.send_error(404, "Not found")

    def _send_text(self, body: str, content_type: str) -> None:
        data = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _send_camera_page(self) -> None:
        stream = html.escape("/stream.mjpg", quote=True)
        body = f"""<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>ITS Camera Live</title>
  <style>
    html,body{{margin:0;width:100%;height:100%;background:#020617;color:#fff;font-family:Arial,sans-serif;overflow:hidden}}
    .wrap{{position:fixed;inset:0;display:grid;place-items:center;background:#020617}}
    img{{width:100%;height:100%;object-fit:cover;background:#020617}}
    .badge{{position:fixed;left:12px;bottom:10px;padding:7px 10px;border-radius:999px;background:rgba(15,23,42,.74);font-size:12px;font-weight:700;backdrop-filter:blur(10px)}}
  </style>
</head>
<body>
  <div class="wrap"><img src="{stream}" alt="Raspberry Pi camera live"></div>
  <div class="badge">Raspberry Pi Camera Live</div>
</body>
</html>"""
        self._send_text(body, "text/html; charset=utf-8")

    def _proxy_stream(self) -> None:
        try:
            with urllib.request.urlopen(STREAM_URL, timeout=12) as upstream:
                content_type = upstream.headers.get("Content-Type") or "multipart/x-mixed-replace"
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Cache-Control", "no-store")
                self.send_header("Connection", "close")
                self.end_headers()
                while True:
                    chunk = upstream.read(16384)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except BrokenPipeError:
            return
        except Exception as exc:
            self.send_error(503, f"Camera stream unavailable: {exc}")


def main() -> None:
    server = ThreadingHTTPServer(("0.0.0.0", PORT), CameraHandler)
    print(f"[camera-gateway] serving /cam/ on 0.0.0.0:{PORT}, stream={STREAM_URL}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
