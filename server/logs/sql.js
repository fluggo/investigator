'use strict';

const es = require('../es.js');
const logCommon = require('./common.js');
const config = require('../config.js');
const d3 = require('d3');
const util = require('../../common/util.js');
const logColumns = require('../../common/logcolumns.js');

const SQL_INDEX_ALIAS = 'sqllog';
const SQL_TYPE = 'sqllog';

const SQLLOG_TEMPLATE = {
  template: 'sqllog-*',
  settings: {
    'index.codec': 'best_compression',
    'index.refresh_interval': '10s',

    'index.number_of_shards': config.number_of_shards,

    // Common analyzer
    analysis: es.COMMON_ANALYSIS,
  },
  mappings: {
    [SQL_TYPE]: {
      include_in_all: false,
      dynamic: false,
      properties: {
        log: logCommon.LOG_COMMON,
        sql: {
          properties: {
            TSQLCommand: {
              type: 'text',
              analyzer: 'code_keyword',
            },
            TextData: {
              type: 'text',
              analyzer: 'code_keyword',
            },
            EventType: { type: 'keyword' },
            DatabaseName: { type: 'keyword' },
            DBUserName: { type: 'keyword' },
            NTUserName: { type: 'keyword' },
            NTDomainName: { type: 'keyword' },
            HostName: { type: 'keyword' },
            ApplicationName: { type: 'keyword' },
            LoginName: { type: 'keyword' },
            ServerName: { type: 'keyword' },
            DatabaseName: { type: 'keyword' },
            SessionLoginName: { type: 'keyword' },
            SchemaName: { type: 'keyword' },
            ObjectName: { type: 'keyword' },
            ObjectType: { type: 'keyword' },
            OwnerName: { type: 'keyword' },
            AlterTableActionList: { type: 'keyword' },
            TargetObjectType: { type: 'keyword' },
            OwnerName: { type: 'keyword' },
            Parameters: { type: 'keyword' },
            DefaultSchema: { type: 'keyword' },
            PropertyName: { type: 'keyword' },
            PropertyValue: { type: 'keyword' },
            TargetObjectName: { type: 'keyword' },
            TargetLoginName: { type: 'keyword' },
            SessionLoginName: { type: 'keyword' },
            SID: { type: 'keyword' },
            LoginSid: { type: 'keyword' },
            TargetLoginSid: { type: 'keyword' },
            IsSystem: { type: 'boolean' },
            Success: { type: 'boolean' },

            DatabaseID: { type: 'integer' },
            RequestID: { type: 'integer' },
            GroupID: { type: 'integer' },
            Error: { type: 'integer' },
            Severity: { type: 'integer' },
            SPID: { type: 'integer' },
            State: { type: 'integer' },
            ClientProcessID: { type: 'integer' },
            Duration: { type: 'long' },
            EventClass: { type: 'integer' },
            EventSubClass: { type: 'integer' },

            StartTime: {
              format: 'dateOptionalTime',
              type: 'date'
            },
            EndTime: {
              format: 'dateOptionalTime',
              type: 'date'
            },

          } // end sql
        }
      }
    }
  },
  aliases: {
    'sqllog': {},
  }
};

function findSqlLogByLocator(locator, callback) {
  var splitLocator = locator.split('-');

  if(splitLocator.length !== 2) {
    return callback(new LogError(`Invalid locator ${locator}.`, 'invalid-locator'));
  }

  var date = logCommon.base64ToNumber(splitLocator[0]);

  es.client.search({
    index: SQL_INDEX_ALIAS,
    type: SQL_TYPE,
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

function getSqlLogEntry(index, id, callback) {
  return es.client.get({ index: index, type: SQL_TYPE, id: id }, callback);
}


function createSqlQuery(terms, options, startTime, endTime, domainSet) {
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
              gte: d3.timeMinute.floor(startTime),
              lt: d3.timeMinute.ceil(endTime),
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
    'sql.TSQLCommand',
    'sql.TextData',
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
    const column = logColumns.sqlColumnsByName.get(term.type);

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
      const existsColumn = logColumns.sqlColumnsByName.get(term.term);
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
      let query = { term: { [`sql.${term.type}`]: term.term } };

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

function searchSqlLogs(query, callback) {
  var startTime = util.createRelativeDate(query.start, false);
  var endTime = util.createRelativeDate(query.end, true);
  const parseQueryTerms = require('../wiki/util.js').parseQueryTerms;
  let domainSet = [];
  const esQuery = createSqlQuery(parseQueryTerms(query.q), {}, startTime, endTime, domainSet);
  const sortColumn = logColumns.sqlColumnsByName.get(query.sortProp);

  domainSet = new Set(domainSet);

  return es.client.search({
    index: SQL_INDEX_ALIAS,
    type: SQL_TYPE,
    body: {
      query: esQuery,
      sort: [{[sortColumn && sortColumn.sortField || 'log.receivedTime']: query.sortOrder || 'desc'}],
      size: query.size,
      from: query.from,
      highlight: {
        pre_tags: ["<highlight>"],
        post_tags: ["</highlight>"],
        fields: {
          'sql.TSQLCommand': { number_of_fragments: 0 }
        }
      },
    }
  }, (err, resp) => {
    if(err)
      return callback(err);

    resp.hits.hits.forEach(hit => {
      const tsql = hit.highlight && hit.highlight['sql.TSQLCommand'][0] || hit._source.sql.TSQLCommand;

      if(!tsql)
        return;

      // Try to grab the domain
      hit.tsql = tsql.replace(/(^[a-z]+:\/\/)([^:/]+)(:[0-9]+)?(\/)/, (match, p1, p2, p3, p4) => {
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


module.exports.SQLLOG_TEMPLATE = SQLLOG_TEMPLATE;
module.exports.findSqlLogByLocator = findSqlLogByLocator;
module.exports.getSqlLogEntry = getSqlLogEntry;
module.exports.searchSqlLogs = searchSqlLogs;
