#!/usr/bin/env python3
"""Run the offscreen WebKit integration executable against a loopback fixture.

Usage: python3 safari/tests/run-webkit.py /tmp/validate-manifest /path/to/extension.appex
No Safari, visible windows, UI automation, persistent profile, or external server.
"""
import http.server
import os
import subprocess
import sys
import threading


class Fixture(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = b"<!doctype html><html><title>Focus fixture</title><body>fixture</body></html>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        result = subprocess.run(
            sys.argv[1:],
            env={**os.environ, "FOCUS_NAVIGATION_FIXTURE": f"http://127.0.0.1:{server.server_port}/"},
            timeout=40,
        )
    finally:
        server.shutdown()
        server.server_close()
    sys.exit(result.returncode)
