'use strict';

const config = require('../server/config.js');
const logger = config.logger;

const es = require('../server/es.js');

const loggerStatsTemplate = {
  template: 'logger-stats-*',
  settings: {
    'index.codec': 'best_compression',
    'index.number_of_shards': config.number_of_shards,
  },
  mappings: {
    _default_: {
      _all: {
        enabled: false
      },
      dynamic_templates: [
        {
          long_numbers: {
            match_mapping_type: 'long',
            mapping: {
              type: 'long',
              index: false,
            }
          }
        },
        {
          double_numbers: {
            match_mapping_type: 'double',
            mapping: {
              type: 'double',
              index: false,
            }
          }
        },
      ],
      dynamic: true,
    },
    "logger-stats": {
      include_in_all: false,
      dynamic: true,
      properties: {
        '@timestamp': {
          format: 'dateOptionalTime',
          type: 'date'
        },
        name: {
          type: 'keyword',
        },
        worker: {
          type: 'integer',
        },
        queued: {
          type: 'integer',
          index: false,
        },
        messagesProcessed: {
          type: 'integer',
          index: false,
        },
      }
    }
  },
  aliases: {
    'logger-stats': {}
  }
};

const elasticsearchStatsTemplate = {
  template: 'elasticsearch-stats-*',
  settings: {
    'index.codec': 'best_compression',
    'index.number_of_shards': config.number_of_shards,
  },
  mappings: {
    _default_: {
      _all: {
        enabled: false
      },
      dynamic_templates: [
        {
          long_numbers: {
            match_mapping_type: 'long',
            mapping: {
              type: 'long',
              index: false,
            }
          }
        },
        {
          double_numbers: {
            match_mapping_type: 'double',
            mapping: {
              type: 'float',
              index: false,
            }
          }
        },
      ],
      dynamic: true,
    },
    "index-stats": {
      properties: {
        index: {
          type: 'keyword',
        },
        '@timestamp': {
          type: 'date'
        },
        alias: {
          type: 'keyword',
        }
      }
    },
    "cluster-stats": {
      properties: {
        '@timestamp': {
          type: 'date'
        },
      }
    },
    "cluster-health": {
      properties: {
        '@timestamp': {
          type: 'date'
        },
      }
    },
    "node-stats": {
      properties: {
        node: {
          type: 'keyword',
        },
        name: {
          type: 'keyword',
        },
        '@timestamp': {
          type: 'date'
        },
      }
    },
  },
  aliases: {
    'elasticsearch-stats': {}
  }
};



const async = require('async');

function WrapperError(message, innerException) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.innerException = innerException;
}

require('util').inherits(WrapperError, Error);
const users = require('../server/users');

const d3 = require('d3');

const INDEX_DATE_FORMAT = d3.utcFormat('%Y.%m.%d');
const INDEX_DATE_PARSE = d3.utcParse('%Y.%m.%d');

// Process command line arguments (command-line-args was going to be my library for this,
// but its core-js dependency doesn't seem to be happy with running on actual ES6)

const bareArgs = [];
const options = {
  force: false,
  continuous: false,
};

for(var arg of process.argv.slice(2)) {
  if(arg[0] === '-') {
    switch(arg) {
      case '--force':
        options.force = true;
        break;
      case '--continuous':
        options.continuous = true;
        break;
      default:
        console.error(`Unknown option "${arg}".`);
        process.exit(1);
    }
  }
  else {
    bareArgs.push(arg);
  }
}

if(!bareArgs.length) {
  console.error('No command given.');
  process.exit(1);
}

function mainCallback(err) {
  if(err) {
    logger.error({err: err}, "Error while executing.");
    process.exit(1);
  }

  process.exit(0);
}

function continuousCallback(err) {
  if(err) {
    logger.error({err: err}, "Error while executing continuous action.");
  }
}

