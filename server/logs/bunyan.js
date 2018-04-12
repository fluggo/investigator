'use strict';

const es = require('../es.js');
const logCommon = require('./common.js');
const config = require('../config.js');

const BUNYAN_INDEX_ALIAS = 'bunyan';
const BUNYAN_TYPE = 'bunyan';

const BUNYAN_TEMPLATE = {
  template: 'bunyan-*',
  settings: {
    'index.codec': 'best_compression',
    //'index.refresh_interval': '30s',

    'index.number_of_shards': config.number_of_shards,

    // Common analyzer
    analysis: es.COMMON_ANALYSIS,
  },
  mappings: {
    "bunyan": {
      include_in_all: false,
      dynamic: false,
      properties: {
        log: logCommon.LOG_COMMON,
        bunyan: {
          properties: {
            pid: {
              type: 'integer',
            },
            module: {
              type: 'keyword',
            },
            level: {
              type: 'byte',
            },
            interest: {
              type: 'byte',
            },
            msg: {
              type: 'text',
            },
            err: {
              properties: {
                name: {
                  type: 'keyword',
                },
                message: {
                  type: 'text',
                },
                stack: {
                  type: 'text',
                }
              }
            },
          }
        }
      }
    }
  },
  aliases: {
    'bunyan': {}
  }
};

function findBunyanByLocator(locator, callback) {
  var splitLocator = locator.split('-');

  if(splitLocator.length !== 2) {
    return callback(new LogError(`Invalid locator ${locator}.`, 'invalid-locator'));
  }

  var date = logCommon.base64ToNumber(splitLocator[0]);

  es.client.search({
    index: BUNYAN_INDEX_ALIAS,
    type: BUNYAN_TYPE,
    requestCache: false,
    trackScores: false,
    body: {
      query: {
        bool: {
          filter: [
            { term: { 'log.receivedTime': new Date(date) } },
            { term: { 'log.recordFinder': splitLocator[1] } }
          ]
        }
      }
    },
    _source: false,
  }, function(err, result) {
    if(err)
      return callback(err);

    return callback(null, result.hits.hits.map(hit => { return {index: hit._index, id: hit._id}; }));
  });
}

function getBunyanEntry(index, id, callback) {
  return es.client.get({ index: index, type: BUNYAN_TYPE, id: id }, callback);
}

module.exports.BUNYAN_TEMPLATE = BUNYAN_TEMPLATE;
module.exports.findBunyanByLocator = findBunyanByLocator;
module.exports.getBunyanEntry = getBunyanEntry;
