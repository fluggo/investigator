import * as wsapi from '../wsapi';
import * as msvista from './msvista';
import * as cylance from './cylance';
import * as bunyan from './bunyan';
import * as wsa from './wsa';
import * as sql from './sql';
import * as syslog from './syslog';
import * as appstatus from './appstatus';
import * as util from '../../common/util';
import * as users from '../users';

function canSearchWsa(user: users.User) {
  const wsa = user.getSettings().userControls.wsa;
  return wsa && wsa.search;
}

interface ActivityIdRequest {
  id: string;
}

wsapi.on<util.DocumentID>('logs/get-bunyan-entry', function(request, callback, notifyCallback) {
  bunyan.getBunyanEntry('bunyan-' + request.data.index, request.data.id, callback);
});
wsapi.on<util.DocumentID>('logs/get-msvista-entry', function(request, callback, notifyCallback) {
  msvista.getVistaLogEntry('msvistalog-' + request.data.index, request.data.id, callback);
});
wsapi.on<ActivityIdRequest>('logs/get-msvista-entries-by-activityid', function(request, callback, notifyCallback) {
  return msvista.getVistaLogEntriesByActivityId(request.data.id, callback);
});
wsapi.on<util.SearchQuery>('logs/search-msvista', function(request, callback, notifyCallback) {
  return msvista.searchVistaLogs(request.data, callback);
});
wsapi.on('logs/get-msvista-stats', function(request, callback, notifyCallback) {
  return msvista.getVistaLogStats(callback);
});
wsapi.on<util.SearchQuery>('logs/msvista/find-admin-logins', function(request, callback, notifyCallback) {
  return msvista.findAdminLogins(request.data, callback);
});
wsapi.on<util.DocumentID>('logs/get-cylance-entry', function(request, callback, notifyCallback) {
  return cylance.getCylanceLogEntry('cylancelog-' + request.data.index, request.data.id, callback);
});
wsapi.on<util.SearchQuery>('logs/search-cylance', function(request, callback, notifyCallback) {
  return cylance.searchCylanceLogs(request.data, callback);
});
wsapi.on('logs/running-programs', function(request, callback, notifyCallback) {
  return appstatus.getRunningPrograms(callback);
});

wsapi.on<util.SearchQuery>('logs/search-sqllog', function(request, callback, notifyCallback) {
  return sql.searchSqlLogs(request.data, callback);
});
wsapi.on<util.DocumentID>('logs/get-sqllog-entry', function(request, callback, notifyCallback) {
  return sql.getSqlLogEntry('sqllog-' + request.data.index, request.data.id, callback);
});

wsapi.on<util.DocumentID>('logs/get-wsalog-entry', function(request, callback, notifyCallback) {
  wsa.getWsaLogEntry('wsalog-' + request.data.index, request.data.id, callback);
});
wsapi.on<util.SearchQuery>('logs/search-wsalog', function(request, callback, notifyCallback) {
  if(!canSearchWsa(request.user)) {
    request.log.error(`User ${request.user.upn} tried to search WSA, which they are not allowed to do.`);
    return callback(new Error('Request denied.'));
  }

  return wsa.searchWsaLogs(request.data, callback);
});

wsapi.on<util.SearchQuery>('logs/search-syslog', function(request, callback, notifyCallback) {
  return syslog.searchSyslogLogs(request.data, callback);
});
