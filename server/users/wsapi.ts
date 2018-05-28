
import * as wsapi from '../wsapi';
import * as users from './index';

function canEditUsers(user: users.User): boolean {
  return !!user.getSettings().userControls.editUsers;
}

interface SetUserSettingsRequest {
  userSettings: users.Settings['userSettings'];
}

interface UserRequest {
  upn: string;
}

interface SetUserControlsRequest extends UserRequest {
  userControls: users.Settings['userControls'];
}

interface CreateUserRequest extends UserRequest {
  settings: users.Settings;
}

wsapi.on<SetUserSettingsRequest>('user/set-user-settings', function(request, callback, notifyCallback) {
  // Set the entry userSettings in the object; this belongs to the user
  var settings = request.user.getSettings();
  settings.userSettings = request.data.userSettings;
  return request.user.setSettings(settings, callback);
});

wsapi.on<SetUserControlsRequest>('user/set-user-controls', function(request, callback, notifyCallback) {
  if(!canEditUsers(request.user)) {
    request.log.error(`User ${request.user.upn} tried to set controls for user ${request.data.upn}, which they are not allowed to do.`);
    return callback(new Error('Request denied.'));
  }

  // Set the entry userControls in the object; this belongs to the admin
  users.getUser(request.data.upn, (err, user) => {
    if(err || !user)
      return callback(err);

    var settings = user.getSettings();
    settings.userControls = request.data.userControls;
    return user.setSettings(settings, callback);
  });
});

wsapi.on('user/get-list', function(request, callback, notifyCallback) {
  return users.getList(callback);
});

wsapi.on<UserRequest>('user/get', function(request, callback, notifyCallback) {
  return users.getUser(request.data.upn, (err, result) => {
    if(err)
      return callback(err);

    if(!result)
      return callback(new Error('User not found.'));

    // Result is an internal object; construct a new object with the settings
    return callback(null, {upn: result.upn, settings: result.getSettings()});
  });
});

wsapi.on<UserRequest>('user/delete', function(request, callback, notifyCallback) {
  if(!canEditUsers(request.user)) {
    request.log.error(`User ${request.user.upn} tried to delete user ${request.data.upn}, which they are not allowed to do.`);
    return callback(new Error('Request denied.'));
  }

  return users.deleteUser(request.data.upn, callback);
});

wsapi.on<CreateUserRequest>('user/create', function(request, callback, notifyCallback) {
  if(!canEditUsers(request.user)) {
    request.log.error(`User ${request.user.upn} tried to create user ${request.data.upn}, which they are not allowed to do.`);
    return callback(new Error('Request denied.'));
  }

  return users.createUser(request.data.upn, request.data.settings, callback);
});
