import * as es from '../es';
import * as logCommon from './common';
import config = require('../config');
import * as d3time from 'd3-time';
import * as util from '../../common/util';

import { AppStatusLogEntry } from '../../common/logtemplates';
import * as logColumns from '../../common/logcolumns';

const APPSTATUS_INDEX_ALIAS = 'appstatus';
const APPSTATUS_TYPE = 'appstatus';

export const APPSTATUS_TEMPLATE: any = {
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
            processId: { type: 'integer' },
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

export function getRunningPrograms(callback: (err: any, results?: AppStatusLogEntry[]) => void) {
  return es.client.search<AppStatusLogEntry>({
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

    const resultMap = new Map<string, AppStatusLogEntry>();

    for(let hit of result.hits.hits) {
      const time = util.asDate(hit._source.log.eventTime);

      if(!time)
        continue;

      const key = `${hit._source.log.source && hit._source.log.source.hostname}\0${hit._source.status.processId}\0${hit._source.status.program}`;

      let oldEntry = resultMap.get(key);

      if(!oldEntry) {
        resultMap.set(key, hit._source);
      }
      else {
        const oldTime = util.asDate(oldEntry.log.eventTime)!;

        if(time > oldTime)
          resultMap.set(key, hit._source);
      }
    }

    return callback(err, Array.from(resultMap.values()));
  });
}
