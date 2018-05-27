// We don't put much in the user mapping
const USER_MAPPING: any = {
/*  settings: {
    'index.codec': 'best_compression'
  },*/
  user: {
    dynamic: false,
  },
};

import * as d3 from 'd3-time-format';
import * as async from 'async';
import * as es from '../es';
import { EventEmitter } from 'events';
import _config = require('../config');
import * as ws from 'ws';
const logger = _config.logger;

// 24H date format down to the millisecond for marking active indices
// We go to the millisecond
const DATE_MINUTE_FORMAT = d3.timeFormat('%Y-%m-%d-%H-%M-%S-%L');

const PREFIX = _config.indexPrefix || '';
export const USER_READ_ALIAS = PREFIX + 'user', USER_WRITE_ALIAS = PREFIX + 'user';
export const USER = 'user';

const _userMap = new Map<string, User>();
const _events = new EventEmitter();

export class UserError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    Object.setPrototypeOf(this, UserError.prototype);
    this.code = code;
  }
}

export interface Settings {
  /** Settings the user controls. */
  userSettings: {};

  /** Settings an administrator controls. */
  userControls: {
    admin?: boolean;
    editUsers?: boolean;

    wiki?: {
      view: boolean;
      edit: boolean | 'propose';
    }

    /** Used only in the tests. */
    blink?: 'blonk';
  };
}

export class User {
  upn: string;
  private _settings: Settings;
  _sockets: Map<string, ws>;

  constructor(upn: string, settings: Settings) {
    this.upn = upn;
    this._settings = settings;
    this._sockets = new Map();

    // Create an empty user settings object if one doesn't exist
    if(!this._settings.userSettings)
      this._settings.userSettings = {};

    if(!this._settings.userControls)
      this._settings.userControls = {};
  }

  getSettings(): Settings {
    return this._settings;
  }

  setSettings(settings: Settings, callback: (err?: any) => void): void {
    //console.log(settings, callback);
    return es.client.index({
      index: USER_WRITE_ALIAS,
      type: USER,
      id: this.upn,
      refresh: 'true',
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

  registerSocket(socket: ws): void {
    var uuid = socket.upgradeReq.uuid;

    this._sockets.set(uuid, socket);

    socket.send(JSON.stringify({type: 'user', upn: this.upn, settings: this._settings}));

    socket.on('close', socket => {
      this._sockets.delete(uuid);
    });

    module.exports.emit('socket-connected', this, socket);
  };

  broadcast(type: string, data: any) {
    for(let socket of this._sockets.values()) {
      socket.send(JSON.stringify({type: type, data: data}));
    }
  };
}

  /** Gets a single user by UPN. Returns null if the user doesn't exist. */
export function getUser(upn: string, callback: (err: any, user?: User | null) => void): void {
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
    return es.client.get<Settings>({index: USER_READ_ALIAS, type: USER, id: upn}, (err, result) => {
      if(err) {
        if(err.status === 404)
          return callback(null, null);

        return callback(err);
      }

      user = new User(upn, result._source);
      _userMap.set(upn, user);

      return callback(null, user);
    });
  }

  // We have the answer, but wait until then next tick
  return process.nextTick(() => {
    return callback(null, user);
  });
}

export function getList(callback: (err: any, results: es.InnerHit[]) => void): void {
  return es.getAllEntries({index: USER_READ_ALIAS, type: USER}, callback);
}

export function createUser(upn: string, settings: Settings, callback: (err?: any) => void) {
  es.client.create({
    index: USER_WRITE_ALIAS,
    type: USER,
    id: upn,
    body: settings,
    refresh: 'true',
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

export function deleteUser(upn: string, callback: (err?: any) => void) {
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

/** Gets an array of index names in the wiki-write alias */
function getWriteIndices(callback: (err: any, indexes?: string[]) => void) {
  return es.getAliasIndices(USER_WRITE_ALIAS, callback);
}

/** Create the wiki index and alias */
export function createIndex(callback: (err: any) => void): void;
export function createIndex(options: {}, callback: (err: any) => void): void;
export function createIndex(options: {} | ((err: any) => void), callback?: (err: any) => void): void {
  // options parameter is optional
  if(callback === undefined) {
    callback = (options as (err: any) => void);
    options = {};
  }

  if(callback === undefined)
    return;

  // Check to see if it already exists
  return getWriteIndices((err: any, indices?: string[]) => {
    if(callback === undefined)
      return;

    if(err || !indices)
      return callback(err || new UserError('Invalid ES response.', 'invalid-es-response'));

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
export function deleteIndex(callback: (err?: any, existed?: boolean) => void): void {
  //console.error('Deleting users index...');
  return getWriteIndices((err, indices) => {
    if(err || indices === undefined)
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

export function forEach(func: (user: User, upn: string) => void): void {
  _userMap.forEach(func);
}

export const on: typeof _events.on = _events.on.bind(_events);
