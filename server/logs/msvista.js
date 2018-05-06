'use strict';

const es = require('../es');
const logCommon = require('./common');
const config = require('../config');
const d3 = require('d3');
const util = require('../../common/util');
const logColumns = require('../../common/logcolumns');
const async = require('async');

const MSVISTA_INDEX_ALIAS = 'msvistalog';
const MSVISTA_TYPE = 'msvistalog';

const MSVISTALOG_TEMPLATE = {
  template: 'msvistalog-*',
  settings: {
    'index.codec': 'best_compression',

    'index.number_of_shards': config.number_of_shards,

    'index.refresh_interval': '10s',

    // Common analyzer
    analysis: es.COMMON_ANALYSIS,
  },
  mappings: {
    msvistalog: {
      include_in_all: false,
      dynamic: false,
      properties: {
        log: logCommon.LOG_COMMON,
        msvistalog: {
          properties: {
            system: {
              properties: {
                provider: {
                  properties: {
                    guid: { type: 'keyword' },    // GUID
                    eventSourceName: { type: 'keyword' },     // string
                  }
                },
                eventId: { type: 'integer' },
                eventType: { type: 'keyword' },   // e.g. AUDIT_FAILURE
                samName: { type: 'keyword' },   // Always uppercase
                severity: { type: 'byte' },
                severityName: { type: 'keyword' },
                version: { type: 'short', index: false },
                task: { type: 'integer' },
                taskName: { type: 'text', fields: { raw: { type: 'keyword' } } },
                opcode: { type: 'integer' },
                opcodeName: { type: 'keyword' },
                recordNumber: { type: 'integer', index: false },
                correlation: {
                  properties: {
                    activityId: { type: 'keyword' },    // GUID
                    relatedActivityId: { type: 'keyword' },   // GUID
                  }
                },
                execution: {
                  properties: {
                    processId: { type: 'integer' },   // unsignedInt, required
                    threadId: { type: 'integer' },    // unsignedInt, required
                  }
                },
                channel: { type: 'keyword' },
                computer: { type: 'keyword' },
              }
            },
            otherFields: { type: 'keyword' },
            unparsedFields: { type: 'keyword' },
            firewall: {
              properties: {
                direction: { type: 'keyword' },
                layer: { type: 'keyword' },
                application: { type: 'keyword' },
                layerRunTimeId: { type: 'integer' },
                filterRunTimeId: { type: 'integer' },

                // 4957
                ruleId: { type: 'keyword' },
                ruleName: { type: 'keyword' },
                ruleAttr: { type: 'keyword' },
                profile: { type: 'keyword' },

                // SIDs
                remoteUserId: { type: 'keyword', copy_to: 'log.all.sid' },
                remoteMachineId: { type: 'keyword', copy_to: 'log.all.sid' },
              }
            },
            logon: {
              properties: {
                // See https://www.ultimatewindowssecurity.com/securitylog/encyclopedia/event.aspx?eventID=4624
                //  Fields headed to common:
                //    SubjectUserSid, SubjectUserName, SubjectDomainName, SubjectLogonId
                //    TargetUserSid, TargetUserName, TargetDomainName, TargetLogonId
                //    IpAddress, IpPort -> source.ip, source.port
                logonType: { type: 'byte' },
                logonProcessName: { type: 'keyword' },
                authenticationPackageName: { type: 'keyword' },
                workstationName: { type: 'keyword' },
                logonGuid: { type: 'keyword' },
                keyLength: { type: 'integer' },
                processName: { type: 'keyword' },
                transmittedServices: { type: 'keyword' },
                lmPackageName: { type: 'keyword' },
                processId: { type: 'integer' },
                tokenElevationType: { type: 'keyword' },
                privilege: { type: 'keyword' },

                /*status: { type: 'keyword' },
                subStatus: { type: 'keyword' },*/
                statusCode: { type: 'long' },
                subStatusCode: { type: 'long' },

                impersonationLevel: { type: 'keyword' },

                // Event 4656
                objectServer: { type: 'keyword' },
                objectType: { type: 'keyword' },
                objectName: { type: 'keyword' },
                operationType: { type: 'keyword' },
                transactionId: { type: 'keyword' },
                accessList: { type: 'keyword' },
                propertyList: { type: 'keyword' },

                memberName: { type: 'text', analyzer: 'lowercase' },    // Distinguished name
                memberSid: { type: 'keyword', copy_to: 'log.all.sid' },

                shareName: { type: 'keyword' },
                ticketEncryptionType: { type: 'integer' },
              },
            },
            crypto: {
              properties: {
                keyName: { type: 'keyword' },
                keyType: { type: 'keyword' },
                providerName: { type: 'keyword' },
                algorithmName: { type: 'keyword' },
                module: { type: 'keyword' },
                returnCode: { type: 'long' },
                operation: { type: 'keyword' },
              }
            },
            service: {
              properties: {
                serviceName: { type: 'keyword' },
                state: { type: 'keyword' },
              }
            },
            networkPolicy: {
              properties: {
                proxyPolicyName: { type: 'keyword' },
                networkPolicyName: { type: 'keyword' },
                reasonCode: { type: 'integer' },
                loggingResult: { type: 'keyword' },
                reason: { type: 'keyword' },
                authenticationType: { type: 'keyword' },
                nasIpv4Address: { type: 'ip' },
                calledStationId: { type: 'ip' },
                callingStationId: { type: 'keyword' },
                nasIdentifier: { type: 'keyword' },
                nasPortType: { type: 'keyword' },
                clientName: { type: 'keyword' },
                clientIpAddress: { type: 'ip' },
                authenticationProvider: { type: 'keyword' },
                authenticationServer: { type: 'keyword' },
              }
            }
          }
        }
      }
    }
  },
  aliases: {
    'msvistalog': {},
  },
};

