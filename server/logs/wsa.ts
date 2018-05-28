import * as es from '../es';
import * as logCommon from './common';
import config = require('../config');
import * as d3time from 'd3-time';
import * as util from '../../common/util';

import { WsaLogEntry } from '../../common/logtemplates';
import * as logColumns from '../../common/logcolumns';

const WSA_INDEX_ALIAS = 'wsalog';
const WSA_TYPE = 'wsalog';

export const WSALOG_TEMPLATE = {
  template: 'wsalog-*',
  settings: {
    'index.codec': 'best_compression',
    'index.refresh_interval': '5s',

    'index.number_of_shards': config.number_of_shards,

    // Common analyzer
    analysis: es.COMMON_ANALYSIS,
  },
  mappings: {
    'wsalog': {
      include_in_all: false,
      dynamic: false,
      properties: {
        log: logCommon.LOG_COMMON,
        wsa: {
          properties: {
            elapsedTime: {
              type: 'integer',
            },
            transactionResult: {
              type: 'keyword',
            },
            upstreamConnection: {
              type: 'keyword',
            },
            upstreamServer: {
              type: 'keyword',
            },
            urlCategory: {
              type: 'keyword',
            },
            aclDecision: {
              type: 'keyword',
            },
            aclDecisionBase: {      // Part of the ACL decision before the first underscore
              type: 'keyword',
            },
            avgBandwidthKbps: { type: 'float', index: false, doc_values: true },
            bandwidthThrottled: { type: 'boolean' },
            request: {
              properties: {
                httpMethod: { type: 'keyword' },
                clientIp: { type: 'ip', copy_to: ['log.source.ip', 'log.all.ip'] },
                url: { type: 'text', fields: { raw: { type: 'keyword' } } },
                username: { type: 'text', fields: { raw: { type: 'keyword' } } },
                samName: { type: 'keyword', copy_to: ['log.source.samName', 'log.all.samName'] },
                urlCategory: { type: 'keyword' },
                outboundMalwareVerdict: { type: 'keyword' },
                outboundMalwareThreatName: { type: 'keyword' },
                size: { type: 'long' },
              }
            },
            response: {
              properties: {
                httpResponseCode: { type: 'short' },
                size: { type: 'long' },
                mimeType: { type: 'keyword' },
                urlCategory: { type: 'keyword' },
                malwareCategory: { type: 'keyword' },
                sha256Hash: { type: 'keyword' },
              }
            },
            verdict: {
              properties: {
                webReputationScore: { type: 'float' },
                ciscoDataSecurity: { type: 'keyword' },
                externalDlp: { type: 'keyword' },
                reputationThreatType: { type: 'keyword' },
                safeSearch: { type: 'keyword' },
                webroot: {
                  properties: {
                    verdict: { type: 'keyword' },
                  }
                },
                mcafee: {
                  properties: {
                    verdict: { type: 'keyword' },
                    virusType: { type: 'keyword' },
                    virusName: { type: 'keyword' },
                  }
                },
                sophos: {
                  properties: {
                    verdict: { type: 'keyword' },
                    virusName: { type: 'keyword' },
                  }
                },
                avc: {
                  properties: {
                    appName: { type: 'keyword' },
                    appType: { type: 'keyword' },
                    appBehavior: { type: 'keyword' },
                  }
                },
                amp: {
                  properties: {
                    verdict: { type: 'keyword' },
                    threatName: { type: 'keyword' },
                    reputationScore: { type: 'half_float' },
                    uploaded: { type: 'boolean' },
                    filename: { type: 'keyword' },
                  }
                },
              }
            },
            policies: {
              properties: {
                decision: { type: 'keyword' },
                identity: { type: 'keyword' },
                outboundMalware: { type: 'keyword' },
                dataSecurity: { type: 'keyword' },
                externalDlp: { type: 'keyword' },
                routingPolicy: { type: 'keyword' },
              }
            }

          } // end wsa
        }
      }
    }
  },
  aliases: {
    'wsalog': {},
  }
};

