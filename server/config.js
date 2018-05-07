// Loads and exports the app's configuration
'use strict';

const bunyan = require('bunyan');
const fs = require('fs');

// Load config file
function loadConfig() {
  const path = require('path');
  const stripJsonComments = require('strip-json-comments');

  const configPath = path.join(__dirname, '../config.json');
  var config;

  try {
    config = JSON.parse(stripJsonComments(fs.readFileSync(configPath, {encoding: 'utf8'})));
  }
  catch(e) {
    console.error('Failed to load configuration file.');
    config = {};
  }

  // Full path to the www files
  config.rootPath = path.join(__dirname, '..', config.rootPath || 'build/www');

  return config;
}

function loadCerts() {
  const rawCerts = fs.readFileSync('/etc/ssl/certs/ca-certificates.crt', {encoding: 'utf8'});
  const certs = [];
  var cert = [];

  rawCerts.split('\n').forEach(function(line) {
    if(line.length === 0)
      return;

    cert.push(line);
    if(line.match(/-END CERTIFICATE-/)) {
      certs.push(cert.join('\n'));
      cert = [];
    }
  });

  return certs;
}

// Custom request serializer to strip sensitive headers
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'sec-websocket-key',
]);

function requestSerializer(req) {
  if (!req)
    return req;

  var headers = {};

  if(req.headers) {
    Object.keys(req.headers).forEach(function(key) {
      if(!SENSITIVE_HEADERS.has(key)) {
        headers[key] = req.headers[key];
      }
    });
  }

  return {
    method: req.method,
    url: req.url,
    headers: headers,
    //remoteAddress: req.connection.remoteAddress,
    //remotePort: req.connection.remotePort
  };
}

const defaultBunyanErrorSerializer = bunyan.stdSerializers.err;

function errorSerializer(err) {
  const result = defaultBunyanErrorSerializer(err);

  result.innerErr = err.innerErr && defaultBunyanErrorSerializer(err.innerErr);
  result.innerException = err.innerException && defaultBunyanErrorSerializer(err.innerException);

  return result;
}

reloadConfig(loadConfig());

function reloadConfig(config) {
  module.exports = config;

  const logStreams = [];

  if(module.exports.logging && module.exports.logging.stdout) {
    logStreams.push({ level: module.exports.logging.stdout.level || 'debug', stream: process.stderr });
  }

  if(module.exports.logging && module.exports.logging.test) {
    const ringbuffer = new bunyan.RingBuffer({ limit: 100 });
    logStreams.push({ level: 'trace', type: 'raw', stream: ringbuffer });

    module.exports.clearLogEntries = function clearLogEntries() {
      ringbuffer.records.splice(0, ringbuffer.records.length);
    };

    module.exports.getLogEntries = function getLogEntries() {
      return ringbuffer.records;
    };
  }

  if(module.exports.logging && module.exports.logging['bunyan-tcp']) {
    let logConfig = module.exports.logging['bunyan-tcp'];

    logStreams.push({
      level: 'debug',
      stream: require('bunyan-tcp').createBunyanStream({server: logConfig.server, port: logConfig.port}),
      type: 'raw',
      closeOnExit: true
    });
  }

  bunyan.stdSerializers.req = requestSerializer;
  bunyan.stdSerializers.err = errorSerializer;

  const logger = bunyan.createLogger({
    name: 'Investigator',
    serializers: {
      req: requestSerializer,
      err: bunyan.stdSerializers.err,
      res: bunyan.stdSerializers.res,
    },
    streams: logStreams
  });

  module.exports.logger = logger;

  const nodemailer = require('nodemailer');

  module.exports.mailer = module.exports.mail && nodemailer.createTransport(module.exports.mail.transportOptions)
  module.exports.reloadConfig = reloadConfig;
  module.exports.loadCerts = loadCerts;
}
