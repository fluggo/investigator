// https://mochajs.org/
// http://chaijs.com/api/bdd/
'use strict';

const chai = require('chai'), expect = chai.expect;

const async = require('async');

const es = require('../../../es');
const wiki = require('../../../wiki');
const indexMaint = require('../../index-maint');
const wikiUtil = require('../../util');
const uuid = require('uuid/v4');
const d3 = require('d3');
const extend = require('extend');

function createTestWiki(articles, knownTags, options, callback) {
  // articles: array of wiki objects ({title: '', body: '', tags: []})
  // knownTags: object or map mapping tag to type, used for creating the mapping
  const time = (d3.timeDay.offset(new Date(), -1)).toISOString();

  if(!options.version)
    options.version = 3;

  const bulkItems = [].concat(...articles.map(article => {
    const prepared = wikiUtil.prepareArticleSync(article, {tagTypes: knownTags});
    const item = {
      common: {},
      wiki: prepared.article,
    };

    item.wiki.createdBy = 'brian@fluggo.com';
    item.wiki.createdTime = time;
    item.wiki.updatedBy = 'brian@fluggo.com';
    item.wiki.updatedTime = time;

    var result = [
      { index: { _id: prepared.id, _type: wikiUtil.ARTICLE } },
      item
    ];

    if(options.version === 1) {
      item.wiki.history = [{
        title: item.wiki.title,
        body: item.wiki.body,
        tags: item.wiki.tags,
        updatedBy: item.wiki.updatedBy,
        updatedTime: item.wiki.updatedTime
      }];
    }
    else {
      item.wiki.uuid = uuid();

      result.push({ index: { _type: wikiUtil.ARTICLE_HISTORY } });
      result.push({
        title: item.wiki.title,
        uuid: item.wiki.uuid,
        body: item.wiki.body,
        tags: item.wiki.tags,
        updatedBy: item.wiki.updatedBy,
        updatedTime: item.wiki.updatedTime,
      });
    }

    if(options.version >= 3) {
      // Unreviewed section
      item.wikiUnreviewed = extend({}, prepared.article, {updatedBy: item.wiki.updatedBy, updatedTime: item.wiki.updatedTime});
    }
    else {
      // Revert placement of derived fields
      item.wikiDerived = {
        rels: item.wiki.rels,
        baseTags: item.wiki.baseTags,
        bodyReferencedArticles: item.wiki.bodyReferencedArticles,
        bodyReferencedHashtags: item.wiki.bodyReferencedHashtags,
        tagReferencedArticles: item.wiki.tagReferencedArticles,
      };

      item.wiki = {
        title: item.wiki.title,
        uuid: item.wiki.uuid,
        body: item.wiki.body,
        tags: item.wiki.tags,
        createdBy: item.wiki.createdBy,
        createdTime: item.wiki.createdTime,
        updatedBy: item.wiki.updatedBy,
        updatedTime: item.wiki.updatedTime,
        history: item.wiki.history,
      };
    }

    if(options.version >= 4) {
      item.common.quickSearch = [
      ];

      if(item.wikiUnreviewed.title)
        item.common.quickSearch.push({ text: item.wikiUnreviewed.title });

      if(item.wiki.title)
        item.common.quickSearch.push({ text: item.wiki.title });
    }

    return result;
  }));

  indexMaint.createWiki({tags: knownTags}, function(err) {
    if(err)
      return callback(err);

    es.client.bulk({
      refresh: 'true',
      index: wikiUtil.WIKI_WRITE_ALIAS,
      body: bulkItems
    }, (err, resp) => {
      if(err)
        return callback(err);

      // Make sure _knownTags is updated
      indexMaint.reloadTags(callback);
    });
  });
}

function createWikiTestArticles(options, callback) {
  // options parameter is optional
  if(!callback) {
    callback = options;
    options = {};
  }

  var knownTags = {
    'tag-type': 'string',
    'alias': 'string',
    'implies': 'article',
    'contains': 'article'
   };

  createTestWiki([
    {
      title: 'Mario',
      body: 'Mario is a [[plumber]] from the [[Mushroom Kingdom]].',
      tags: ['test', 'person', 'actor', 'plumber', 'eats:super-mushroom', 'lives-in:mushroom-kingdom'],
    },
    {
      title: 'Super Mushroom',
      body: 'Super Mushrooms make [[Mario]] big.',
      tags: ['test', 'powerup'],
    },
    {
      title: 'Mushroom Kingdom',
      body: 'The Mushroom Kingdom is where the Super Mario series takes place. [[Princess Peach]] is the ruler.\n\nThis paragraph references [[Mario]]. #mario',
      tags: ['test', 'actor', 'place', 'contains:super-mushroom'],
    },
    {
      title: 'Contains',
      body: 'Test line 1\n\nTest line 2',
      tags: ['test', 'tag-type:article'],
    },
  ], knownTags, options, callback);
};

function getAllWikiHistory(uuid, callback) {
  es.getAllEntries({
    index: wikiUtil.WIKI_READ_ALIAS,
    type: wikiUtil.ARTICLE_HISTORY,
    body: {
      query: {
        constant_score: {
          filter: { term: { uuid: uuid } }
        }
      }
    }
  }, (err, res) => {
    if(err)
      return callback(err);

    callback(null, res);
  });
}

