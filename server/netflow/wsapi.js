'use strict';

const wsapi = require('../wsapi');
const netflow = require('./index');

function canViewNetflow(user) {
  return user.getSettings().userControls.netflow.view;
}

wsapi.on('netflow/search', function(request, callback, notifyCallback) {
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

wsapi.on('netflow/raw-search', function(request, callback, notifyCallback) {
  if(!canViewNetflow(request.user)) {
    request.log.error(`User ${request.user.upn} tried to search netflow, which they are not allowed to do.`);
    return callback(new Error('Request denied.'));
  }

  netflow.rawSearch(request.data, callback);
});
