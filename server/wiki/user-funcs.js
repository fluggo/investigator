'use strict';

const config = require('../config.js');
const logger = config.logger.child({module: 'ldap/user-funcs'});
const path = require('path');
const d3 = require('d3');
const utilFuncs = require('../../common/util.js');

const filewatch = require('../filewatch.js');

var _firstScript = true;

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

filewatch.watchFile(path.join(__dirname, '../user-scripts/wiki.js')).on('change', text => {
  const vm = require('vm');

  const context = {
    require: require,
    buildTag: utilFuncs.buildTag,
    d3: d3,
    collapseArray: collapseArray,
    uncollapseArray: uncollapseArray,
    console: console,
  };

  (_firstScript ? logger.info : logger.warn).call(logger, {messageId: 'wiki/user-funcs/load-new-script'}, 'Loading new wiki user script.');

  try {
    vm.runInNewContext(text, context, {filename: 'user-scripts/wiki.js'});
  }
  catch(err) {
    logger.error({messageId: 'wiki/user-funcs/load-new-script/error', err: err}, 'Error parsing wiki user script.');
  }

  module.exports.makeWikiRecommendations = function makeWikiRecommendations(objects) {
    if(context.makeWikiRecommendations) {
      try {
        return context.makeWikiRecommendations(objects);
      }
      catch(err) {
        console.log(err);
        logger.error({messageId: 'wiki/user-funcs/makeWikiRecommendations/error', err: err}, 'Error while executing user makeWikiRecommendations; running default instead.');
      }
    }

    return defaultMakeWikiRecommendations(objects);
  }

  module.exports.makeWikiQuickSearchTerms = function makeWikiQuickSearchTerms(objects) {
    if(context.makeWikiQuickSearchTerms) {
      try {
        return context.makeWikiQuickSearchTerms(objects).concat(defaultMakeWikiQuickSearchTerms(objects));
      }
      catch(err) {
        logger.error({messageId: 'wiki/user-funcs/makeWikiQuickSearchTerms/error', err: err}, 'Error while executing user makeWikiQuickSearchTerms; running default instead.');
      }
    }

    return defaultMakeWikiQuickSearchTerms(objects);
  }

/*  module.exports.makeWikiRecommendations = function makeWikiRecommendations(ldap) {
    if(context.makeWikiRecommendations) {
      try {
        return context.makeWikiRecommendations(ldap);
      }
      catch(err) {
        logger.error({messageId: 'wiki/user-funcs/makeWikiRecommendations/error', err: err}, 'Error while executing user makeWikiRecommendations; running default instead.');
      }
    }

    return defaultMakeWikiRecommendations(ldap);
  }*/
});

function defaultMakeWikiRecommendations(objects) {
  return null;
}

function defaultMakeWikiQuickSearchTerms(source) {
  const result = [];

  if(source.wikiUnreviewed.title)
    result.push({text: source.wikiUnreviewed.title, isTitle: true});

  if(source.wiki.title)
    result.push({text: source.wiki.title, isTitle: true});

  result.push({text: utilFuncs.shrinkTitleId(source.wiki.title || source.wikiUnreviewed.title), isId: true, weight: 0.5});

  return result;
}

const ldap = require('../ldap');
const wiki = require('./index.js');

function findLdapByDN(dn, callback) {
}

function findLdapByName(name, type, callback) {
}

function findWikiByName(name, callback) {
}

function findWikiByTag(tag, value, callback) {
}

module.exports.makeWikiRecommendations = defaultMakeWikiRecommendations;
module.exports.makeWikiQuickSearchTerms = defaultMakeWikiQuickSearchTerms;
