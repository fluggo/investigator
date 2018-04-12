'use strict';

const logger = require('../config.js').logger.child({module: 'wiki'});

function WikiError(message, code) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.code = code;
}

require('util').inherits(WikiError, Error);

module.exports.WikiError = WikiError;
module.exports.logger = logger;

const wikiUtil = require('../../common/util.js');
const textile = require('../../common/textile.js');
const indexMaint = require('./index-maint.js');
const Netmask = require('netmask').Netmask;

const _config = require('../config.js').wiki || {};
const PREFIX = require('../config.js').indexPrefix || '';
const WIKI_READ_ALIAS = PREFIX + 'wiki-read';
const WIKI_WRITE_ALIAS = PREFIX + 'wiki-write';
const ARTICLE = 'article';
const ARTICLE_HISTORY = 'article-history';


function coerceMap(obj) {
  if(!obj)
    return obj;

  const keys = Object.keys(obj);

  if(keys.length === 0 && obj.has) {
    // I think it's already a map
    return obj;
  }

  return new Map(Object.keys(obj).map(key => [key, obj[key]]));
}

function collapseArray(array) {
  if(array.length === 0)
    return null;

  if(array.length === 1)
    return array[0];

  return array;
}

function uncollapseArray(value) {
  if(Array.isArray(value))
    return value;

  return [value,];
}

module.exports.coerceMap = coerceMap;
module.exports.collapseArray = collapseArray;
module.exports.uncollapseArray = uncollapseArray;
module.exports.WIKI_READ_ALIAS = WIKI_READ_ALIAS;
module.exports.WIKI_WRITE_ALIAS = WIKI_WRITE_ALIAS;
module.exports.ARTICLE = ARTICLE;
module.exports.ARTICLE_HISTORY = ARTICLE_HISTORY;
module.exports.PREFIX = PREFIX;


function parseQueryTerms(query) {
  // Produces an array of terms:
  // { term: 'term text', type: 'term', req: 'should' }
  // type is:
  //    'term' - ordinary word for match
  //    'phrase' - phrase match
  //    other - prefixed term/phrase with "name:stuff" -> type: 'name', term: 'stuff'
  // req is:
  //    'should' - result should have this
  //    'must' - result must have this (prefix "+")
  //    'must_not' - result

  const QUERY_RE = /[-+]?(?:[^\s:]+:)?"[^""]+"|[^\s]+/g;
  const result = [];
  let match = null;

  while((match = QUERY_RE.exec(query)) !== null) {
    let qstr = match[0];

    // Check for must/must not
    let must = (qstr[0] === '+');
    let must_not = (qstr[0] === '-');

    if(must || must_not) {
      qstr = qstr.substr(1);
    }

    let phrase = (qstr[0] === '"');
    let query = null;

    if(phrase) {
      qstr = qstr.substr(1, qstr.length - 2);

      result.push({
        term: qstr,
        type: 'phrase',
        req: must ? 'must' : (must_not ? 'must_not' : 'should'),
      });

      continue;
    }

    if(qstr[0] === '#') {
      // Hashtag
      qstr = qstr.substr(1);

      result.push({
        term: qstr,
        type: 'hashtag',
        req: must ? 'must' : (must_not ? 'must_not' : 'should'),
      });

      continue;
    }

    let tagIndex = qstr.indexOf(':');

    if(tagIndex !== -1) {
      let type = qstr.substr(0, tagIndex), term = qstr.substr(tagIndex + 1);

      if(term[0] === '"') {
        // Un-phrase it
        term = term.substr(1, term.length - 2);
      }

      result.push({
        term: term,
        type: type,
        req: must ? 'must' : (must_not ? 'must_not' : 'should'),
      });

      continue;
    }

    result.push({
      term: qstr,
      type: 'term',
      req: must ? 'must' : (must_not ? 'must_not' : 'should'),
    });
  }

  return result;
}

