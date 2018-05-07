'use strict';

const wsapi = require('../wsapi.js');
const wiki = require('./index.js');
const indexMaint = require('./index-maint.js');
const util = require('./util.js');
const users = require('../users');

function canViewWiki(user) {
  const wiki = user.getSettings().userControls.wiki;
  return wiki && wiki.view;
}

function canViewHistory(user) {
  return canViewWiki(user) && user.getSettings().userControls.wiki.viewHistory;
}

function canEditWiki(user) {
  return canViewWiki(user) && user.getSettings().userControls.wiki.edit === true;
}

function canProposeWiki(user) {
  return canViewWiki(user) && user.getSettings().userControls.wiki.edit === 'propose';
}

wsapi.on('wiki/get-article-by-id', function(request, callback, notifyCallback) {
  if(!canViewWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to request wiki article ${request.data.id}.`);
    return callback(new Error('Request denied.'));
  }

  wiki.getArticleById(request.data.id, request.data.options, callback);
});

wsapi.on('wiki/get-articles-by-ldap-guid', function(request, callback, notifyCallback) {
  if(!canViewWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to get articles for LDAP GUIDs.`);
    return callback(new Error('Request denied.'));
  }

  wiki.getArticlesByLdapGuid(request.data.guids, request.data.options, callback);
});

wsapi.on('wiki/get-unreviewed-articles', function(request, callback, notifyCallback) {
  if(!canViewWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to get unreviewed articles.`);
    return callback(new Error('Request denied.'));
  }

  return wiki.getUnreviewedArticles(callback);
});

wsapi.on('wiki/update-article', function(request, callback, notifyCallback) {
  if(!canEditWiki(request.user) && !canProposeWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to update article ${request.data.id}.`);
    return callback(new Error('Request denied.'));
  }

  const options = request.data.options || {};

  if(options.unreviewed !== undefined && !options.unreviewed && !canEditWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to create an official version of article ${request.data.id}.`);
    return callback(new Error('Request denied.'));
  }

  wiki.updateArticle(request.data.id, request.data.version, request.data.article, request.user.upn, {
    unreviewed: canProposeWiki(request.user) ? true : options.unreviewed,
  }, callback);
});

wsapi.on('wiki/create-article', function(request, callback, notifyCallback) {
  if(!canEditWiki(request.user) && !canProposeWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to create article ${request.data.article && request.data.article.title}.`);
    return callback(new Error('Request denied.'));
  }

  wiki.createArticle(request.data.article, request.user.upn, {unreviewed: canProposeWiki(request.user)}, callback);
});

wsapi.on('wiki/delete-article', function(request, callback, notifyCallback) {
  if(!canEditWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to delete article ${request.data.id}.`);
    return callback(new Error('Request denied.'));
  }

  wiki.deleteArticle(request.data.id, request.user.upn, callback);
});

wsapi.on('wiki/find-all-tags', function(request, callback, notifyCallback) {
  if(!canViewWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to request the tag list.`);
    return callback(new Error('Request denied.'));
  }

  wiki.findAllTags(callback);
});

wsapi.on('wiki/search', function(request, callback, notifyCallback) {
  if(!canViewWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to search the wiki for "${request.data.q}".`);
    return callback(new Error('Request denied.'));
  }

  const unreviewed = request.data.unreviewed;
  const wikiRoot = unreviewed ? 'wikiUnreviewed' : 'wiki';

  // { q: 'this is a query', from: from, size: size }
  let terms = util.parseQueryTerms(request.data.q);
  let query = util.createWikiQuery(terms, {unreviewed: unreviewed});

  let body = {
    query: query,
    from: request.data.from,
    size: request.data.size,
    sort: [
      { _score: { order: 'desc' } },
      { updatedTime: { order: 'desc' } },
    ],
    highlight: {
      pre_tags: ['<highlight>'],
      post_tags: ['</highlight>'],
      fields: {
        // Use the fast vector highlighter across the various analyzed fields
        [`${wikiRoot}.title`]: {
          type: 'fvh',
          matched_fields: [`${wikiRoot}.title`, `${wikiRoot}.title.simple`, `${wikiRoot}.title.english`]
        },
        [`${wikiRoot}.body`]: {
          type: 'fvh',
          matched_fields: [`${wikiRoot}.body`, `${wikiRoot}.body.simple`, `${wikiRoot}.body.english`]
        },
      }
    },
    _source: [`${wikiRoot}.title`, `${wikiRoot}.tags`, `${wikiRoot}.body`, 'wiki.unreviewed'],
  };

  wiki.search(body, function(err, resp) {
    return callback(err, resp);
  });
});

wsapi.on('wiki/check-articles-exist', function(request, callback, notifyCallback) {
  if(!canViewWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to check for the existence of an article.`);
    return callback(new Error('Request denied.'));
  }

  wiki.checkArticlesExist(request.data, callback);
});

