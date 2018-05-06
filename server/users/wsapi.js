'use strict';

const wsapi = require('../wsapi');
const users = require('./index');

function canEditUsers(user) {
  return user.getSettings().userControls.editUsers;
}

wsapi.on('user/set-user-settings', function(request, callback, notifyCallback) {
  // Set the entry userSettings in the object; this belongs to the user
  var settings = request.user.getSettings();
  settings.userSettings = request.data.userSettings;
  return request.user.setSettings(settings, callback);
});

wsapi.on('user/set-user-controls', function(request, callback, notifyCallback) {
  if(!canEditUsers(request.user)) {
    request.log.error(`User ${request.user.upn} tried to set controls for user ${request.data.upn}, which they are not allowed to do.`);
    return callback(new Error('Request denied.'));
  }

  // Set the entry userControls in the object; this belongs to the admin
  users.get(request.data.upn, (err, user) => {
    if(err)
      return callback(err);

    var settings = user.getSettings();
    settings.userControls = request.data.userControls;
    return user.setSettings(settings, callback);
  });
});

wsapi.on('user/get-list', function(request, callback, notifyCallback) {
  return users.getList(callback);
});

wsapi.on('user/get', function(request, callback, notifyCallback) {
  return users.get(request.data.upn, (err, result) => {
    if(err)
      return callback(err);

    if(!result)
      return callback(new Error('User not found.'));

    // Result is an internal object; construct a new object with the settings
    return callback(null, {upn: result.upn, settings: result.getSettings()});
  });
});

wsapi.on('user/delete', function(request, callback, notifyCallback) {
  if(!canEditUsers(request.user)) {
    request.log.error(`User ${request.user.upn} tried to delete user ${request.data.upn}, which they are not allowed to do.`);
    return callback(new Error('Request denied.'));
  }

  return users.delete(request.data.upn, callback);
});

wsapi.on('user/create', function(request, callback, notifyCallback) {
  if(!canEditUsers(request.user)) {
    request.log.error(`User ${request.user.upn} tried to create user ${request.data.upn}, which they are not allowed to do.`);
    return callback(new Error('Request denied.'));
  }

  return users.create(request.data.upn, request.data.settings, callback);
});
