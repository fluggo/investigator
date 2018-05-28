// Useful docs
// See: https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/api-reference-2-0.html
'use strict';

const d3 = require('d3');
const async = require('async');
const EventEmitter = require('events');
module.exports = new EventEmitter();
const es = require('../es');

const util = require('./util');
const indexMaint = require('./index-maint');
const logger = util.logger;
const uuid = require('uuid/v4');
const extend = require('extend');
const userFuncs = require('./user-funcs');

function getArticleById(id, options, callback) {
  if(!callback) {
    callback = options;
    options = {};
  }

  const stageOne = {
    article: callback =>
      es.client.get({
        index: util.WIKI_READ_ALIAS,
        type: util.ARTICLE,
        id: id,
      }, callback)
  };

  // Determine whether to try to fetch references to this article
  if(options.references) {
    stageOne.linkRefs = callback =>
      es.client.search({
        index: util.WIKI_READ_ALIAS,
        type: util.ARTICLE,
        body: {
          query: {
            bool: {
              filter: [ { term: { 'wiki.bodyReferencedArticles': id } } ]
            }
          },
          sort: '_doc',
          size: 10,
          _source: ['wiki.title', 'wiki.body'],
        }
      }, callback);

    stageOne.tagRefs = callback =>
      es.client.search({
        index: util.WIKI_READ_ALIAS,
        type: util.ARTICLE,
        body: {
          query: {
            bool: {
              filter: [ { term: { 'wiki.baseTags': id } } ]
            }
          },
          sort: '_doc',
          size: 10,
          _source: ['wiki.title'],
        }
      }, callback);

    stageOne.hashtagRefs = callback =>
      es.client.search({
        index: util.WIKI_READ_ALIAS,
        type: util.ARTICLE,
        body: {
          query: {
            bool: {
              filter: [ { term: { 'wiki.bodyReferencedHashtags': id } } ]
            }
          },
          sort: '_doc',
          size: 10,
          _source: ['wiki.title', 'wiki.body'],
        }
      }, callback);

    stageOne.reverseTagRefs = callback =>
      es.client.search({
        index: util.WIKI_READ_ALIAS,
        type: util.ARTICLE,
        body: {
          query: {
            bool: {
              filter: [ { term: { 'wiki.tagReferencedArticles': id } } ]
            }
          },
          sort: '_doc',
          size: 100,
          _source: ['wiki.title', 'wiki.rels'],
        }
      }, callback);
  }

  // Execute stage one
  return async.parallel(stageOne, (err, stageOneResult) => {
    if(err) {
      if(+err.status === 404)
        return callback(null, null);

      return callback(err);
    }

    const result = stageOneResult.article[0];

    if(options.references) {
      result.references = {
        tags: {
          total: stageOneResult.tagRefs[0].hits.total,
          hits: stageOneResult.tagRefs[0].hits.hits.map(hit => { return { id: hit._id, title: hit._source.wiki.title }; }),
        },
        reverseTagRefs: {
          total: stageOneResult.reverseTagRefs[0].hits.total,
          hits: [].concat(...stageOneResult.reverseTagRefs[0].hits.hits.map(hit =>
            [].concat(...Object.keys(hit._source.wiki.rels)
              .filter(tag => indexMaint.getTagTypeSync(tag) === 'article' && hit._source.wiki.rels[tag].some(refId => refId === id))
              .map(tag => {
                return {
                  id: hit._id,
                  title: hit._source.wiki.title,
                  tag: tag,
                };
              }))
          )),
        },
        links: {
          total: stageOneResult.linkRefs[0].hits.total,
          hits: stageOneResult.linkRefs[0].hits.hits.map(hit => {
            return {
              id: hit._id,
              title: hit._source.wiki.title,
              lines: util.parseBodyForRefsSync(hit._source.wiki.body).linkLines.filter(line => line.ref === id).map(line => line.context)
            };
          }),
        },
        hashtags: {
          total: stageOneResult.hashtagRefs[0].hits.total,
          hits: stageOneResult.hashtagRefs[0].hits.hits.map(hit => {
            return {
              id: hit._id,
              title: hit._source.wiki.title,
              lines: util.parseBodyForRefsSync(hit._source.wiki.body).hashtagLines.filter(line => line.ref === id).map(line => line.context)
            };
          }),
        },
      };
    }

    callback(null, result);
  });
}

function search(body, callback) {
  es.client.search({
    index: util.WIKI_READ_ALIAS,
    type: util.ARTICLE,
    body: body,
  }, callback);
};

