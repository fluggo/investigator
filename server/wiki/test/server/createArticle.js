// https://mochajs.org/
// http://chaijs.com/api/bdd/
'use strict';

const chai = require('chai'), expect = chai.expect;

const wikiUtil = require('../../util');
const test = require('./index');
const indexMaint = require('../../index-maint');
const async = require('async');
const wiki = require('../../index');
const es = require('../../../es');

describe('createArticle', function() {
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
    wiki.createArticle({title: 'Western Digital', body: 'They make hard drives.', tags: ['actor', 'company']}, 'brian@fluggo.com', function(err, result) {
      if(err)
        return done(err);

      expect(result._id).to.equal('western-digital');
      expect(result._version).to.equal(1);

      wiki.getArticleById('western-digital', {}, function(err, result) {
        if(err)
          return done(err);

        expect(result._id).to.equal('western-digital');
        expect(result._version).to.equal(1);
        expect(result._source.wiki.body).to.equal('They make hard drives.');
        expect(result._source.wiki.title).to.equal('Western Digital');
        expect(result._source.wiki.tags).to.deep.equal(['actor', 'company']);
        expect(result._source.wiki.uuid).to.exist;
        expect(result._source.wiki.baseTags).to.deep.equal(['actor', 'company']);
        expect(result._source.wiki.createdBy).to.equal('brian@fluggo.com');
        expect(result._source.wiki.updatedBy).to.equal('brian@fluggo.com');
        expect(result._source.wiki.createdTime).to.exist;
        expect(result._source.wiki.updatedTime).to.exist;
        expect(result._source.wiki.updatedTime).to.equal(result._source.wiki.createdTime);
        expect(result._source.wiki.history).to.not.exist;

        test.getAllWikiHistory(result._source.wiki.uuid, function(err, history) {
          if(err)
            return done(err);

          expect(history).to.have.lengthOf(1);
          expect(history[0]._source.body).to.equal('They make hard drives.');
          expect(history[0]._source.title).to.equal('Western Digital');
          expect(history[0]._source.tags).to.deep.equal(['actor', 'company']);
          expect(history[0]._source.uuid).to.equal(result._source.wiki.uuid);
          expect(history[0]._source.updatedTime).to.equal(result._source.wiki.updatedTime);

          done();
        });

      });
    });
  });

  it('detects if an article already exists', function(done) {
    wiki.createArticle({title: 'Mario', body: 'A policeman.', tags: ['policeman']}, 'brian@fluggo.com', function(err, result) {
      expect(err).to.exist;
      expect(err.code).to.equal('article-already-exists');

      done();
    });
  });

  it('parses tag-type into rels field', function(done) {
    wiki.createArticle({title: 'Test tag', body: 'This is a test tag.', tags: ['tag-type:article']}, 'Pingu@NOOK.NOOK', function(err, result) {
      if(err)
        return done(err);

      // Get this article the back way
      es.client.get({
        index: 'test-wiki-read',
        type: 'article',
        id: 'test-tag'
      }, function(err, res) {
        expect(res._source.wiki.rels).to.exist;
        expect(res._source.wiki.rels['tag-type']).to.exist;
        expect(res._source.wiki.rels['tag-type']).to.deep.equal(['article']);
        done();
      });
    });
  });

  it('reloads known tag-types after an article is created', function(done) {
    wiki.createArticle({title: 'Test tag', body: 'This is a test tag.', tags: ['tag-type:article']}, 'Pingu@NOOK.NOOK', function(err, result) {
      if(err)
        return done(err);

      indexMaint.getKnownTags(function(err, result) {
        if(err)
          return done(err);

        expect(result.get('test-tag')).to.equal('article');
        done();
      });
    });
  });

  it('emits an event when an article is created', function(done) {
    wiki.once('article-changed', function(evt) {
      expect(evt).to.exist;
      expect(evt.id).to.equal('western-digital');
      expect(evt.oldId).to.not.exist;
      expect(evt.title).to.equal('Western Digital');
      expect(evt.user).to.equal('brian@fluggo.com');
      expect(evt.changeType).to.equal('created');

      return done();
    });

    wiki.createArticle({title: 'Western Digital', body: 'They make hard drives.', tags: ['actor', 'company']}, 'brian@fluggo.com', function(err, result) {
      if(err)
        return done(err);
    });
  });

  it('supports marking an article as waiting for review', function(done) {
    wiki.createArticle({title: 'Western Digital', body: 'They make hard drives.', tags: ['actor', 'company']}, 'brian@fluggo.com', {unreviewed: true}, function(err, result) {
      if(err)
        return done(err);

      expect(result._id).to.equal('western-digital');
      expect(result._version).to.equal(1);

      wiki.getArticleById('western-digital', {}, function(err, result) {
        if(err)
          return done(err);

        expect(result._id).to.equal('western-digital');
        expect(result._version).to.equal(1);
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

  it('does not include unreviewed versions in history before they\'re committed', function(done) {
    return wiki.createArticle({title: 'Western Digital', body: 'They make hard drives.', tags: ['actor', 'company']}, 'FARK@wonka.com', {unreviewed: true}, function(err, result) {
      if(err)
        return done(err);

      return wiki.getArticleById('western-digital', {}, function(err, result) {
        if(err)
          return done(err);

        return test.getAllWikiHistory(result._source.wiki.uuid, function(err, history) {
          if(err)
            return done(err);

          expect(history).to.have.lengthOf(0);

          done();
        });
      });
    });
  });

  it('emits an event when an article needs review', function(done) {
    wiki.once('article-created', function(evt) {
      expect(evt).to.exist;
      expect(evt.id).to.equal('western-digital');
      expect(evt.oldId).to.not.exist;
      expect(evt.title).to.equal('Western Digital');
      expect(evt.oldTitle).to.not.exist;
      expect(evt.user).to.equal('FARK@wonka.com');
      expect(evt.changeType).to.equal('created-needs-review');

      return done();
    });

    wiki.createArticle({title: 'Western Digital', body: 'They make hard drives.', tags: ['actor', 'company']}, 'FARK@wonka.com', {unreviewed: true}, function(err, result) {
      if(err)
        return done(err);
    });
  });

  it('includes quick search definitions', function(done) {
    wiki.createArticle({title: 'Western Digital', body: 'They make hard drives.', tags: ['actor', 'company']}, 'FARK@wonka.com', {unreviewed: true}, function(err, result) {
      if(err)
        return done(err);

      return wiki.getArticleById('western-digital', {}, function(err, result) {
        if(err)
          return done(err);

        expect(result._source.common.quickSearch).to.exist;
        done();
      });
    });
  });
});
