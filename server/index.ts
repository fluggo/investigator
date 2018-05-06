Error.stackTraceLimit = Infinity;
process.title = 'InfoSec Investigator';

import express = require('express');
import async = require('async');
import path = require('path');
const packageJson = require('../package.json');
import uuid = require('uuid/v4');

import wsapi = require('./wsapi');
import dns = require('dns');

wsapi.on('dns/reverse', function(request, callback, notifyCallback) {
  dns.reverse(request.data.ip, (err: NodeJS.ErrnoException, hostnames: string[]) => {
    // Don't report ENOTFOUND as an error
    if(err && err.code === 'ENOTFOUND')
      return callback(null, null);

    return callback(null, hostnames);
  });
});

wsapi.on('raw/search', function(request, callback, notifyCallback) {
  if(!request.user.getSettings().userControls.editUsers) {
    request.log.error(`User ${request.user.upn} tried to do a raw search for "${request.data.q}".`);
    return callback(new Error('Request denied.'));
  }

  // { q: 'this is a query', from: from, size: size }
  let body = {
    query: {
      query_string: {
        query: request.data.q,
      }
    },
    from: request.data.from,
    size: 100,
  };

  es.client.search({body: body}, callback);
});

wsapi.on('cluster/health', function(request, callback, notifyCallback) {
  es.getClusterHealth(callback);
});

wsapi.on('cluster/state', function(request, callback, notifyCallback) {
  es.getClusterState(callback);
});

wsapi.on('cluster/stats', function(request, callback, notifyCallback) {
  es.getClusterStats(callback);
});

const _config = require('./config');
const logger = _config.logger;

const es = require('./es');
require('./wiki/wsapi');
require('./ldap/wsapi');
require('./users/wsapi')
require('./netflow/wsapi');
require('./cylance/wsapi');
require('./logs/wsapi')
const netflow = require('./netflow');
const users = require('./users');
const logs = require('./logs');
const url = require('url');

var router = express.Router({
  // Route names are case-sensitive
  caseSensitive: true,

  // /foo and /foo/ are not the same
  // (see https://www.npmjs.com/package/express-slash for a helper module)
  strict: true
});

// Set up paths to static files.
//
// By default, files are served up with a max-age of zero. For files that
// we promise not to change, we're supplying a time of 30 days, so the
// browser can skip asking us about those.
router.use('/js/', express.static(path.join(_config.rootPath, 'static'), {
  // Don't try to serve up the index of a directory
  index: false,

  // Don't bother with last-modified, we've got etags
  lastModified: false,

  // Have the cache check back with us after a year (effectively permanent)
  maxAge: '365d'
}));

// Non-static files
function nonStaticCacheControl(res: express.Response, path: any, stat: any): void {
  // Tell the browser it must check with us for a new version every time
  // ("no-cache" is another misnomer-- the browser and proxies are allowed
  // to cache the result, but they must check with us for a new version
  // before serving it; to disable all caching, set "no-store")
  res.set('Cache-Control', 'public, no-cache');
}

router.use('/js/', express.static(path.join(_config.rootPath, 'js'), {
  index: false,
  lastModified: false,
  fallthrough: false,
  setHeaders: nonStaticCacheControl
}));

// Forestall mistakes in requesting templates; all of our templates are compiled, not served
router.all('/template/*', function(req, res) {
  res.sendStatus(404);
});

router.all('/partials/*', function(req, res) {
  res.sendStatus(404);
});

function sendIndexFile(res: express.Response) {
  res.sendFile('index.html', {
    root: _config.rootPath,
    lastModified: false,
    headers: {
      // Force IE into modern standards mode
      'X-UA-Compatible': 'IE=edge',

      // Set our CSP to the resources we need
      'Content-Security-Policy': "default-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; connect-src 'self' " + (_config.secure ? 'wss' : 'ws') + "://" + _config.hostname + ":*; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; script-src 'self'; media-src 'self';",

      // As above, cache, but force revalidation
      'Cache-Control': 'public, no-cache'
    }
  });
}