function getArticleSummariesById(ids, callback) {
  es.client.mget({
    index: util.WIKI_READ_ALIAS,
    type: util.ARTICLE,
    _source: [
      'wiki.title',
      'wiki.body',
      'wiki.rels.tag-type',
      'wikiUnreviewed.title',
      'wikiUnreviewed.body',
      'wikiUnreviewed.rels.tag-type',
    ],
    body: {
      ids: ids
    }
  }, function(err, res) {
    if(err)
      return callback(err);

    var result = res.docs.map(doc => {
      return {
        id: doc._id,
        found: doc.found,
        title: (doc._source && ((doc._source.wiki && doc._source.wiki.title) || (doc._source.wikiUnreviewed && doc._source.wikiUnreviewed.title))) || undefined,
        summary: (doc._source && (util.parseBodyForSummary((doc._source.wiki && doc._source.wiki.body) || (doc._source.wikiUnreviewed && doc._source.wikiUnreviewed.body)))) || undefined,
        tagType: (doc._source && ((doc._source.wiki && doc._source.wiki.rels && util.collapseArray(doc._source.wiki.rels['tag-type'])) ||
          (doc._source.wikiUnreviewed && doc._source.wikiUnreviewed.rels && util.collapseArray(doc._source.wikiUnreviewed.rels['tag-type'])))) || undefined,
      };
    });

    return callback(null, result);
  });
}

function getArticleHistory(uuid, options, callback) {
  options = options || {};

  const query = {
    term: { 'uuid': uuid }
  };

  const body = {
    query: query,
    from: options.from,
    size: options.size,
    sort: [
      { updatedTime: { order: 'desc' } },
    ],
    _source: true
  };

  es.client.search({
    index: util.WIKI_READ_ALIAS,
    type: util.ARTICLE_HISTORY,
    body: body,
  }, function(err, resp) {
    return callback(err, resp);
  });
}

function getUnreviewedArticles(callback) {
  es.client.search({
    index: util.WIKI_READ_ALIAS,
    type: util.ARTICLE,
    body: {
      query: {
        term: { 'wiki.unreviewed': true }
      },
      size: 200,
      sort: [
        { 'wikiUnreviewed.updatedTime': { order: 'asc' } },
      ],
      _source: true,
    }
  }, (err, resp) => {
    if(err)
      return callback(err);

    return callback(err, resp);
  });
}

function getArticleByUuid(uuid, callback) {
  const query = {
    term: { 'wiki.uuid': uuid }
  };

  const body = {
    query: query,
    _source: true
  };

  es.client.search({
    index: util.WIKI_READ_ALIAS,
    type: util.ARTICLE,
    body: body,
  }, function(err, resp) {
    return callback(err, resp.hits.hits[0]);
  });
}

const CORRELATIONS = (() => {
  const ldap = require('../ldap');
  const cylance = require('../cylance');

  return [
    {
      tag: ldap.ID_TAG,
      stringSearch: (q, callback) => ldap.stringSearch(q, {all: true, idOnly: true, correlationOnly: true}, callback),
      getById: (id, callback) => ldap.getObjectsById(id, {}, (err, resp) => {
        if(err)
          return callback(err);

        return callback(null, resp[0]);
      }),
      attribute: 'ldap',
    },
    {
      tag: cylance.DEVICE_ID_TAG,
      stringSearch: (q, callback) => cylance.deviceStringSearch(q, {all: true, idOnly: true}, callback),
      getById: (id, callback) => cylance.getDeviceObjectsById(id, {}, (err, resp) => {
        if(err)
          return callback(err);

        return callback(null, resp[0]);
      }),
      attribute: 'cylanceDevice',
    }
  ];
})();