function parseTagValue(type, value) {
  if(value === undefined || value === null)
    return value;

  var parsedValue;

  switch(type) {
    case 'string':
      return value;

    case 'article':
      return wikiUtil.shrinkTitleId(value);

    case 'ip':
    case 'cidr':
      try {
        parsedValue = new Netmask(value);
      }
      catch(e) {
        return null;
      }

      if(type === 'ip') {
        // Just take the base
        return parsedValue.base;
      }
      else {
        // CIDR
        return parsedValue.toString();
      }

    case 'float':
    case 'double':
      parsedValue = parseFloat(value);

      if(!isFinite(parsedValue))
        return null;

      return parsedValue;

    case 'long':
    case 'short':
    case 'integer':
    case 'byte':
      parsedValue = parseInt(value);

      if(!isFinite(parsedValue))
        return;

      return parsedValue;

    case 'date':
      parsedValue = Date.parse(value);

      if(!isFinite(parsedValue))
        return null;

      return new Date(parsedValue);

    default:
      return null;
  }
}

// Create the query for the given query text and tag mappings
function createWikiQuery(terms, options) {
  options = options || {};

  const WIKI_SUB_PREFIX = options.unreviewed ? 'wikiUnreviewed' : 'wiki';

  const TITLE_SEARCH_LIST = [
    `${WIKI_SUB_PREFIX}.title^3`,
    `${WIKI_SUB_PREFIX}.title.simple^2`,
    `${WIKI_SUB_PREFIX}.title.english`,
  ];

  const BODY_SEARCH_LIST = [
    `${WIKI_SUB_PREFIX}.body^3`,
    `${WIKI_SUB_PREFIX}.body.simple^2`,
    `${WIKI_SUB_PREFIX}.body.english`,
  ];

  const result = {
    bool: {
      must: [],
      filter: [],
      should: [],
      must_not: []
    }
  };

  // Collection of all terms sitting by themselves so they can be queried together
  let lonelyShouldTerms = [];

  function makeTerms(terms, options) {
    options = options || {};

    const result = [
      {
        multi_match: {
          query: terms,
          type: options.type || 'most_fields',
          fields: TITLE_SEARCH_LIST,
          boost: 3,
        },
      },
    ];

    if(options.fuzzy && options.type !== 'phrase') {
      result.push({
        multi_match: {
          query: terms,
          type: options.type || 'most_fields',
          fuzziness: 'AUTO',
          fields: TITLE_SEARCH_LIST,
          boost: 0.5,
        },
      });
    }

    result.push(
      {
        multi_match: {
          query: terms,
          type: options.type || 'most_fields',
          fields: BODY_SEARCH_LIST,
          boost: 1.5,
        },
      }
    );

    if(options.fuzzy && options.type !== 'phrase') {
      result.push({
        multi_match: {
          query: terms,
          type: options.type || 'most_fields',
          fuzziness: 'AUTO',
          fields: BODY_SEARCH_LIST,
          boost: 0.125,
        },
      });
    }

    return { bool: { should: result, minimum_should_match: 1 } };
  }

  terms.forEach(function(term) {
    if(term.type === 'term') {
      if(term.req === 'should') {
        // Elasticsearch will do smarter things if these are submitted together
        lonelyShouldTerms.push(term.term);
      }
      else if(term.req === 'must') {
        result.bool.must.push(makeTerms(term.term));

      }
      else if(term.req === 'must_not') {
        result.bool.must_not.push({
          multi_match: {
            query: term.term,
            fields: TITLE_SEARCH_LIST.concat(BODY_SEARCH_LIST),
          }
        });
      }
    }
    else if(term.type === 'phrase') {
      // Do a phrase multi-match
      let queries = makeTerms(term.term, {type: 'phrase'});

      if(term.req === 'should') {
        result.bool.should.push(queries);
      }
      else if(term.req === 'must') {
        result.bool.must.push(queries);
      }
      else if(term.req === 'must_not') {
        result.bool.must_not.push(queries);
      }
    }
    else if(term.type === 'tag') {
      // Do exact matches using 'term'
      let query = {
        bool: {
          should: [
            { term: { [`${WIKI_SUB_PREFIX}.allBaseTags`]: wikiUtil.shrinkTitleId(term.term) } },
          ],
          minimum_should_match: 1,
        }
      };

      if(term.req === 'should') {
        result.bool.should.push(query);
      }
      else if(term.req === 'must') {
        // Pop this into filter; we don't care about the score
        result.bool.filter.push(query);
      }
      else if(term.req === 'must_not') {
        result.bool.must_not.push(query);
      }
    }
    else if(term.type === 'hashtag') {
      // Do exact matches using 'term'
      let query = {
        term: {
          [`${WIKI_SUB_PREFIX}.bodyReferencedHashtags`]: wikiUtil.shrinkTitleId(term.term)
        }
      };

      if(term.req === 'should') {
        result.bool.should.push(query);
      }
      else if(term.req === 'must') {
        // Pop this into filter; we don't care about the score
        result.bool.filter.push(query);
      }
      else if(term.req === 'must_not') {
        result.bool.must_not.push(query);
      }
    }
    else {
      let tagType = indexMaint.getTagTypeSync(term.type) || 'string';
      let query;

      switch(tagType) {
        default:
          query = { term: { [`${WIKI_SUB_PREFIX}.rels.${term.type}`]: parseTagValue(tagType, term.term) } };
          break;
      }

      if(!query)
        return;

      if(term.req === 'should') {
        result.bool.should.push(query);
      }
      else if(term.req === 'must') {
        // Pop this into filter; we don't care about the score
        result.bool.filter.push(query);
      }
      else if(term.req === 'must_not') {
        result.bool.must_not.push(query);
      }
    }
  });

  if(lonelyShouldTerms.length !== 0) {
    result.bool.should.push(makeTerms(lonelyShouldTerms.join(' '), {fuzzy: true}));
  }

  return result;
}

