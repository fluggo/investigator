'use strict';

// We don't put much in the user mapping
const USER_MAPPING = {
/*  settings: {
    'index.codec': 'best_compression'
  },*/
  user: {
    dynamic: false,
  },
};

const d3 = require('d3');
const async = require('async');
const es = require('../es');
const EventEmitter = require('events');
const logger = require('../config').logger;

// 24H date format down to the millisecond for marking active indices
// We go to the millisecond
const DATE_MINUTE_FORMAT = d3.timeFormat('%Y-%m-%d-%H-%M-%S-%L');

function UserError(message, code) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.code = code;
}

require('util').inherits(UserError, Error);

var _config = require('../config');
var PREFIX = _config.indexPrefix || '';
var USER_READ_ALIAS = PREFIX + 'user', USER_WRITE_ALIAS = PREFIX + 'user';
const USER = 'user';

const _userMap = new Map();

// Gets a single user by UPN. Returns null if the user doesn't exist.
function get(upn, callback) {
  let user = _userMap.get(upn);

  if(_config.disableSecurity && upn === 'default_user') {
    user = new User('default_user', {
      userControls: {
        admin: true,
        editUsers: true,
        wiki: {
          view: true,
          edit: true,
        },
      },
      userSettings: {
      },
    });
  }

  if(!user) {
    return es.client.get({index: USER_READ_ALIAS, type: USER, id: upn}, (err, result) => {
      if(err) {
        if(err.status === 404)
          return callback(null, null);

        return callback(err);
      }

      user = new User(upn, result._source);
      _userMap.set(upn, user);

      // Create an empty user settings object if one doesn't exist
      if(!user._settings.userSettings)
        user._settings.userSettings = {};

      if(!user._settings.userControls)
        user._settings.userControls = {};

      return callback(null, user);
    });
  }

  // We have the answer, but wait until then next tick
  return process.nextTick(() => {
    return callback(null, user);
  });
}

function getList(callback) {
  return es.getAllEntries({index: USER_READ_ALIAS, type: USER}, callback);
}

function User(upn, settings) {
  this.upn = upn;
  this._settings = settings;
  this._sockets = new Map();
}

User.prototype.getSettings = function getSettings() {
  return this._settings;
};

User.prototype.setSettings = function setSettings(settings, callback) {
  //console.log(settings, callback);
  es.client.index({
    index: USER_WRITE_ALIAS,
    type: USER,
    id: this.upn,
    refresh: true,
    body: settings,
  }, (err, resp) => {
    if(err)
      return callback(err);

    for(let socket of this._sockets.values()) {
      socket.send(JSON.stringify({type: 'user', upn: this.upn, settings: this._settings}));
    }

    return callback();
  });
};

User.prototype.registerSocket = function registerSocket(socket) {
  var uuid = socket.upgradeReq.uuid;

  this._sockets.set(uuid, socket);

  socket.send(JSON.stringify({type: 'user', upn: this.upn, settings: this._settings}));

  socket.on('close', socket => {
    this._sockets.delete(uuid);
  });

  module.exports.emit('socket-connected', this, socket);
};

User.prototype.broadcast = function broadcast(type, data) {
  for(let socket of this._sockets.values()) {
    socket.send(JSON.stringify({type: type, data: data}));
  }
};

function create(upn, settings, callback) {
  es.client.create({
    index: USER_WRITE_ALIAS,
    type: USER,
    id: upn,
    body: settings,
    refresh: true,
  }, (err, result) => {
    if(err)
      return callback(err);

    // Clear out any users by the same name we had before
    var user = _userMap.get(upn);

    if(user) {
      for(let socket of user._sockets.values()) {
        socket.close();
      }

      _userMap.delete(upn);
    }

    return callback();
  });
}

function deleteUser(upn, callback) {
  es.client.delete({
    index: USER_WRITE_ALIAS,
    type: USER,
    id: upn,
    refresh: true,
  }, (err, result) => {
    if(err)
      return callback(err);

    _userMap.delete(upn);
    return callback();
  });
}

// Gets an array of index names in the wiki-write alias
function getWriteIndices(callback) {
  return es.getAliasIndices(USER_WRITE_ALIAS, callback);
}

// Create the wiki index and alias
function createIndex(options, callback) {
  // options parameter is optional
  if(!callback) {
    callback = options;
    options = {};
  }

  // Check to see if it already exists
  getWriteIndices((err, indices) => {
    if(err)
      return callback(err);

    if(indices.length > 1)
      return callback(new UserError(`Multiple user indices defined: ${indices}`, 'too-many-indices'));

    if(indices.length === 1)
      return callback(new UserError(`User index already exists as "${indices[0]}".`, 'index-already-exists'));

    const newName = PREFIX + 'user-' + DATE_MINUTE_FORMAT(new Date());
    //console.error(`Creating new index "${newName}"...`);

    return es.client.indices.create({
      index: newName,
      body: {
        settings: { number_of_shards: 1 },
        aliases: { [USER_READ_ALIAS]: {}, [USER_WRITE_ALIAS]: {} },
        mappings: USER_MAPPING,
      }
    }, callback);
  });
}

// Deletes the entire wiki; careful with this, of course
function deleteIndex(callback) {
  //console.error('Deleting users index...');
  getWriteIndices((err, indices) => {
    if(err)
      return callback(err);

    if(indices.length === 0) {
      //console.error('No wiki indices defined.');
      return callback(null, false);
    }

    logger.warn({indices: indices, messageId: 'users/deleteIndex'}, `Deleting ${indices.length === 1 ? 'index' : 'indices'} ${indices.join(', ')}.`);
    //console.error(`Deleting ${indices.length === 1 ? 'index' : 'indices'} ${indices.join(', ')}.`);

    return es.client.indices.delete({index: indices}, function(err) {
      if(err)
        logger.error({err: err, indices: indices}, `Deleting indices failed.`)

      _userMap.clear();

      //console.error(err ? 'failed.' : 'done.');
      return callback(err, !err);
    });
  });
}

function forEach(func) {
  _userMap.forEach(func);
}

module.exports = new EventEmitter();
module.exports.get = get;
module.exports.getList = getList;
module.exports.forEach = forEach;
module.exports.create = create;
module.exports.delete = deleteUser;
module.exports.createIndex = createIndex;
module.exports.deleteIndex = deleteIndex;
module.exports.User = User;
module.exports.USER = USER;
module.exports.USER_WRITE_ALIAS = USER_WRITE_ALIAS;
