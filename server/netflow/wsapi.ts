import * as wsapi from '../wsapi';
import * as netflow from './index';
import * as users from '../users';
import * as util from '../../common/util';

function canViewNetflow(user: users.User) {
  const netflow = user.getSettings().userControls.netflow;
  return netflow && netflow.view;
}

wsapi.on<util.NetflowSearchQuery>('netflow/search', function(request, callback, notifyCallback) {
  if(!canViewNetflow(request.user)) {
    request.log.error(`User ${request.user.upn} tried to search netflow, which they are not allowed to do.`);
    return callback(new Error('Request denied.'));
  }

  netflow.search(request.data, callback);
});
wsapi.on('netflow/health', function(request, callback, notifyCallback) {
  if(!canViewNetflow(request.user)) {
    request.log.error(`User ${request.user.upn} tried to check netflow health, which they are not allowed to do.`);
    return callback(new Error('Request denied.'));
  }

  netflow.healthCheck(callback);
});

wsapi.on<util.NetflowSearchQuery>('netflow/raw-search', function(request, callback, notifyCallback) {
  if(!canViewNetflow(request.user)) {
    request.log.error(`User ${request.user.upn} tried to search netflow, which they are not allowed to do.`);
    return callback(new Error('Request denied.'));
  }

  netflow.rawSearch(request.data, callback);
});
