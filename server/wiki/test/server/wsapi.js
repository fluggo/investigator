// https://mochajs.org/
// http://chaijs.com/api/bdd/
'use strict';

const chai = require('chai'), expect = chai.expect;

const wikiUtil = require('../../util.js');
const test = require('./index.js');
const indexMaint = require('../../index-maint.js');
const async = require('async');
const wiki = require('../../index.js');
const d3 = require('d3');
const config = require('../../../config.js');
const users = require('../../../users');
const wsapi = require('../../../wsapi');
require('../../wsapi.js');

function callWsapi(id, user, data, callback, notifyCallback) {
  return wsapi.emit(id, {user: user, data: data, log: config.logger}, callback, notifyCallback || function() {});
}

describe('Wiki WSAPI', function() {
  describe('create-article', function() {
    beforeEach(function(done) {
      async.series([
        indexMaint.deleteWiki,
        test.createWikiTestArticles,
      ], done);
    });

    afterEach(function(done) {
      indexMaint.deleteWiki(done);
    });

    it('creates an article', function(done) {
      const user = new users.User('Fake@FAKE.ORG', {userControls: {wiki: {view: true, edit: true}}});

      return callWsapi('wiki/create-article', user, {article: {title: 'Western Digital', body: 'They make hard drives.', tags: ['actor', 'company']}}, function(err, result) {
        if(err)
          return done(err);

        expect(result._id).to.equal('western-digital');
        expect(result._version).to.equal(1);

        wiki.getArticleById('western-digital', {}, function(err, result) {
          if(err)
            return done(err);

          expect(result).to.exist;
          expect(result._id).to.equal('western-digital');
          expect(result._version).to.equal(1);
          expect(result._source.wiki.body).to.equal('They make hard drives.');
          expect(result._source.wiki.title).to.equal('Western Digital');
          expect(result._source.wiki.createdBy).to.equal('Fake@FAKE.ORG');
          expect(result._source.wiki.updatedBy).to.equal('Fake@FAKE.ORG');

          return done();
        });
      });
    });

    it('creates an unreviewed article', function(done) {
      const user = new users.User('Fake@FAKE.ORG', {userControls: {wiki: {view: true, edit: 'propose'}}});

      return callWsapi('wiki/create-article', user, {article: {title: 'Western Digital', body: 'They make hard drives.', tags: ['actor', 'company']}}, function(err, result) {
        if(err)
          return done(err);

        wiki.getArticleById('western-digital', {}, function(err, result) {
          if(err)
            return done(err);

          expect(result).to.exist;
          expect(result._source.wiki.unreviewed).to.be.true;
          expect(result._source.wiki.body).to.not.exist;
          expect(result._source.wikiUnreviewed.body).to.equal('They make hard drives.');

          return done();
        });
      });
    });

    it('fails if the user does not have edit permissions', function(done) {
      const user = new users.User('Fake@FAKE.ORG', {userControls: {wiki: {view: true, edit: false}}});

      return callWsapi('wiki/create-article', user, {article: {title: 'Western Digital', body: 'They make hard drives.', tags: ['actor', 'company']}}, function(err, result) {
        expect(err).to.exist;
        expect(err.message).to.equal('Request denied.');
        return done();
      });
    });

    it('fails if the user does not have view permissions', function(done) {
      const user = new users.User('Fake@FAKE.ORG', {userControls: {wiki: {view: false, edit: true}}});

      return callWsapi('wiki/create-article', user, {article: {title: 'Western Digital', body: 'They make hard drives.', tags: ['actor', 'company']}}, function(err, result) {
        expect(err).to.exist;
        expect(err.message).to.equal('Request denied.');
        return done();
      });
    });
  });

  describe('update-article', function() {
    beforeEach(function(done) {
      async.series([
        indexMaint.deleteWiki,
        test.createWikiTestArticles,
      ], done);
    });

    afterEach(function(done) {
      indexMaint.deleteWiki(done);
    });

    it('updates an article', function(done) {
      const user = new users.User('Fake@FAKE.ORG', {userControls: {wiki: {view: true, edit: true}}});

      return callWsapi('wiki/update-article', user, {id: 'mario', version: 1, article: {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}}, function(err, result) {
        if(err)
          return done(err);

        expect(result._id).to.equal('mario');
        expect(result._version).to.equal(2);
        expect(result._source.wiki.body).to.equal('Test article text');
        expect(result._source.wiki.title).to.equal('Mario');
        expect(result._source.wiki.tags).to.deep.equal(['test', 'tags']);
        expect(result._source.wiki.baseTags).to.deep.equal(['test', 'tags']);
        expect(result._source.wiki.updatedBy).to.equal('Fake@FAKE.ORG');
        expect(result._source.wiki.updatedTime).to.exist;

        return wiki.getArticleById('mario', {}, function(err, result) {
          if(err)
            return done(err);

          expect(result._id).to.equal('mario');
          expect(result._version).to.equal(2);
          expect(result._source.wiki.body).to.equal('Test article text');
          expect(result._source.wiki.title).to.equal('Mario');
          expect(result._source.wiki.tags).to.deep.equal(['test', 'tags']);
          expect(result._source.wiki.updatedBy).to.equal('Fake@FAKE.ORG');
          expect(result._source.wiki.updatedTime).to.exist;
          done();
        });
      });
    });

    it('by default updates an article for review if user has propose', function(done) {
      const user = new users.User('Fake@FAKE.ORG', {userControls: {wiki: {view: true, edit: 'propose'}}});

      return callWsapi('wiki/update-article', user, {id: 'mario', version: 1, article: {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}}, function(err, result) {
        if(err)
          return done(err);

        expect(result._id).to.equal('mario');
        expect(result._version).to.equal(2);
        expect(result._source.wiki.body).to.equal('Mario is a [[plumber]] from the [[Mushroom Kingdom]].');
        expect(result._source.wiki.title).to.equal('Mario');
        expect(result._source.wiki.tags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats:super-mushroom', 'lives-in:mushroom-kingdom']);
        expect(result._source.wiki.baseTags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats', 'lives-in']);
        expect(result._source.wiki.updatedBy).to.equal('brian@fluggo.com');
        expect(result._source.wiki.updatedTime).to.exist;
        expect(result._source.wikiUnreviewed.body).to.equal('Test article text');
        expect(result._source.wikiUnreviewed.title).to.equal('Mario');
        expect(result._source.wikiUnreviewed.tags).to.deep.equal(['test', 'tags']);
        expect(result._source.wikiUnreviewed.baseTags).to.deep.equal(['test', 'tags']);
        expect(result._source.wikiUnreviewed.updatedBy).to.equal('Fake@FAKE.ORG');
        expect(result._source.wikiUnreviewed.updatedTime).to.exist;

        return done();
      });
    });

    it('updates an article for review if user requests "keep" but has propose', function(done) {
      const user = new users.User('Fake@FAKE.ORG', {userControls: {wiki: {view: true, edit: 'propose'}}});

      return callWsapi('wiki/update-article', user, {id: 'mario', version: 1, article: {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}, options: {unreviewed: 'keep'}}, function(err, result) {
        if(err)
          return done(err);

        expect(result._id).to.equal('mario');
        expect(result._version).to.equal(2);
        expect(result._source.wiki.body).to.equal('Mario is a [[plumber]] from the [[Mushroom Kingdom]].');
        expect(result._source.wiki.unreviewed).to.be.true;
        expect(result._source.wikiUnreviewed.body).to.equal('Test article text');

        return done();
      });
    });

    it('updates an article officially if user requests "keep"', function(done) {
      const user = new users.User('Fake@FAKE.ORG', {userControls: {wiki: {view: true, edit: true}}});

      return callWsapi('wiki/update-article', user, {id: 'mario', version: 1, article: {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}, options: {unreviewed: 'keep'}}, function(err, result) {
        if(err)
          return done(err);

        expect(result._id).to.equal('mario');
        expect(result._version).to.equal(2);
        expect(result._source.wiki.body).to.equal('Test article text');
        expect(result._source.wiki.unreviewed).to.be.false;
        expect(result._source.wikiUnreviewed.body).to.equal('Test article text');

        return done();
      });
    });

    it('updates an article for review if user requests "keep"', function(done) {
      const user = new users.User('Fake@FAKE.ORG', {userControls: {wiki: {view: true, edit: true}}});

      return callWsapi('wiki/update-article', user, {id: 'mario', version: 1, article: {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}, options: {unreviewed: true}}, function(err, result) {
        if(err)
          return done(err);

        return callWsapi('wiki/update-article', user, {id: 'mario', version: 2, article: {title: 'Mario', body: 'Test article text 2', tags: ['test', 'tags']}, options: {unreviewed: 'keep'}}, function(err, result) {
          if(err)
            return done(err);

          expect(result._id).to.equal('mario');
          expect(result._version).to.equal(3);
          expect(result._source.wiki.body).to.equal('Mario is a [[plumber]] from the [[Mushroom Kingdom]].');
          expect(result._source.wiki.unreviewed).to.be.true;
          expect(result._source.wikiUnreviewed.body).to.equal('Test article text 2');

          return done();
        });
      });
    });

    it('fails if the user does not have edit permissions', function(done) {
      const user = new users.User('Fake@FAKE.ORG', {userControls: {wiki: {view: true, edit: false}}});

      return callWsapi('wiki/update-article', user, {id: 'mario', version: 1, article: {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}}, function(err, result) {
        expect(err).to.exist;
        expect(err.message).to.equal('Request denied.');
        done();
      });
    });

    it('fails if the user requests unreviewed but only has propose', function(done) {
      const user = new users.User('Fake@FAKE.ORG', {userControls: {wiki: {view: true, edit: 'propose'}}});

      return callWsapi('wiki/update-article', user, {id: 'mario', version: 1, article: {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}, options: {unreviewed: false}}, function(err, result) {
        expect(err).to.exist;
        expect(err.message).to.equal('Request denied.');
        done();
      });
    });

    it('fails if the user does not have view permissions', function(done) {
      const user = new users.User('Fake@FAKE.ORG', {userControls: {wiki: {view: false, edit: true}}});

      return callWsapi('wiki/update-article', user, {id: 'mario', version: 1, article: {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}}, function(err, result) {
        expect(err).to.exist;
        expect(err.message).to.equal('Request denied.');
        done();
      });
    });
  });
});
