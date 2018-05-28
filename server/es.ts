// Useful docs
// See: https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/api-reference-2-0.html

import * as d3 from 'd3-time-format';
import * as async from 'async';
import * as stream from 'stream';
import { EventEmitter } from 'events';
import config = require('./config');
const logger = config.logger;

import * as elasticsearch from 'elasticsearch';
export * from 'elasticsearch';

const _esclient = new elasticsearch.Client(config.elasticsearch);

// Mapping for the "common" object
export const COMMON_MAPPING = {
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

export const COMMON_ANALYSIS = {
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

export type InnerHit = elasticsearch.SearchResponse<object>['hits']['hits'][0];

// Returns a stream (EventEmitter with data, error, and end) that
// scrolls through all the entries in the given index
export function getEntriesStream(options?: elasticsearch.SearchParams): stream.Readable {
  let fetchedItems = 0;
  let _scroll_id: string | undefined = undefined;
  let _inProgress = false, _done = false;

  const resultStream = new stream.Readable({
    objectMode: true,
    read: read
  });

  //console.log('start');

  const query: elasticsearch.SearchParams = {
    sort: ['_doc'],
    scroll: '30s',
    body: { query: { match_all: {} } }
  };

  if(options)
    Object.assign(query, options);

  function read(): void {
    if(_inProgress || _done)
      return;

    _inProgress = true;

    if(!_scroll_id) {
      return _esclient.search(query, getMoreEntries);
    }
    else {
      return _esclient.scroll({
        scrollId: _scroll_id,
        scroll: '30s'
      }, getMoreEntries);
    }
  }

  function getMoreEntries(err: any, resp: elasticsearch.SearchResponse<object>): void {
    //console.log('getMoreEntries');
    _inProgress = false;

    if(err)
      return resultStream.emit('error', err), undefined;

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
export function getAllEntries(options: elasticsearch.SearchParams, callback: (err: any, data: InnerHit[]) => void) {
  const entriesStream = getEntriesStream(options);
  const data: InnerHit[] = [];

  entriesStream.once('error', callback);
  entriesStream.on('data', (obj: InnerHit) => {
    //console.log('keeping data');
    data.push(obj);
  });
  entriesStream.once('end', () => {
    //console.log('calling end callback');
    return callback(null, data);
  });
}

// Gets an array of index names in the wiki-write alias
export function getAliasIndices(alias: string, callback: (err: any, indexes?: string[]) => void): void {
  return _esclient.indices.getAlias({name: alias}, (err, response) => {
    if(err) {
      if(err.status === '404' || err.status === 404)
        return callback(null, []);

      return callback(err);
    }

    return callback(null, Object.keys(response));
  });
}

export function getClusterHealth(callback: (error: any, response: any) => void) {
  _esclient.cluster.health({level: 'indices'}, callback);
}

export function getClusterState(callback: (error: any, response: any) => void) {
  _esclient.cluster.state({metric: ['master_node', 'nodes', 'metadata']}, callback);
}

export function getClusterStats(callback: (error: any, response: any) => void) {
  _esclient.cluster.stats({}, callback);
}

interface BulkAction {
  action: { index: object } | { create: object } | { delete: object } | { update: object },
  doc: object
}

interface BulkIndexStreamOptions {
  /** Option for refreshing the index atfer each write.
   * 
   * For best performance, set this to false and refresh manually after the indexing is finished.
   */
  refresh?: elasticsearch.Refresh,

  /** Default type to upload to if one isn't specified in the bulk item. */
  type?: string,

  /** Default index to upload to if one isn't specified in the bulk item. */
  index?: string,

  /** Number of bytes to send in each bulk index request. Defaults to 10 MiB. */
  bulkSize?: number
}

export function getBulkIndexStream(options: BulkIndexStreamOptions): stream.Writable {
  interface QueueItem {
    text: string,
    callback: Function | null
  }

  options = options || {};
  var _bulkSize = options.bulkSize || 10 * 1024 * 1024;
  const _queue: QueueItem[] = [];
  var _indexInProgress = false;

  function write(chunk: BulkAction, encoding: string, callback: Function) {
    //console.log('write chunk');
    writev([{chunk: chunk}], callback);
  }

  function writev(chunks: ReadonlyArray<{ chunk: BulkAction }>, callback: Function) {
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

  function startIndex(): void {
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

    return _esclient.bulk({
      refresh: options.refresh,
      type: options.type,
      index: options.index,
      body: items.map(c => c.text).join('')
    }, (err: any, result: any) => {
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
              items[i].callback!();

            continue;
          }

          if(result.items[i].create.status === 429 || result.items[i].create.status === 503) {
            _queue.push(items[i]);
          }
          else {
            //log.warn({messageId: 'lib/es/bulk-load/item-error', status: result.items[i].create.status, action: items[i].text}, 'Item failed for unknown reason.');
            if(items[i].callback)
              items[i].callback!(new Error(`Item failed due to ${result.items[i].create.status} error.`));
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

interface StaticIndexerOptions {
  /**
   * The alias to switch to this new index upon completion. Any indexes already
   * referenced by this alias will be removed.
   *
   * The index will be named based on this alias plus a timestamp.
   */
  alias: string,

  /** The mapping for the new index. */
  mapping: object,

  /**
   * Number of bulk index operations to attempt at once. This depends on the
   * capacity of your cluster. Defaults to 2.
   */
  concurrency?: number
}

/** A mechanism for fast-loading a new index. */
export class StaticIndexer {
  private readonly queues: stream.Writable[];
  private readonly indexName: string;
  private readonly mapping: object;
  private readonly alias: string;
  private pushed = 0;
  private indexed = 0;
  private doneFunc: Function | null = null;
  private nextStreamIndex = 0;

  constructor(options: StaticIndexerOptions) {
    if(!options.alias)
      throw new Error('Failed to find "alias" parameter');

    if(!options.mapping)
      throw new Error('Failed to find "mapping" parameter');

    // 24H date format down to the millisecond for marking active indices
    // We go to the millisecond
    const DATE_MINUTE_FORMAT = d3.timeFormat('%Y-%m-%d-%H-%M-%S-%L');
    const CONCURRENCY = options.concurrency || 2;

    this.indexName = `${options.alias}-${DATE_MINUTE_FORMAT(new Date())}`;
    this.queues = [...new Array(CONCURRENCY)].map(a => getBulkIndexStream({ index: this.indexName }));
    this.mapping = options.mapping;
    this.alias = options.alias;
  }

  private writeProgress(): void {
    process.stdout.write(`Wrote ${this.indexed}/${this.pushed}...\r`);
  }

  push(doc: object, id: string, type: string): void {
    this.pushed++;
    this.writeProgress();

    ++this.nextStreamIndex;

    if(this.nextStreamIndex >= this.queues.length)
      this.nextStreamIndex = 0;

    return this.queues[this.nextStreamIndex].write({action: { index: {_type: type, _id: id}}, doc: doc}, undefined, (err: any) => {
      this.indexed++;
      this.writeProgress();

      if(err) {
        console.error('Error while indexing into elasticsearch:', err);
        return;
      }
    }), undefined;
  }

  createIndex(callback: (error: any, response: any, status: any) => void): void {
    console.error(`Creating index ${this.indexName}...`)

    return _esclient.indices.create({
      index: this.indexName,
      body: {
        settings: {
          // Disable refresh while we're loading
          'index.refresh_interval': -1,

          'index.number_of_shards': config.number_of_shards,

          // Common analyzer
          analysis: COMMON_ANALYSIS,
        },
        mappings: this.mapping,
      }
    }, callback);
  }

  private refreshIndex(callback: (error: any, response: any) => void): void {
    console.error('Refreshing index...');
    return _esclient.indices.refresh({ index: this.indexName }, callback);
  }

  private optimizeIndex(callback: (error: any, response: any, status: any) => void): void {
    console.error('Force-merging index...');
    return _esclient.indices.forcemerge({ index: this.indexName, maxNumSegments: 1, requestTimeout: 120000 }, callback);
  }

  private switchAliases(callback: (error: any, response: any) => void): void {
    console.error('Switching the aliases...');

    getAliasIndices(this.alias, (err, readIndexes) => {
      if(err)
        return callback(err, undefined);

      var actions: elasticsearch.IndicesUpdateAliasesParamsAction[] = [
        { add: { index: this.indexName, alias: this.alias } },
      ];

      if(readIndexes) {
        readIndexes.forEach(index => {
          actions.push({ remove: { index: index, alias: this.alias } });
        });
      }

      _esclient.indices.updateAliases({
        body: {
          actions: actions
        }
      }, callback);
    });
  }

  private waitForElasticSearch(callback: (err: any) => void): void {
    console.error('Waiting for Elasticsearch to finish...');

    return async.parallel(this.queues.map((q, i) => ((callback: (err?: object) => void) => {
      return q.end(() => {
        //console.log(`ended ${i}`);
        callback();
      });
    })), callback);
  }

  end(callback: (err: any) => void): void {
    return async.series([
      this.waitForElasticSearch,
      this.refreshIndex,
      this.optimizeIndex,
      this.switchAliases,
    ], callback);
  }
}

export const client = _esclient;
