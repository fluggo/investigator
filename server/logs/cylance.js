'use strict';

const es = require('../es.js');
const logCommon = require('./common.js');
const config = require('../config.js');
const d3 = require('d3');
const util = require('../../common/util.js');
const logColumns = require('../../common/logcolumns.js');

const CYLANCE_INDEX_ALIAS = 'cylancelog';
const CYLANCE_TYPE = 'cylancelog';

const CYLANCE_TEMPLATE = {
  template: 'cylancelog-*',
  settings: {
    'index.codec': 'best_compression',
    'index.refresh_interval': '1s',

    'index.number_of_shards': config.number_of_shards,

    // Common analyzer
    analysis: es.COMMON_ANALYSIS,
  },
  mappings: {
    [CYLANCE_TYPE]: {
      include_in_all: false,
      dynamic: false,
      properties: {
        log: logCommon.LOG_COMMON,
        cylance: {
          properties: {
            eventType: {
              type: 'keyword',
            },
            eventName: {
              type: 'keyword',
            },

            // Device system security
            device: {
              type: 'keyword',
            },
            agentVersion: {
              type: 'keyword',
            },
            ip: {
              type: 'ip',
            },
            mac: {
              type: 'keyword',
            },
            samName: {
              type: 'keyword',
            },
            message: {
              type: 'text',
            },

            // Exploit attempt
            processId: {
              type: 'integer',
            },
            processName: {
              type: 'text',
              fields: {
                raw: {
                  type: 'keyword',
                },
              },
            },
            os: {
              type: 'text',
              fields: {
                raw: {
                  type: 'keyword',
                },
              },
            },
            loginName: { type: 'keyword' },
            violationType: { type: 'keyword' },
            zone: { type: 'keyword' },

            // Threat
            fileName: {
              type: 'text',
              fields: {
                simple: {
                  type: 'text',
                  analyzer: 'simple',
                },
                raw: {
                  type: 'keyword',
                },
              }
            },
            fullPath: {
              type: 'text',
              fields: {
                simple: {
                  type: 'text',
                  analyzer: 'simple',
                },
                raw: {
                  type: 'keyword',
                },
              },
            },
            driveType: { type: 'keyword' },
            sha256: { type: 'keyword' },
            md5: { type: 'keyword' },
            status: { type: 'keyword' },
            cylanceScore: { type: 'float' },
            fileType: { type: 'keyword' },
            isRunning: { type: 'boolean' },
            autoRun: { type: 'boolean' },
            detectedBy: { type: 'keyword' },
            threatClass: { type: 'keyword' },
            threatSubClass: { type: 'keyword' },

            policy: { type: 'keyword' },
            category: { type: 'keyword' },
            userName: { type: 'keyword' },
            userEmail: { type: 'keyword' },
            reason: { type: 'keyword' },
            auditMessage: { type: 'text' },

            externalDevice: {
              properties: {
                type: { type: 'keyword' },
                vendorId: { type: 'keyword' },
                name: {
                  type: 'text',
                  fields: {
                    simple: {
                      type: 'text',
                      analyzer: 'simple',
                    },
                    raw: {
                      type: 'keyword',
                    },
                  },
                },
                productId: { type: 'keyword' },
                serialNumber: { type: 'keyword' },
              }
            },

          } // end cylance
        }
      }
    }
  },
  aliases: {
    [CYLANCE_INDEX_ALIAS]: {},
  }
};

