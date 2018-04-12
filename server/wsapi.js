// Defines an EventEmitter for handling calls from the client
'use strict';

module.exports = new (require('events')).EventEmitter();

// No more than one handler per call
module.exports.setMaxListeners(1);

// Listeners on this module are called with these parameters:
// function(request, responseCallback(err, response), notifyCallback(notification))
//
// where:
//
//    request: Contains:
//      user - User object associated with the connection.
//      log: Logger for this request.
//      data: Data sent with the request.
//    responseCallback - Callback that MUST be called. If err is specified,
//      the err is sent as a rejection response. Otherwise, a success response is
//      sent with "response" as the object.
//    notifyCallback - Can be called to send notifications about the request to the client.

// Separate API for scripts
module.exports.service = new (require('events')).EventEmitter();
module.exports.service.setMaxListeners(1);

const _sockets = new Map();

module.exports.service.registerSocket = function registerSocket(socket) {
  var uuid = socket.upgradeReq.uuid;

  _sockets.set(uuid, socket);

  socket.on('close', socket => {
    _sockets.delete(uuid);
  });

  module.exports.service.emit('socket-connected', this, socket);
};

module.exports.service.broadcast = function broadcast(type, data) {
  for(let socket of _sockets.values()) {
    socket.send(JSON.stringify({type: type, data: data}));
  }
};
