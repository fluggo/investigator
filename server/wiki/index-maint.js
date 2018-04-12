'use strict';

const util = require('./util.js');
const async = require('async');
const es = require('../es.js');
const d3 = require('d3');
const uuid = require('uuid/v4');
const extend = require('extend');
const users = require('../users');
const userFuncs = require('./user-funcs.js');

const logger = util.logger;

// 24H date format down to the millisecond for marking active indices
// We go to the millisecond
const DATE_MINUTE_FORMAT = d3.timeFormat('%Y-%m-%d-%H-%M-%S-%L');

function createMapping(dataTags) {
  // relationshipTags is an object of { contains: 'article' }
  // Types are: 'string', 'long', 'integer', 'short', 'byte', 'double', 'float',
  // 'date' (which expects strict_date_optional_time), 'ip', 'article'
  dataTags = util.coerceMap(dataTags);

  var result = {
    article: {
      dynamic: false,
      include_in_all: false,
      properties: {
        common: es.COMMON_MAPPING,
        wiki: {
          properties: {
            // Title of the article, in plain text
            title: {
              type: 'text',
              store: true,      // Store for highlighting
              term_vector: 'with_positions_offsets',
              fields: {
                simple: {
                  type: 'text',
                  analyzer: 'simple',
                  term_vector: 'with_positions_offsets',
                },
                english: {
                  type: 'text',
                  analyzer: 'english',
                  term_vector: 'with_positions_offsets',
                }
              },
            },

            // Unique ID of article to connect it to its history
            uuid: {
              type: 'keyword',
            },

            // Official main body of the article, using textile formatting
            body: {
              type: 'text',
              store: true,      // Store for highlighting
              term_vector: 'with_positions_offsets',
              fields: {
                simple: {
                  type: 'text',
                  analyzer: 'simple',
                  term_vector: 'with_positions_offsets',
                },
                english: {
                  type: 'text',
                  analyzer: 'english',
                  term_vector: 'with_positions_offsets',
                }
              },
            },

            // User-specified array of tags, not including hashtags
            tags: {
              type: 'text',
              index: false,
            },

            createdBy: {
              type: 'keyword',
            },

            createdTime: {
              type: 'date',
            },

            updatedBy: {
              type: 'keyword',
            },

            updatedTime: {
              type: 'date',
            },

            rels: {
              properties: {
              }
            },

            unreviewed: {
              type: 'boolean',
            },

            // All tags from wiki.tags without their values
            baseTags: {
              type: 'keyword',
            },

            // Articles referenced in the body as links
            bodyReferencedArticles: {
              type: 'keyword',
            },

            // Articles referenced in the body as hashtags
            bodyReferencedHashtags: {
              type: 'keyword',
            },

            // Union of baseTags and bodyReferencedHashtags
            allBaseTags: {
              type: 'keyword',
            },

            // Articles referenced in tags
            tagReferencedArticles: {
              type: 'keyword',
            },
          }
        },
        wikiUnreviewed: {
          properties: {
            // Title of the article, in plain text
            title: {
              type: 'text',
              store: true,      // Store for highlighting
              term_vector: 'with_positions_offsets',
              fields: {
                simple: {
                  type: 'text',
                  analyzer: 'simple',
                  term_vector: 'with_positions_offsets',
                },
                english: {
                  type: 'text',
                  analyzer: 'english',
                  term_vector: 'with_positions_offsets',
                }
              },
            },

            // Official main body of the article, using textile formatting
            body: {
              type: 'text',
              store: true,      // Store for highlighting
              term_vector: 'with_positions_offsets',
              fields: {
                simple: {
                  type: 'text',
                  analyzer: 'simple',
                  term_vector: 'with_positions_offsets',
                },
                english: {
                  type: 'text',
                  analyzer: 'english',
                  term_vector: 'with_positions_offsets',
                }
              },
            },

            // User-specified array of tags, not including hashtags
            tags: {
              type: 'text',
              index: false,
            },

            updatedBy: {
              type: 'keyword',
            },

            updatedTime: {
              type: 'date',
            },

            rels: {
              properties: {
              }
            },

            // All tags from wiki.tags without their values
            baseTags: {
              type: 'keyword',
            },

            // Articles referenced in the body as links
            bodyReferencedArticles: {
              type: 'keyword',
            },

            // Articles referenced in the body as hashtags
            bodyReferencedHashtags: {
              type: 'keyword',
            },

            // Union of baseTags and bodyReferencedHashtags
            allBaseTags: {
              type: 'keyword',
            },

            // Articles referenced in tags
            tagReferencedArticles: {
              type: 'keyword',
            },
          }
        }
      }
    },
    'article-history': {
      dynamic: false,
      include_in_all: false,
      properties: {
        // Unique ID of article to connect it to its history
        uuid: {
          type: 'keyword',
        },

        updatedBy: {
          type: 'keyword',
        },

        updatedTime: {
          type: 'date',
        },
      }
    }
  };

  function setRelProps(relsProps) {
    dataTags.forEach((type, tag) => {
      switch(type) {
        case 'string':
          relsProps[tag] = {
            type: 'keyword',
          };
          break;

        case 'article':
          relsProps[tag] = {
            type: 'keyword',
            copy_to: 'wiki.tagReferencedArticles',
          };
          break;

        case 'long':
        case 'integer':
        case 'short':
        case 'byte':
        case 'double':
        case 'float':
        case 'date':
          relsProps[tag] = {
            type: type,
          };
          break;

        case 'ip':
          relsProps[tag] = {
            type: 'ip',
          };
          break;

        default:
          //throw new WikiError('Invalid tag data type "' + tag.type + '".', 'invalid-tag-type');
          break;
      }
    });

    // Force the tag-type, alias, and implies tags
    relsProps['ldap-guid'] = { type: 'keyword' };
    relsProps['tag-type'] = { type: 'keyword' };
    relsProps['alias'] = { type: 'keyword' };
    relsProps['implies'] = { type: 'keyword', copy_to: 'wiki.tagReferencedArticles' };
  }

  setRelProps(result.article.properties.wiki.properties.rels.properties);
  setRelProps(result.article.properties.wikiUnreviewed.properties.rels.properties);

  return result;
}

