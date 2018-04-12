'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const EventEmitter = require('events');

function watchFile(filePath, encoding) {
  // Watches the file at the given path and raises 'change' event
  // with the file's new contents when it changes (or null if the file is deleted)
  // Raises 'error' on error
  const RELOAD_TIMER = 100;
  var _reloadTimer = null;
  var _reloadInProgress = false;

  const emitter = new EventEmitter();

  filePath = path.resolve(filePath);
  const dir = path.dirname(filePath);
  const watchFilename = path.basename(filePath);

  // Watch the directory so we can be notified when the file gets created
  const watcher = fs.watch(dir, {persistent: false});

  watcher.on('change', (evt, filename) => {
    if(filename === watchFilename)
      scheduleReload();
  });

  function scheduleReload() {
    if(_reloadTimer !== null) {
      clearTimeout(_reloadTimer);
      _reloadTimer = null;
    }

    _reloadTimer = setTimeout(reload, RELOAD_TIMER);
  }

  function reload() {
    // Prevent race
    if(_reloadInProgress)
      return;

    _reloadInProgress = true;

    fs.readFile(filePath, {encoding: encoding}, (err, contents) => {
      _reloadInProgress = false;

      if(err) {
        if(err.code === 'ENOENT')
          return emitter.emit('change', null);

        return emitter.emit('error', err);
      }

      emitter.emit('change', contents);
    });
  }

  emitter.close = () => watcher.close();

  reload();

  return emitter;
}

module.exports.watchFile = watchFile;
