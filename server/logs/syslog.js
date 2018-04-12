'use strict';

const es = require('../es.js');
const logCommon = require('./common.js');
const config = require('../config.js');
const d3 = require('d3');
const util = require('../../common/util.js');
const logColumns = require('../../common/logcolumns.js');

const SYSLOG_INDEX_ALIAS = 'raw-syslog';
const SYSLOG_TYPE = 'raw-syslog';

const RAW_SYSLOG_TEMPLATE = {
  template: 'raw-syslog-*',
  settings: {
    //'index.codec': 'best_compression',
    'index.refresh_interval': '10s',

    'index.number_of_shards': config.number_of_shards,

    // Common analyzer
    analysis: es.COMMON_ANALYSIS,
  },
  mappings: {
    [SYSLOG_TYPE]: {
      include_in_all: false,
      dynamic: false,
      properties: {
        log: logCommon.LOG_COMMON,
      }
    }
  },
  aliases: {
    [SYSLOG_INDEX_ALIAS]: {},
  }
};

function createSyslogQuery(terms, options, startTime, endTime) {
  options = options || {};

  if(!endTime)
    endTime = new Date();

  const result = {
    bool: {
      filter: [
        // First, a broader range query that can be cached
        {
          range: {
            'log.receivedTime': {
              gte: d3.timeHour.floor(startTime),
              lt: d3.timeHour.ceil(endTime),
            }
          }
        },

        // And now a more specific time range (see https://www.elastic.co/guide/en/elasticsearch/guide/current/_filter_order.html)
        // We do floor/ceil to avoid the graph being misinterpreted at the endpoints (bars with partial data)
        {
          range: {
            'log.receivedTime': {
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
    'log.message',
  ];

  let filtered = { must: result.bool.filter, must_not: result.bool.must_not, should: result.bool.should };
  let scored = { must: result.bool.must, must_not: result.bool.must_not, should: result.bool.should };

  // Collection of all terms sitting by themselves so they can be queried together
  let lonelyShouldTerms = [];

  function makeTerms(terms, options) {
    options = options || {};

    if(!Array.isArray(terms))
      terms = [terms];

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
    const column = logColumns.syslogColumnsByName.get(term.type);

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
      const existsColumn = logColumns.syslogColumnsByName.get(term.term);
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

function searchSyslogLogs(query, callback) {
  var startTime = util.createRelativeDate(query.start, false);
  var endTime = util.createRelativeDate(query.end, true);
  const parseQueryTerms = require('../wiki/util.js').parseQueryTerms;
  const esQuery = createSyslogQuery(parseQueryTerms(query.q), {}, startTime, endTime);
  const sortColumn = logColumns.syslogColumnsByName.get(query.sortProp);

  return es.client.search({
    index: 'raw-syslog',
    type: 'raw-syslog',
    body: {
      query: esQuery,
      sort: [{[sortColumn && sortColumn.sortField || 'log.receivedTime']: query.sortOrder || 'desc'}],
      size: query.size,
      from: query.from,
      highlight: {
        pre_tags: ["<highlight>"],
        post_tags: ["</highlight>"],
        fields: {
          'log.message': { number_of_fragments: 0 }
        }
      },
    }
  }, (err, resp) => {
    if(err)
      return callback(err);

    return callback(null, resp);
  });
}

module.exports.RAW_SYSLOG_TEMPLATE = RAW_SYSLOG_TEMPLATE;
module.exports.searchSyslogLogs = searchSyslogLogs;