const INDEX_SETTINGS = [
  {
    prefix: 'appstatus',      // required
    keepDayCount: 2,          // default: null, meaning not managed
    // archiveDayCount: 5,    // default: 5 (if keepDayCount is defined)
  },
  { prefix: 'raw-syslog', keepDayCount: 5 },
  { prefix: 'elasticsearch-stats', keepDayCount: 5 },
  { prefix: 'bunyan', keepDayCount: 5 },
  { prefix: 'logger-stats', keepDayCount: 5 },
  { prefix: 'wsalog', keepDayCount: 5 },
  { prefix: 'sqllog', keepDayCount: 5 },
  { prefix: 'dns', keepDayCount: 5 },
  { prefix: 'msvistalog', keepDayCount: 30 },
  { prefix: 'netflow', keepDayCount: 30 },

  { prefix: 'wiki' },
  { prefix: 'ldap' },
  { prefix: 'cylance' },
];

const INDEX_BY_PREFIX = new Map(INDEX_SETTINGS.map(i => [i.prefix, i]));

function getOldIndexes(callback) {
  es.client.indices.get({
    index: INDEX_SETTINGS.filter(i => i.keepDayCount).map(i => i.prefix + '-*'),
    allowNoIndices: true,
    expandWildcards: 'all',
  }, function(err, res) {
    if(err)
      return callback(err);

    const toDelete = [];
    const toArchive = [];
    const toKeep = [];

    Object.keys(res).forEach(indexName => {
      let date = indexName.substring(indexName.length - 10);
      date = INDEX_DATE_PARSE(date);

      const prefix = indexName.substring(0, indexName.length - 11);
      const indexSettings = INDEX_BY_PREFIX.get(prefix);

      if(!indexSettings)
        return;

      const keepDate = d3.utcDay.offset(new Date(), -indexSettings.keepDayCount);
      const archiveDate = d3.utcDay.offset(new Date(), -(indexSettings.archiveDayCount || 5));

      if(date < keepDate)
        toDelete.push(indexName);
      else if(date < archiveDate)
        toArchive.push(indexName);
      else
        toKeep.push(indexName);
    });

    return callback(null, {toDelete: toDelete, toArchive: toArchive, toKeep: toKeep});
  });
}


function deleteOldIndexes(callback) {
  return getOldIndexes((err, res) => {
    if(err)
      return callback(err);

    const toDelete = res.toDelete;
    const toArchive = res.toArchive;

    return async.parallel([
      callback => {
        if(toDelete.length === 0) {
          logger.info('No outdated indexes to delete.');
          return callback();
        }

        logger.info({toDelete: toDelete}, 'Deleting outdated indexes.');

        return es.client.indices.delete({
          index: toDelete
        }, callback);
      },
      callback => {
        if(toArchive.length === 0) {
          logger.info('No indexes to compress.');
          return callback();
        }

        logger.info({toArchive: toArchive}, 'Archiving older indexes.');

        return es.client.indices.putSettings({
          index: toArchive,
          body: {
            index: {
              number_of_replicas: 0,
            }
          }
        }, callback);
      },
    ], callback);
  });
}

function deleteStatsIndexes(callback) {
  es.client.indices.delete({ index: 'elasticsearch-stats-*' }, callback);
}

function deleteNetflowIndexes(callback) {
  es.client.indices.delete({ index: 'netflow-*' }, callback);
}

function deleteSyslogIndexes(callback) {
  es.client.indices.delete({ index: 'raw-syslog-*' }, callback);
}

function deleteBunyanIndexes(callback) {
  es.client.indices.delete({ index: 'bunyan-*' }, callback);
}

function deleteLoggerStatsIndexes(callback) {
  es.client.indices.delete({ index: 'logger-stats-*' }, callback);
}

function deleteWsaLogIndexes(callback) {
  es.client.indices.delete({ index: 'wsalog-*' }, callback);
}

