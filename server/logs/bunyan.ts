import * as es from '../es';
import * as logCommon from './common';
import config = require('../config');
import * as d3time from 'd3-time';
import * as util from '../../common/util';

import { BunyanLogEntry } from '../../common/logtemplates';
import * as logColumns from '../../common/logcolumns';

const BUNYAN_INDEX_ALIAS = 'bunyan';
const BUNYAN_TYPE = 'bunyan';

export const BUNYAN_TEMPLATE: any = {
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

export function findBunyanByLocator(locator: string, callback: (err: any, results?: util.DocumentID[]) => void) {
  var splitLocator = locator.split('-');

  if(splitLocator.length !== 2) {
    return callback(new logCommon.LogError(`Invalid locator ${locator}.`, 'invalid-locator'));
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

export function getBunyanEntry(index: string, id: string, callback: (err: any, response: es.GetResponse<BunyanLogEntry>) => void) {
  return es.client.get<BunyanLogEntry>({ index: index, type: BUNYAN_TYPE, id: id }, callback);
}