// Parses the Textile source of an article and pulls out any wiki links
function parseBodyForRefsSync(body) {
  const linkLines = [], hashtagLines = [];
  const jsonml = textile.jsonml(body, {keepContext: true});

  // Non-recursive search of the jsonml to avoid abuse of the stack
  const queue = [jsonml];

  while(queue.length) {
    const next = queue.shift().concat();

    if(typeof next === 'string')
      continue;

    const tagName = next.shift();
    var attributes = {};

    // Grab the attributes list if there is one (object at jsonml[1] originally)
    if(next.length && typeof next[0] === 'object' && !Array.isArray(next[0])) {
      attributes = next.shift();
    }

    if(tagName === 'wiki') {
      // Wiki tag; href is the referenced article name
      linkLines.push({ ref: wikiUtil.shrinkTitleId(attributes.href), context: attributes.context })
    }

    if(tagName === 'hashtag') {
      // Hashtag; href on the tag is the referenced article name
      // (obj is <hashtag><tag href="tagname">:<value>value></value></hashtag>)
      let hashtag = null, value;

      while(next.length) {
        let hashtagElement = next.shift();

        if(!Array.isArray(hashtagElement))
          continue;

        if(hashtagElement[0] === 'tag')
          hashtag = hashtagElement[1].href;

        if(hashtagElement[0] === 'value')
          value = hashtagElement[1];
      }

      var result = { ref: wikiUtil.shrinkTitleId(hashtag), context: attributes.context };

      if(value)
        result.value = value;

      hashtagLines.push(result);
    }

    // Push the contents for future runs
    queue.unshift(...next);
  }

  return { linkLines: linkLines, hashtagLines: hashtagLines };
}

function parseBodyForSummary(body) {
  var newLine = body.indexOf('\n');

  if(newLine === -1)
    return body;

  return body.substr(0, newLine);
}

