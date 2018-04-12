// Useful docs
// See: https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/api-reference-2-0.html

'use strict';

const d3 = require('d3');
const async = require('async');
const stream = require('stream');
const EventEmitter = require('events');
const config = require('./config.js');
const logger = config.logger;

const _esclient = new require('elasticsearch').Client(config.elasticsearch);

// Mapping for the "common" object
const COMMON_MAPPING = {
  properties: {
    name: {
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
    content: {
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
    email: {
      type: 'text',
      analyzer: 'lowercase',
      fields: {
        simple: {
          type: 'text',
          analyzer: 'simple',
        }
      },
    },
    upn: {
      type: 'text',
      analyzer: 'lowercase',
      fields: {
        simple: {
          type: 'text',
          analyzer: 'simple',
        }
      },
    },
    samName: {
      type: 'text',
      analyzer: 'lowercase',
      fields: {
        simple: {
          type: 'text',
          analyzer: 'simple',
        }
      },
    },
    ip: {
      type: 'ip'
    },
    mac: {
      type: 'keyword',
    },
    quickSearch: {
      type: 'nested',
      include_in_all: false,
      dynamic: false,
      properties: {
        text: {
          "type": "text",
          "analyzer": "autocomplete",
          "search_analyzer": "standard",
          "term_vector": "with_positions_offsets",
        },
        isId: {
          type: 'boolean',
        },
        weight: {
          type: 'half_float',
        }
      },
    },
  }
};

const COMMON_ANALYSIS = {
  tokenizer: {
    autocomplete_filter: {
      type: "edge_ngram",
      min_gram: 1,
      max_gram: 20,
      token_chars: ["letter", "digit", "punctuation"]
    },
    code_keyword_tokenizer: {
      type: 'pattern',

      // Identifies stretches of non-keywords and numbers
      pattern: '(?:[^a-zA-Z0-9_]++[0-9]*+)++',
    },
  },
  analyzer: {
    lowercase: {
      tokenizer: 'keyword',
      filter: 'lowercase',
    },
    autocomplete: {
      type: "custom",
      tokenizer: "autocomplete_filter",
      filter: ['lowercase'],
    },
    code_keyword: {
      type: 'custom',
      tokenizer: 'code_keyword_tokenizer',
      filter: ['lowercase'],
    },
  },
};

// Returns a stream (EventEmitter with data, error, and end) that
// scrolls through all the entries in the given index
function getEntriesStream(options) {
  let fetchedItems = 0;
  let _scroll_id = null;
  let _inProgress = false, _done = false;

  let resultStream = new stream.Readable({
    objectMode: true,
    read: read
  });

  //console.log('start');

  const query = {
    sort: ['_doc'],
    scroll: '30s',
    body: { query: { match_all: {} } }
  };

  for(let key of Object.keys(options || {}))
    query[key] = options[key] || query[key];

  function read() {
    if(_inProgress || _done)
      return;

    _inProgress = true;

    if(!_scroll_id) {
      _esclient.search(query, getMoreEntries);
    }
    else {
      _esclient.scroll({
        scrollId: _scroll_id,
        scroll: '30s'
      }, getMoreEntries);
    }
  }

  function getMoreEntries(err, resp) {
    //console.log('getMoreEntries');
    _inProgress = false;

    if(err)
      return resultStream.emit('error', err);

    _scroll_id = resp._scroll_id;

    //console.log(`Received items: ${resp.hits.hits.length} (total ${resp.hits.total})`);

    fetchedItems += resp.hits.hits.length;

    if(fetchedItems >= resp.hits.total) {
      //console.log(`end (${fetchedItems} >= ${resp.hits.total})`);
      _done = true;
    }

    for(let hit of resp.hits.hits)
      resultStream.push(hit);

    if(_done) {
      resultStream.push(null);
    }

    if(!resp.hits.hits.length)
      read();
  }

  return resultStream;
}

// Fetches all the entries in the given index as an array
function getAllEntries(options, callback) {
  const entriesStream = getEntriesStream(options);
  const data = [];

  entriesStream.once('error', callback);
  entriesStream.on('data', function(obj) {
    //console.log('keeping data');
    data.push(obj);
  });
  entriesStream.once('end', function() {
    //console.log('calling end callback');
    callback(null, data);
  });
}

// Gets an array of index names in the wiki-write alias
function getAliasIndices(alias, callback) {
  return _esclient.indices.getAlias({name: alias}, function(err, response) {
    if(err) {
      if(err.status === '404' || err.status === 404)
        return callback(null, []);

      return callback(err);
    }

    return callback(null, Object.keys(response));
  });
}

function getClusterHealth(callback) {
  _esclient.cluster.health({level: 'indices'}, callback);
}

function getClusterState(callback) {
  _esclient.cluster.state({metric: ['master_node', 'nodes', 'metadata']}, callback);
}

function getClusterStats(callback) {
  _esclient.cluster.stats({}, callback);
}

function getBulkIndexStream(options) {
  options = options || {};
  var _bulkSize = options.bulkSize || 10 * 1024 * 1024;
  const _queue = [];
  var _indexInProgress = false;

  function write(chunk, encoding, callback) {
    //console.log('write chunk');
    writev([{chunk: chunk}], callback);
  }

  function writev(chunks, callback) {
    //console.log('writev chunk');

    _queue.push(...chunks.map((chunk, i) => {
      const text = JSON.stringify(chunk.chunk.action) + '\n' + (chunk.chunk.doc ? (JSON.stringify(chunk.chunk.doc) + '\n') : '');
      //console.log(chunk);
      //console.log(text);
      return {text: text, callback: (i === chunks.length - 1) ? callback : null};
    }));

    if(!_indexInProgress) {
      _indexInProgress = true;
      setImmediate(startIndex);
    }
  }

  function startIndex() {
    //console.log('\nStarting another index...');

    let count = 0;
    let size = 0;

    while(count < _queue.length) {
      size += _queue[count].text.length;
      count++;

      if(size >= _bulkSize)
        break;
    }

    var items = _queue.splice(0, count);

    //console.log(`Indexing ${items.length} items (${_queue.length} remaining)...`);

    _esclient.bulk({
      refresh: options.refresh,
      type: options.type,
      index: options.index,
      body: items.map(c => c.text).join('')
    }, (err, result) => {
      if(err) {
        logger.warn({messageId: 'server/es/bulk-load/error', err: err}, 'Elasticsearch bulk load failed.');

        if(err.statusCode === 400) {
          for(let item of items) {
            if(item.callback)
              item.callback(err);
          }

          return;
        }

        _queue.unshift(...items);
        return startIndex();
      }

      // Check results to know what to retry
      if(result.errors) {
        for(let i = 0; i < items.length; i++) {
          if(!result.items[i].create || result.items[i].create.status === 201) {
            if(items[i].callback)
              items[i].callback();

            continue;
          }

          if(result.items[i].create.status === 429 || result.items[i].create.status === 503) {
            _queue.push(items[i]);
          }
          else {
            //log.warn({messageId: 'lib/es/bulk-load/item-error', status: result.items[i].create.status, action: items[i].text}, 'Item failed for unknown reason.');
            if(items[i].callback)
              items[i].callback(new Error(`Item failed due to ${result.items[i].create.status} error.`));
          }
        }
      }
      else {
        for(let item of items) {
          if(item.callback)
            item.callback();
        }
      }

      if(_queue.length) {
        return startIndex();
      }
      else {
        _indexInProgress = false;
      }
    });
  }

  return new stream.Writable({
    highWaterMark: 3 * 1000,
    objectMode: true,
    write: write,
    writev: writev
  });
}

// A mechanism for fast-loading a new static index
//
// options is {alias: 'alias', mapping: {}}
function StaticIndexer(options) {
  if(!options.alias)
    throw new Error('Failed to find "alias" parameter');

  if(!options.mapping)
    throw new Error('Failed to find "mapping" parameter');

  // 24H date format down to the millisecond for marking active indices
  // We go to the millisecond
  const DATE_MINUTE_FORMAT = d3.timeFormat('%Y-%m-%d-%H-%M-%S-%L');
  const INDEX_NAME = options.alias + '-' + DATE_MINUTE_FORMAT(new Date());

  const CONCURRENCY = 2;
  let nextStreamIndex = 0;

  const queues = [...new Array(CONCURRENCY)].map(a => getBulkIndexStream({ index: INDEX_NAME }));

  let doneFunc = null;
  let pushed = 0, indexed = 0;

  function writeProgress() {
    process.stdout.write(`Wrote ${indexed}/${pushed}...\r`);
  }

  function push(doc, id, type) {
    pushed++;
    writeProgress();

    ++nextStreamIndex;

    if(nextStreamIndex >= queues.length)
      nextStreamIndex = 0;

    queues[nextStreamIndex].write({action: { index: {_type: type, _id: id}}, doc: doc}, null, err => {
      indexed++;
      writeProgress();

      if(err) {
        console.error('Error while indexing into elasticsearch:', err);
        return;
      }
    });
  }

  function createIndex(callback) {
    console.error(`Creating index ${INDEX_NAME}...`)

    _esclient.indices.create({
      index: INDEX_NAME,
      body: {
        settings: {
          // Disable refresh while we're loading
          'index.refresh_interval': -1,

          'index.number_of_shards': config.number_of_shards,

          // Common analyzer
          analysis: COMMON_ANALYSIS,
        },
        mappings: options.mapping,
      }
    }, callback);
  }

  function refreshIndex(callback) {
    console.error('Refreshing index...');
    _esclient.indices.refresh({ index: INDEX_NAME }, callback);
  }

  function optimizeIndex(callback) {
    console.error('Force-merging index...');
    _esclient.indices.forcemerge({ index: INDEX_NAME, maxNumSegments: 1, requestTimeout: 120000 }, callback);
  }

  function switchAliases(callback) {
    console.error('Switching the aliases...');

    getAliasIndices(options.alias, function(err, readIndexes) {
      if(err)
        return callback(err);

      var actions = [
        { add: { index: INDEX_NAME, alias: options.alias } },
      ];

      readIndexes.forEach(function(index) {
        actions.push({ remove: { index: index, alias: options.alias } });
      });

      _esclient.indices.updateAliases({
        body: {
          actions: actions
        }
      }, callback);
    });
  }

  function waitForElasticSearch(callback) {
    console.error('Waiting for Elasticsearch to finish...');

    return async.parallel(queues.map((q, i) => (callback => {
      return q.end(() => {
        //console.log(`ended ${i}`);
        callback();
      });
    })), callback);
  }

  function end(callback) {
    return async.series([
      waitForElasticSearch,
      refreshIndex,
      optimizeIndex,
      switchAliases,
    ], callback);
  }

  this.createIndex = createIndex;
  this.push = push;
  this.end = end;
}

module.exports.client = _esclient;
module.exports.getClusterHealth = getClusterHealth;
module.exports.getClusterState = getClusterState;
module.exports.getClusterStats = getClusterStats;
module.exports.getEntriesStream = getEntriesStream;
module.exports.getAllEntries = getAllEntries;
module.exports.getAliasIndices = getAliasIndices;
module.exports.StaticIndexer = StaticIndexer;
module.exports.getBulkIndexStream = getBulkIndexStream;
module.exports.COMMON_MAPPING = COMMON_MAPPING;
module.exports.COMMON_ANALYSIS = COMMON_ANALYSIS;
