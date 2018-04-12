'use strict';

const async = require('async');
const es = require('../es.js');
const mapping = require('./mapping.js');

const CYLANCE_READ_ALIAS = 'cylance';
const CYLANCE_DEVICE = mapping.CYLANCE_DEVICE;
const SUMMARY_FIELDS = ['device.name', 'device.agentVersion', 'device.lastReportedUser', 'device.online',
  'device.online', 'device.onlineDate', 'device.offlineDate'];

const DEVICE_ID_TAG = 'cylance-device';

function getDevicesById(ids, options, callback) {
  // options is {} with:
  // * summary: true to only get the LDAP summary fields and not the whole thing

  options = options || {};

  if(!Array.isArray(ids))
    ids = [ids];

  if(ids.length === 0)
    return callback(null, []);

  return es.client.mget({
    index: CYLANCE_READ_ALIAS,
    type: CYLANCE_DEVICE,
    _source: options.summary ? SUMMARY_FIELDS : true,
    body: { ids: ids }
  }, (err, devices) => {
    if(err)
      return callback(err);

    return callback(null, devices.docs.filter(obj => obj.found));
  });
}

function deviceStringSearch(q, options, callback) {
  /*
    q: the query string

    options: {}
    * from, size: from and size for search
    * all: get all results
    * summary: true for summary fields only
    * idOnly: return only the objectGUIDs
    * correlationOnly: return only correlation-eligible objects (currently users/computers)
  */

  let query = {
    query_string: {
      query: q,
      fields: [
        'common.name^2', 'common.email',
        'common.samName', 'common.samName.simple',
        'common.upn', 'common.upn.simple',
        'common.content'
      ],
    }
  };

  if(options.correlationOnly) {
    // Filter for users only (this includes computers)
/*    query = {
      bool: {
        must: [query],
        filter: [
          { term: { 'ldap.objectClass': 'user' } }
        ]
      }
    }*/
  };

  let body = {
    query: query,
    _source: options.idOnly ? 'device.serialNumber' : (options.summary ? SUMMARY_FIELDS : true),
  };

  if(options.all) {
    es.getAllEntries({
      index: CYLANCE_READ_ALIAS,
      type: CYLANCE_DEVICE,
      body: body
    }, (err, resp) => {
      if(err)
        return callback(err);

      if(options.idOnly) {
        resp = resp.map(obj => obj._source.device.serialNumber);
      }

      return callback(null, resp);
    });
  }
  else {
    body.from = options.from;
    body.size = options.size;

    return es.client.search({
      index: CYLANCE_READ_ALIAS,
      type: CYLANCE_DEVICE,
      body: body
    }, callback);
  }
}

module.exports.deviceStringSearch = deviceStringSearch;
module.exports.getDevicesById = getDevicesById;
module.exports.DEVICE_ID_TAG = DEVICE_ID_TAG;