function correlateIdSearch(q, options, callback) {
  // The primary correlation search function behind our wiki correlation feature.
  // We run the @q@ query against all known correlation sources, match IDs where we can,
  // and join the results into a single list
  options = options || {};

  let terms = util.parseQueryTerms(q);
  let query = util.createWikiQuery(terms, {unreviewed: options.unreviewed});

  const ldap = require('../ldap');
  const cylance = require('../cylance');

  const wikiRoot = options.unreviewed ? 'wikiUnreviewed' : 'wiki';
  const LDAP_TAG_PATH = `${wikiRoot}.rels.${ldap.ID_TAG}`;
  const CYLANCE_DEVICE_TAG_PATH = `${wikiRoot}.rels.${cylance.ID_TAG}`;

  return async.parallel([
    callback => es.getAllEntries({
      index: util.WIKI_READ_ALIAS,
      type: util.ARTICLE,
      body: {
        query: {
          bool: {
            must: [
              query,
            ],
            filter: {
              bool: {
                should: CORRELATIONS.map(corr => {
                  return { constant_score: { filter:
                    { exists: { field: `${wikiRoot}.rels.${corr.tag}` } }
                  } };
                }),
                minimum_should_match: 1,
              }
            }
          }
        },
        _source: ['wiki.uuid'].concat(CORRELATIONS.map(corr => `${wikiRoot}.rels.${corr.tag}`)),
      },
    }, callback)
  ].concat(CORRELATIONS.map(corr => (callback => corr.stringSearch(q, callback)))), (err, searchResults) => {
    if(err)
      return callback(err);

    const queryBody = {
      query: {
        bool: {
          should: CORRELATIONS.map((corr, i) => {
            // Find everything matching our IDs
            return { constant_score: { filter:
              { terms: { [`${wikiRoot}.rels.${corr.tag}`]: searchResults[i + 1] } }
            } };
          }),
          must_not: [
            // Skip anything we already know about
            { terms: { 'wiki.uuid': searchResults[0].map(hit => hit._source.wiki.uuid) } }
          ],
          minimum_should_match: 1,
        },
      },
      _source: ['wiki.uuid'].concat(CORRELATIONS.map(corr => `${wikiRoot}.rels.${corr.tag}`)),
    };

    //console.log(JSON.stringify(queryBody, null, 2));

    // Now that we have ldap objectGUIDs and any other identifiers, find also those articles
    return es.getAllEntries({
      index: util.WIKI_READ_ALIAS,
      type: util.ARTICLE,
      body: queryBody,
    }, (err, remainingWikiResp) => {
      if(err)
        return callback(err);

      const idSets = CORRELATIONS.map((corr, i) => new Set(searchResults[i + 1]));
      let wikiArticles = searchResults[0].concat(remainingWikiResp);

      // Remove all IDs we already know about
      wikiArticles = wikiArticles.filter(article => {
        if(!article._source.wiki)
          return false;

        // If we're looking for official articles, skip articles that don't have official versions yet
        if(!options.unreviewed && !article._source.wiki.title)
          return false;

        let hasId = false;

        // If we have the wiki article, don't return the ID associated with that article
        CORRELATIONS.forEach((corr, i) => {
          if(article._source[wikiRoot].rels[corr.tag]) {
            for(let id of article._source[wikiRoot].rels[corr.tag])
              idSets[i].delete(id);

            hasId = true;
          }
        });

        // Leave out any wiki articles without any IDs attached
        return hasId;
      });

      // Produce a list of all IDs
      const result = Array.from(wikiArticles).map(article => { return {type: 'wiki', id: article._id}; }).concat(
        ...CORRELATIONS.map((corr, i) => Array.from(idSets[i]).map(id => { return {type: corr.tag, id: id}; }))
      );

      return callback(null, result);
    });
  });
}

function filterMapToWikiResults(alternatives, options) {
  const ldap = require('../ldap');

  return alternatives.filter(result => {
    // Feed the recommendations function the right version of the wiki
    const wiki = result.wiki && (options.unreviewed ? result.wiki._source.wikiUnreviewed : (result.wiki._source.wiki.title && result.wiki._source.wiki)) || null;

    result.recommendations = userFuncs.makeWikiRecommendations(
      extend({}, result, {
        wiki: wiki,
        ldapMemoryMap: ldap.memoryMap,
        wikiMemoryMap: indexMaint.getWikiMemoryMapSync(),
      })
    );

    const combinedRecommendations = result.recommendations && util.combineWikiRecommendations(result.recommendations, wiki);

    if(options.withRecommendationsOnly || options.withSuggestionsOnly) {
      // Objects with errors
      if(result.error)
        return true;

      // Objects with recommendation objects
      if(!result.recommendations)
        return false;

      if(result.wiki) {
        if(!alternatives[0].wiki && alternatives[0].recommendations.noauto) {
          // Well, they're not going to like this one either
          return false;
        }

        // Article exists; are there recommendations to implement?
        return combinedRecommendations
          .changes.some(change => change.level <= (options.withRecommendationsOnly ? 2 : 3) && change.action !== 'keep');
      }
      else {
        // Article doesn't exist; do we auto-create these objects?
        return !result.recommendations.noauto;
      }
    }
    else {
      return true;
    }
  });
}

// Selected the unreviewed wiki if requested or if it's the only version available
function pickWiki(wikiObj, unreviewed) {
    // Decide whether we're going to base our relationships on the reviewed article
    const wikiUnreviewed = unreviewed || !wikiObj._source.wiki.title;
    return wikiUnreviewed ? wikiObj._source.wikiUnreviewed : wikiObj._source.wiki;
}

function collectWikiObjects(id, options, callback) {
  options = options || {};

  const replacements = options.replacements || {};
  const suggestions = options.suggestions || {};

  return es.client.get({
    index: util.WIKI_READ_ALIAS,
    type: util.ARTICLE,
    id: id,
  }, (err, wikiObj) => {
    if(err)
      return callback(err);

    // Decide whether we're going to base our relationships on the reviewed article
    const wiki = pickWiki(wikiObj, options.unreviewed);

    const result = {
      wiki: wikiObj,

      // Whether the unreviewed article was used
      wikiUnreviewed: options.unreviewed || !wikiObj._source.wiki.title,
    };

    var nextStage = [];

    for(let corr of CORRELATIONS) {
      const ids = wiki.rels[corr.tag];

      if(ids && ids.length > 1) {
        result.error = {
          message: `This article has more than one ${corr.tag} tag.`,
          code: 'multiple-tags',
        };

        return callback(null, result);
      }

      const id = ids && ids[0];

      if(replacements[corr.attribute]) {
        result[corr.attribute] = replacements[corr.attribute];
      }
      else if(id) {
        nextStage.push(callback => corr.getById(id, (err, resp) => {
          if(err)
            return callback(err);

          result[corr.attribute] = resp || suggestions[corr.attribute];
          return callback();
        }));
      }
      else if(suggestions[corr.attribute]) {
        result[corr.attribute] = suggestions[corr.attribute];
      }
    }

    return async.series(nextStage, err => {
      return callback(err, result);
    });
  });
}