// Gets an array of index names in the wiki-write alias
function getWikiWriteIndices(callback) {
  return es.getAliasIndices(util.WIKI_WRITE_ALIAS, callback);
}



// Create the wiki index and alias
function createWiki(options, callback) {
  // Check to see if it already exists
  getWikiWriteIndices(function(err, indices) {
    if(err)
      return callback(err);

    if(indices.length > 1)
      return callback(new util.WikiError(`Multiple wiki indices defined: ${indices}`, 'too-many-indices'));

    if(indices.length === 1)
      return callback(new util.WikiError(`Wiki index already exists as "${indices[0]}".`, 'index-already-exists'));

    const newName = util.PREFIX + 'wiki-' + DATE_MINUTE_FORMAT(new Date());
    //console.error(`Creating new index "${newName}"...`);

    es.client.indices.create({
        index: newName,
        body: {
          settings: {
            analysis: es.COMMON_ANALYSIS,
            'index.number_of_shards': 2,
          },
          aliases: { [util.WIKI_READ_ALIAS]: {}, [util.WIKI_WRITE_ALIAS]: {} },
          mappings: createMapping(util.coerceMap(options.tags) || _knownTags),
        }
      }, function(err) {
        //console.error(err ? 'failed.' : 'done.');
        return callback(err);
      });
  });
}

// Deletes the entire wiki; careful with this, of course
function deleteWiki(callback) {
  //console.error('Deleting wiki...');
  getWikiWriteIndices(function(err, indices) {
    if(err)
      return callback(err);

    if(indices.length === 0) {
      //console.error('No wiki indices defined.');
      return callback(null, false);
    }

    logger.warn({indices: indices, messageId: 'wiki/createArticle/history-error'}, `Deleting ${indices.length === 1 ? 'index' : 'indices'} ${indices.join(', ')}.`);

    es.client.indices.delete({index: indices}, function(err) {
      if(err)
        logger.error({err: err, indices: indices}, `Deleting indices failed.`)

      //console.error(err ? 'failed.' : 'done.');
      return callback(err, !err);
    });
  });
}

