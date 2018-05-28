import * as bunyan from './bunyan';
import * as wsa from './wsa';
import * as appstatus from './appstatus';
import * as msvista from './msvista';
import * as syslog from './syslog';
import * as sql from './sql';
import * as cylance from './cylance';
import * as dns from './dns';
import * as async from 'async';
import * as es from '../es';

export function setTemplates(callback: (err: any) => void) {
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

export { findBunyanByLocator } from './bunyan';
export { findVistaLogByLocator } from './msvista';
export { findWsaLogByLocator } from './wsa';
export { findCylanceLogByLocator } from './cylance';
export { findSqlLogByLocator } from './sql';
