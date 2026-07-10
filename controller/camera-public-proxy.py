#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ITS public camera proxy")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8890)
    parser.add_argument("--webrtc-port", type=int, default=8889)
    parser.add_argument("--hls-port", type=int, default=8888)
    return parser.parse_args()


ARGS = parse_args()


class ProxyHandler(BaseHTTPRequestHandler):
    server_version = "ITS-CameraPublicProxy/1.0"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[camera-public-proxy] " + fmt % args + "\n")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._common_headers()
        self.end_headers()

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path in {"", "/", "/cam", "/cam/"}:
            self._camera_page()
            return
        if path == "/health":
            self._health()
            return
        if path.startswith("/cam/"):
            self._proxy_to_hls(path)
            return
        self.send_error(404, "Not found")

    def _common_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")

    def _send_text(self, status: int, body: str, content_type: str) -> None:
        data = body.encode("utf-8")
        self.send_response(status)
        self._common_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _camera_page(self) -> None:
        playlist = html.escape("/cam/index.m3u8", quote=True)
        body = f"""<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>ITS Camera Live</title>
  <style>
    html,body{{margin:0;width:100%;height:100%;background:#05070d;color:#fff;font-family:Arial,sans-serif;overflow:hidden}}
    video{{position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#05070d}}
    .badge{{position:fixed;left:12px;bottom:10px;padding:7px 10px;border-radius:999px;background:rgba(15,23,42,.74);font-size:12px;font-weight:700}}
  </style>
</head>
<body>
  <video id="v" autoplay muted playsinline></video>
  <div class="badge">Raspberry Pi Camera Live</div>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js"></script>
  <script>
    const video = document.getElementById('v');
    const src = '{playlist}';
    if (video.canPlayType('application/vnd.apple.mpegurl')) {{
      video.src = src;
      video.play().catch(() => {{}});
    }}
    else if (window.Hls) {{
      const hls = new Hls({{ lowLatencyMode: true, backBufferLength: 30 }});
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {{}}));
    }}
  </script>
</body>
</html>"""
        self._send_text(200, body, "text/html; charset=utf-8")

    def _health(self) -> None:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{ARGS.hls_port}/cam/index.m3u8", timeout=5) as upstream:
                head = upstream.read(64)
            if b"#EXTM3U" in head:
                self._send_text(200, "ok\n", "text/plain; charset=utf-8")
                return
        except Exception:
            pass
        self._send_text(503, "camera unavailable\n", "text/plain; charset=utf-8")

    def _proxy_to_hls(self, path: str) -> None:
        target = f"http://127.0.0.1:{ARGS.hls_port}{path}"
        if "?" in self.path:
            target += "?" + self.path.split("?", 1)[1]
        try:
            with urllib.request.urlopen(target, timeout=12) as upstream:
                self.send_response(upstream.status)
                self._common_headers()
                self.send_header("Content-Type", upstream.headers.get("Content-Type", "application/octet-stream"))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                while True:
                    chunk = upstream.read(32768)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except BrokenPipeError:
            return
        except urllib.error.HTTPError as exc:
            self.send_error(exc.code, exc.reason)
        except Exception as exc:
            self.send_error(503, f"HLS unavailable: {exc}")


def main() -> None:
    server = ThreadingHTTPServer((ARGS.host, ARGS.port), ProxyHandler)
    print(
        f"[camera-public-proxy] serving {ARGS.host}:{ARGS.port}, hls=127.0.0.1:{ARGS.hls_port}, webrtc=127.0.0.1:{ARGS.webrtc_port}",
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