function reindexArticles(options, callback) {
  const newIndexName = util.PREFIX + 'wiki-' + DATE_MINUTE_FORMAT(new Date());
  options = options || {};

  function createNewIndex(callback) {
    logger.warn(`Creating new index ${newIndexName} for reindexing.`);
    //console.error(`Creating new index for reindexing ${newIndexName}...`);

    es.client.indices.create({
        index: newIndexName,
        body: {
          settings: { analysis: es.COMMON_ANALYSIS },
          mappings: createMapping(util.coerceMap(options.tags) || _knownTags),
        }
      }, callback);
  }

  function copyArticles(callback) {
    logger.warn(`Copying articles for reindexing.`);
    //console.error('Copying articles...');

    // Get the stream of entries
    const readStream = es.getEntriesStream({index: options.readIndex || util.WIKI_READ_ALIAS});
    const writeStream = es.getBulkIndexStream({index: newIndexName, type: util.ARTICLE});

    function errorHandler(err) {
      // Probably should clean up the index we created?
      logger.error({err: err, rawErr: err}, 'Error in stream copy.');
      return callback && callback(err);
    };

    const transform = new require('stream').Transform({
      objectMode: true,
      highWaterMark: 10 * 1000,
      transform: function(chunk, encoding, callback) {
        //console.log('transform chunk');
        if(chunk._type === util.ARTICLE) {
          // Re-prepare the article
          let officialEntry = {}, id = null;

          if(chunk._source.wiki.title) {
            officialEntry = util.prepareArticleSync(chunk._source.wiki);
            id = officialEntry.id;

            if(officialEntry.error) {
              // There was an error preparing an article; report the error and continue
              const error = new util.WikiError('There were errors with the existing articles.', 'existing-article-error');
              error.entry = entry;

              return callback(error);
            }
          }

          // Copy over attributes that aren't covered by prepareArticleSync
          const item = {
            common: {},
            wiki: extend({}, officialEntry.article, {
              unreviewed: chunk._source.wiki.unreviewed,
              unreviewedHistory: chunk._source.wiki.unreviewedHistory,
              uuid: chunk._source.wiki.uuid,
              createdBy: chunk._source.wiki.createdBy,
              createdTime: chunk._source.wiki.createdTime,
              updatedBy: chunk._source.wiki.updatedBy,
              updatedTime: chunk._source.wiki.updatedTime,
            }),
          };

          // Migrate v1 -> v2 (history in article to history as separate object)
          if(!item.wiki.uuid) {
            item.wiki.uuid = uuid();

            for(let histObj of chunk._source.wiki.history) {
              histObj.uuid = item.wiki.uuid;
              transform.push({
                action: { index: { _type: util.ARTICLE_HISTORY } },
                doc: histObj
              });
            }

            item.wiki.history = undefined;
          }

          // Migrate v2 -> v3 (add wikiUnreviewed section)
          if(chunk._source.wikiUnreviewed) {
            let unreviewedEntry = util.prepareArticleSync(chunk._source.wikiUnreviewed);
            id = id || unreviewedEntry.id;

            item.wikiUnreviewed = extend({}, unreviewedEntry.article, {
              updatedBy: chunk._source.wikiUnreviewed.updatedBy,
              updatedTime: chunk._source.wikiUnreviewed.updatedTime,
            });
          }
          else {
            item.wiki.unreviewed = false;

            item.wikiUnreviewed = extend({}, officialEntry.article, {
              updatedBy: chunk._source.wiki.updatedBy,
              updatedTime: chunk._source.wiki.updatedTime,
            });
          }

          item.common.quickSearch = userFuncs.makeWikiQuickSearchTerms(item);

          // Sign them up for reindexing
          transform.push({
            action: { index: { _id: id, _type: util.ARTICLE, _version: chunk._version } },
            doc: item
          });
        }
        else if(chunk._type === util.ARTICLE_HISTORY) {
          transform.push({
            action: { index: { _type: util.ARTICLE_HISTORY } },
            doc: chunk._source
          });
        }

        return callback();
      }
    });

    readStream.pipe(transform).pipe(writeStream);

    /*readStream.on('end', () => console.log('readStream end'));
    transform.on('end', () => console.log('transform end'));
    transform.on('prefinish', () => console.log('transform prefinish'));
    transform.on('finish', () => console.log('transform finish'));
    writeStream.on('finish', () => console.log('writeStream finish'));
    writeStream.on('close', () => console.log('writeStream close'));*/

    readStream.once('error', errorHandler);
    transform.once('error', errorHandler);
    writeStream.once('error', errorHandler);
    writeStream.once('finish', callback);
  }

  function refreshIndex(callback) {
    return es.client.indices.refresh({index: newIndexName}, callback);
  }

  logger.warn('Reindexing wiki...');

  async.series([
    reloadTags,
    createNewIndex,
    copyArticles,

    // Refresh the new index so articles are immediately available
    refreshIndex,
  ], function(err) {
    if(err) {
      logger.error({err: err}, 'Reindexing wiki failed.');
      return callback && callback(err);
    }

    return callback && callback(null, {index: newIndexName});
  });
}