export function findWsaLogByLocator(locator: string, callback: (err: any, results?: logCommon.DocumentID[]) => void) {
  var splitLocator = locator.split('-');

  if(splitLocator.length !== 2) {
    return callback(new logCommon.LogError(`Invalid locator ${locator}.`, 'invalid-locator'));
  }

  var date = logCommon.base64ToNumber(splitLocator[0]);

  es.client.search<WsaLogEntry>({
    index: WSA_INDEX_ALIAS,
    type: WSA_TYPE,
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

export function getWsaLogEntry(index: string, id: string, callback: (err: any, result: es.GetResponse<WsaLogEntry>) => void) {
  return es.client.get({ index: index, type: WSA_TYPE, id: id }, callback);
}


function createWsaQuery(terms: util.QueryTerm[], startTime: Date, endTime: Date, domainSet: string[]) {
  const result: any = {
    bool: {
      filter: [
        // First, a broader range query that can be cached
        {
          range: {
            'log.eventTime': {
              gte: d3time.timeHour.floor(startTime),
              lt: d3time.timeHour.ceil(endTime),
            }
          }
        },

        // And now a more specific time range (see https://www.elastic.co/guide/en/elasticsearch/guide/current/_filter_order.html)
        // We do floor/ceil to avoid the graph being misinterpreted at the endpoints (bars with partial data)
        {
          range: {
            'log.eventTime': {
              gte: d3time.timeMinute.floor(startTime),
              lt: d3time.timeMinute.ceil(endTime),
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
    'wsa.request.url',
  ];

  let filtered = { must: result.bool.filter, must_not: result.bool.must_not, should: result.bool.should };
  let scored = { must: result.bool.must, must_not: result.bool.must_not, should: result.bool.should };

  // Collection of all terms sitting by themselves so they can be queried together
  const lonelyShouldTerms: string[] = [];

  function makeTerms(terms: string | string[], options: { type?: 'phrase', noFuzzies?: boolean } = {}) {
    options = options || {};

    if(!Array.isArray(terms))
      terms = [terms];

    domainSet.push(...terms);

    const result: any[] = [
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

    result.push({
      terms: {
        'log.target.fqdnBreakdown': terms,
      },
    });

    return { bool: { should: result } };
  }

  terms.forEach(function(term) {
    const column = logColumns.wsaColumnsByName.get(term.type);

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
    else if(term.type === 'method') {
      // Do exact matches using 'term'
      let query = { term: { 'wsa.request.httpMethod': term.term.toUpperCase() } };
      filtered[term.req].push(query);
    }
    else if(term.type === 'aclDecision') {
      // Do exact matches using 'term'
      let query = { term: { 'wsa.aclDecision': term.term.toUpperCase() } };
      filtered[term.req].push(query);
    }
    else if(term.type === 'domain') {
      // Do exact matches using 'term'
      let query = { term: { 'log.target.fqdnBreakdown': term.term.toLowerCase() } };
      filtered[term.req].push(query);
    }
    else if(term.type === 'exists') {
      const existsColumn = logColumns.syslogColumnsByName.get(term.term);

      if(existsColumn)
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
      let query = { term: { [`wsa.${term.type}`]: term.term } };

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

export function searchWsaLogs(query: logCommon.SearchQuery, callback: (err: any, results?: es.SearchResponse<WsaLogEntry>) => void) {
  const startTime = util.createRelativeDate(query.start, false);

  if(!startTime)
    return callback(new logCommon.LogError('Invalid start date for the query.', 'invalid-start-date'));

  const endTime = util.createRelativeDate(query.end, true);

  if(!endTime)
    return callback(new logCommon.LogError('Invalid end date for the query.', 'invalid-end-date'));

  const domainSetParam: string[] = [];
  const esQuery = createWsaQuery(util.parseQueryTerms(query.q), startTime, endTime, domainSetParam);
  const sortColumn = logColumns.wsaColumnsByName.get(query.sortProp);

  const domainSet = new Set(domainSetParam);

  return es.client.search<WsaLogEntry>({
    index: WSA_INDEX_ALIAS,
    type: WSA_TYPE,
    body: {
      query: esQuery,
      sort: [{[sortColumn && sortColumn.sortField || 'log.receivedTime']: query.sortOrder || 'desc'}],
      size: query.size,
      from: query.from,
      highlight: {
        pre_tags: ["<highlight>"],
        post_tags: ["</highlight>"],
        fields: {
          'wsa.request.url': { number_of_fragments: 0 }
        }
      },
    }
  }, (err, resp) => {
    if(err)
      return callback(err);

    resp.hits.hits.forEach(hit => {
      const baseUrl: string = hit.highlight && hit.highlight['wsa.request.url'][0] || hit._source.wsa.request.url;

      // Try to grab the domain
      hit.url = baseUrl.replace(/(^[a-z]+:\/\/)([^:/]+)(:[0-9]+)?(\/)/, (match, p1, p2, p3, p4) => {
        const domainPieces = p2.split('.');

        for(let i = 0; i < domainPieces.length; i++) {
          const checkPiece = domainPieces.slice(i).join('.');

          if(domainSet.has(checkPiece))
            return p1 + domainPieces.slice(0, i).join('.') + '.' + '<highlight>' + checkPiece + '</highlight>' + (p3 || '') + p4;
        }

        return match;
      });
    });

    return callback(null, resp);
  });
}