function getVistaLogEntry(index, id, callback) {
  return es.client.get({ index: index, type: MSVISTA_TYPE, id: id }, callback);
}

function getVistaLogEntriesByActivityId(id, callback) {
  return es.client.search({
    index: MSVISTA_INDEX_ALIAS,
    type: MSVISTA_TYPE,
    body: {
      query: {
        constant_score: {
          filter: {
            term: {
              'msvistalog.system.correlation.activityId': id
            }
          }
        }
      },
      sort: [{'log.receivedTime': 'asc'}],
      size: 10,
    }
  }, callback);
}

function createVistaQuery(terms, options, startTime, endTime) {
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

  const CATEGORY_SEARCH_LIST = [
    'msvistalog.category',
  ];

  const BODY_SEARCH_LIST = [
    'log.message',
  ];

  let filtered = { must: result.bool.filter, must_not: result.bool.must_not, should: result.bool.should };
  let scored = { must: result.bool.must, must_not: result.bool.must_not, should: result.bool.should };

  // Collection of all terms sitting by themselves so they can be queried together
  let lonelyShouldTerms = [];

  function makeTerms(terms, options) {
    options = options || {};

    const result = [
      {
        multi_match: {
          query: terms,
          type: options.type || 'most_fields',
          fields: BODY_SEARCH_LIST,
          boost: 2,
        },
      },
    ];

    if(options.type !== 'phrase') {
      result.push({
        multi_match: {
          query: terms,
          type: options.type || 'most_fields',
          fuzziness: 'AUTO',
          fields: BODY_SEARCH_LIST,
          boost: 0.25,
        },
      });
    }

    return result;
  }

  terms.forEach(function(term) {
    const column = logColumns.msvistaColumnsByName.get(term.type);

    if(term.type === 'term') {
      if(term.term === '*') {
        filtered[term.req].push({ match_all: {} });
      }
      else if(term.req === 'should') {
        // Elasticsearch will do smarter things if these are submitted together
        lonelyShouldTerms.push(term.term);
      }
      else if(term.req === 'must') {
        result.bool.must.push(...makeTerms(term.term));

      }
      else if(term.req === 'must_not') {
        result.bool.must_not.push({
          multi_match: {
            query: term.term,
            fields: BODY_SEARCH_LIST,
          }
        });
      }
    }
    else if(term.type === 'phrase') {
      // Do a phrase multi-match
      let queries = makeTerms(term.term, {type: 'phrase'});
      scored[term.req].push(...queries);
    }
    else if(term.type === 'type') {
      // Do exact matches using 'term'
      let query = { term: { 'msvistalog.system.eventType': term.term } };
      filtered[term.req].push(query);
    }
    else if(term.type === 'exists') {
      const existsColumn = logColumns.msvistaColumnsByName.get(term.term);
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
      let query = { term: { [`msvistalog.${term.type}`]: term.term } };

      if(!query)
        return;

      filtered[term.req].push(query);
    }
  });

  if(lonelyShouldTerms.length !== 0) {
    result.bool.should.push(...makeTerms(lonelyShouldTerms.join(' ')));
  }

  return result;
}

function searchVistaLogs(query, callback) {
  var startTime = util.createRelativeDate(query.start, false);
  var endTime = util.createRelativeDate(query.end, true);
  const parseQueryTerms = require('../wiki/util').parseQueryTerms;
  const esQuery = createVistaQuery(parseQueryTerms(query.q), {}, startTime, endTime);
  const sortColumn = logColumns.msvistaColumnsByName.get(query.sortProp);

  return es.client.search({
    index: MSVISTA_INDEX_ALIAS,
    type: MSVISTA_TYPE,
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
  }, callback);
}