wsapi.on('wiki/tag-report', function(request, callback, notifyCallback) {
  if(!canViewWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to run a tag report.`);
    return callback(new Error('Request denied.'));
  }

  let terms = util.parseQueryTerms(request.data.q);
  let query = util.createWikiQuery(terms);

  wiki.getWikiReport(query, request.data.tags, callback);
});

wsapi.on('wiki/wiki-review-search', function(request, callback, notifyCallback) {
  if(!canViewWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to run the wiki review search "${request.data.q}".`);
    return callback(new Error('Request denied.'));
  }

  return wiki.correlateIdSearch(request.data.q, request.data.options, callback);
});

wsapi.on('wiki/map-to-wiki', function(request, callback, notifyCallback) {
  if(!canViewWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to map "${request.data.id}" to the wiki.`);
    return callback(new Error('Request denied.'));
  }

  return wiki.mapToWiki(request.data.id, request.data.options, callback);
});

wsapi.on('wiki/get-history', function(request, callback, notifyCallback) {
  if(!canViewHistory(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to view wiki history for "${request.data.uuid}".`);
    return callback(new Error('Request denied.'));
  }

  return wiki.getArticleHistory(request.data.uuid, request.data.options, callback);
});

wsapi.on('wiki/get-article-by-uuid', function(request, callback, notifyCallback) {
  if(!canViewWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to view article by UUID "${request.data.uuid}".`);
    return callback(new Error('Request denied.'));
  }

  return wiki.getArticleByUuid(request.data.uuid, callback);
});

wsapi.on('wiki/get-tag-frequency-by-prefix', function(request, callback, notifyCallback) {
  if(!canViewWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to view tag frequencies by prefix "${request.data.prefix}".`);
    return callback(new Error('Request denied.'));
  }

  return wiki.getTagFrequencyByPrefix(request.data.prefix, callback);
});

wsapi.on('wiki/get-known-tags', function(request, callback, notifyCallback) {
  if(!canViewWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to view tag frequencies by prefix "${request.data.prefix}".`);
    return callback(new Error('Request denied.'));
  }

  return require('./index-maint.js').getKnownTags((err, tags) => {
    if(err)
      return callback(err);

    return callback(null, Array.from(tags.entries()).map(e => {
      return {tag: e[0], type: e[1]};
    }));
  });
});

wsapi.on('wiki/quick-search', function(request, callback, notifyCallback) {
  if(!canViewWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to perform a quick search with the query "${request.data.q}".`);
    return callback(new Error('Request denied.'));
  }

  return wiki.quickSearch(request.data.q, request.data.options, callback);
});

wsapi.on('wiki/find-duplicate-tag-values', function(request, callback, notifyCallback) {
  if(!canViewWiki(request.user)) {
    request.log.error(`Permission denied: ${request.user.upn} tried to find duplicate tag values.`);
    return callback(new Error('Request denied.'));
  }

  return wiki.findDuplicateTagValues(request.data.tags, callback);
});

wiki.on('article-changed', data => {
  users.forEach(user => {
    if(canViewWiki(user))
      user.broadcast('wiki/article-changed', data);
  });
});


// Fetch every fifteen minutes just in case
function getLatestWikiMap(callback) {
  return indexMaint.fetchLatestWikiMap(callback);
}

getLatestWikiMap();

setInterval(getLatestWikiMap, 10 * 60 * 1000).unref();

wsapi.service.on('wiki/update-wiki-map', function(request, callback, notifyCallback) {
  return getLatestWikiMap(callback);
});
