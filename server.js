const http = require('http');
const { serveStatic } = require('./routes/static');
const apiRouter = require('./routes/api');
const { rotateLog } = require('./logger');

rotateLog();

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    apiRouter(req, res);
  } else {
    serveStatic(res, req.url);
  }
});

server.listen(3000, () => console.log('http://localhost:3000'));