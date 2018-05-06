'use strict';

const bunyan = require('./bunyan');
const wsa = require('./wsa');
const appstatus = require('./appstatus');
const msvista = require('./msvista');
const syslog = require('./syslog');
const sql = require('./sql');
const cylance = require('./cylance');
const dns = require('./dns');
const async = require('async');
const es = require('../es');

function setTemplates(callback) {
  async.parallel([
    callback => es.client.indices.putTemplate({
      name: 'bunyan-template',
      body: bunyan.BUNYAN_TEMPLATE,
    }, callback),
    callback => es.client.indices.putTemplate({
      name: 'wsalog-template',
      body: wsa.WSALOG_TEMPLATE,
    }, callback),
    callback => es.client.indices.putTemplate({
      name: 'raw-syslog-template',
      body: syslog.RAW_SYSLOG_TEMPLATE,
    }, callback),
    callback => es.client.indices.putTemplate({
      name: 'msvistalog-template',
      body: msvista.MSVISTALOG_TEMPLATE,
    }, callback),
    callback => es.client.indices.putTemplate({
      name: 'cylance-template',
      body: cylance.CYLANCE_TEMPLATE,
    }, callback),
    callback => es.client.indices.putTemplate({
      name: 'appstatus-template',
      body: appstatus.APPSTATUS_TEMPLATE,
    }, callback),
    callback => es.client.indices.putTemplate({
      name: 'sqllog-template',
      body: sql.SQLLOG_TEMPLATE,
    }, callback),
    callback => es.client.indices.putTemplate({
      name: 'dns-template',
      body: dns.DNS_TEMPLATE,
    }, callback),
  ], callback);
}

module.exports.setTemplates = setTemplates;
module.exports.findBunyanByLocator = bunyan.findBunyanByLocator;
module.exports.findVistaLogByLocator = msvista.findVistaLogByLocator;
module.exports.findWsaLogByLocator = wsa.findWsaLogByLocator;
module.exports.findCylanceLogByLocator = cylance.findCylanceLogByLocator;
module.exports.findSqlLogByLocator = sql.findSqlLogByLocator;