// App root, with some special handling for log entry requests
router.get('/', function(req, res) {
  const parsedUrl = url.parse(req.url, true);

  if(parsedUrl.query.bl) {
    return logs.findBunyanByLocator(parsedUrl.query.bl, (err, result) => {
      if(err)
        return res.status(500).send(err.toString());

      if(result.length === 0)
        return res.status(404).send("Couldn't find the log entry.");

      if(result.length > 1)
        return res.status(500).send("More than one entry matched the request.");

      return res.redirect(_config.subdir + 'logs/bunyan/entry/' + encodeURIComponent(result[0].index.substr(7)) + '/' + encodeURIComponent(result[0].id));
    });
  }

  if(parsedUrl.query.vl) {
    return logs.findVistaLogByLocator(parsedUrl.query.vl, (err, result) => {
      if(err)
        return res.status(500).send(err.toString());

      if(result.length === 0)
        return res.status(404).send("Couldn't find the log entry.");

      if(result.length > 1)
        return res.status(500).send("More than one entry matched the request.");

      return res.redirect(_config.subdir + 'logs/msvista/entry/' + encodeURIComponent(result[0].index.substr(11)) + '/' + encodeURIComponent(result[0].id));
    });
  }

  if(parsedUrl.query.wsa) {
    return logs.findWsaLogByLocator(parsedUrl.query.wsa, (err, result) => {
      if(err)
        return res.status(500).send(err.toString());

      if(result.length === 0)
        return res.status(404).send("Couldn't find the log entry.");

      if(result.length > 1)
        return res.status(500).send("More than one entry matched the request.");

      return res.redirect(_config.subdir + 'logs/wsa/entry/' + encodeURIComponent(result[0].index.substr(7)) + '/' + encodeURIComponent(result[0].id));
    });
  }

  if(parsedUrl.query.cy) {
    return logs.findCylanceLogByLocator(parsedUrl.query.cy, (err, result) => {
      if(err)
        return res.status(500).send(err.toString());

      if(result.length === 0)
        return res.status(404).send("Couldn't find the log entry.");

      if(result.length > 1)
        return res.status(500).send("More than one entry matched the request.");

      return res.redirect(_config.subdir + 'logs/cylance/entry/' +
        encodeURIComponent(result[0].index.substr('cylancelog-'.length)) + '/' + encodeURIComponent(result[0].id));
    });
  }

  if(parsedUrl.query.sq) {
    return logs.findSqlLogByLocator(parsedUrl.query.sq, (err, result) => {
      if(err)
        return res.status(500).send(err.toString());

      if(result.length === 0)
        return res.status(404).send("Couldn't find the log entry.");

      if(result.length > 1)
        return res.status(500).send("More than one entry matched the request.");

      return res.redirect(_config.subdir + 'logs/sql/entry/' +
        encodeURIComponent(result[0].index.substr('sqllog-'.length)) + '/' + encodeURIComponent(result[0].id));
    });
  }

  return sendIndexFile(res);
});

// Loading the application itself; note that this *has* to come after all others
router.get('*', function(req, res) {
  return sendIndexFile(res);
});

import http = require('http');
import ws = require('ws');
import helmet = require('helmet');