function captureStatsSnapshot(callback) {
  const now = new Date();
  const indexName = 'elasticsearch-stats-' + INDEX_DATE_FORMAT(now);

  function wrapError(callback, message) {
    return function(err) {
      if(err)
        return callback(new WrapperError(message, err));

      callback();
    }
  }

  function indexStatsSnapshot(callback) {
    console.time('index-stats-snapshot');

    // Fetch stats for all indexes
    es.client.indices.stats({
      index: '_all'
    }, function(err, res) {
      if(err)
        return callback(new WrapperError('Failed to fetch index stats', err));

      es.client.indices.getAlias({}, function(err, aliases) {
        if(err)
          return callback(new WrapperError('Failed to fetch indexes', err));

        aliases = Object.keys(aliases).reduce(function(result, index) {
          result[index] = Object.keys(aliases[index].aliases);
          return result;
        }, {});

        //console.log(aliases);

        // Turn them into a bulk upload set
        const docs = Object.keys(res.indices).map(function(index) {
          let doc = res.indices[index];
          doc.index = index;
          doc['@timestamp'] = now;
          doc.alias = aliases[index];

          // Clear the really large integer that Elasticsearch can't parse
          if(doc.primaries && doc.primaries.segments)
            doc.primaries.segments.max_unsafe_auto_id_timestamp = undefined;

          if(doc.total && doc.total.segments)
            doc.total.segments.max_unsafe_auto_id_timestamp = undefined;

          return doc;
        });

        const ops = Array.prototype.concat.apply([], docs.map(function(doc) {
          return [
            { index: { _index: indexName, _type: 'index-stats' } },
            doc
          ];
        }));

        // Bulk index
        es.client.bulk({
          body: ops
        }, function(err, resp) {
          if(err)
            return callback(new WrapperError('Failed to upload index snapshot', err));

          if(resp.errors) {
            logger.warn({errors: resp.items.filter(a => a.index.status >= 400)}, 'Bulk upload error during index stats snapshot.');
          }

          console.timeEnd('index-stats-snapshot');
          return callback();
        });
      });
    });
  }

  function clusterStatsSnapshot(callback) {
    console.time('cluster-stats-snapshot');

    es.client.cluster.stats({}, function(err, stats) {
      if(err)
        return callback(new WrapperError('Failed to fetch cluster stats', err));

      stats['@timestamp'] = now;

      // Clear the really large integer that Elasticsearch can't parse
      stats.indices.segments.max_unsafe_auto_id_timestamp = undefined;

      es.client.index({
        index: indexName,
        type: 'cluster-stats',
        body: stats
      }, function(err) {
        if(err)
          return callback(new WrapperError('Failed to index cluster stats', err));

        console.timeEnd('cluster-stats-snapshot');
        return callback();
      });
    });
  }

  function clusterHealthSnapshot(callback) {
    console.time('cluster-health-snapshot');

    es.client.cluster.health({}, function(err, stats) {
      if(err)
        return callback(new WrapperError('Failed to fetch cluster health', err));

      stats['@timestamp'] = now;

      es.client.index({
        index: indexName,
        type: 'cluster-health',
        body: stats
      }, function(err) {
        if(err)
          return callback(new WrapperError('Failed to index cluster health', err));

        console.timeEnd('cluster-health-snapshot');
        return callback();
      });
    });
  }

  function nodeStatsSnapshot(callback) {
    console.time('node-stats-snapshot');

    es.client.nodes.stats({}, function(err, stats) {
      if(err)
        return callback(new WrapperError('Failed to fetch node stats', err));

      stats = stats.nodes;

      const docs = Object.keys(stats).map(function(node) {
        let doc = stats[node];
        doc.node = node;
        doc['@timestamp'] = now;

        // Clear the really large integer that Elasticsearch can't parse
        doc.indices.segments.max_unsafe_auto_id_timestamp = undefined;

        return doc;
      });

      const ops = Array.prototype.concat.apply([], docs.map(function(doc) {
        return [
          { index: { _index: indexName, _type: 'node-stats' } },
          doc
        ];
      }));

      // Bulk index
      es.client.bulk({
        body: ops
      }, function(err, resp) {
        if(err)
          return callback(new WrapperError('Failed to index node stats', err));

        if(resp.errors) {
          logger.warn({errors: resp.items.filter(a => a.index.status >= 400)}, 'Bulk upload error during node stats snapshot.');
        }

        console.timeEnd('node-stats-snapshot');
        return callback();
      });
    });
  }

  async.parallel([indexStatsSnapshot, clusterStatsSnapshot, nodeStatsSnapshot, clusterHealthSnapshot], callback);
}

