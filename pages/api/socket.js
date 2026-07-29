import httpProxy from 'http-proxy';

const proxy = httpProxy.createProxyServer({
  target: 'http://localhost:4000',
  ws: true,
  changeOrigin: true,
});

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req, res) {
  return new Promise((resolve, reject) => {
    proxy.web(req, res, {}, (err) => {
      if (err) {
        console.error('Proxy error:', err);
        reject(err);
      }
      resolve();
    });
    
    // Gère le WebSocket upgrade
    if (req.socket && req.socket.server) {
      req.socket.server.on('upgrade', (request, socket, head) => {
        if (request.url.startsWith('/socket.io/')) {
          proxy.ws(request, socket, head);
        }
      });
    }
  });
}