module.exports.createWikiTestArticles = createWikiTestArticles;
module.exports.getAllWikiHistory = getAllWikiHistory;

describe('Wiki server library', function() {
  require('./prepareArticleSync');
  require('./createWikiQuery');

  describe('getArticleById', function() {
    beforeEach(function(done) {
      async.series([
        indexMaint.deleteWiki,
        createWikiTestArticles,
      ], done);
    });

    afterEach(function(done) {
      indexMaint.deleteWiki(done);
    });

    it('fetches the mario article', function(done) {
      wiki.getArticleById('mario', {}, function(err, result) {
        expect(err).to.not.exist;
        expect(result).to.exist;
        expect(result._id).to.equal('mario');
        expect(result._source.wiki.title).to.equal('Mario');
        expect(result._source.wiki.history).to.not.exist;
        done();
      });
    });

    it('fetches the contains article with tag lookups', function(done) {
      wiki.getArticleById('contains', {references: true}, function(err, result) {
        expect(err).to.not.exist;
        expect(result).to.exist;
        expect(result._id).to.equal('contains');
        expect(result.references).to.exist;
        expect(result.references.tags).to.exist;
        expect(result.references.tags.total).to.equal(1);
        expect(result.references.tags.hits).to.have.lengthOf(1)
          .and.has.deep.members([{ title: 'Mushroom Kingdom', id: 'mushroom-kingdom' }]);
        expect(result.references.hashtags.total).to.equal(0);
        expect(result.references.hashtags.hits).to.have.lengthOf(0);
        expect(result.references.links.total).to.equal(0);
        expect(result.references.links.hits).to.have.lengthOf(0);
        done();
      });
    });

    it('fetches the mario article with tag lookups', function(done) {
      wiki.getArticleById('mario', {references: true}, function(err, result) {
        expect(err).to.not.exist;
        expect(result).to.exist;
        expect(result._id).to.equal('mario');
        expect(result.references).to.exist;
        expect(result.references.tags).to.exist;
        expect(result.references.tags.total).to.equal(0);
        expect(result.references.tags.hits).to.have.lengthOf(0);
        expect(result.references.hashtags.total).to.equal(1);
        expect(result.references.hashtags.hits).to.have.lengthOf(1)
          .and.has.deep.members([{ title: 'Mushroom Kingdom', id: 'mushroom-kingdom', lines: ['This paragraph references [[Mario]]. #mario'] }]);
        expect(result.references.links.total).to.equal(2);
        expect(result.references.links.hits).to.have.lengthOf(2)
          .and.has.deep.members([
            { title: 'Super Mushroom', id: 'super-mushroom', lines: ['Super Mushrooms make [[Mario]] big.'] },
            { title: 'Mushroom Kingdom', id: 'mushroom-kingdom', lines: ['This paragraph references [[Mario]]. #mario'] }]);
        done();
      });
    });

    it('yields null if the article doesn\'t exist', function(done) {
      wiki.getArticleById('squeege', {}, function(err, result) {
        expect(err).to.not.exist;
        expect(result).to.equal(null);
        done();
      });
    });
  });

  describe('combineWikiRecommendations', function() {
    it('makes recommendations with no article', function() {
      const recommendations = {
        title: 'Test title',
        clear: ['fqdn', 'spn'],
        require: ['ldap-guid:4ef77592-ae69-4dc0-8bf4-08a562873c83'],
        recommend: {
          'user': true,
          'computer': false,
          'fqdn:itsame.fluggo.com': true,
        },
        suggest: {
          'useless-account': true,
          'awesome-account': false,
        },
        possibilities: ['never-login', 'outside-server']
      };

      const combined = wikiUtil.combineWikiRecommendations(recommendations, null);

      expect(combined.title).to.equal('Test title');
      expect(combined.changes).to.deep.equal([
        { tag: 'ldap-guid:4ef77592-ae69-4dc0-8bf4-08a562873c83', level: 1, levelName: 'require', action: 'add' },
        { tag: 'fqdn:itsame.fluggo.com', level: 2, levelName: 'recommend', action: 'add' },
        { tag: 'user', level: 2, levelName: 'recommend', action: 'add' },
        { tag: 'useless-account', level: 3, levelName: 'suggest', action: 'add' },
      ]);
      expect(combined.possibilities).to.have.lengthOf(2)
        .and.to.have.deep.members([{tag: 'never-login', isSet: false}, {tag: 'outside-server', isSet: false}]);
    });

    it('gives precedence to recommendations without an article', function() {
      const recommendations = {
        title: 'Test title',
        clear: ['fqdn', 'spn'],
        require: ['ldap-guid:4ef77592-ae69-4dc0-8bf4-08a562873c83'],
        recommend: {
          'user': false,
        },
        suggest: {
          'user': true,
        },
        possibilities: ['never-login', 'outside-server']
      };

      const combined = wikiUtil.combineWikiRecommendations(recommendations, null);

      expect(combined.title).to.equal('Test title');
      expect(combined.changes).to.deep.equal([
        { tag: 'ldap-guid:4ef77592-ae69-4dc0-8bf4-08a562873c83', level: 1, levelName: 'require', action: 'add' },
      ]);
    });

    it('removes possibilities when there are suggestions or recommendations', function() {
      const recommendations = {
        title: 'Test title',
        clear: ['fqdn', 'spn'],
        require: ['ldap-guid:4ef77592-ae69-4dc0-8bf4-08a562873c83'],
        recommend: {
        },
        suggest: {
          'user': true,
        },
        possibilities: ['user', 'outside-server']
      };

      const combined = wikiUtil.combineWikiRecommendations(recommendations, null);

      expect(combined.possibilities).to.have.lengthOf(1)
        .and.to.have.deep.members([{tag: 'outside-server', isSet: false}]);
    });

    it('makes recommendations with an article', function() {
      const recommendations = {
        title: 'Test title',
        clear: ['fqdn', 'spn'],
        require: ['ldap-guid:4ef77592-ae69-4dc0-8bf4-08a562873c83'],
        recommend: {
          'user': true,
          'computer': false,
          'fqdn:itsame.fluggo.com': true,
        },
        suggest: {
          'useless-account': true,
          'awesome-account': false,
        },
        possibilities: ['never-login', 'outside-server']
      };

      const article = {
        title: 'Test title',
        body: 'body dont matter',
        tags: [
          'fqdn:thisiswrong.com',
          'spn:removeme',
          'ldap-guid:4ef77592-ae69-4dc0-8bf4-08a562873c83',
          'user',
          'computer',
          'useless-account',
          'awesome-account',
          'never-login'
        ]
      };

      const combined = wikiUtil.combineWikiRecommendations(recommendations, article);

      expect(combined.title).to.equal('Test title');
      expect(combined.changes).to.deep.equal([
        { tag: 'ldap-guid:4ef77592-ae69-4dc0-8bf4-08a562873c83', level: 1, levelName: 'require', action: 'keep' },
        { tag: 'fqdn:itsame.fluggo.com', level: 2, levelName: 'recommend', action: 'add' },
        { tag: 'user', level: 2, levelName: 'recommend', action: 'keep' },
        { tag: 'fqdn:thisiswrong.com', level: 2, levelName: 'recommend', action: 'remove' },
        { tag: 'spn:removeme', level: 2, levelName: 'recommend', action: 'remove' },
        { tag: 'computer', level: 2, levelName: 'recommend', action: 'remove' },
        { tag: 'useless-account', level: 3, levelName: 'suggest', action: 'keep' },
        { tag: 'awesome-account', level: 3, levelName: 'suggest', action: 'remove' },
      ]);
      expect(combined.possibilities).to.have.lengthOf(2)
        .and.to.have.deep.members([{tag: 'never-login', isSet: true}, {tag: 'outside-server', isSet: false}]);
    });

    it('makes "keep" recommendations after clears', function() {
      const recommendations = {
        title: 'Test title',
        clear: ['fqdn', 'spn', 'computer'],
        require: ['ldap-guid:4ef77592-ae69-4dc0-8bf4-08a562873c83'],
        recommend: {
          'user': true,
          'computer': true,
          'fqdn:itsame.fluggo.com': true,
        },
        suggest: {
          'useless-account': true,
          'awesome-account': false,
        },
        possibilities: ['never-login', 'outside-server']
      };

      const article = {
        title: 'Test title',
        body: 'body dont matter',
        tags: [
          'fqdn:itsame.fluggo.com',
          'spn:removeme',
          'ldap-guid:4ef77592-ae69-4dc0-8bf4-08a562873c83',
          'user',
          'computer',
          'useless-account',
          'awesome-account',
          'never-login'
        ]
      };

      const combined = wikiUtil.combineWikiRecommendations(recommendations, article);

      expect(combined.title).to.equal('Test title');
      expect(combined.changes).to.deep.equal([
        { tag: 'ldap-guid:4ef77592-ae69-4dc0-8bf4-08a562873c83', level: 1, levelName: 'require', action: 'keep' },
        { tag: 'fqdn:itsame.fluggo.com', level: 2, levelName: 'recommend', action: 'keep' },
        { tag: 'computer', level: 2, levelName: 'recommend', action: 'keep' },
        { tag: 'user', level: 2, levelName: 'recommend', action: 'keep' },
        { tag: 'spn:removeme', level: 2, levelName: 'recommend', action: 'remove' },
        { tag: 'useless-account', level: 3, levelName: 'suggest', action: 'keep' },
        { tag: 'awesome-account', level: 3, levelName: 'suggest', action: 'remove' },
      ]);
      expect(combined.possibilities).to.have.lengthOf(2)
        .and.to.have.deep.members([{tag: 'never-login', isSet: true}, {tag: 'outside-server', isSet: false}]);
    });

    it('gives precedence to recommendations with an article', function() {
      const recommendations = {
        title: 'Test title',
        clear: ['fqdn', 'spn'],
        require: ['ldap-guid:4ef77592-ae69-4dc0-8bf4-08a562873c83'],
        recommend: {
          'user': false,
        },
        suggest: {
          'user': true,
        },
        possibilities: ['never-login', 'outside-server']
      };

      const article = {
        title: 'Test title',
        body: 'body dont matter',
        tags: [
          'fqdn:thisiswrong.com',
          'spn:removeme',
          'ldap-guid:4ef77592-ae69-4dc0-8bf4-08a562873c83',
          'user',
          'computer',
          'useless-account',
          'awesome-account',
          'never-login'
        ]
      };

      const combined = wikiUtil.combineWikiRecommendations(recommendations, article);

      expect(combined.changes).to.deep.equal([
        { tag: 'ldap-guid:4ef77592-ae69-4dc0-8bf4-08a562873c83', level: 1, levelName: 'require', action: 'keep' },
        { tag: 'fqdn:thisiswrong.com', level: 2, levelName: 'recommend', action: 'remove' },
        { tag: 'spn:removeme', level: 2, levelName: 'recommend', action: 'remove' },
        { tag: 'user', level: 2, levelName: 'recommend', action: 'remove' },
      ]);
    });

  });

  require('./createArticle');
  require('./updateArticle');

  describe('deleteArticle', function() {
    beforeEach(function(done) {
      async.series([
        indexMaint.deleteWiki,
        createWikiTestArticles,
      ], done);
    });

    afterEach(function(done) {
      indexMaint.deleteWiki(done);
    });

    it('emits an event when an article is deleted', function(done) {
      wiki.once('article-changed', function(evt) {
        expect(evt).to.exist;
        expect(evt.id).to.equal('mario');
        //expect(evt.title).to.equal('Super Mario');
        //expect(evt.oldTitle).to.equal('Mario');
        expect(evt.user).to.equal('brian@fluggo.com');
        expect(evt.changeType).to.equal('deleted');

        return done();
      });

      wiki.deleteArticle('mario', 'brian@fluggo.com', function(err, result) {
        if(err)
          return done(err);
      });
    });
  });

  describe('getEntriesStream', function() {
    beforeEach(function(done) {
      async.series([
        indexMaint.deleteWiki,
        createWikiTestArticles,
      ], done);
    });

    afterEach(function(done) {
      indexMaint.deleteWiki(done);
    });

    it('fetches all entries as a stream', function(done) {
      const emitter = es.getEntriesStream({index: 'test-wiki-read', type: 'article'});
      const result = [];

      emitter.addListener('error', done);
      emitter.addListener('data', function(data) {
        result.push(data);
      });
      emitter.addListener('end', function() {
        expect(result.length).to.equal(4);
        done();
      });
    });
  });

  describe('getAllEntries', function() {
    beforeEach(function(done) {
      async.series([
        indexMaint.deleteWiki,
        createWikiTestArticles,
      ], done);
    });

    afterEach(function(done) {
      indexMaint.deleteWiki(done);
    });

    it('fetches all entries at once', function(done) {
      es.getAllEntries({index: 'test-wiki-read', type: 'article'}, function(err, result) {
        expect(err).to.not.exist;
        expect(result.length).to.equal(4);
        done();
      });
    });
  });

  describe('reindexArticles', function() {
    beforeEach(function(done) {
      async.series([
        indexMaint.deleteWiki,
        createWikiTestArticles,
      ], done);
    });

    afterEach(function(done) {
      indexMaint.deleteWiki(done);
    });

    it('actually works', function(done) {
      const emitter = indexMaint.reindexArticles({}, function(err, result) {
        if(err)
          return done(err);

        indexMaint.switchAliasesTo(result.index, function(err, result) {
          if(err)
            return done(err);

          wiki.getArticleById('mario', function(err, result) {
            if(err)
              return done(err);

            expect(result._source.wiki.title).to.equal('Mario')
            expect(result._source.wiki.body).to.equal('Mario is a [[plumber]] from the [[Mushroom Kingdom]].')
            expect(result._source.wiki.tags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats:super-mushroom', 'lives-in:mushroom-kingdom']);
            expect(result._source.wiki.uuid).to.exist;
            expect(result._source.wiki.createdBy).to.equal('brian@fluggo.com');
            expect(result._source.wiki.createdTime).to.exist;
            expect(result._source.wiki.updatedBy).to.equal('brian@fluggo.com');
            expect(result._source.wiki.updatedTime).to.exist;
            done();
          });
        });
      });
    });

    it('migrates unreviewed articles', function(done) {
      return wiki.createArticle({title: 'Western Digital', body: 'They make hard drives.', tags: ['actor', 'company']}, 'brian@fluggo.com', {unreviewed: true}, function(err) {
        if(err)
          return done(err);

        return indexMaint.reindexArticles({}, function(err, result) {
          if(err)
            return done(err);

          return indexMaint.switchAliasesTo(result.index, function(err, result) {
            if(err)
              return done(err);

            return wiki.getArticleById('western-digital', function(err, result) {
              if(err)
                return done(err);

              expect(result._id).to.equal('western-digital');
              expect(result._source.wiki.body).to.not.exist;
              expect(result._source.wiki.title).to.not.exist;
              expect(result._source.wiki.tags).to.not.exist;
              expect(result._source.wiki.uuid).to.exist;
              expect(result._source.wiki.baseTags).to.not.exist;
              expect(result._source.wiki.createdBy).to.not.exist;
              expect(result._source.wiki.updatedBy).to.not.exist;
              expect(result._source.wiki.createdTime).to.not.exist;
              expect(result._source.wiki.updatedTime).to.not.exist;
              expect(result._source.wiki.unreviewed).to.be.true;
              expect(result._source.wiki.unreviewedHistory).to.exist.and.have.lengthOf(1);
              expect(result._source.wiki.unreviewedHistory[0].body).to.equal('They make hard drives.');
              expect(result._source.wiki.unreviewedHistory[0].title).to.equal('Western Digital');
              expect(result._source.wiki.unreviewedHistory[0].tags).to.deep.equal(['actor', 'company']);
              expect(result._source.wiki.unreviewedHistory[0].baseTags).to.deep.equal(['actor', 'company']);
              expect(result._source.wikiUnreviewed.body).to.equal('They make hard drives.');
              expect(result._source.wikiUnreviewed.title).to.equal('Western Digital');
              expect(result._source.wikiUnreviewed.tags).to.deep.equal(['actor', 'company']);
              expect(result._source.wikiUnreviewed.baseTags).to.deep.equal(['actor', 'company']);
              expect(result._source.wikiUnreviewed.createdBy).to.not.exist;
              expect(result._source.wikiUnreviewed.updatedBy).to.equal('brian@fluggo.com');
              expect(result._source.wikiUnreviewed.createdTime).to.not.exist;
              expect(result._source.wikiUnreviewed.updatedTime).to.exist;
              done();
            });
          });
        });
      });

    });
  });

  describe('reindexArticles v1 -> v2', function() {
    beforeEach(function(done) {
      async.series([
        indexMaint.deleteWiki,
        callback => createWikiTestArticles({version: 1}, callback),
      ], done);
    });

    afterEach(function(done) {
      indexMaint.deleteWiki(done);
    });

    it('migrates history', function(done) {
      const emitter = indexMaint.reindexArticles({}, function(err, result) {
        if(err)
          return done(err);

        indexMaint.switchAliasesTo(result.index, function(err, result) {
          if(err)
            return done(err);

          // Verify history has been migrated over
          wiki.getArticleById('mario', {}, function(err, result) {
            expect(err).to.not.exist;
            expect(result._id).to.equal('mario');
            expect(result._version).to.equal(1);
            expect(result._source.wiki.history).to.not.exist;
            expect(result._source.wiki.uuid).to.exist;

            getAllWikiHistory(result._source.wiki.uuid, function(err, history) {
              if(err)
                return done(err);

              expect(history).to.have.lengthOf(1);
              expect(history[0]._source.uuid).to.equal(result._source.wiki.uuid);
              expect(history[0]._source.updatedTime).to.equal(result._source.wiki.createdTime);

              done();
            });

          });
        });
      });

      // progress emitter is broken for now
      /*emitter.addListener('error', function(err) {
        console.log('error', err.articles);
      });
      emitter.addListener('progress', function(evt) {
        //console.log('progress', evt);
      });
      emitter.addListener('end', function(evt) {
        //console.log('end');
      });*/
    });
  });

  describe('reindexArticles v2 -> v3', function() {
    beforeEach(function(done) {
      async.series([
        indexMaint.deleteWiki,
        callback => createWikiTestArticles({version: 2}, callback),
      ], done);
    });

    afterEach(function(done) {
      indexMaint.deleteWiki(done);
    });

    it('creates the unreviewed section', function(done) {
      const emitter = indexMaint.reindexArticles({}, function(err, result) {
        if(err)
          return done(err);

        indexMaint.switchAliasesTo(result.index, function(err, result) {
          if(err)
            return done(err);

          // Verify history has been migrated over
          return wiki.getArticleById('mario', {}, function(err, result) {
            if(err)
              return done(err);

            expect(result._id).to.equal('mario');
            expect(result._version).to.equal(1);
            expect(result._source.wiki.unreviewed).to.be.false;
            expect(result._source.wikiUnreviewed).to.exist;
            expect(result._source.wikiUnreviewed.title).to.equal('Mario');
            expect(result._source.wikiUnreviewed.body).to.equal('Mario is a [[plumber]] from the [[Mushroom Kingdom]].');
            expect(result._source.wikiUnreviewed.updatedBy).to.equal(result._source.wiki.updatedBy);
            expect(result._source.wikiUnreviewed.updatedTime).to.equal(result._source.wiki.updatedTime);

            return done();
          });
        });
      });
    });

    it('moves the wikiDerived section', function(done) {
      const emitter = indexMaint.reindexArticles({}, function(err, result) {
        if(err)
          return done(err);

        indexMaint.switchAliasesTo(result.index, function(err, result) {
          if(err)
            return done(err);

          // Verify history has been migrated over
          return wiki.getArticleById('mario', {}, function(err, result) {
            if(err)
              return done(err);

            expect(result._id).to.equal('mario');
            expect(result._version).to.equal(1);
            expect(result._source.wikiDerived).to.not.exist;
            expect(result._source.wiki.baseTags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats', 'lives-in']);
            expect(result._source.wiki.rels).to.exist;
            expect(result._source.wikiUnreviewed).to.exist;
            expect(result._source.wikiUnreviewed.title).to.equal('Mario');
            expect(result._source.wikiUnreviewed.body).to.equal('Mario is a [[plumber]] from the [[Mushroom Kingdom]].');
            expect(result._source.wikiUnreviewed.baseTags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats', 'lives-in']);
            expect(result._source.wikiUnreviewed.updatedBy).to.equal(result._source.wiki.updatedBy);
            expect(result._source.wikiUnreviewed.updatedTime).to.equal(result._source.wiki.updatedTime);

            return done();
          });
        });
      });
    });
  });

  describe('reindexArticles v3 -> v4', function() {
    beforeEach(function(done) {
      async.series([
        indexMaint.deleteWiki,
        callback => createWikiTestArticles({version: 3}, callback),
      ], done);
    });

    afterEach(function(done) {
      indexMaint.deleteWiki(done);
    });

    it('creates the quickSearch section', function(done) {
      const emitter = indexMaint.reindexArticles({}, function(err, result) {
        if(err)
          return done(err);

        indexMaint.switchAliasesTo(result.index, function(err, result) {
          if(err)
            return done(err);

          // Verify history has been migrated over
          return wiki.getArticleById('mario', {}, function(err, result) {
            if(err)
              return done(err);

            expect(result._source.common.quickSearch).to.exist;
            return done();
          });
        });
      });
    });
  });

  describe('parseQueryTerms', function() {
    it('should parse single terms', function() {
      expect(wikiUtil.parseQueryTerms('test'), 'basic').to.deep.equal([
        { term: 'test', type: 'term', req: 'should' }
      ]);

      expect(wikiUtil.parseQueryTerms('  test '), 'whitespace').to.deep.equal([
        { term: 'test', type: 'term', req: 'should' }
      ]);

      expect(wikiUtil.parseQueryTerms('+test'), 'must').to.deep.equal([
        { term: 'test', type: 'term', req: 'must' }
      ]);

      expect(wikiUtil.parseQueryTerms('-test'), 'must_not').to.deep.equal([
        { term: 'test', type: 'term', req: 'must_not' }
      ]);

      expect(wikiUtil.parseQueryTerms('tag:test'), 'tag').to.deep.equal([
        { term: 'test', type: 'tag', req: 'should' }
      ]);

      expect(wikiUtil.parseQueryTerms('+tag:test'), 'must tag').to.deep.equal([
        { term: 'test', type: 'tag', req: 'must' }
      ]);

      expect(wikiUtil.parseQueryTerms('-tag:test'), 'must_not tag').to.deep.equal([
        { term: 'test', type: 'tag', req: 'must_not' }
      ]);

      expect(wikiUtil.parseQueryTerms('"this is a phrase"'), 'phrase').to.deep.equal([
        { term: 'this is a phrase', type: 'phrase', req: 'should' }
      ]);

      expect(wikiUtil.parseQueryTerms('tag:"this is a phrase"'), 'phrase tag').to.deep.equal([
        { term: 'this is a phrase', type: 'tag', req: 'should' }
      ]);
    });

    it('should parse multiple terms', function() {
      expect(wikiUtil.parseQueryTerms('test kong'), 'two terms').to.deep.equal([
        { term: 'test', type: 'term', req: 'should' },
        { term: 'kong', type: 'term', req: 'should' }
      ]);

      expect(wikiUtil.parseQueryTerms('test +kong'), 'two terms with required').to.deep.equal([
        { term: 'test', type: 'term', req: 'should' },
        { term: 'kong', type: 'term', req: 'must' }
      ]);

      expect(wikiUtil.parseQueryTerms('test -"phrase thing"'), 'two terms with must_not phrase').to.deep.equal([
        { term: 'test', type: 'term', req: 'should' },
        { term: 'phrase thing', type: 'phrase', req: 'must_not' }
      ]);

      expect(wikiUtil.parseQueryTerms('test -tag:"phrase thing"'), 'two terms with must_not phrase tag').to.deep.equal([
        { term: 'test', type: 'term', req: 'should' },
        { term: 'phrase thing', type: 'tag', req: 'must_not' }
      ]);

      expect(wikiUtil.parseQueryTerms('-tag:"phrase thing" +stuff'), 'two terms with must_not phrase tag').to.deep.equal([
        { term: 'phrase thing', type: 'tag', req: 'must_not' },
        { term: 'stuff', type: 'term', req: 'must' },
      ]);
    });

    it('should parse hashtags', function() {
      expect(wikiUtil.parseQueryTerms('#tag')).to.deep.equal([
        { term: 'tag', type: 'hashtag', req: 'should' },
      ]);

      expect(wikiUtil.parseQueryTerms('+#tag')).to.deep.equal([
        { term: 'tag', type: 'hashtag', req: 'must' },
      ]);

      expect(wikiUtil.parseQueryTerms('-#tag')).to.deep.equal([
        { term: 'tag', type: 'hashtag', req: 'must_not' },
      ]);
    });
  });

  describe('parseBodyForRefsSync', function() {
    it('finds wiki references', function() {
      const text = `this is [[text]] for the article

this is a second [[haha|line]]`;

      const result = wikiUtil.parseBodyForRefsSync(text);

      expect(result.linkLines[0]).to.deep.equal(
        { context: 'this is [[text]] for the article', ref: 'text' }
      );

      expect(result.linkLines[1]).to.deep.equal(
        { context: 'this is a second [[haha|line]]', ref: 'haha' }
      );
    });

    it('finds hashtag references', function() {
      const text = `this is a #hashtag for the article

this is a second #hashtag:value`;

      const result = wikiUtil.parseBodyForRefsSync(text);

      expect(result.hashtagLines[0]).to.deep.equal(
        { context: 'this is a #hashtag for the article', ref: 'hashtag' }
      );

      expect(result.hashtagLines[1]).to.deep.equal(
        { context: 'this is a second #hashtag:value', ref: 'hashtag', value: 'value' }
      );
    });

  });

  describe('getArticleSummariesById', function() {
    beforeEach(function(done) {
      async.series([
        indexMaint.deleteWiki,
        createWikiTestArticles,
      ], done);
    });

    afterEach(function(done) {
      indexMaint.deleteWiki(done);
    });

    it('checks whether articles exist', function(done) {
      wiki.getArticleSummariesById(['mario', 'luigi'], function(err, res) {
        if(err)
          done(err);

        const mario = res.find(entry => entry.id === 'mario');

        expect(mario).to.exist.and.deep.equal({
          id: 'mario',
          found: true,
          title: 'Mario',
          summary: 'Mario is a [[plumber]] from the [[Mushroom Kingdom]].',
          tagType: undefined
        });

        const luigi = res.find(entry => entry.id === 'luigi');

        expect(luigi).to.exist.and.deep.equal({
          id: 'luigi',
          found: false,
          summary: undefined,
          title: undefined,
          tagType: undefined
        })

        done();
      });
    });

    it('works when no articles exist', function(done) {
      wiki.getArticleSummariesById(['princess', 'luigi'], function(err, res) {
        if(err)
          done(err);

        expect(res).to.have.lengthOf(2);
        expect(res.every(entry => entry.found === false)).to.be.true;

        done();
      });
    });

    it('tells us the tag-type of an article', function(done) {
      wiki.getArticleSummariesById(['contains'], function(err, res) {
        if(err)
          done(err);

        expect(res).to.have.lengthOf(1);

        expect(res[0].id).to.equal('contains');
        expect(res[0].found).to.equal(true);
        expect(res[0].tagType).to.equal('article');

        done();
      });

    });
  });

  describe('findAllTags', function() {
    beforeEach(function(done) {
      async.series([
        indexMaint.deleteWiki,
        createWikiTestArticles,
      ], done);
    });

    afterEach(function(done) {
      indexMaint.deleteWiki(done);
    });

    it('works', function(done) {
      wiki.findAllTags(function(err, tags) {
        if(err)
          return done(err);

        const map = new Map(tags.map(tag => [tag.tag, tag]));

        expect(map.has('test')).to.be.true;
        expect(map.get('test').usageCount).to.equal(4);
        expect(map.get('test').article).to.not.exist;

        expect(map.has('contains')).to.be.true;
        expect(map.get('contains').usageCount).to.equal(1);
        expect(map.get('contains').article).to.exist;
        expect(map.get('contains').article.title).to.equal('Contains');
        expect(map.get('contains').article.summary).to.equal('Test line 1');
        expect(map.get('contains').article.tagType).to.equal('article');

        done();
      });
    });
  });

  describe('createMapping', function() {
    it('handles normal tag types', function() {
      expect(indexMaint.createMapping({}).article.properties.wiki.properties.rels.properties['stuff'])
        .to.not.exist;
      expect(indexMaint.createMapping({stuff: 'integer'}).article.properties.wiki.properties.rels.properties['stuff'])
        .to.deep.equal({ type: 'integer' });
      expect(indexMaint.createMapping({stuff: 'ip'}).article.properties.wiki.properties.rels.properties['stuff'])
        .to.deep.equal({ type: 'ip' });
      expect(indexMaint.createMapping({stuff: 'string'}).article.properties.wiki.properties.rels.properties['stuff'])
        .to.deep.equal({ type: 'keyword' });
      expect(indexMaint.createMapping({stuff: 'article'}).article.properties.wiki.properties.rels.properties['stuff'])
        .to.deep.equal({ type: 'keyword', copy_to: 'wiki.tagReferencedArticles' });
    });

    it('forces tag-type mapping', function() {
      var mapping = indexMaint.createMapping({});

      expect(mapping.article.properties.wiki.properties.rels.properties['tag-type']).to.deep.equal({ type: 'keyword' });

      mapping = indexMaint.createMapping({ 'tag-type': 'integer' });

      expect(mapping.article.properties.wiki.properties.rels.properties['tag-type']).to.deep.equal({ type: 'keyword' });
    });
  });

  describe('fetchTags', function() {
    beforeEach(function(done) {
      async.series([
        indexMaint.deleteWiki,
        createWikiTestArticles,
      ], done);
    });

    afterEach(function(done) {
      indexMaint.deleteWiki(done);
    });

    it('fetches the tags in existence', function(done) {
      indexMaint.fetchTags(function(err, res) {
        if(err)
          return done(err);

        expect([...res.entries()]).to.have.deep.members([
          ['contains', 'article'],
          ['tag-type', 'string'],
          ['alias', 'string'],
          ['implies', 'article']
        ]);

        done();
      });
    });

    it('fetches new tags', function(done) {
      wiki.createArticle({title: 'Ip', body: '', tags: ['tag-type:ip']}, 'Pingu@NOOK.NOOK', function(err, result) {
        if(err)
          return done(err);

        es.client.indices.refresh({index: 'test-wiki-read'}, function(err) {
          if(err)
            return done(err);

          indexMaint.fetchTags(function(err, res) {
            if(err)
              return done(err);

            expect([...res.entries()]).to.have.deep.members([
              ['contains', 'article'],
              ['tag-type', 'string'],
              ['alias', 'string'],
              ['implies', 'article'],
              ['ip', 'ip']
            ]);

            done();
          });
        })
      });
    });
  });

  describe('getWikiReport', function () {
    beforeEach(function(done) {
      async.series([
        indexMaint.deleteWiki,
        createWikiTestArticles,
      ], done);
    });

    afterEach(function(done) {
      indexMaint.deleteWiki(done);
    });

    it('builds a report from the base dataset', function(done) {
      wiki.getWikiReport({ match_all: {} }, ['contains', 'tag-type', 'mario', 'eats', 'powerup'], function(err, result) {
        if(err)
          return done(err);

        expect(result).to.exist;
        expect(result.articles).to.exist;
        result.articles.sort((a, b) => d3.ascending(a.id, b.id));

        expect(result).to.deep.equal({
          tags: [
            {
              id: 'contains',
              type: 'article',
              title: 'Contains',
              summary: 'Test line 1',
            },
            {
              id: 'tag-type',
              type: 'string',
            },
            {
              id: 'mario',
              title: 'Mario',
              summary: 'Mario is a [[plumber]] from the [[Mushroom Kingdom]].',
            },
            {
              id: 'eats'
            },
            {
              id: 'powerup'
            },
          ],
          resultCount: 4,
/*
    {
      title: 'Mario',
      body: 'Mario is a [[plumber]] from the [[Mushroom Kingdom]].',
      tags: ['test', 'person', 'actor', 'plumber', 'eats:super-mushroom', 'lives-in:mushroom-kingdom'],
    },
    {
      title: 'Super Mushroom',
      body: 'Super Mushrooms make [[Mario]] big.',
      tags: ['test', 'powerup'],
    },
    {
      title: 'Mushroom Kingdom',
      body: 'The Mushroom Kingdom is where the Super Mario series takes place. [[Princess Peach]] is the ruler.\n\nThis paragraph references [[Mario]]. #mario',
      tags: ['test', 'actor', 'place', 'contains:super-mushroom'],
    },
    {
      title: 'Contains',
      body: 'Test line 1\n\nTest line 2',
      tags: ['test', 'tag-type:article'],
    },
*/
          articles: [
            {
              id: 'contains',
              title: 'Contains',
              summary: 'Test line 1',
              tags: {
                contains: null,
                'tag-type': [{ value: 'article' }],
                mario: null,
                eats: null,
                powerup: null,
              },
            },
            {
              id: 'mario',
              title: 'Mario',
              summary: 'Mario is a [[plumber]] from the [[Mushroom Kingdom]].',
              tags: {
                contains: null,
                'tag-type': null,
                mario: null,
                eats: [
                  { value: 'super-mushroom' }
                ],
                powerup: null,
              },
            },
            {
              id: 'mushroom-kingdom',
              title: 'Mushroom Kingdom',
              summary: 'The Mushroom Kingdom is where the Super Mario series takes place. [[Princess Peach]] is the ruler.',
              tags: {
                contains: [
                  { value: 'super-mushroom' }
                ],
                'tag-type': null,
                mario: [
                  { line: 'This paragraph references [[Mario]]. #mario' }
                ],
                eats: null,
                powerup: null,
              },
            },
            {
              id: 'super-mushroom',
              title: 'Super Mushroom',
              summary: 'Super Mushrooms make [[Mario]] big.',
              tags: {
                contains: null,
                'tag-type': null,
                mario: null,
                eats: null,
                powerup: [
                  { value: true }
                ],
              },
            },
          ],
        });

        return done();
      });
    });

    it('handles valued hashtags', function(done) {
      async.series([
        function(callback) {
          wiki.createArticle({title: 'Test hashtag', body: 'just a test hashtag.', tags: ['tag-type:integer']}, 'brian@fluggo.com', callback);
        },
        function(callback) {
          wiki.createArticle({title: 'Luigi', body: 'A policeman. #test-hashtag:1234', tags: []}, 'brian@fluggo.com', callback);
        },
        function(callback) {
          wiki.getWikiReport({ term: { 'wiki.bodyReferencedHashtags': 'test-hashtag' } }, ['test-hashtag'], function(err, result) {
            if(err)
              return callback(err);

            expect(result).to.exist;
            expect(result.articles).to.exist;

            expect(result.articles).to.deep.equal([
                {
                  id: 'luigi',
                  title: 'Luigi',
                  summary: 'A policeman. #test-hashtag:1234',
                  tags: {
                    'test-hashtag': [{ line: 'A policeman. #test-hashtag:1234', value: 1234 }],
                  },
                },
              ]);

            return callback();
          });
        }
      ], done);


    });
  });
});

require('./wsapi');