function cleanupUnaliasedIndexes(callback) {
  return es.client.indices.get({ index: INDEX_SETTINGS.map(i => i.prefix + '-*') }, function(err, result) {
    if(err)
      return callback(err);

    var indexesToDelete = Object.keys(result).filter(function(index) {
      return Object.keys(result[index].aliases).length === 0;
    });

    if(indexesToDelete.length === 0)
      return callback();

    if(indexesToDelete.length > 100)
      indexesToDelete = indexesToDelete.slice(0, 100);

    //console.error('Deleting these indexes:');
    //indexesToDelete.forEach(function(index) { console.error('* ' + index); });

    logger.info({indexes: indexesToDelete}, 'Deleting unaliased indexes.')

    return es.client.indices.delete({ index: indexesToDelete }, callback);
  });
}

function deleteOldSnapshots(repositories, daysToKeep, callback) {
  logger.info('Deleting old snapshots.');
  let cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

  return async.series(repositories.map(repository => {
    return callback => {
      return es.client.snapshot.get({ repository: repository, snapshot: '*' }, (err, result) => {
        if(err)
          return callback(err);

        var snapshotsToCull = result.snapshots
          .filter(snap => snap.start_time_in_millis < cutoffTime)
          .map(snap => snap.snapshot);

        if(snapshotsToCull.length) {
          return async.series(snapshotsToCull.map(snap => {
            return callback => {
              logger.info({snapshot: snap, repository: repository}, `Deleting outdated snapshot ${snap} from ${repository}.`);
              return es.client.snapshot.delete({ repository: repository, snapshot: snap }, callback);
            };
          }), callback);
        }
        else {
          logger.info({repository: repository}, `No snapshots to cull from ${repository}.`);
          return callback();
        }
      });
    };
  }), callback);
}