function startServer(callback: (err: any) => void) {
  const app = express();
  const server = http.createServer();

  // Disable the X-Powered-By header
  app.disable('x-powered-by');

  // Enable logging
  app.use(require('bunyan-request')({ logger: logger }));

  // Deny frame embedding
  app.use(helmet.frameguard({ action: 'deny' }));

  // Tell the browser to trust us on content types
  app.use(helmet.noSniff());

  // Replace json method so we can prepend Angular's CSRF-prevention prefix
  function safejson(this: express.Response, value?: any): express.Response {
    this.type('json');

    var result = JSON.stringify(value, app.get('json replacer'), app.get('json spaces'));
    this.send(")]}',\n" + result);
    return this;
  }

  app.use(function(req, res, next) {
    res.json = safejson;
    next();
  });

  // Add in the application router
  app.use(_config.formsSubdir, require('./forms').router);
  app.use(_config.subdir, router);

  /** Type for adding internal properties to express requests. */
  interface InternalRequest extends express.Request {
    /** Logger child associated with the request. */
    log: typeof logger,

    /** Unique ID of this request. */
    uuid: string
  }

  // Report errors to Bunyan
  app.use(function(err, req: InternalRequest, res, next) {
    req.log.error({err: err}, 'Error during route.');
    next(err);
  } as express.ErrorRequestHandler);

  // Set up the main web socket server.
  // These objects live alongside express, and talk to the underlying
  // http.Server object directly.
  var wsServer = new ws.Server({
    server: server,
    path: _config.subdir + '_service/main',
    perMessageDeflate: false,   // Compression + SSL = leakage, plus I think my implementation is broken
    verifyClient: (info, callback) => {
      const req = info.req as InternalRequest;

      try {
        // Use headers to find username from upstream reverse proxy
        let remoteUser = req.headers['proxy-user'];

        if(_config.disableSecurity)
          remoteUser = 'default_user';

        req.uuid = uuid();
        req.log = logger.child({webRequestId: req.uuid, remoteUser: remoteUser});
        req.log.info({req: {method: req.method, headers: req.headers, url: req.url}}, 'Begin _service/main websocket');

        let user = users.get(remoteUser, (err, user) => {
          if(!user) {
            req.log.warn(`Unknown user "${remoteUser}"`);
            return callback(false, 403, `Unknown user "${remoteUser}"`);
          }

          if(err) {
            req.log.error({err: err}, `Server error"`);
            return callback(false, 500, 'Server error: ' + err.message);
          }

          req.user = user;
          return callback(true);
        });
      }
      catch(err) {
        logger.error({err: err, req: {method: req.method, headers: req.headers, url: req.url}}, 'Failed to verify client.')
        return callback(false);
      }
    }
  });

  // http://stackoverflow.com/questions/18391212/is-it-not-possible-to-stringify-an-error-using-json-stringify
  function replaceErrors(key: any, value: any) {
    if(value instanceof Error) {
      const error: any = {};

      Object.getOwnPropertyNames(value).forEach(function(key) {
        error[key] = value[key];
      });

      return error;
    }

    return value;
  }

  wsServer.on('connection', function(socket, rawreq) {
    const upgradeReq = rawreq as InternalRequest;

    // Send the first update, which is the list of valid client versions
    socket.send(JSON.stringify({type: 'client-versions', versions: [packageJson.version]}));
    upgradeReq.user.registerSocket(ws);

    socket.on('message', function(rawMessage) {
      const message = JSON.parse(rawMessage);

      function responseCallback(err: any, response?: object): void {
        if(socket.readyState !== ws.OPEN) {
          return upgradeReq.log.warn({messageName: message.name, readyState: socket.readyState}, 'Failed to send response, websocket was closed');
        }

        if(err) {
          upgradeReq.log.warn({messageName: message.name, err: err, messageData: message.data}, `Error during ${message.name} WS request`);

          socket.send(JSON.stringify({type: 'cbrej', id: message.id, data: err}, replaceErrors), err => {
            if(err)
              upgradeReq.log.error({messageName: message.name, err: err}, 'Failed to send error to client');
          });
        }
        else {
          socket.send(JSON.stringify({type: 'cbres', id: message.id, data: response}, replaceErrors), err => {
            if(err)
              upgradeReq.log.error({messageName: message.name, err: err}, 'Failed to send response to client');
          });
        }
      }

      function notifyCallback(notification: object): void {
        socket.send(JSON.stringify({type: 'cbnot', id: message.id, data: notification}, replaceErrors), err => {
          upgradeReq.log.error({messageName: message.name, err: err}, 'Failed to send notification to client');
        });
      }

      if(message.type === 'cbreq') {
        // It's a request, try sending it to the wsapi listeners
        upgradeReq.log.info({messageName: message.name}, 'Received WSAPI request');

        if(!wsapi.emit(message.name, {user: upgradeReq.user, log: upgradeReq.log, data: message.data}, responseCallback, notifyCallback)) {
          // No listener was defined, send a reject
          responseCallback({message: `No listener defined for "${message.name}".`});
        }
      }
    });

    socket.on('error', err => {
      upgradeReq.log.error({err: err}, 'Client or socket error');
    });

    socket.on('close', (code, message) => {
      upgradeReq.log.info({code: code, message: message}, 'Socket closed');
    });
  });

  // Set up the service web socket server. This is used for connections with
  // other server-side tools.
  const wsServiceServer = new ws.Server({
    server: server,
    path: _config.subdir + '_service/service',
    perMessageDeflate: false,   // Compression + SSL = leakage, plus I think my implementation is broken
    verifyClient: (info, callback) => {
      const req = info.req as InternalRequest;

      try {
        // Fetch Bearer token
        const remoteKey = req.headers['authorization'] && req.headers['authorization'].substr(7);

        req.uuid = uuid();
        req.log = logger.child({webRequestId: req.uuid});
        req.log.info({req: {method: req.method, headers: req.headers, url: req.url}}, 'Begin _service/service websocket');

        if(_config.serviceKey !== remoteKey) {
          req.log.error({req: {method: req.method, headers: req.headers, url: req.url}}, `Failed to verify remote key to service websocket`);
          return callback(false);
        }

        return callback(true);
      }
      catch(err) {
        console.log(err);
        logger.error({err: err, req: {method: req.method, headers: req.headers, url: req.url}}, 'Failed to verify client.')
        return callback(false);
      }
    }
  });

  wsServiceServer.on('connection', function(socket, rawreq) {
    const upgradeReq = rawreq as InternalRequest;

    // Send the first update, which is the list of valid client versions
    socket.send(JSON.stringify({type: 'client-versions', versions: [packageJson.version]}));
    socket.send(JSON.stringify({type: 'wiki/memory-map', data: require('./wiki/index-maint').getMemoryMapPublishedVersionSync()})) ;
    wsapi.service.registerSocket(ws);

    socket.on('message', function(rawMessage) {
      const message = JSON.parse(rawMessage);

      function responseCallback(err: any, response?: object): void {
        if(socket.readyState !== ws.OPEN) {
          return upgradeReq.log.warn({messageName: message.name, readyState: socket.readyState}, 'Failed to send response, websocket was closed');
        }

        if(err) {
          upgradeReq.log.warn({messageName: message.name, err: err, messageData: message.data}, `Error during ${message.name} WS request`);

          socket.send(JSON.stringify({type: 'cbrej', id: message.id, data: err}, replaceErrors), err => {
            if(err)
              upgradeReq.log.error({messageName: message.name, err: err}, 'Failed to send error to client');
          });
        }
        else {
          socket.send(JSON.stringify({type: 'cbres', id: message.id, data: response}, replaceErrors), err => {
            if(err)
              upgradeReq.log.error({messageName: message.name, err: err}, 'Failed to send response to client');
          });
        }
      }

      function notifyCallback(notification: object): void {
        socket.send(JSON.stringify({type: 'cbnot', id: message.id, data: notification}, replaceErrors), err => {
          upgradeReq.log.error({messageName: message.name, err: err}, 'Failed to send notification to client');
        });
      }

      if(message.type === 'cbreq') {
        // It's a request, try sending it to the wsapi listeners
        upgradeReq.log.info({messageName: message.name}, 'Received WSAPI request');

        if(!wsapi.service.emit(message.name, {user: upgradeReq.user, log: upgradeReq.log, data: message.data}, responseCallback, notifyCallback)) {
          // No listener was defined, send a reject
          responseCallback({message: `No listener defined for "${message.name}".`});
        }
      }
    });

    socket.on('error', err => {
      upgradeReq.log.error({err: err}, 'Client or socket error');
    });

    socket.on('close', (code, message) => {
      upgradeReq.log.info({code: code, message: message}, 'Socket closed');
    });
  });

  // Actually start the server
  server.on('request', app);
  server.listen(_config.port, callback);
}

// Start everything
async.series([
  // Wait for wiki maintenance tasks to finish before we expose the site
  cb => require('./wiki/index-maint').pushWriteQueue(null, cb),
  startServer,
], function(err) {
});