function createSnapshot(callback) {
  const newSnapshotName = util.PREFIX + 'wiki-snapshot-' + DATE_MINUTE_FORMAT(new Date());

  es.client.snapshot.create({
    repository: 'wiki-backup',
    snapshot: newSnapshotName,
    body: {
      indices: util.WIKI_READ_ALIAS,
      include_global_state: false,
    }
  }, callback);
}

function switchAliasesTo(index, callback) {
  es.getAliasIndices(util.WIKI_READ_ALIAS, function(err, readIndexes) {
    if(err)
      return callback(err);

    es.getAliasIndices(util.WIKI_WRITE_ALIAS, function(err, writeIndexes) {
      if(err)
        return callback(err);

      var actions = [
        { add: { index: index, alias: util.WIKI_READ_ALIAS } },
        { add: { index: index, alias: util.WIKI_WRITE_ALIAS } },
      ];

      //console.error('Removing read indexes', readIndexes);
      //console.error('Removing write indexes', writeIndexes);
      //console.error('Adding index', index);

      readIndexes.forEach(function(index) {
        actions.push({ remove: { index: index, alias: util.WIKI_READ_ALIAS } });
      });

      writeIndexes.forEach(function(index) {
        actions.push({ remove: { index: index, alias: util.WIKI_WRITE_ALIAS } });
      });

      es.client.indices.updateAliases({
        body: {
          actions: actions
        }
      }, err => {
        if(err)
          logger.error({err: err}, `Failed to switch wiki aliases to ${index}.`);
        else
          logger.warn(`Switched wiki aliases to ${index}.`);

        return callback(err);
      });
    });
  });
}



/*******
  In-memory tag map
*******/

var _knownTags = new Map();
setDefaultTagTypes(_knownTags);

function areMapsEqual(a, b) {
  // Just a dumb cross-check
  for(let entry of a) {
    if(b.get(entry[0]) !== entry[1])
      return false;
  }

  for(let entry of b) {
    if(a.get(entry[0]) !== entry[1])
      return false;
  }

  return true;
}

function setDefaultTagTypes(map) {
  map.set('tag-type', 'string');
  map.set('implies', 'article');
  map.set('alias', 'string');
}

function fetchTags(callback) {
  // Walk the articles with "tag-type" tag
  es.getAllEntries({
    index: util.WIKI_READ_ALIAS,
    type: util.ARTICLE,
    body: {
      _source: ['wiki.rels.tag-type'],
      query: {
        exists: {
          field: 'wiki.rels.tag-type'
        }
      },
    }
  }, function(err, res) {
    if(err)
      return callback(err);

    var result = new Map();

    res.forEach(function(hit) {
      var type = hit._source.wiki.rels['tag-type'];
      result.set(hit._id, util.collapseArray(type));
    });

    // Our "default" tag types can't actually be overridden,
    // so we set them last
    setDefaultTagTypes(result);

    callback(null, result);
  });
}


function reloadTags(callback) {
  // Should be called in _masterWriteQueue
  return fetchTags(function(err, res) {
    if(err)
      return callback(err);

    _knownTags = res;
    return callback();
  });
}


