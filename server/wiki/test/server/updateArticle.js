// https://mochajs.org/
// http://chaijs.com/api/bdd/
'use strict';

const chai = require('chai'), expect = chai.expect;

const wikiUtil = require('../../util');
const test = require('./index');
const indexMaint = require('../../index-maint');
const async = require('async');
const wiki = require('../../index');
const d3 = require('d3');

describe('updateArticle', function() {
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
    wiki.updateArticle('mario', 1, {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}, 'Pingu@NOOK.NOOK', function(err, result) {
      if(err)
        return done(err);

      expect(result._id).to.equal('mario');
      expect(result._version).to.equal(2);
      expect(result._source.wiki.body).to.equal('Test article text');
      expect(result._source.wiki.title).to.equal('Mario');
      expect(result._source.wiki.tags).to.deep.equal(['test', 'tags']);
      expect(result._source.wiki.baseTags).to.deep.equal(['test', 'tags']);
      expect(result._source.wiki.createdBy).to.equal('brian@fluggo.com');
      expect(result._source.wiki.createdTime).to.exist;
      expect(result._source.wiki.updatedBy).to.equal('Pingu@NOOK.NOOK');
      expect(result._source.wiki.updatedTime).to.exist;
      expect(result._source.wiki.history).to.not.exist;
      expect(result._source.wiki.uuid).to.exist;

      wiki.getArticleById('mario', {}, function(err, result) {
        expect(err).to.not.exist;
        expect(result._id).to.equal('mario');
        expect(result._version).to.equal(2);
        expect(result._source.wiki.body).to.equal('Test article text');
        expect(result._source.wiki.title).to.equal('Mario');
        expect(result._source.wiki.tags).to.deep.equal(['test', 'tags']);
        expect(result._source.wiki.createdBy).to.equal('brian@fluggo.com');
        expect(result._source.wiki.createdTime).to.exist;
        expect(result._source.wiki.updatedBy).to.equal('Pingu@NOOK.NOOK');
        expect(result._source.wiki.updatedTime).to.exist;
        expect(result._source.wiki.history).to.not.exist;
        expect(result._source.wiki.uuid).to.exist;

        test.getAllWikiHistory(result._source.wiki.uuid, function(err, history) {
          if(err)
            return done(err);

          expect(history).to.have.lengthOf(2);
          history.sort((a, b) => {
            return d3.ascending(new Date(a._source.updatedTime), new Date(b._source.updatedTime));
          });
          expect(history[0]._source.body).to.equal('Mario is a [[plumber]] from the [[Mushroom Kingdom]].');
          expect(history[0]._source.title).to.equal('Mario');
          expect(history[0]._source.tags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats:super-mushroom', 'lives-in:mushroom-kingdom']);
          expect(history[0]._source.uuid).to.equal(result._source.wiki.uuid);
          expect(history[0]._source.updatedTime).to.equal(result._source.wiki.createdTime);
          expect(history[1]._source.body).to.equal('Test article text');
          expect(history[1]._source.title).to.equal('Mario');
          expect(history[1]._source.tags).to.deep.equal(['test', 'tags']);
          expect(history[1]._source.uuid).to.equal(result._source.wiki.uuid);
          expect(history[1]._source.updatedTime).to.equal(result._source.wiki.updatedTime);

          done();
        });

      });
    });
  });

  it('allows changing the title', function(done) {
    wiki.updateArticle('mario', 1, {title: 'Super Mario', body: 'Test article text', tags: ['test', 'tags']}, 'brian@fluggo.com', function(err, result) {
      if(err)
        return done(err);

      expect(result._id).to.equal('super-mario');
      expect(result._source.wiki.title).to.equal('Super Mario');

      wiki.getArticleById('super-mario', {}, function(err, result) {
        expect(err).to.not.exist;
        expect(result._id).to.equal('super-mario');
        expect(result._source.wiki.title).to.equal('Super Mario');

        test.getAllWikiHistory(result._source.wiki.uuid, function(err, history) {
          if(err)
            return done(err);

          expect(history).to.have.lengthOf(2);
          history.sort((a, b) => {
            return d3.ascending(new Date(a._source.updatedTime), new Date(b._source.updatedTime));
          });
          expect(history[0]._source.body).to.equal('Mario is a [[plumber]] from the [[Mushroom Kingdom]].');
          expect(history[0]._source.title).to.equal('Mario');
          expect(history[0]._source.tags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats:super-mushroom', 'lives-in:mushroom-kingdom']);
          expect(history[0]._source.uuid).to.equal(result._source.wiki.uuid);
          expect(history[0]._source.updatedTime).to.equal(result._source.wiki.createdTime);
          expect(history[1]._source.body).to.equal('Test article text');
          expect(history[1]._source.title).to.equal('Super Mario');
          expect(history[1]._source.tags).to.deep.equal(['test', 'tags']);
          expect(history[1]._source.uuid).to.equal(result._source.wiki.uuid);
          expect(history[1]._source.updatedTime).to.equal(result._source.wiki.updatedTime);

          wiki.getArticleById('mario', {}, function(err, result) {
            if(err)
              done(err);

            expect(result).to.not.exist;
            done();
          });

        });
      });
    });
  });

  it('detects if an article already exists', function(done) {
    wiki.updateArticle('mario', 1, {title: 'Mushroom Kingdom', body: 'Test article text', tags: ['test', 'tags']}, 'brian@fluggo.com', function(err, result) {
      expect(err).to.exist;
      expect(err.code).to.equal('article-already-exists');

      done();
    });
  });

  it('detects version conflicts', function(done) {
    wiki.updateArticle('mario', 12, {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}, 'brian@fluggo.com', function(err, result) {
      expect(err).to.exist;
      expect(err.code).to.equal('version-conflict');
      done();
    });
  });

  it("leaves the user's UPN alone", function(done) {
    wiki.updateArticle('mario', 1, {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}, 'FARK@wonka.com', function(err, result) {
      expect(result._source.wiki.updatedBy).to.equal('FARK@wonka.com');
      done();
    });
  });

  it('reloads known tag-types after an article is updated', function(done) {
    wiki.updateArticle('mario', 1, {title: 'Mario', body: 'Test article text', tags: ['tag-type:ip']}, 'FARK@wonka.com', function(err, result) {
      if(err)
        return done(err);

      indexMaint.getKnownTags(function(err, result) {
        if(err)
          return done(err);

        expect(result.get('mario')).to.equal('ip');
        done();
      });
    });
  });

  it('emits an event when an article is updated', function(done) {
    wiki.once('article-changed', function(evt) {
      expect(evt).to.exist;
      expect(evt.id).to.equal('mario');
      expect(evt.oldId).to.not.exist;
      expect(evt.title).to.equal('Mario');
      expect(evt.oldTitle).to.not.exist;
      expect(evt.user).to.equal('FARK@wonka.com');
      expect(evt.changeType).to.equal('updated');

      return done();
    });

    wiki.updateArticle('mario', 1, {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}, 'FARK@wonka.com', function(err, result) {
      if(err)
        return done(err);
    });
  });

  it('emits an event when an article is renamed', function(done) {
    wiki.once('article-changed', function(evt) {
      expect(evt).to.exist;
      expect(evt.id).to.equal('super-mario');
      expect(evt.oldId).to.equal('mario');
      expect(evt.title).to.equal('Super Mario');
      expect(evt.oldTitle).to.equal('Mario');
      expect(evt.user).to.equal('brian@fluggo.com');
      expect(evt.changeType).to.equal('updated');

      return done();
    });

    wiki.updateArticle('mario', 1, {title: 'Super Mario', body: 'Test article text', tags: ['test', 'tags']}, 'brian@fluggo.com', function(err, result) {
      if(err)
        return done(err);
    });
  });

  it('holds a version for review', function(done) {
    wiki.updateArticle('mario', 1, {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}, 'FARK@wonka.com', {unreviewed: true}, function(err, result) {
      if(err)
        return done(err);

      expect(result._version).to.equal(2);
      expect(result._source.wiki.body).to.equal('Mario is a [[plumber]] from the [[Mushroom Kingdom]].');
      expect(result._source.wiki.title).to.equal('Mario');
      expect(result._source.wiki.tags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats:super-mushroom', 'lives-in:mushroom-kingdom']);
      expect(result._source.wiki.baseTags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats', 'lives-in']);
      expect(result._source.wiki.createdBy).to.equal('brian@fluggo.com');
      expect(result._source.wiki.createdTime).to.exist;
      expect(result._source.wiki.updatedBy).to.equal('brian@fluggo.com');
      expect(result._source.wiki.updatedTime).to.exist;
      expect(result._source.wiki.history).to.not.exist;
      expect(result._source.wiki.unreviewed).to.be.true;
      expect(result._source.wiki.unreviewedHistory).to.have.lengthOf(1);
      expect(result._source.wiki.unreviewedHistory[0].body).to.equal('Test article text');
      expect(result._source.wiki.unreviewedHistory[0].title).to.equal('Mario');
      expect(result._source.wiki.unreviewedHistory[0].tags).to.deep.equal(['test', 'tags']);
      expect(result._source.wiki.unreviewedHistory[0].baseTags).to.deep.equal(['test', 'tags']);
      expect(result._source.wiki.uuid).to.exist;
      expect(result._source.wikiUnreviewed.body).to.equal('Test article text');
      expect(result._source.wikiUnreviewed.title).to.equal('Mario');
      expect(result._source.wikiUnreviewed.tags).to.deep.equal(['test', 'tags']);
      expect(result._source.wikiUnreviewed.baseTags).to.deep.equal(['test', 'tags']);
      expect(result._source.wikiUnreviewed.createdBy).to.not.exist;
      expect(result._source.wikiUnreviewed.createdTime).to.not.exist;
      expect(result._source.wikiUnreviewed.updatedBy).to.equal('FARK@wonka.com');
      expect(result._source.wikiUnreviewed.updatedTime).to.exist;
      expect(result._source.wikiUnreviewed.history).to.not.exist;
      expect(result._source.wikiUnreviewed.uuid).to.not.exist;

      done();
    });
  });

  it('holds more than one version for review', function(done) {
    wiki.updateArticle('mario', 1, {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}, 'FARK@wonka.com', {unreviewed: true}, function(err, result) {
      if(err)
        return done(err);

      wiki.updateArticle('mario', 2, {title: 'Mario', body: 'Test article text 2', tags: ['test', 'tags', 'mexitags']}, 'FARK@wonka.com', {unreviewed: true}, function(err, result) {
        if(err)
          return done(err);

        expect(result._version).to.equal(3);
        expect(result._source.wiki.body).to.equal('Mario is a [[plumber]] from the [[Mushroom Kingdom]].');
        expect(result._source.wiki.title).to.equal('Mario');
        expect(result._source.wiki.tags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats:super-mushroom', 'lives-in:mushroom-kingdom']);
        expect(result._source.wiki.baseTags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats', 'lives-in']);
        expect(result._source.wiki.createdBy).to.equal('brian@fluggo.com');
        expect(result._source.wiki.createdTime).to.exist;
        expect(result._source.wiki.updatedBy).to.equal('brian@fluggo.com');
        expect(result._source.wiki.updatedTime).to.exist;
        expect(result._source.wiki.history).to.not.exist;
        expect(result._source.wiki.unreviewed).to.be.true;
        expect(result._source.wiki.unreviewedHistory).to.have.lengthOf(2);
        expect(result._source.wiki.unreviewedHistory[0].body).to.equal('Test article text');
        expect(result._source.wiki.unreviewedHistory[0].title).to.equal('Mario');
        expect(result._source.wiki.unreviewedHistory[0].tags).to.deep.equal(['test', 'tags']);
        expect(result._source.wiki.unreviewedHistory[0].baseTags).to.deep.equal(['test', 'tags']);
        expect(result._source.wiki.unreviewedHistory[0].updatedBy).to.equal('FARK@wonka.com');
        expect(result._source.wiki.unreviewedHistory[0].updatedTime).to.exist;
        expect(result._source.wiki.unreviewedHistory[1].body).to.equal('Test article text 2');
        expect(result._source.wiki.unreviewedHistory[1].title).to.equal('Mario');
        expect(result._source.wiki.unreviewedHistory[1].tags).to.deep.equal(['test', 'tags', 'mexitags']);
        expect(result._source.wiki.unreviewedHistory[1].baseTags).to.deep.equal(['test', 'tags', 'mexitags']);
        expect(result._source.wiki.unreviewedHistory[1].updatedBy).to.equal('FARK@wonka.com');
        expect(result._source.wiki.unreviewedHistory[1].updatedTime).to.exist;
        expect(result._source.wiki.uuid).to.exist;
        expect(result._source.wikiUnreviewed.body).to.equal('Test article text 2');
        expect(result._source.wikiUnreviewed.title).to.equal('Mario');
        expect(result._source.wikiUnreviewed.tags).to.deep.equal(['test', 'tags', 'mexitags']);
        expect(result._source.wikiUnreviewed.baseTags).to.deep.equal(['test', 'tags', 'mexitags']);
        expect(result._source.wikiUnreviewed.createdBy).to.not.exist;
        expect(result._source.wikiUnreviewed.createdTime).to.not.exist;
        expect(result._source.wikiUnreviewed.updatedBy).to.equal('FARK@wonka.com');
        expect(result._source.wikiUnreviewed.updatedTime).to.exist;
        expect(result._source.wikiUnreviewed.history).to.not.exist;
        expect(result._source.wikiUnreviewed.uuid).to.not.exist;
        expect(result._source.common.quickSearch).to.exist;

        done();
      });
    });
  });

  it('preserves official status for official articles', function(done) {
    wiki.updateArticle('mario', 1, {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}, 'FARK@wonka.com', {unreviewed: false}, function(err, result) {
      if(err)
        return done(err);

      wiki.updateArticle('mario', 2, {title: 'Mario', body: 'Test article text 2', tags: ['test', 'tags', 'mexitags']}, 'FARK@wonka.com', {unreviewed: 'keep'}, function(err, result) {
        if(err)
          return done(err);

        expect(result._version).to.equal(3);
        expect(result._source.wiki.body).to.equal('Test article text 2');
        expect(result._source.wiki.title).to.equal('Mario');
        expect(result._source.wiki.tags).to.deep.equal(['test', 'tags', 'mexitags']);
        expect(result._source.wiki.baseTags).to.deep.equal(['test', 'tags', 'mexitags']);
        expect(result._source.wiki.createdBy).to.equal('brian@fluggo.com');
        expect(result._source.wiki.createdTime).to.exist;
        expect(result._source.wiki.updatedBy).to.equal('FARK@wonka.com');
        expect(result._source.wiki.updatedTime).to.exist;
        expect(result._source.wiki.history).to.not.exist;
        expect(result._source.wiki.unreviewed).to.be.false;
        expect(result._source.wiki.unreviewedHistory).to.not.exist;
        expect(result._source.wiki.uuid).to.exist;
        expect(result._source.wikiUnreviewed.body).to.equal('Test article text 2');
        expect(result._source.wikiUnreviewed.title).to.equal('Mario');
        expect(result._source.wikiUnreviewed.tags).to.deep.equal(['test', 'tags', 'mexitags']);
        expect(result._source.wikiUnreviewed.baseTags).to.deep.equal(['test', 'tags', 'mexitags']);
        expect(result._source.wikiUnreviewed.createdBy).to.not.exist;
        expect(result._source.wikiUnreviewed.createdTime).to.not.exist;
        expect(result._source.wikiUnreviewed.updatedBy).to.equal('FARK@wonka.com');
        expect(result._source.wikiUnreviewed.updatedTime).to.exist;
        expect(result._source.wikiUnreviewed.history).to.not.exist;
        expect(result._source.wikiUnreviewed.uuid).to.not.exist;
        expect(result._source.common.quickSearch).to.exist;

        done();
      });
    });
  });

  it('preserves unreviewed status for unreviewed articles', function(done) {
    wiki.updateArticle('mario', 1, {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}, 'FARK@wonka.com', {unreviewed: true}, function(err, result) {
      if(err)
        return done(err);

      wiki.updateArticle('mario', 2, {title: 'Mario', body: 'Test article text 2', tags: ['test', 'tags', 'mexitags']}, 'FARK@wonka.com', {unreviewed: 'keep'}, function(err, result) {
        if(err)
          return done(err);

        expect(result._version).to.equal(3);
        expect(result._source.wiki.body).to.equal('Mario is a [[plumber]] from the [[Mushroom Kingdom]].');
        expect(result._source.wiki.title).to.equal('Mario');
        expect(result._source.wiki.tags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats:super-mushroom', 'lives-in:mushroom-kingdom']);
        expect(result._source.wiki.baseTags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats', 'lives-in']);
        expect(result._source.wiki.createdBy).to.equal('brian@fluggo.com');
        expect(result._source.wiki.createdTime).to.exist;
        expect(result._source.wiki.updatedBy).to.equal('brian@fluggo.com');
        expect(result._source.wiki.updatedTime).to.exist;
        expect(result._source.wiki.history).to.not.exist;
        expect(result._source.wiki.unreviewed).to.be.true;
        expect(result._source.wiki.unreviewedHistory).to.have.lengthOf(2);
        expect(result._source.wiki.unreviewedHistory[0].body).to.equal('Test article text');
        expect(result._source.wiki.unreviewedHistory[0].title).to.equal('Mario');
        expect(result._source.wiki.unreviewedHistory[0].tags).to.deep.equal(['test', 'tags']);
        expect(result._source.wiki.unreviewedHistory[0].baseTags).to.deep.equal(['test', 'tags']);
        expect(result._source.wiki.unreviewedHistory[0].updatedBy).to.equal('FARK@wonka.com');
        expect(result._source.wiki.unreviewedHistory[0].updatedTime).to.exist;
        expect(result._source.wiki.unreviewedHistory[1].body).to.equal('Test article text 2');
        expect(result._source.wiki.unreviewedHistory[1].title).to.equal('Mario');
        expect(result._source.wiki.unreviewedHistory[1].tags).to.deep.equal(['test', 'tags', 'mexitags']);
        expect(result._source.wiki.unreviewedHistory[1].baseTags).to.deep.equal(['test', 'tags', 'mexitags']);
        expect(result._source.wiki.unreviewedHistory[1].updatedBy).to.equal('FARK@wonka.com');
        expect(result._source.wiki.unreviewedHistory[1].updatedTime).to.exist;
        expect(result._source.wiki.uuid).to.exist;
        expect(result._source.wikiUnreviewed.body).to.equal('Test article text 2');
        expect(result._source.wikiUnreviewed.title).to.equal('Mario');
        expect(result._source.wikiUnreviewed.tags).to.deep.equal(['test', 'tags', 'mexitags']);
        expect(result._source.wikiUnreviewed.baseTags).to.deep.equal(['test', 'tags', 'mexitags']);
        expect(result._source.wikiUnreviewed.createdBy).to.not.exist;
        expect(result._source.wikiUnreviewed.createdTime).to.not.exist;
        expect(result._source.wikiUnreviewed.updatedBy).to.equal('FARK@wonka.com');
        expect(result._source.wikiUnreviewed.updatedTime).to.exist;
        expect(result._source.wikiUnreviewed.history).to.not.exist;
        expect(result._source.wikiUnreviewed.uuid).to.not.exist;
        expect(result._source.common.quickSearch).to.exist;

        done();
      });
    });
  });

  it('clears versions held for review', function(done) {
    wiki.updateArticle('mario', 1, {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}, 'FARK@wonka.com', {unreviewed: true}, function(err, result) {
      if(err)
        return done(err);

      expect(result._version).to.equal(2);
      expect(result._source.wiki.body).to.equal('Mario is a [[plumber]] from the [[Mushroom Kingdom]].');
      expect(result._source.wiki.title).to.equal('Mario');
      expect(result._source.wiki.tags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats:super-mushroom', 'lives-in:mushroom-kingdom']);
      expect(result._source.wiki.baseTags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats', 'lives-in']);
      expect(result._source.wiki.createdBy).to.equal('brian@fluggo.com');
      expect(result._source.wiki.createdTime).to.exist;
      expect(result._source.wiki.updatedBy).to.equal('brian@fluggo.com');
      expect(result._source.wiki.updatedTime).to.exist;
      expect(result._source.wiki.history).to.not.exist;
      expect(result._source.wiki.unreviewed).to.be.true;
      expect(result._source.wiki.unreviewedHistory).to.have.lengthOf(1);
      expect(result._source.wiki.unreviewedHistory[0].body).to.equal('Test article text');
      expect(result._source.wiki.unreviewedHistory[0].title).to.equal('Mario');
      expect(result._source.wiki.unreviewedHistory[0].tags).to.deep.equal(['test', 'tags']);
      expect(result._source.wiki.unreviewedHistory[0].baseTags).to.deep.equal(['test', 'tags']);
      expect(result._source.wiki.uuid).to.exist;
      expect(result._source.wikiUnreviewed.body).to.equal('Test article text');
      expect(result._source.wikiUnreviewed.title).to.equal('Mario');
      expect(result._source.wikiUnreviewed.tags).to.deep.equal(['test', 'tags']);
      expect(result._source.wikiUnreviewed.baseTags).to.deep.equal(['test', 'tags']);
      expect(result._source.wikiUnreviewed.createdBy).to.not.exist;
      expect(result._source.wikiUnreviewed.createdTime).to.not.exist;
      expect(result._source.wikiUnreviewed.updatedBy).to.equal('FARK@wonka.com');
      expect(result._source.wikiUnreviewed.updatedTime).to.exist;
      expect(result._source.wikiUnreviewed.history).to.not.exist;
      expect(result._source.wikiUnreviewed.uuid).to.not.exist;
      expect(result._source.common.quickSearch).to.exist;

      wiki.updateArticle('mario', 2, {title: 'Mario', body: 'Test article text 2', tags: ['test', 'tags']}, 'bark@wonka.com', {unreviewed: false}, function(err, result) {
        if(err)
          return done(err);

        expect(result._version).to.equal(3);
        expect(result._source.wiki.body).to.equal('Test article text 2');
        expect(result._source.wiki.title).to.equal('Mario');
        expect(result._source.wiki.tags).to.deep.equal(['test', 'tags']);
        expect(result._source.wiki.baseTags).to.deep.equal(['test', 'tags']);
        expect(result._source.wiki.createdBy).to.equal('brian@fluggo.com');
        expect(result._source.wiki.createdTime).to.exist;
        expect(result._source.wiki.updatedBy).to.equal('bark@wonka.com');
        expect(result._source.wiki.updatedTime).to.exist;
        expect(result._source.wiki.history).to.not.exist;
        expect(result._source.wiki.unreviewedHistory).to.not.exist;
        expect(result._source.wiki.uuid).to.exist;
        expect(result._source.wikiUnreviewed.body).to.equal('Test article text 2');
        expect(result._source.wikiUnreviewed.title).to.equal('Mario');
        expect(result._source.wikiUnreviewed.tags).to.deep.equal(['test', 'tags']);
        expect(result._source.wikiUnreviewed.baseTags).to.deep.equal(['test', 'tags']);
        expect(result._source.wikiUnreviewed.createdBy).to.not.exist;
        expect(result._source.wikiUnreviewed.createdTime).to.not.exist;
        expect(result._source.wikiUnreviewed.updatedBy).to.equal('bark@wonka.com');
        expect(result._source.wikiUnreviewed.updatedTime).to.exist;
        expect(result._source.wikiUnreviewed.history).to.not.exist;
        expect(result._source.wikiUnreviewed.uuid).to.not.exist;
        expect(result._source.common.quickSearch).to.exist;

        done();
      });
    });
  });

  it('includes unreviewed versions in history', function(done) {
    wiki.updateArticle('mario', 1, {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}, 'FARK@wonka.com', {unreviewed: true}, function(err, result) {
      if(err)
        return done(err);

      wiki.updateArticle('mario', 2, {title: 'Mario', body: 'Test article text 2', tags: ['test', 'tags']}, 'bark@wonka.com', {unreviewed: false}, function(err, result) {
        if(err)
          return done(err);

        test.getAllWikiHistory(result._source.wiki.uuid, function(err, history) {
          if(err)
            return done(err);

          expect(history).to.have.lengthOf(2);
          history.sort((a, b) => {
            return d3.ascending(new Date(a._source.updatedTime), new Date(b._source.updatedTime));
          });
          expect(history[0]._source.body).to.equal('Mario is a [[plumber]] from the [[Mushroom Kingdom]].');
          expect(history[0]._source.title).to.equal('Mario');
          expect(history[0]._source.tags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats:super-mushroom', 'lives-in:mushroom-kingdom']);
          expect(history[0]._source.uuid).to.equal(result._source.wiki.uuid);
          expect(history[0]._source.updatedTime).to.equal(result._source.wiki.createdTime);
          expect(history[1]._source.body).to.equal('Test article text 2');
          expect(history[1]._source.title).to.equal('Mario');
          expect(history[1]._source.tags).to.deep.equal(['test', 'tags']);
          expect(history[1]._source.uuid).to.equal(result._source.wiki.uuid);
          expect(history[1]._source.updatedTime).to.equal(result._source.wiki.updatedTime);

          expect(history[0]._source.unreviewedHistory).to.not.exist;
          expect(history[1]._source.unreviewedHistory).to.have.lengthOf(1);
          expect(history[1]._source.unreviewedHistory[0].body).to.equal('Test article text');
          expect(history[1]._source.unreviewedHistory[0].title).to.equal('Mario');
          expect(history[1]._source.unreviewedHistory[0].tags).to.deep.equal(['test', 'tags']);
          expect(history[1]._source.unreviewedHistory[0].baseTags).to.deep.equal(['test', 'tags']);
          expect(history[1]._source.unreviewedHistory[0].updatedBy).to.equal('FARK@wonka.com');
          expect(history[1]._source.unreviewedHistory[0].updatedTime).to.exist;

          done();
        });
      });
    });
  });

  it('includes unreviewed versions in history when changing title', function(done) {
    wiki.updateArticle('mario', 1, {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}, 'FARK@wonka.com', {unreviewed: true}, function(err, result) {
      if(err)
        return done(err);

      wiki.updateArticle('mario', 2, {title: 'Mario 2', body: 'Test article text 2', tags: ['test', 'tags']}, 'bark@wonka.com', {unreviewed: false}, function(err, result) {
        if(err)
          return done(err);

        test.getAllWikiHistory(result._source.wiki.uuid, function(err, history) {
          if(err)
            return done(err);

          expect(history).to.have.lengthOf(2);
          history.sort((a, b) => {
            return d3.ascending(new Date(a._source.updatedTime), new Date(b._source.updatedTime));
          });
          expect(history[0]._source.body).to.equal('Mario is a [[plumber]] from the [[Mushroom Kingdom]].');
          expect(history[0]._source.title).to.equal('Mario');
          expect(history[0]._source.tags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats:super-mushroom', 'lives-in:mushroom-kingdom']);
          expect(history[0]._source.uuid).to.equal(result._source.wiki.uuid);
          expect(history[0]._source.updatedTime).to.equal(result._source.wiki.createdTime);
          expect(history[1]._source.body).to.equal('Test article text 2');
          expect(history[1]._source.title).to.equal('Mario 2');
          expect(history[1]._source.tags).to.deep.equal(['test', 'tags']);
          expect(history[1]._source.uuid).to.equal(result._source.wiki.uuid);
          expect(history[1]._source.updatedTime).to.equal(result._source.wiki.updatedTime);

          expect(history[0]._source.unreviewedHistory).to.not.exist;
          expect(history[1]._source.unreviewedHistory).to.exist;
          expect(history[1]._source.unreviewedHistory).to.have.lengthOf(1);
          expect(history[1]._source.unreviewedHistory[0].body).to.equal('Test article text');
          expect(history[1]._source.unreviewedHistory[0].title).to.equal('Mario');
          expect(history[1]._source.unreviewedHistory[0].tags).to.deep.equal(['test', 'tags']);
          expect(history[1]._source.unreviewedHistory[0].baseTags).to.deep.equal(['test', 'tags']);
          expect(history[1]._source.unreviewedHistory[0].updatedBy).to.equal('FARK@wonka.com');
          expect(history[1]._source.unreviewedHistory[0].updatedTime).to.exist;

          done();
        });
      });
    });
  });

  it('processes tags by type', function(done) {
    wiki.updateArticle('mario', 1, {title: 'Mario', body: 'Test article text', tags: ['test', 'tags', 'contains:"test a type two"']}, 'FARK@wonka.com', {unreviewed: true}, function(err, result) {
      if(err)
        return done(err);

      expect(result._source.wikiUnreviewed.body).to.equal('Test article text');
      expect(result._source.wikiUnreviewed.title).to.equal('Mario');
      expect(result._source.wikiUnreviewed.baseTags).to.deep.equal(['test', 'tags', 'contains']);
      expect(result._source.wikiUnreviewed.rels.contains).to.deep.equal(['test-a-type-two']);
      expect(result._source.wikiUnreviewed.tags).to.deep.equal(['test', 'tags', 'contains:test-a-type-two']);

      done();
    });
  });

  it('does not include unreviewed versions in history before they\'re committed', function(done) {
    wiki.updateArticle('mario', 1, {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}, 'FARK@wonka.com', {unreviewed: true}, function(err, result) {
      if(err)
        return done(err);

      test.getAllWikiHistory(result._source.wiki.uuid, function(err, history) {
        if(err)
          return done(err);

        expect(history).to.have.lengthOf(1);
        expect(history[0]._source.body).to.equal('Mario is a [[plumber]] from the [[Mushroom Kingdom]].');
        expect(history[0]._source.title).to.equal('Mario');
        expect(history[0]._source.tags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats:super-mushroom', 'lives-in:mushroom-kingdom']);
        expect(history[0]._source.uuid).to.equal(result._source.wiki.uuid);
        expect(history[0]._source.updatedTime).to.equal(result._source.wiki.createdTime);

        done();
      });
    });
  });

  it('does not change the ID of an unreviewed article with a title change', function(done) {
    return wiki.updateArticle('mario', 1, {title: 'Super Mario', body: 'Test article text', tags: ['test', 'tags']}, 'FARK@wonka.com', {unreviewed: true}, function(err, result) {
      if(err)
        return done(err);

      expect(result._version).to.equal(2);
      expect(result._id).to.equal('mario');
      expect(result._source.wiki.body).to.equal('Mario is a [[plumber]] from the [[Mushroom Kingdom]].');
      expect(result._source.wiki.title).to.equal('Mario');
      expect(result._source.wiki.tags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats:super-mushroom', 'lives-in:mushroom-kingdom']);
      expect(result._source.wiki.baseTags).to.deep.equal(['test', 'person', 'actor', 'plumber', 'eats', 'lives-in']);
      expect(result._source.wiki.createdBy).to.equal('brian@fluggo.com');
      expect(result._source.wiki.createdTime).to.exist;
      expect(result._source.wiki.updatedBy).to.equal('brian@fluggo.com');
      expect(result._source.wiki.updatedTime).to.exist;
      expect(result._source.wiki.unreviewed).to.be.true;
      expect(result._source.wiki.unreviewedHistory).to.have.lengthOf(1);
      expect(result._source.wiki.unreviewedHistory[0].body).to.equal('Test article text');
      expect(result._source.wiki.unreviewedHistory[0].title).to.equal('Super Mario');
      expect(result._source.wiki.unreviewedHistory[0].tags).to.deep.equal(['test', 'tags']);
      expect(result._source.wiki.unreviewedHistory[0].baseTags).to.deep.equal(['test', 'tags']);
      expect(result._source.wiki.uuid).to.exist;
      expect(result._source.wikiUnreviewed.body).to.equal('Test article text');
      expect(result._source.wikiUnreviewed.title).to.equal('Super Mario');
      expect(result._source.wikiUnreviewed.tags).to.deep.equal(['test', 'tags']);
      expect(result._source.wikiUnreviewed.baseTags).to.deep.equal(['test', 'tags']);
      expect(result._source.wikiUnreviewed.createdBy).to.not.exist;
      expect(result._source.wikiUnreviewed.createdTime).to.not.exist;
      expect(result._source.wikiUnreviewed.updatedBy).to.equal('FARK@wonka.com');
      expect(result._source.wikiUnreviewed.updatedTime).to.exist;

      return wiki.getArticleById('mario', {}, function(err, result) {
        if(err)
          done(err);

        expect(result).to.exist;
        done();
      });
    });

  });

  it('emits an event when an article needs review', function(done) {
    wiki.once('article-changed', function(evt) {
      expect(evt).to.exist;
      expect(evt.id).to.equal('mario');
      expect(evt.oldId).to.not.exist;
      expect(evt.title).to.equal('Mario');
      expect(evt.oldTitle).to.not.exist;
      expect(evt.user).to.equal('FARK@wonka.com');
      expect(evt.changeType).to.equal('updated-needs-review');

      return done();
    });

    return wiki.updateArticle('mario', 1, {title: 'Mario', body: 'Test article text', tags: ['test', 'tags']}, 'FARK@wonka.com', {unreviewed: true}, function(err, result) {
      if(err)
        return done(err);
    });
  });

  it('emits an event when an article needs review while changing title', function(done) {
    wiki.once('article-changed', function(evt) {
      expect(evt).to.exist;
      expect(evt.id).to.equal('mario-2');
      expect(evt.oldId).to.not.exist;
      expect(evt.title).to.equal('Mario 2');
      expect(evt.oldTitle).to.not.exist;
      expect(evt.user).to.equal('FARK@wonka.com');
      expect(evt.changeType).to.equal('updated-needs-review');

      return done();
    });

    return wiki.updateArticle('mario', 1, {title: 'Mario 2', body: 'Test article text', tags: ['test', 'tags']}, 'FARK@wonka.com', {unreviewed: true}, function(err, result) {
      if(err)
        return done(err);
    });
  });

  it('fills in createdBy for article created unreviewed', function(done) {
    return wiki.createArticle({title: 'Western Digital', body: 'They make hard drives.', tags: ['actor', 'company']}, 'brian@fluggo.com', {unreviewed: true}, function(err, result) {
      if(err)
        return done(err);

      return wiki.updateArticle('western-digital', 1, {title: 'Western Digital', body: 'They make hard drives.', tags: ['actor', 'company']}, 'FARK@wonka.com', function(err, result) {
        if(err)
          return done(err);

        expect(result._source.wiki.createdBy).to.equal('FARK@wonka.com');
        expect(result._source.wiki.createdTime).to.exist;
        expect(result._source.wiki.updatedBy).to.equal('FARK@wonka.com');
        expect(result._source.wiki.updatedTime).to.exist;
        expect(result._source.wiki.createdTime).to.equal(result._source.wiki.updatedTime);

        return done();
      });
    });
  });

  it('fills in createdBy for article created unreviewed while changing article name', function(done) {
    return wiki.createArticle({title: 'Western Digital', body: 'They make hard drives.', tags: ['actor', 'company']}, 'brian@fluggo.com', {unreviewed: true}, function(err, result) {
      if(err)
        return done(err);

      return wiki.updateArticle('western-digital', 1, {title: 'Western Digital 2', body: 'They make hard drives.', tags: ['actor', 'company']}, 'FARK@wonka.com', function(err, result) {
        if(err)
          return done(err);

        expect(result._source.wiki.createdBy).to.equal('FARK@wonka.com');
        expect(result._source.wiki.createdTime).to.exist;
        expect(result._source.wiki.updatedBy).to.equal('FARK@wonka.com');
        expect(result._source.wiki.updatedTime).to.exist;
        expect(result._source.wiki.createdTime).to.equal(result._source.wiki.updatedTime);

        return done();
      });
    });
  });
});
