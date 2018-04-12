'use strict';

const wsapi = require('../wsapi.js');
const cylance = require('./index.js');

wsapi.on('cylance/device/get-objects-by-id', function(request, callback, notifyCallback) {
  cylance.getDevicesById(request.data.ids, request.data.options, callback);
});

wsapi.on('cylance/device/string-search', function(request, callback, notifyCallback) {
  // { q: 'this is a query', from: from, size: size }
  return cylance.deviceStringSearch(request.data.q, {summary: true, from: request.data.from, size: request.data.size}, callback);
});