function prepareArticleSync(article, options) {
  options = options || {};
  options.tagTypes = options.tagTypes && coerceMap(options.tagTypes);

  if(typeof article.title !== 'string') {
    return {article: article, error: new WikiError("The article didn't have a title.", 'missing-title')};
  }

  if(typeof article.body !== 'string') {
    return {article: article, error: new WikiError("The article didn't have a body.", 'missing-body')};
  }

  if(!Array.isArray(article.tags)) {
    return {article: article, error: new WikiError("The article didn't have a tag array.", 'missing-tags')};
  }

  if(article.tags.length === 0) {
    article.tags = ['tagme'];
  }

  // De-dupe tags
  article.tags = Array.from(new Set(article.tags));

  const id = wikiUtil.shrinkTitleId(article.title);

  if(id.length === 0) {
    return {article: article, error: new WikiError("The article didn't have a valid title.", 'invalid-title')};
  }

  // Construct the new article
  const preparedArticle = {
    title: article.title,
    body: article.body,
    tags: article.tags,
    rels: {},
    baseTags: new Set(),
    bodyReferencedArticles: [],
    bodyReferencedHashtags: [],
    allBaseTags: [],
  };

  // Parse and add the tag relations now
  var parsedTags = article.tags.map(wikiUtil.parseTag);

  var rewrittenArticleTags = [];

  function addTag(tag, baseTag) {
    if(baseTag)
      preparedArticle.baseTags.add(tag.tag);

    let type = options.tagTypes && options.tagTypes.get(tag.tag) || indexMaint.getTagTypeSync(tag.tag);

    // If unknown, skip
    if(!type) {
      if(baseTag)
        rewrittenArticleTags.push(wikiUtil.buildTag(tag.tag, tag.value));

      return;
    }

    // Override the type for "alias"; we want the references to be valid IDs
    if(tag.tag === 'alias')
      type = 'article';

    // Make sure an array exists for the tag
    if(!preparedArticle.rels[tag.tag])
      preparedArticle.rels[tag.tag] = [];

    var parsedValue = parseTagValue(type, tag.value);

    if(!parsedValue) {
      if(baseTag)
        rewrittenArticleTags.push(wikiUtil.buildTag(tag.tag, tag.value));

      return;
    }

    preparedArticle.rels[tag.tag].push(parsedValue);

    if(baseTag) {
      if(type === 'article')
        rewrittenArticleTags.push(wikiUtil.buildTag(tag.tag, parsedValue));
      else
        rewrittenArticleTags.push(wikiUtil.buildTag(tag.tag, tag.value));
    }
  }

  parsedTags.forEach(tag => addTag(tag, true));

  // Now parse the body and fetch all the wiki tags
  var parsedRefs = parseBodyForRefsSync(article.body);
  parsedRefs.hashtagLines.forEach(line => addTag({tag: line.ref, value: line.value}), false);

  preparedArticle.baseTags = Array.from(preparedArticle.baseTags);
  preparedArticle.bodyReferencedArticles = Array.from(new Set(parsedRefs.linkLines.map(line => line.ref)));
  preparedArticle.bodyReferencedHashtags = Array.from(new Set(parsedRefs.hashtagLines.map(line => line.ref)));
  preparedArticle.allBaseTags = Array.from(new Set(preparedArticle.baseTags.concat(preparedArticle.bodyReferencedHashtags)));
  preparedArticle.tags = rewrittenArticleTags;

  return { id: id, article: preparedArticle };
}

module.exports.parseQueryTerms = parseQueryTerms;
module.exports.parseTagValue = parseTagValue;
module.exports.createWikiQuery = createWikiQuery;
module.exports.parseBodyForRefsSync = parseBodyForRefsSync;
module.exports.parseBodyForSummary = parseBodyForSummary;
module.exports.prepareArticleSync = prepareArticleSync;
module.exports.parseTag = wikiUtil.parseTag;
module.exports.combineWikiRecommendations = wikiUtil.combineWikiRecommendations;
