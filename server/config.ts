// Loads and exports the app's configuration
'use strict';

import bunyan = require('bunyan');
import fs = require('fs');
import es = require('elasticsearch');
import path = require('path');
import nodemailer = require('nodemailer');
import http = require('http');

class Config {
  /** The hostname clients will use to connect to the server. */
  hostname: string;

  /**
   * The port clients will use to connect to the server.
   * When running directly, this changes which port the server runs on.
   */
  port: number;

  /**
   * Whether users will connect over HTTPS/WSS (true) or HTTP/WS (false).
   * This only affects URLs presented to the client; to get secure access, use
   * a proxy server.
   */
  secure: boolean;

  /** Subdirectory at which the site will be hosted. */
  subdir: string;

  /** Subdirectory at which the forms part of the site will be hosted. */
  formsSubdir: string;

  /**
   * If true, authenticates all users as a powerful user, useful for when
   * testing locally.
   */
  disableSecurity: boolean;

  /**
   * (optional) Path to the client web files, default is 'build/www'.
   */
  rootPath?: string;

  /** Configuration for the Elasticsearch client. */
  elasticsearch: es.ConfigOptions;

  /** Number of shards per index. */
  number_of_shards: number;

  /** Mail sending configuration. */
  mail: {
    /** Transport options for nodemailer; can be URL or object. */
    transportOptions: string | any;
  };

  /** Logging configuration. */
  logging: {
    /** Log as Bunyan JSON stream over TCP */
    "bunyan-tcp": {
      server: string;
      port: number;
    };

    /** Log as Bunyan JSON stream to stdout */
    stdout: {
      level?: bunyan.LogLevel;
    },

    test?: boolean;
  };

  /** Service key for external services to authenticate. */
  serviceKey?: string;
}

class PublishedConfig extends Config {
  logger: bunyan;
  clearLogEntries?: () => void;
  getLogEntries?: () => any[];
  mailer?: nodemailer.Transporter;
  rootPath: string;

  constructor() {
    super();
    this.reloadConfig(this.loadConfig());
  }

  // Load config file
  loadConfig(): Config {
    const stripJsonComments = require('strip-json-comments');

    const configPath = path.join(__dirname, '../config.json');
    let config: Config;

    try {
      config = JSON.parse(stripJsonComments(fs.readFileSync(configPath, {encoding: 'utf8'})));
    }
    catch(e) {
      console.error('Failed to load configuration file.');
      throw e;
    }

    // Full path to the www files
    config.rootPath = path.join(__dirname, '..', config.rootPath || 'build/www');

    return config;
  }

  loadCerts(): string[] {
    const rawCerts = fs.readFileSync('/etc/ssl/certs/ca-certificates.crt', {encoding: 'utf8'});
    const certs: string[] = [];
    var cert: string[] = [];

    rawCerts.split('\n').forEach(line => {
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

  reloadConfig(config: Config): void {
    Object.assign(this, config);

    const logStreams: bunyan.Stream[] = [];

    if(config.logging && config.logging.stdout) {
      logStreams.push({ level: config.logging.stdout.level || 'debug', stream: process.stderr });
    }

    if(config.logging && config.logging.test) {
      const ringbuffer = new bunyan.RingBuffer({ limit: 100 });
      logStreams.push({ level: 'trace', type: 'raw', stream: ringbuffer });

      this.clearLogEntries = function clearLogEntries() {
        ringbuffer.records.splice(0, ringbuffer.records.length);
      };

      this.getLogEntries = function getLogEntries() {
        return ringbuffer.records;
      };
    }

    if(config.logging && config.logging['bunyan-tcp']) {
      let logConfig = config.logging['bunyan-tcp'];

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

    this.logger = logger;

    this.mailer = config.mail && nodemailer.createTransport(config.mail.transportOptions)
  }
}

// Custom request serializer to strip sensitive headers
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'sec-websocket-key',
]);

function requestSerializer(req: http.IncomingMessage) {
  if (!req)
    return req;

  var headers: typeof req.headers = {};

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

function errorSerializer(err: any) {
  const result = defaultBunyanErrorSerializer(err);

  result.innerErr = err.innerErr && defaultBunyanErrorSerializer(err.innerErr);
  result.innerException = err.innerException && defaultBunyanErrorSerializer(err.innerException);

  return result;
}

export = new PublishedConfig();