function mapToWiki(id, options, callback) {
  // Maps one of the correlated IDs from correlateIdSearch into an
  // existing wiki article or another object with recommendations

  // result is [{
  //    name: '',
  //    recommendations: {},
  //    ldap?: {_id: '', _source: {}},
  //    wiki?: {_id: '', _source: {}},
  //    error?: {message: '', code: ''},
  // }, ...]
  const ldap = require('../ldap');

  options = options || {};

  const wikiRoot = options.unreviewed ? 'wikiUnreviewed' : 'wiki';
  const LDAP_TAG_PATH = `${wikiRoot}.rels.${ldap.ID_TAG}`;

  if(id.type === 'wiki') {
    return collectWikiObjects(id.id, {unreviewed: options.unreviewed}, (err, result) => {
      if(err) {
        // No result
        if(+err.status === 404)
          return callback(null, null);

        return callback(err);
      }

      result.name = 'Existing article';
      const alternatives = [result];

      if(options.noAlternatives)
        return callback(null, filterMapToWikiResults(alternatives, options));

      var ldapObj = result.ldap;

      let followup = [];

      if(ldapObj && ldapObj._source.ldap.objectClass.indexOf('computer') !== -1) {
        // If you have another data source that manages computers,
        // you could try to link it to the wiki entry here.
      }

      const wiki = pickWiki(result.wiki, options.unreviewed);

      if(wiki.rels['asset-tag']) {
        // If you have another data source that works with specific identifiers,
        // you could try to link it with the wiki entry here.
      }

      return async.series(followup, (err) => {
        if(err)
          return callback(err);

        let identified_objects = new Set();

        return callback(null, filterMapToWikiResults(alternatives, options));
      });
    });
  }
  else if(id.type === ldap.ID_TAG) {
    // This ID was returned from the correlator because no wiki article could be found for it
    return ldap.getObjectsById(id.id, {}, (err, resp) => {
      if(err)
        return callback(err);

      const ldapObj = resp[0];

      if(!ldapObj) {
        return callback(null, []);
      }

      const alternatives = [{
        name: 'New article',
        ldap: ldapObj
      }];

      let followup = [];

      if(ldapObj._source.ldap.objectClass.indexOf('computer') !== -1 && !options.noAlternatives) {
        // If you have another data source that manages computers,
        // you could try to link it to the wiki entry here.
      }

      followup.push(
        // Search for a matching article out there
        callback => {
          var should = [
            { term: { [LDAP_TAG_PATH]: id.id } },
          ];

          if(!options.noAlternatives)
            should.push({ match: { [`${wikiRoot}.title`]: { query: ldapObj._source.common.name, boost: 0.1 } } });

          // If you have another data source that can offer alternative
          // searches for possible articles that already match this object,
          // add them to the "should" query here.

          // Search for a matching article out there
          return es.client.search({
            index: util.WIKI_READ_ALIAS,
            type: util.ARTICLE,
            body: {
              query: {
                bool: {
                  should: should
                }
              },
              _source: false,
              size: 2,
            }
          }, (err, resp) => {
            if(err)
              return callback(err);

            if(resp.hits.total < 1) {
              return callback();
            }

            return async.each(resp.hits.hits, (hit, callback) =>
              collectWikiObjects(hit._id, {replacements: {ldap: ldapObj}, suggestions: { }}, (err, result) => {
                if(err)
                  return callback(err);

                const wiki = pickWiki(result.wiki, options.unreviewed);

                result.name = `Add LDAP object ${ldapObj._source.common.name} to existing article "${wiki.title}"`;

                // Put the wiki result first if it's a really good match
                if(wiki.rels[ldap.ID_TAG] && wiki.rels[ldap.ID_TAG][0] === id.id) {
                  // Exact match
                  alternatives.unshift(result);
                }
                else {
                  alternatives.push(result);
                }

                return callback();
              }), callback);
          })
        }
      );

      return async.series(followup, (err) => {
        if(err)
          return callback(err);

        if(options.noAlternatives && alternatives.length > 1) {
          alternatives.splice(1);
        }

        return callback(null, filterMapToWikiResults(alternatives, options));
      });

    });
  }
  else {
    // You can insert other identifier types for alternate sources here

    return callback(null, [{
      error: {
        message: 'This ID type is not implemented.',
        code: 'invalid-type-code',
      }
    }]);
  }
}