switch(bareArgs[0]) {
  case 'create-wiki':
    require('../server/wiki/index-maint.js').createWiki({}, mainCallback);
    break;

  case 'delete-wiki':
    if(!options.force) {
      return mainCallback(new Error('Not going to delete the wiki without --force.'));
    }

    require('../server/wiki/index-maint.js').deleteWiki(mainCallback);
    break;

  case 'reindex-wiki':
    require('../server/wiki/index-maint.js').reindexArticles(null, function(err, res) {
      if(err)
        return mainCallback(err);

      console.error(`Articles reindexed to "${res.index}".`);
      mainCallback();
    });
    break;

  case 'switch-wiki-alias':
    if(!bareArgs[1])
      return mainCallback(new Error('Not enough arguments. Need to specify the index name.'));

    require('../server/wiki/index-maint.js').switchAliasesTo(bareArgs[1], mainCallback);
    break;

  case 'show-tag-types':
    require('../server/wiki/index-maint.js').fetchTags(function(err, res) {
      if(err)
        return mainCallback(err);

      console.log(res);
      mainCallback();
    });
    break;

  case 'cleanup-unaliased-indexes':
    cleanupUnaliasedIndexes(mainCallback);
    break;

  case 'set-templates': {
    const netflow = require('../server/netflow');
    const logs = require('../server/logs');
    
    async.series([
/*      callback =>
        es.client.cluster.putSettings({
          body: {
            persistent: {
              'discovery.zen.minimum_master_nodes': 2,
            }
          }
        }, callback),*/
      function(callback) {
        es.client.indices.putTemplate({
          name: 'elasticsearch-stats-template',
          body: elasticsearchStatsTemplate,
        }, callback);
      },
      function(callback) {
        es.client.indices.putTemplate({
          name: 'logger-stats-template',
          body: loggerStatsTemplate,
        }, callback);
      },
      netflow.setTemplate,
      logs.setTemplates,
    ], mainCallback);
  }
    break;

  case 'maintain-log-indexes':
    async.parallel([
      deleteOldIndexes,
      callback => deleteOldSnapshots(['wiki-backup'], 7, callback),
      cleanupUnaliasedIndexes
    ], mainCallback);
    break;

  case 'close-archive-indexes':
    return getOldIndexes((err, res) => {
      if(err)
        return mainCallback(err);

      console.log(res.toArchive);

      return es.client.indices.close({
        index: res.toArchive,
        expandWildcards: 'open',
        allowNoIndices: true,
      }, mainCallback);
    });
    break;

  case 'open-archive-indexes':
    return getOldIndexes((err, res) => {
      if(err)
        return mainCallback(err);

      return es.client.indices.open({
        index: INDEX_SETTINGS.map(i => i.prefix + '-*'),
        expandWildcards: 'all',
        allowNoIndices: true,
      }, mainCallback);
    });
    break;

  case 'capture-stats-snapshot':
    if(!options.continuous) {
      captureStatsSnapshot(mainCallback);
    }
    else {
      function capture() {
        console.log('Capturing (', new Date(), ')');
        captureStatsSnapshot(continuousCallback);
      }

      setInterval(capture, 15000);
      capture();
    }
    break;

  case 'delete-logger-stats-indexes':
    if(!options.force) {
      return mainCallback(new Error('Not going to delete the statistics indexes without --force.'));
    }

    return deleteLoggerStatsIndexes(mainCallback);
    break;

  case 'delete-elasticsearch-stats-indexes':
    if(!options.force) {
      return mainCallback(new Error('Not going to delete the statistics indexes without --force.'));
    }

    return deleteStatsIndexes(mainCallback);
    break;

  case 'delete-netflow-indexes':
    if(!options.force) {
      return mainCallback(new Error('Not going to delete the netflow indexes without --force.'));
    }

    return deleteNetflowIndexes(mainCallback);
    break;

  case 'delete-bunyan-indexes':
    if(!options.force) {
      return mainCallback(new Error('Not going to delete the Bunyan indexes without --force.'));
    }

    return deleteBunyanIndexes(mainCallback);
    break;

  case 'delete-syslog-indexes':
    if(!options.force) {
      return mainCallback(new Error('Not going to delete the syslog indexes without --force.'));
    }

    return deleteSyslogIndexes(mainCallback);
    break;

  case 'delete-wsalog-indexes':
    if(!options.force) {
      return mainCallback(new Error('Not going to delete the wsalog indexes without --force.'));
    }

    return deleteWsaLogIndexes(mainCallback);
    break;

  case 'find-admins':
    return ldapService.findAdmins(function(err, result) {
      if(err)
        return mainCallback(err);

      console.log('Enterprise admins:');

      result.enterprise.forEach(function(obj) {
        console.log('  ' + obj.ldap['msDS-PrincipalName']);
      });

      Object.keys(result).forEach(function(key) {
        if(key === 'enterprise')
          return;

        console.log(`${key} domain admins:`);

        result[key].forEach(function(obj) {
          console.log('  ' + obj.ldap['msDS-PrincipalName']);
        });
      })
    });
    break;

  case 'create-user-index':
    users.createIndex(mainCallback);
    break;

  case 'create-user':
    if(!bareArgs[1])
      return mainCallback(new Error('Not enough arguments. Need to specify the user UPN.'));

    users.create(bareArgs[1], {userControls:{editUsers: true}}, mainCallback);
    break;

  case 'get-user':
    if(!bareArgs[1])
      return mainCallback(new Error('Not enough arguments. Need to specify the user UPN.'));

    users.get(bareArgs[1], function(err, user) {
      if(err)
        return mainCallback(err);

      var settings = user.getSettings();

      console.log(JSON.stringify(settings, null, 2));

      return mainCallback();
    });
    break;

  case 'sync-flush':
    es.client.indices.flushSynced({index: '_all'}, mainCallback);
    break;

  case 'snapshot-wiki':
    require('../server/wiki/index-maint.js').createSnapshot(mainCallback);
    break;

  default:
    console.error(`Unknown command "${bareArgs[0]}".`)
    break;
}