function findVistaLogByLocator(locator, callback) {
  var splitLocator = locator.split('-');

  if(splitLocator.length !== 2) {
    return callback(new LogError(`Invalid locator ${locator}.`, 'invalid-locator'));
  }

  var date = logCommon.base64ToNumber(splitLocator[0]);

  es.client.search({
    index: MSVISTA_INDEX_ALIAS,
    type: MSVISTA_TYPE,
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

function getVistaLogStats(callback) {
  return async.parallel({
    lastDay: callback => es.client.search({
        index: MSVISTA_INDEX_ALIAS,
        type: MSVISTA_TYPE,
        body: {
          size: 0,
          query: {
            bool: {
              filter: { range: { 'log.eventTime': { gte: 'now-1d' } } },
            },
          },
          aggregations: {
            byComputer: {
              terms: { field: 'msvistalog.system.computer', size: 1000 },
              aggregations: {
                minEventTime: {
                  min: { field: 'log.eventTime' }
                },
                maxEventTime: {
                  max: { field: 'log.eventTime' }
                },
                minReceivedTime: {
                  min: { field: 'log.receivedTime' }
                },
                maxReceivedTime: {
                  max: { field: 'log.receivedTime' }
                },
              },
            },
          }
        }
      }, callback),
    statistical: callback => es.client.search({
        index: MSVISTA_INDEX_ALIAS,
        type: MSVISTA_TYPE,
        body: {
          size: 0,
          aggregations: {
            sample: {
              sampler: {
                shard_size: 5000,
              },
              aggregations: {
                byComputer: {
                  terms: { field: 'msvistalog.system.computer', size: 1000 },
                  aggregations: {
                    minEventTime: {
                      min: { field: 'log.eventTime' }
                    },
                    maxEventTime: {
                      max: { field: 'log.eventTime' }
                    },
                    minReceivedTime: {
                      min: { field: 'log.receivedTime' }
                    },
                    maxReceivedTime: {
                      max: { field: 'log.receivedTime' }
                    },
                  }
                }
              }
            },
          }
        }
      }, callback),
  }, callback);
}

function findAdminLogins(query, callback) {
  var startTime = util.createRelativeDate(query.start, false);
  var endTime = util.createRelativeDate(query.end, true);
  const wikiMap = require('../wiki/index-maint').getWikiMemoryMapSync();

  return es.client.search({
    index: MSVISTA_INDEX_ALIAS,
    type: MSVISTA_TYPE,
    body: {
      query: {
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

            { term: { 'msvistalog.system.eventId': 4672 } },

            { terms: { 'msvistalog.logon.privilege': ['SeTakeOwnershipPrivilege', 'SeTcbPrivilege', 'SeAssignPrimaryTokenPrivilege', 'SeCreateTokenPrivilege'] } },

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
          must_not: [
            { terms: { 'log.source.samName': ['NT AUTHORITY\\SYSTEM'] } }
          ]
        }
      },
      size: 0,
      aggs: {
        user: {
          terms: { field: 'log.source.samName', size: 10000 },
          aggs: {
            computer: {
              terms: { field: 'msvistalog.system.computer', size: 10000 },
              aggs: {
                privileges: {
                  terms: { field: 'msvistalog.logon.privilege', size: 10000 }
                },
              },
            },
          },
        },
      },
    },
  }, (err, searchResult) => {
    if(err)
      return callback(err);

    function wikiToReturnWiki(wiki) {
      if(!wiki)
        return wiki;

      return {
        id: wiki.id,
        title: wiki.title,
        summary: wiki.summary,
        fqdn: wiki.fqdn,
        samName: wiki.samName,
        ldapGuid: wiki.ldapGuid,
      };
    }

    const result = [].concat(...searchResult.aggregations.user.buckets.map(user => {
      return user.computer.buckets.map(computer => {
        let computerWiki = wikiMap.byFqdn.get(computer.key);
        computerWiki = computerWiki && computerWiki[0];

        let userWiki = wikiMap.bySamName.get(user.key);
        userWiki = userWiki && userWiki[0];

        return {
          userSamName: user.key,
          userWiki: wikiToReturnWiki(userWiki),
          computerFqdn: computer.key,
          computerWiki: wikiToReturnWiki(computerWiki),
          privileges: computer.privileges.buckets.map(priv => priv.key)
        };
      });
    })).filter(v => !v.userWiki || !v.computerWiki || v.userWiki !== v.computerWiki);

    return callback(null, result);
  });
}

module.exports.MSVISTALOG_TEMPLATE = MSVISTALOG_TEMPLATE;

module.exports.getVistaLogEntry = getVistaLogEntry;
module.exports.getVistaLogEntriesByActivityId = getVistaLogEntriesByActivityId;
module.exports.searchVistaLogs = searchVistaLogs;
module.exports.findVistaLogByLocator = findVistaLogByLocator;
module.exports.getVistaLogStats = getVistaLogStats;
module.exports.findAdminLogins = findAdminLogins;