function findAllTags(callback) {
  es.client.search({
    index: util.WIKI_READ_ALIAS,
    type: util.ARTICLE,
    body: {
      query: { match_all: {} },
      size: 0,
      aggs: {
        tags: {
          terms: { field: 'wikiUnreviewed.allBaseTags', size: 1000000 }
        },
      },
    }
  }, (err, allTags) => {
    if(err)
      return callback(err);

    if(allTags.aggregations.tags.buckets.length === 0)
      return callback(null, []);

    return getArticleSummariesById(allTags.aggregations.tags.buckets.map(bucket => bucket.key), (err, articles) => {
      if(err)
        return callback(err);

      // Turn articles into a map
      articles = new Map(articles.filter(article => article.found).map(article => [article.id, article]));

      // Match them back up with their tag counterparts
      const result = allTags.aggregations.tags.buckets.map(bucket => {
        return {
          tag: bucket.key,
          usageCount: bucket.doc_count,
          article: articles.get(bucket.key) || null,
        };
      });

      return callback(null, result);
    });
  });
}

function getArticlesBySearch(query, options, callback) {
  options = options || {};

  es.client.search({
    index: util.WIKI_READ_ALIAS,
    type: util.ARTICLE,
    body: {
      query: query,
    },
    sort: options.sort || '_doc',
    size: options.size || 10000,
  }, function(err, res) {
    if(err)
      return callback(err);

    res = res.hits.hits;

    if(options.hashTags) {
      let hashTagSet = new Set(options.hashTags);

      res.forEach(doc => {
        doc._source.hashTags = util.parseBodyForRefsSync(doc._source.wiki.body).hashtagLines.filter(line => hashTagSet.has(line.ref));
      });
    }

    if(options.summary) {
      res.forEach(doc => {
        doc._source.summary = util.parseBodyForSummary(doc._source.wiki.body);
        doc._source.wiki.body = undefined;
      });
    }

    return callback(null, res);
  });
}

function getArticlesByLdapGuid(ldapGuids, options, callback) {
  const ldap = require('../ldap');

  if(!Array.isArray(ldapGuids))
    ldapGuids = [ldapGuids];

  return getArticlesBySearch({
    terms: {
      ['wiki.rels.' + ldap.ID_TAG]: ldapGuids
    }
  }, options, callback);
}

function createArticle(article, user, options, callback) {
  if(!callback) {
    callback = options;
    options = {};
  }

  indexMaint.pushWriteQueue(callback => {
    const prepared = util.prepareArticleSync(article);

    if(prepared.error) {
      return callback(prepared.error);
    }

    const unreviewedObj = extend({}, prepared.article, {updatedTime: (new Date()).toISOString(), updatedBy: user});

    const item = {
      common: {},
      wiki: {},
      wikiUnreviewed: unreviewedObj,
    };

    const id = prepared.id;

    item.wiki.uuid = uuid();

    if(options.unreviewed) {
      item.wiki.unreviewed = true;
      item.wiki.unreviewedHistory = [unreviewedObj];
    }
    else {
      extend(item.wiki, unreviewedObj, {createdTime: unreviewedObj.updatedTime, createdBy: user});
    }

    item.common.quickSearch = userFuncs.makeWikiQuickSearchTerms(item);

    es.client.create({
      index: util.WIKI_WRITE_ALIAS,
      type: util.ARTICLE,
      id: id,
      body: item,
      refresh: 'true',
    }, function(err, resp) {
      if(err) {
        if(err.statusCode === 409) {
          return callback(new util.WikiError('An article with this title already exists.', 'article-already-exists'));
        }

        return callback(err);
      }

      if(options.unreviewed) {
        logger.info({id: id, user: user, messageId: 'wiki/createArticle/article-needs-review'}, `${user} created ${id}; needs review.`);

        module.exports.emit('article-created', {
          id: id,
          title: article.title,
          user: user,
          changeType: 'created-needs-review'
        });

        return callback(undefined, resp);
      }
      else {
        es.client.index({
          index: util.WIKI_WRITE_ALIAS,
          type: util.ARTICLE_HISTORY,
          body: {
            title: item.wiki.title,
            body: item.wiki.body,
            tags: item.wiki.tags,
            uuid: item.wiki.uuid,
            createdTime: item.wiki.createdTime,
            createdBy: item.wiki.createdBy,
            updatedTime: item.wiki.updatedTime,
            updatedBy: item.wiki.updatedBy,
          },
          refresh: 'true'
        }, err => {
          if(err) {
            // Log the error, but call it a success
            logger.error({err: err, id: id, messageId: 'wiki/createArticle/history-error'}, `Failed to index history for article ${id}.`);
          }

          logger.info({id: id, user: user, messageId: 'wiki/createArticle/article-created'}, `${user} created ${id}.`);

          module.exports.emit('article-changed', {
            id: id,
            title: article.title,
            user: user,
            changeType: 'created'
          });

          return callback(undefined, resp);
        });
      }

    });
  }, callback);

  indexMaint.reloadTagsWithReindex(err => {
    if(err)
      logger.error({err: err}, 'Error reloading tags after creating article.');
  });

  indexMaint.updateUnreviewedArticleCount();
  indexMaint.fetchLatestWikiMap();
};