function reloadTagsWithReindex(callback) {
  // Reloads the tags; if they've changed, reindexes all documents
  // Should be called in _masterWriteQueue
  return fetchTags(function(err, res) {
    if(err)
      return callback(err);

    if(!areMapsEqual(_knownTags, res)) {
      //console.error('Reindexing...');
      return reindexArticles({}, (err, res) => {
        if(err)
          return callback(err);

        //console.error('Switching aliases...');
        return switchAliasesTo(res.index, err => {
          if(err)
            return callback(err);

          //console.error('Reloading tag types...');
          return reloadTags(callback);
        });
      });
    }

    _knownTags = res;
    return callback();
  });
}

function getKnownTags(callback) {
  // Gets the tags known internally
  // This is async because it waits for the _masterWriteQueue
  return _masterWriteQueue.push(function(callback) {
    return callback(null, _knownTags);
  }, callback);
}


var _unreviewedArticleCount = 0;

function updateUnreviewedArticleCount(callback) {
  es.client.search({
    index: util.WIKI_READ_ALIAS,
    type: util.ARTICLE,
    body: {
      query: {
        term: { 'wiki.unreviewed': true }
      },
      size: 0,
    }
  }, (err, resp) => {
    if(err) {
      logger.warn({err: err, messageId: 'wiki/updateUnreviewedArticleCount/error'}, 'Failed to fetch the updated count of articles waiting for review.');
      return callback && callback(err);
    }

    _unreviewedArticleCount = resp.hits.total;

    users.forEach(user => {
      user.broadcast('wiki/stats', {unreviewedArticleCount: _unreviewedArticleCount});
    });

    return callback && callback();
  });
}

function createWikiMap(callback) {
  // Try to reduce memory footprint by interning strings as they come through
  const internMap = new Map();

  function intern(str) {
    let result = internMap.get(str);

    if(!result) {
      internMap.set(str, str);
      result = str;
    }

    return result;
  }

  const result = {
    byId: new Map(),
    bySamName: new Map(),
    byLdapGuid: new Map(),
    byMac: new Map(),
    bySid: new Map(),
    byFqdn: new Map(),
    byTag: new Map(),
    byIp: new Map(),
  };

  function addMapList(map, keyList, obj) {
    if(!keyList)
      return;

    for(let key of keyList) {
      let list = map.get(key);

      if(!list) {
        list = [];
        map.set(key, list);
      }

      list.push(obj);
    }
  }

  const entriesStream = es.getEntriesStream({ index: 'wiki-read', type: 'article', _source: [
    'wiki.allBaseTags',
    'wiki.rels',
    'wiki.title',
    'wiki.body',
  ] });
  const data = [];

  entriesStream.once('error', callback);
  entriesStream.on('data', function(obj) {
    //console.log('keeping data');

    if(!obj._source.wiki || !obj._source.wiki.title)
      return;

    const newObj = {
      id: obj._id,
      title: obj._source.wiki.title,
      summary: util.parseBodyForSummary(obj._source.wiki.body),
      fqdn: obj._source.wiki.rels.fqdn && obj._source.wiki.rels.fqdn.map(intern),
      ldapGuid: obj._source.wiki.rels['ldap-guid'] && obj._source.wiki.rels['ldap-guid'].map(intern),
      sid: obj._source.wiki.rels['sid'] && obj._source.wiki.rels['sid'].map(intern),
      mac: obj._source.wiki.rels['mac'] && obj._source.wiki.rels['mac'].map(intern),
      ip: obj._source.wiki.rels['ip'] && obj._source.wiki.rels['ip'].map(intern),
      samName: obj._source.wiki.rels['sam-name'] && obj._source.wiki.rels['sam-name'].map(intern),
      tags: new Set(obj._source.wiki.allBaseTags.map(intern)),
    };

    addMapList(result.bySamName, newObj.samName, newObj);
    addMapList(result.bySid, newObj.sid, newObj);
    addMapList(result.byMac, newObj.mac, newObj);
    addMapList(result.byLdapGuid, newObj.ldapGuid, newObj);
    addMapList(result.byFqdn, newObj.fqdn, newObj);
    addMapList(result.byIp, newObj.fqdn, newObj);
    addMapList(result.byTag, newObj.tags, newObj);
    result.byId.set(newObj.id, newObj);

    //process.stdout.write(result.byId.size + '  \r');

    //console.log(JSON.stringify(obj, null, 2));
  });
  entriesStream.once('end', function() {
    //console.log('calling end callback');
    //callback(null, data);

    /*for(let obj of result.byId.values()) {
    }*/

    return callback(null, result);
  });
}

