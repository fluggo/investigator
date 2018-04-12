'use strict';

const wsapi = require('../wsapi.js');
const msvista = require('./msvista.js');
const cylance = require('./cylance.js');
const bunyan = require('./bunyan.js');
const wsa = require('./wsa.js');
const sql = require('./sql.js');
const syslog = require('./syslog.js');
const appstatus = require('./appstatus.js');

function canSearchWsa(user) {
  return user.getSettings().userControls.wsa && user.getSettings().userControls.wsa.search;
}

wsapi.on('logs/get-bunyan-entry', function(request, callback, notifyCallback) {
  bunyan.getBunyanEntry('bunyan-' + request.data.index, request.data.id, callback);
});
wsapi.on('logs/get-msvista-entry', function(request, callback, notifyCallback) {
  msvista.getVistaLogEntry('msvistalog-' + request.data.index, request.data.id, callback);
});
wsapi.on('logs/get-msvista-entries-by-activityid', function(request, callback, notifyCallback) {
  return msvista.getVistaLogEntriesByActivityId(request.data.id, callback);
});
wsapi.on('logs/search-msvista', function(request, callback, notifyCallback) {
  return msvista.searchVistaLogs(request.data, callback);
});
wsapi.on('logs/get-msvista-stats', function(request, callback, notifyCallback) {
  return msvista.getVistaLogStats(callback);
});
wsapi.on('logs/msvista/find-admin-logins', function(request, callback, notifyCallback) {
  return msvista.findAdminLogins(request.data, callback);
});
wsapi.on('logs/get-cylance-entry', function(request, callback, notifyCallback) {
  return cylance.getCylanceLogEntry('cylancelog-' + request.data.index, request.data.id, callback);
});
wsapi.on('logs/search-cylance', function(request, callback, notifyCallback) {
  return cylance.searchCylanceLogs(request.data, callback);
});
wsapi.on('logs/running-programs', function(request, callback, notifyCallback) {
  return appstatus.getRunningPrograms(callback);
});

wsapi.on('logs/search-sqllog', function(request, callback, notifyCallback) {
  return sql.searchSqlLogs(request.data, callback);
});
wsapi.on('logs/get-sqllog-entry', function(request, callback, notifyCallback) {
  return sql.getSqlLogEntry('sqllog-' + request.data.index, request.data.id, callback);
});

wsapi.on('logs/get-wsalog-entry', function(request, callback, notifyCallback) {
  wsa.getWsaLogEntry('wsalog-' + request.data.index, request.data.id, callback);
});
wsapi.on('logs/search-wsalog', function(request, callback, notifyCallback) {
  if(!canSearchWsa(request.user)) {
    request.log.error(`User ${request.user.upn} tried to search WSA, which they are not allowed to do.`);
    return callback(new Error('Request denied.'));
  }

  return wsa.searchWsaLogs(request.data, callback);
});

wsapi.on('logs/search-syslog', function(request, callback, notifyCallback) {
  return syslog.searchSyslogLogs(request.data, callback);
});