function updateArticle(id, version, article, user, options, callback) {
  if(callback === undefined) {
    callback = options;
    options = {};
  }

  // options can include:
  //    unreviewed
  //      false - Make an official version of the article.
  //      true - Make an unofficial version of the article.
  //      'keep' - If the article is already unreviewed, make an unreviewed version.

  indexMaint.pushWriteQueue(callback => {
    const prepared = util.prepareArticleSync(article);

    if(prepared.error) {
      return callback(prepared.error);
    }

    const unreviewedObj = extend({}, prepared.article, {updatedTime: (new Date()).toISOString(), updatedBy: user});

    const item = {
      common: {},
      wikiUnreviewed: unreviewedObj,
    };

    const newId = prepared.id;

    // Fetch the original article
    getArticleById(id, {}, function(err, result) {
      if(err)
        return callback(err);

      const unreviewedHistory = result._source.wiki.unreviewedHistory;

      if(options.unreviewed === 'keep')
        options.unreviewed = result._source.wiki.unreviewed;

      if(options.unreviewed) {
        item.wiki = result._source.wiki;

        item.wiki.unreviewed = true;
        item.wiki.unreviewedHistory = item.wiki.unreviewedHistory || [];
        item.wiki.unreviewedHistory.push(unreviewedObj);
      }
      else {
        item.wiki = extend({}, unreviewedObj, {
          unreviewed: false,
          createdBy: result._source.wiki.createdBy || unreviewedObj.updatedBy,
          createdTime: result._source.wiki.createdTime || unreviewedObj.updatedTime,
          uuid: result._source.wiki.uuid,
        });
      }

      item.common.quickSearch = userFuncs.makeWikiQuickSearchTerms(item);

      if(id === newId || options.unreviewed) {
        es.client.index({
          index: util.WIKI_WRITE_ALIAS,
          type: util.ARTICLE,
          id: id,
          version: version,
          body: item,
          refresh: 'true'
        }, function(err, resp) {
          if(err) {
            if(err.statusCode === 409) {
              return callback(new util.WikiError('The article changed since last loaded.', 'version-conflict'));
            }

            return callback(err);
          }

          if(options.unreviewed) {
            resp._source = item;

            logger.info({id: id, user: user, messageId: 'wiki/updateArticle/article-needs-review'}, `${user} updated article ${id}; needs review.`);

            module.exports.emit('article-changed', {
              id: newId,
              title: article.title,
              user: user,
              changeType: 'updated-needs-review'
            });

            return callback(undefined, resp);
          }
          else {
            es.client.index({
              index: util.WIKI_WRITE_ALIAS,
              type: util.ARTICLE_HISTORY,
              body: extend({}, item.wiki, {unreviewedHistory: unreviewedHistory}),
              refresh: 'true',
            }, err => {
              if(err) {
                // Log the error, but report success
                logger.error({err: err, id: id, messageId: 'wiki/updateArticle/history-error'}, `Failed to index history for article ${id}.`);
              }

              resp._source = item;

              logger.info({id: id, user: user, messageId: 'wiki/updateArticle/article-changed'}, `${user} updated article ${id}.`);

              module.exports.emit('article-changed', {
                id: newId,
                title: article.title,
                user: user,
                changeType: 'updated'
              });

              return callback(undefined, resp);
            });
          }
        });
      }
      else {
        es.client.create({
          index: util.WIKI_WRITE_ALIAS,
          type: util.ARTICLE,
          id: newId,
          body: item,
          refresh: 'true',
        }, function(err, resp) {
          if(err) {
            if(err.statusCode === 409) {
              return callback(new util.WikiError('An article with this title already exists.', 'article-already-exists'));
            }

            return callback(err);
          }

          resp._source = item;

          es.client.index({
            index: util.WIKI_WRITE_ALIAS,
            type: util.ARTICLE_HISTORY,
            body: extend({}, item.wiki, {unreviewedHistory: unreviewedHistory}),
            refresh: 'true'
          }, err => {
            if(err)
              logger.error({err: err, id: id, messageId: 'wiki/updateArticle/history-error'}, `Failed to index history for article ${id}.`);

            es.client.delete({
              index: util.WIKI_WRITE_ALIAS,
              type: util.ARTICLE,
              id: id,
              refresh: 'true',
            }, function(err) {
              if(err) {
                // Log the error, but report success
                return callback(new util.WikiError('Failed to delete old article.', 'delete-old-article-failed'));
              }

              logger.info({id: newId, oldId: id, user: user, messageId: 'wiki/updateArticle/article-renamed'}, `${user} renamed ${id} to ${newId}.`);

              module.exports.emit('article-changed', {
                id: newId,
                oldId: id,
                title: article.title,
                oldTitle: result._source.wiki.title,
                user: user,
                changeType: 'updated'
              });

              return callback(undefined, resp);
            });
          });

        });
      }
    });
  }, callback);

  indexMaint.reloadTagsWithReindex(err => {
    if(err)
      logger.error({err: err}, 'Error reloading tags after updating article.');
  });

  indexMaint.updateUnreviewedArticleCount();
  indexMaint.fetchLatestWikiMap();
};

