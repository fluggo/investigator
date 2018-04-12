// https://mochajs.org/
// http://chaijs.com/api/bdd/
'use strict';

const chai = require('chai'), expect = chai.expect;

const wikiUtil = require('../../util.js');

describe('prepareArticleSync', function() {
  const tagTypes = { 'alias': 'string' };

  it('rejects articles with no title', function() {
    const article = {
      body: 'Test body',
      tags: ['test', 'tags']
    };

    var prepared = wikiUtil.prepareArticleSync(article, {tagTypes: tagTypes});
    expect(prepared).to.exist;

    expect(prepared.error).to.be.an('object');
    expect(prepared.error.code).to.equal('missing-title');
  });

  it('rejects articles with an empty title', function() {
    const article = {
      title: '',
      body: 'Test body',
      tags: ['test', 'tags']
    };

    var prepared = wikiUtil.prepareArticleSync(article, {tagTypes: tagTypes});
    expect(prepared).to.exist;

    expect(prepared.error).to.be.an('object');
    expect(prepared.error.code).to.equal('invalid-title');
  });

  it('rejects articles with no body', function() {
    const article = {
      title: 'Test title',
      tags: ['test', 'tags']
    };

    var prepared = wikiUtil.prepareArticleSync(article, {tagTypes: tagTypes});
    expect(prepared).to.exist;

    expect(prepared.error).to.be.an('object');
    expect(prepared.error.code).to.equal('missing-body');
  });

  it('rejects articles with no tag array', function() {
    const article = {
      title: 'Test title',
      body: 'Test body',
    };

    var prepared = wikiUtil.prepareArticleSync(article, {tagTypes: tagTypes});
    expect(prepared).to.exist;

    expect(prepared.error).to.be.an('object');
    expect(prepared.error.code).to.equal('missing-tags');
  });

  it('rejects articles with an invalid tag array', function() {
    const article = {
      title: 'Test title',
      body: 'Test body',
      tags: 'stuff',
    };

    var prepared = wikiUtil.prepareArticleSync(article, {tagTypes: tagTypes});
    expect(prepared).to.exist;

    expect(prepared.error).to.be.an('object');
    expect(prepared.error.code).to.equal('missing-tags');
  });

  it('replaces an empty tag array with ["tagme"]', function() {
    const article = {
      title: 'Test title',
      body: 'Test body',
      tags: [],
    };

    var prepared = wikiUtil.prepareArticleSync(article, {tagTypes: tagTypes});
    expect(prepared).to.exist;

    expect(prepared.error).to.not.exist;
    expect(prepared.article.tags).to.deep.equal(['tagme']);
  });

  it('puts base tags in... base tags array', function() {
    const article = {
      title: 'Test title',
      body: 'Test body',
      tags: ['contains:things', 'props', 'cidr:10.0.0.0/24'],
    };

    var prepared = wikiUtil.prepareArticleSync(article, {tagTypes: tagTypes});
    expect(prepared).to.exist;

    expect(prepared.error).to.not.exist;
    expect(prepared.article.baseTags).to.deep.equal(['contains', 'props', 'cidr']);
    expect(prepared.article.allBaseTags).to.have.lengthOf(3)
      .and.have.members(['contains', 'props', 'cidr']);
  });

  it('identifies referenced articles in the body', function() {
    const article = {
      title: 'Test title',
      body: 'Test body with a [[Link]] to a [[different article]].',
      tags: ['contains:things', 'props', 'cidr:10.0.0.0/24'],
    };

    var prepared = wikiUtil.prepareArticleSync(article, {tagTypes: tagTypes});
    expect(prepared).to.exist;
    expect(prepared.error).to.not.exist;

    expect(prepared.article.bodyReferencedArticles).to.have.lengthOf(2)
      .and.have.members(['link', 'different-article']);
    expect(prepared.article.allBaseTags).to.have.lengthOf(3)
      .and.have.members(['contains', 'props', 'cidr']);
  });

  it('identifies referenced hashtags in the body', function() {
    const article = {
      title: 'Test title',
      body: 'Test body with a [[Link]] to a #hashtag. #never-logon',
      tags: ['contains:things', 'props', 'cidr:10.0.0.0/24'],
    };

    var prepared = wikiUtil.prepareArticleSync(article, {tagTypes: tagTypes});
    expect(prepared).to.exist;
    expect(prepared.error).to.not.exist;

    expect(prepared.article.bodyReferencedHashtags).to.have.lengthOf(2)
      .and.have.members(['hashtag', 'never-logon']);
    expect(prepared.article.allBaseTags).to.have.lengthOf(5)
      .and.have.members(['contains', 'props', 'cidr', 'hashtag', 'never-logon']);
  });

  it('identifies valued hashtags in the body', function() {
    const article = {
      title: 'Test title',
      body: 'Test body with a [[Link]] to a #hashtag:1234. #never-logon',
      tags: ['contains:things', 'props', 'cidr:10.0.0.0/24'],
    };

    var prepared = wikiUtil.prepareArticleSync(article, {tagTypes: {hashtag: 'integer'}});
    expect(prepared).to.exist;
    expect(prepared.error).to.not.exist;

    expect(prepared.article.bodyReferencedHashtags).to.have.lengthOf(2)
      .and.have.members(['hashtag', 'never-logon']);
    expect(prepared.article.rels.hashtag).to.have.lengthOf(1)
      .and.have.members([1234]);
  });

  it('coerces alias values into article IDs', function() {
    // Alias is indexed as type "string", but it contains article IDs,
    // so the tag values should be coerced into article IDs
    const article = {
      title: 'Test title',
      body: 'Test body.',
      tags: ['alias:this is a tag'],
    };

    var prepared = wikiUtil.prepareArticleSync(article, {tagTypes: tagTypes});
    expect(prepared).to.exist;
    expect(prepared.error).to.not.exist;

    expect(prepared.article.rels.alias).to.have.lengthOf(1)
      .and.have.members(['this-is-a-tag']);
    expect(prepared.article.tags).to.have.lengthOf(1)
      .and.have.members(['alias:this-is-a-tag']);
  });

  it('coerces article-valued tags into article IDs', function() {
    // Alias is indexed as type "string", but it contains article IDs,
    // so the tag values should be coerced into article IDs
    const article = {
      title: 'Test title',
      body: 'Test body.',
      tags: ['contains:"this is a tag"'],
    };

    var prepared = wikiUtil.prepareArticleSync(article, {tagTypes: {'contains': 'article'}});
    expect(prepared).to.exist;
    expect(prepared.error).to.not.exist;

    expect(prepared.article.rels.contains).to.have.lengthOf(1)
      .and.have.members(['this-is-a-tag']);
    expect(prepared.article.tags).to.have.lengthOf(1)
      .and.have.members(['contains:this-is-a-tag']);
  });

  it('preserves string-valued tags with spaces', function() {
    // Alias is indexed as type "string", but it contains article IDs,
    // so the tag values should be coerced into article IDs
    const article = {
      title: 'Test title',
      body: 'Test body.',
      tags: ['contains:"this is a tag"'],
    };

    var prepared = wikiUtil.prepareArticleSync(article, {tagTypes: {'contains': 'string'}});
    expect(prepared).to.exist;
    expect(prepared.error).to.not.exist;

    expect(prepared.article.rels.contains).to.have.lengthOf(1)
      .and.have.members(['this is a tag']);
    expect(prepared.article.tags).to.have.lengthOf(1)
      .and.have.members(['contains:"this is a tag"']);
  });

  it('handles when article-valued tags are used without values', function() {
    const article = {
      title: 'Test title',
      body: 'Test body.',
      tags: ['contains'],
    };

    var prepared = wikiUtil.prepareArticleSync(article, {tagTypes: {'contains': 'article'}});
    expect(prepared).to.exist;
    expect(prepared.error).to.not.exist;

    expect(prepared.article.rels.contains).to.have.lengthOf(0);
    expect(prepared.article.baseTags).to.have.lengthOf(1)
      .and.have.members(['contains']);
  });

  it('de-dupes explicit tags', function() {
    const article = {
      title: 'Test title',
      body: 'Test body.',
      tags: ['contains', 'hoppy:12', 'hoppy:12', 'bargl', 'contains'],
    };

    var prepared = wikiUtil.prepareArticleSync(article, {tagTypes: {'contains': 'article'}});
    expect(prepared).to.exist;
    expect(prepared.error).to.not.exist;

    expect(prepared.article.tags).to.have.lengthOf(3)
      .and.have.members(['contains', 'hoppy:12', 'bargl']);
  });
});
