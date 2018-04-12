'use strict';

function LogError(message, code) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.code = code;
}

require('util').inherits(LogError, Error);

function base64ToNumber(str) {
  var data = new Buffer(str, 'base64');
  return data.readUIntLE(0, data.length);
}

const LOG_COMMON = {
  properties: {
    recordFinder: {
      type: 'keyword',
    },
    receivingPort: {
      type: 'integer',
    },
    reportingIp: {
      type: 'ip',
    },
    receivedTime: {
      format: 'dateOptionalTime',
      type: 'date'
    },
    eventTime: {
      format: 'dateOptionalTime',
      type: 'date',
    },
    tag: {
      type: 'keyword',
    },
    message: {
      type: 'text',
    },
    ipProtocol: { type: 'byte' },
    all: {
      properties: {
        // Copies of all values set elsewhere
        ip: { type: 'ip' },
        hostname: { type: 'keyword' },
        fqdn: { type: 'keyword' },
        fqdnBreakdown: { type: 'keyword' },
        samName: { type: 'keyword' },   // Always uppercase
        serviceName: { type: 'keyword' },
        sid: { type: 'keyword' },   // Always uppercase
        port: { type: 'integer' },
        domain: { type: 'keyword' },  // Always uppercase
        upn: { type: 'keyword' },   // 
        logonId: { type: 'keyword' },   // 0xHEX
      }
    },
    source: {
      properties: {
        ip: { type: 'ip', copy_to: 'log.all.ip' },
        hostname: { type: 'keyword', copy_to: 'log.all.hostname' },
        fqdn: { type: 'keyword', copy_to: 'log.all.fqdn' },
        fqdnBreakdown: { type: 'keyword', copy_to: 'log.all.fqdnBreakdown' },
        samName: { type: 'keyword', copy_to: 'log.all.samName' },   // Always uppercase
        serviceName: { type: 'keyword', copy_to: 'log.all.serviceName' },
        sid: { type: 'keyword', copy_to: 'log.all.sid' },   // Always uppercase
        port: { type: 'integer', copy_to: 'log.all.port' },
        domain: { type: 'keyword', copy_to: 'log.all.domain' }, // Always uppercase
        upn: { type: 'keyword', copy_to: 'log.all.upn' },   // 
        logonId: { type: 'keyword', copy_to: 'log.all.logonId' },   // 0xHEX
      }
    },
    target: {
      properties: {
        ip: { type: 'ip', copy_to: 'log.all.ip' },
        hostname: { type: 'keyword', copy_to: 'log.all.hostname' },
        fqdn: { type: 'keyword', copy_to: 'log.all.fqdn' },
        fqdnBreakdown: { type: 'keyword', copy_to: 'log.all.fqdnBreakdown' },
        samName: { type: 'keyword', copy_to: 'log.all.samName' },   // Always uppercase
        serviceName: { type: 'keyword', copy_to: 'log.all.serviceName' },
        sid: { type: 'keyword', copy_to: 'log.all.sid' },   // Always uppercase
        port: { type: 'integer', copy_to: 'log.all.port' },
        domain: { type: 'keyword', copy_to: 'log.all.domain' }, // Always uppercase
        upn: { type: 'keyword', copy_to: 'log.all.upn' },   // 
        logonId: { type: 'keyword', copy_to: 'log.all.logonId' },   // 0xHEX
      }
    },
  }
};

module.exports.LogError = LogError;
module.exports.base64ToNumber = base64ToNumber;
module.exports.LOG_COMMON = LOG_COMMON;