var _wikiMemoryMap = {
  byId: new Map(),
  bySamName: new Map(),
  byLdapGuid: new Map(),
  byMac: new Map(),
  bySid: new Map(),
  byFqdn: new Map(),
  byTag: new Map(),
};

function getMemoryMapPublishedVersionSync() {
  return Array.from(_wikiMemoryMap.byId.values()).map(v => {
    return {
      id: v.id,
      title: v.title,
      fqdn: v.fqdn,
      ldapGuid: v.ldapGuid,
      sid: v.sid,
      mac: v.mac,
      ip: v.ip,
      samName: v.samName,
      tags: Array.from(v.tags),
    };
  });
}

function fetchLatestWikiMap(callback) {
  const wsapi = require('../wsapi.js');

  return createWikiMap((err, result) => {
    if(err) {
      logger.error({err: err}, 'Failed to fetch latest wiki in-memory map.');
      return callback && callback(err);
    }
    else {
      _wikiMemoryMap = result;

      const publishVersion = getMemoryMapPublishedVersionSync();

      wsapi.service.broadcast('wiki/memory-map', publishVersion);

      return callback && callback();
    }
  });
}


users.on('socket-connected', (user, socket) => {
  socket.send(JSON.stringify({type: 'wiki/stats', data: {unreviewedArticleCount: _unreviewedArticleCount}}));
});

// The master queue which serializes all write tasks and allows us to do some asynchronous actions
const _masterWriteQueue = async.queue(function(task, callback) {
  if(!task)
    return callback();

  return task(callback);
});

// First thing: load tags
_masterWriteQueue.push(reloadTags);
_masterWriteQueue.push(updateUnreviewedArticleCount);

function pushWriteQueue(func, callback) {
  _masterWriteQueue.push(func, callback);
}



/******
  EXPORTS
*****/

module.exports.reindexArticles = function(options, callback) {
  _masterWriteQueue.push(callback => reindexArticles(options, callback), callback);
};

module.exports.switchAliasesTo = function(index, callback) {
  _masterWriteQueue.push(callback => switchAliasesTo(index, callback), callback);
};

module.exports.reloadTags = function(callback) {
  _masterWriteQueue.push(callback => reloadTags(callback), callback);
};

module.exports.reloadTagsWithReindex = function(callback) {
  _masterWriteQueue.push(callback => reloadTagsWithReindex(callback), callback);
};

module.exports.updateUnreviewedArticleCount = function(callback) {
  _masterWriteQueue.push(callback => updateUnreviewedArticleCount(callback), callback);
};

module.exports.fetchLatestWikiMap = function(callback) {
  _masterWriteQueue.push(callback => fetchLatestWikiMap(callback), callback);
};

module.exports.createWiki = function(options, callback) {
  _masterWriteQueue.push(callback => createWiki(options, callback), callback);
};

module.exports.deleteWiki = function(callback) {
  _masterWriteQueue.push(callback => deleteWiki(callback), callback);
};

module.exports.getTagTypeSync = function(str) {
  if(!_knownTags) {
    _knownTags = new Map();
    setDefaultTagTypes(_knownTags);
  }

  return _knownTags.get(str);
};

module.exports.getWikiMemoryMapSync = function() {
  return _wikiMemoryMap;
};

module.exports.getMemoryMapPublishedVersionSync = getMemoryMapPublishedVersionSync;

module.exports.fetchTags = fetchTags;
module.exports.getKnownTags = getKnownTags;
module.exports.pushWriteQueue = pushWriteQueue;
module.exports.createMapping = createMapping;
module.exports.createSnapshot = createSnapshot;