function findCylanceLogByLocator(locator, callback) {
  var splitLocator = locator.split('-');

  if(splitLocator.length !== 2) {
    return callback(new LogError(`Invalid locator ${locator}.`, 'invalid-locator'));
  }

  var date = logCommon.base64ToNumber(splitLocator[0]);

  es.client.search({
    index: CYLANCE_INDEX_ALIAS,
    type: CYLANCE_TYPE,
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

function getCylanceLogEntry(index, id, callback) {
  return es.client.get({ index: index, type: CYLANCE_TYPE, id: id }, callback);
}


function createCylanceQuery(terms, options, startTime, endTime, domainSet) {
  options = options || {};

  if(!endTime)
    endTime = new Date();

  const result = {
    bool: {
      filter: [
        // First, a broader range query that can be cached
        {
          range: {
            'log.eventTime': {
              gte: d3.timeHour.floor(startTime),
              lt: d3.timeHour.ceil(endTime),
            }
          }
        },

        // And now a more specific time range (see https://www.elastic.co/guide/en/elasticsearch/guide/current/_filter_order.html)
        // We do floor/ceil to avoid the graph being misinterpreted at the endpoints (bars with partial data)
        {
          range: {
            'log.eventTime': {
              gte: startTime,
              lt: endTime,
            }
          }
        },
      ],
      must: [],
      should: [],
      must_not: [],
      minimum_should_match: '1<75%',
    }
  };

/*  if(reportingIp) {
    // The reporting IP filter should go second, because it, too, can be cached
    result.bool.filter.splice(1, 0, { term: { reporting_ip: reportingIp } });
  }*/

  const BODY_SEARCH_LIST = [
    'cylance.message',
  ];

  let filtered = { must: result.bool.filter, must_not: result.bool.must_not, should: result.bool.should };
  let scored = { must: result.bool.must, must_not: result.bool.must_not, should: result.bool.should };

  // Collection of all terms sitting by themselves so they can be queried together
  let lonelyShouldTerms = [];

  function makeTerms(terms, options) {
    options = options || {};

    if(!Array.isArray(terms))
      terms = [terms];

    domainSet.push(...terms);

    const result = [
      {
        multi_match: {
          query: terms.join(' '),
          type: options.type || 'most_fields',
          fields: BODY_SEARCH_LIST,
          boost: 2,
        },
      },
    ];

    if(options.type !== 'phrase' && !options.noFuzzies) {
      result.push({
        multi_match: {
          query: terms.join(' '),
          type: options.type || 'most_fields',
          fuzziness: 'AUTO',
          fields: BODY_SEARCH_LIST,
          boost: 0.25,
        },
      });
    }

    return { bool: { should: result } };
  }

  terms.forEach(function(term) {
    const column = logColumns.cylanceColumnsByName.get(term.type);

    if(term.type === 'term') {
      if(term.term === '*') {
        filtered[term.req].push({ match_all: {} });
      }
      else if(term.req === 'should') {
        // Elasticsearch will do smarter things if these are submitted together
        lonelyShouldTerms.push(term.term);
      }
      else if(term.req === 'must') {
        result.bool.must.push(makeTerms(term.term, {noFuzzies: true}));

      }
      else if(term.req === 'must_not') {
        result.bool.must_not.push(makeTerms(term.term, {noFuzzies: true}));
      }
    }
    else if(term.type === 'phrase') {
      // Do a phrase multi-match
      let queries = makeTerms(term.term, {type: 'phrase'});
      scored[term.req].push(queries);
    }
    else if(term.type === 'tag') {
      // Do exact matches using 'term'
      let query = { term: { 'log.tag': term.term } };
      filtered[term.req].push(query);
    }
    else if(term.type === 'exists') {
      const existsColumn = logColumns.cylanceColumnsByName.get(term.term);
      filtered[term.req].push({ exists: { field: existsColumn.field } });
    }
    else if(column) {
      const esterm = column.toEsTerm(term.term);

      if(esterm !== undefined) {
        const query = { term: { [column.field]: esterm } };
        filtered[term.req].push(query);
      }
    }
    else {
      let query = { term: { [`cylance.${term.type}`]: term.term } };

      if(!query)
        return;

      filtered[term.req].push(query);
    }
  });

  if(lonelyShouldTerms.length !== 0) {
    result.bool.should.push(makeTerms(lonelyShouldTerms));
  }

  return result;
}

function searchCylanceLogs(query, callback) {
  var startTime = util.createRelativeDate(query.start, false);
  var endTime = util.createRelativeDate(query.end, true);
  const parseQueryTerms = require('../wiki/util.js').parseQueryTerms;
  let domainSet = [];
  const esQuery = createCylanceQuery(parseQueryTerms(query.q), {}, startTime, endTime, domainSet);
  const sortColumn = logColumns.cylanceColumnsByName.get(query.sortProp);

  domainSet = new Set(domainSet);

  return es.client.search({
    index: CYLANCE_INDEX_ALIAS,
    type: CYLANCE_TYPE,
    body: {
      query: esQuery,
      sort: [{[sortColumn && sortColumn.sortField || 'log.receivedTime']: query.sortOrder || 'desc'}],
      size: query.size,
      from: query.from,
      highlight: {
        pre_tags: ["<highlight>"],
        post_tags: ["</highlight>"],
        fields: {
          'cylance.message': { number_of_fragments: 0 }
        }
      },
    }
  }, (err, resp) => {
    if(err)
      return callback(err);

    return callback(null, resp);
  });
}


module.exports.CYLANCE_TEMPLATE = CYLANCE_TEMPLATE;
module.exports.findCylanceLogByLocator = findCylanceLogByLocator;
module.exports.getCylanceLogEntry = getCylanceLogEntry;
module.exports.searchCylanceLogs = searchCylanceLogs;