function deleteArticle(id, user, callback) {
  es.client.delete({
    index: util.WIKI_WRITE_ALIAS,
    type: util.ARTICLE,
    id: id,
    refresh: 'true',
  }, function(err) {
    if(err)
      return callback(new util.WikiError('Failed to delete article.', 'delete-article-failed'));

    logger.info({id: id, user: user, messageId: 'wiki/deleteArticle/article-deleted'}, `${user} deleted ${id}.`);

    module.exports.emit('article-changed', {
      id: id,
      user: user,
      changeType: 'deleted'
    });

    indexMaint.updateUnreviewedArticleCount();
    indexMaint.fetchLatestWikiMap();

    return callback();
  });
}

function checkArticlesExist(ids, callback) {
  return getArticleSummariesById(ids, callback);
}

function getWikiReport(query, tags, callback) {
  return async.parallel({
    tags: callback => getArticleSummariesById(tags, callback),
    articles: callback => es.client.search({
      index: util.WIKI_READ_ALIAS,
      type: util.ARTICLE,
      size: 10000,
      body: {
        query: query
      }
    }, callback)
  }, (err, stageOneResult) => {
    if(err)
      return callback(err);

    var tagTypes = new Map();

    //console.log(JSON.stringify(stageOneResult.articles, null, 2));

    var result = {
      tags: stageOneResult.tags.map(article => {
        var tag = { id: article.id };

        article.tagType = article.tagType || indexMaint.getTagTypeSync(article.id);

        if(article.tagType) {
          tag.type = article.tagType;
          tagTypes.set(article.id, tag.type);
        }
        else {
          tagTypes.set(article.id, 'string');
        }

        if(article.summary)
          tag.summary = article.summary;

        if(article.title)
          tag.title = article.title;

        return tag;
      }),
      resultCount: stageOneResult.articles[0].hits.total,
    };

    result.articles = stageOneResult.articles[0].hits.hits.map(sourceArticle => {
      var article = {
        id: sourceArticle._id,
        title: sourceArticle._source.wiki.title,
        summary: util.parseBodyForSummary(sourceArticle._source.wiki.body),
        tags: {},
      };

      for(let tag of result.tags)
        article.tags[tag.id] = null;

      for(let tagStr of sourceArticle._source.wiki.tags) {
        let tag = util.parseTag(tagStr);
        let tagType = tagTypes.get(tag.tag);

        if(!tagType)
          continue;

        if(!article.tags[tag.tag])
          article.tags[tag.tag] = [];

        if(tag.value) {
          tag.value = util.parseTagValue(tagType, tag.value);
          article.tags[tag.tag].push({ value: tag.value });
        }
        else {
          article.tags[tag.tag].push({ value: true });
        }
      }

      var refs = util.parseBodyForRefsSync(sourceArticle._source.wiki.body);

      for(let hashtagLine of refs.hashtagLines) {
        let tagType = tagTypes.get(hashtagLine.ref);

        if(!tagType)
          continue;

        let line = { line: hashtagLine.context };

        if(hashtagLine.value)
          line.value = util.parseTagValue(tagType, hashtagLine.value);

        if(!article.tags[hashtagLine.ref])
          article.tags[hashtagLine.ref] = [];

        article.tags[hashtagLine.ref].push(line);
      }

      return article;
    });

    return callback(null, result);
  });
}

