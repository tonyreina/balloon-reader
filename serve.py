#!/usr/bin/env python3
"""Static server for Balloon Reader.

python3 -m http.server works, but it does not know about .woff2, serves the
40MB speech model with no cache headers so every reload re-downloads it, and
gives .wasm the wrong type. This fixes those three things and nothing else.

    python3 serve.py [port]
"""

import functools
import http.server
import mimetypes
import socketserver
import sys

mimetypes.add_type('font/woff2', '.woff2')
mimetypes.add_type('application/wasm', '.wasm')
mimetypes.add_type('application/gzip', '.tar.gz')
mimetypes.add_type('text/javascript', '.js')

# Files that never change: let the browser keep them.
CACHE_FOREVER = ('.tar.gz', '.woff2', '.wasm')


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        if self.path.endswith(CACHE_FOREVER):
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
        else:
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        # Keep the console readable while a child is playing.
        if '200' not in fmt % args or self.path == '/':
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    socketserver.TCPServer.allow_reuse_address = True
    handler = functools.partial(Handler, directory='.')
    with socketserver.TCPServer(('', port), handler) as server:
        print(f'Balloon Reader: http://localhost:{port}')
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print('\nstopped')


if __name__ == '__main__':
    main()
