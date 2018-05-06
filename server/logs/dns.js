'use strict';

const es = require('../es');
const logCommon = require('./common');
const config = require('../config');
const d3 = require('d3');
const util = require('../../common/util');
const logColumns = require('../../common/logcolumns');

const DNS_INDEX_ALIAS = 'dns';
const DNS_TYPE = 'dns';

const DNS_TEMPLATE = {
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


module.exports.DNS_TEMPLATE = DNS_TEMPLATE;
