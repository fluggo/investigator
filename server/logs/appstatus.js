'use strict';

const es = require('../es');
const logCommon = require('./common');
const config = require('../config');

const APPSTATUS_INDEX_ALIAS = 'appstatus';
const APPSTATUS_TYPE = 'appstatus';

const APPSTATUS_TEMPLATE = {
  template: 'appstatus-*',
  settings: {
    'index.codec': 'best_compression',
    //'index.refresh_interval': '30s',

    'index.number_of_shards': config.number_of_shards,

    // Common analyzer
    analysis: es.COMMON_ANALYSIS,
  },
  mappings: {
    [APPSTATUS_TYPE]: {
      include_in_all: false,
      dynamic: false,
      properties: {
        log: logCommon.LOG_COMMON,
        status: {
          properties: {
            processVersion: { type: 'keyword' },
            processStatus: { type: 'keyword' },
            program: { type: 'keyword' },
            processStartTime: {
              format: 'dateOptionalTime',
              type: 'date'
            },
            processBuildTime: {
              format: 'dateOptionalTime',
              type: 'date'
            },
          },
        },
      },
    }
  },
  aliases: {
    'appstatus': {}
  }
};

function getRunningPrograms(callback) {
  return es.client.search({
    index: APPSTATUS_INDEX_ALIAS,
    type: APPSTATUS_TYPE,
    body: {
      from: 0,
      size: 1000,
      sort: [{ 'log.receivedTime': 'desc' }],
      query: {
        bool: {
          filter: {
            range: {
              'log.receivedTime': { gte: 'now-80s' }
            }
          }
        }
      }
    }
  }, (err, result) => {
    if(err)
      return callback(err);

    const resultMap = new Map();

    for(let hit of result.hits.hits) {
      const time = new Date(hit._source.log.eventTime);
      const key = `${hit._source.log.source.hostname}\0${hit._source.status.processId}\0${hit._source.status.program}`;

      let oldEntry = resultMap.get(key);

      if(!oldEntry) {
        resultMap.set(key, hit._source);
      }
      else {
        const oldTime = new Date(oldEntry.log.eventTime);

        if(time > oldTime)
          resultMap.set(key, hit._source);
      }
    }

    return callback(err, Array.from(resultMap.values()));
  });
}

module.exports.APPSTATUS_TEMPLATE = APPSTATUS_TEMPLATE;
module.exports.getRunningPrograms = getRunningPrograms;
