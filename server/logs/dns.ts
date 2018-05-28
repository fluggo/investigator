import * as es from '../es';
import * as logCommon from './common';
import config = require('../config');
import * as d3time from 'd3-time';
import * as util from '../../common/util';

import * as logColumns from '../../common/logcolumns';

const DNS_INDEX_ALIAS = 'dns';
const DNS_TYPE = 'dns';

export const DNS_TEMPLATE: any = {
  template: 'dns-*',
  settings: {
    'index.codec': 'best_compression',
    'index.refresh_interval': '30s',

    'index.number_of_shards': config.number_of_shards,

    // Common analyzer
    analysis: es.COMMON_ANALYSIS,
  },
  mappings: {
    [DNS_TYPE]: {
      include_in_all: false,
      dynamic: false,
      properties: {
        log: logCommon.LOG_COMMON,
        dns: {
          properties: {
            opcode: { type: 'keyword' },
            responseCode: { type: 'keyword' },

            flags: {
              properties: {
                authoritative: { type: 'boolean' },
                truncated: { type: 'boolean' },
                recursionDesired: { type: 'boolean' },
                recursionAvailable: { type: 'boolean' },
              }
            },

            questionType: { type: 'keyword' },
            topDomain: { type: 'keyword' },
            secondaryDomain: { type: 'keyword' },
          } // end dns
        }
      }
    }
  },
  aliases: {
    [DNS_INDEX_ALIAS]: {},
  }
};