function getTagFrequencyByPrefix(prefix, callback) {
/*  const query = {
    prefix: {
      'wikiUnreviewed.baseTags': prefix
    }
  };*/

  prefix = prefix.toLowerCase().replace(/[.?+*|{}[\]()"\#@&<>~]/g, '\\$&');

  es.client.search({
    index: util.WIKI_READ_ALIAS,
    type: util.ARTICLE,
    body: {
      query: { match_all: {} },
      size: 0,
      aggs: {
        tags: {
          terms: {
            field: 'wikiUnreviewed.allBaseTags',
            include: prefix + '.*'
          }
        }
      }
    }
  }, callback);
}

function quickSearch(q, options, callback) {
  if(!callback) {
    callback = options;
    options = {};
  }

  q = q || '';
  options = options || {};

  const query = {
    bool: {
      must: {
        term: {
          'common.quickSearch.text': q.toLowerCase()
        }
      },
    }
  };

  if(!options.includeIds) {
    query.bool.must_not = { term: { 'common.quickSearch.isId': true } };
  }

  es.client.search({
    index: util.WIKI_READ_ALIAS,
    type: util.ARTICLE,
    body: {
      query: {
        nested: {
          path: 'common.quickSearch',
          query: query,
          inner_hits: {
            sort: [{ 'common.quickSearch.weight': { order: 'desc', missing: 1 }}],
            size: 1,
            highlight: {
              pre_tags: ["<highlight>"],
              post_tags: ["</highlight>"],
              number_of_fragments: 0,
              fields: {
                'common.quickSearch.text': {type: "fvh"}
              }
            },
          },
        },
      },
      _source: ['wikiUnreviewed.title', 'wiki.title'],
    }
  }, (err, resp) => {
    if(err)
      return callback(err);

    const result = resp.hits.hits.map(hit => {
      const innerHit = hit.inner_hits['common.quickSearch'].hits.hits[0];

      return {
        text: innerHit._source.text,
        id: hit._id,
        highlight: innerHit.highlight['common.quickSearch.text'][0],
        category: innerHit._source.category,
        title: innerHit._source.isTitle ? undefined : (hit._source.wikiUnreviewed.title || hit._source.wiki.title),
        href: 'wiki/article/' + encodeURIComponent(hit._id),
        type: 'wiki-article',
      };
    });

    callback(null, result);
  });
}

function findDuplicateTagValues(tags, callback) {
  if(!tags) {
    tags = indexMaint.getWikiMemoryMapSync().byTag.get('unique-tag') || [];
    tags = tags.map(doc => doc.id);
  }

  // Find duplicate terms
  tags = Array.from(new Set(tags));
  const aggs = {};

  for(let tag of tags) {
    aggs[tag] = { terms: { field: `wiki.rels.${tag}`, min_doc_count: 2 }};
  }

  return es.client.search({
    index: util.WIKI_READ_ALIAS,
    type: util.ARTICLE,
    body: {
      query: { exists: { field: 'wiki.title' } },
      aggs: aggs,
      size: 0,
    }
  }, (err, firstResult) => {
    if(err)
      return callback(err);

    // Find the wiki articles that match these terms
    const nextSearch = [];

    for(let tag of tags) {
      let keys = firstResult.aggregations[tag].buckets.map(a => a.key);

      if(keys.length)
        nextSearch.push({ terms: { [`wiki.rels.${tag}`]: keys } });
    }

    if(!nextSearch.length)
      return callback(null, tags.map(tag => { return { tag: tag, keys: [] }; }));

    return es.client.search({
      index: util.WIKI_READ_ALIAS,
      type: util.ARTICLE,
      body: {
        query: { bool: { should: nextSearch, minimum_should_match: 1 } },
        sort: '_doc',
        size: 1000,
        _source: ['wiki.title'].concat(tags.map(tag => `wiki.rels.${tag}`)),
      }
    }, (err, searchResult) => {
      if(err)
        return callback(err);

      // Map the articles back onto the tags and terms, and return that
      const result = tags.map(tag => {
        return {
          tag: tag,
          keys: firstResult.aggregations[tag].buckets.map(bucket => {
            return {
              key: bucket.key,
              count: bucket.doc_count,
              docs: searchResult.hits.hits.filter(doc => doc._source.wiki.rels[tag] && doc._source.wiki.rels[tag].some(a => a === bucket.key)),
            };
          })
        };
      });

      return callback(null, result);
    });
  });
}

module.exports.getArticleById = getArticleById;
module.exports.getArticlesByLdapGuid = getArticlesByLdapGuid;
module.exports.updateArticle = updateArticle;
module.exports.createArticle = createArticle;
module.exports.deleteArticle = deleteArticle;
module.exports.search = search;
module.exports.checkArticlesExist = checkArticlesExist;
module.exports.getArticleSummariesById = getArticleSummariesById;
module.exports.findAllTags = findAllTags;
module.exports.getWikiReport = getWikiReport;
module.exports.correlateIdSearch = correlateIdSearch;
module.exports.mapToWiki = mapToWiki;
module.exports.getArticleHistory = getArticleHistory;
module.exports.getArticleByUuid = getArticleByUuid;
module.exports.getUnreviewedArticles = getUnreviewedArticles;
module.exports.getTagFrequencyByPrefix = getTagFrequencyByPrefix;
module.exports.quickSearch = quickSearch;
module.exports.getWikiMemoryMapSync = indexMaint.getWikiMemoryMapSync;
module.exports.findDuplicateTagValues = findDuplicateTagValues;
