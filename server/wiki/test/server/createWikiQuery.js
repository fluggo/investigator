// https://mochajs.org/
// http://chaijs.com/api/bdd/
'use strict';

const chai = require('chai'), expect = chai.expect;

const wikiUtil = require('../../util');

describe('createWikiQuery', function() {
  it('does basic terms', function() {
    let query = wikiUtil.createWikiQuery(wikiUtil.parseQueryTerms('test test2'));

    expect(query.bool.should).to.have.lengthOf(1);
    expect(query.bool.should[0].bool.should).to.have.lengthOf(4);
    expect(query.bool.should[0].bool.should[0].multi_match.query).to.equal('test test2');
    expect(query.bool.should[0].bool.should[0].multi_match.type).to.equal('most_fields');
    expect(query.bool.must).to.have.lengthOf(0);
    expect(query.bool.must_not).to.have.lengthOf(0);
    expect(query.bool.filter).to.have.lengthOf(0);

    query = wikiUtil.createWikiQuery(wikiUtil.parseQueryTerms(' test  test2 '));

    expect(query.bool.should).to.have.lengthOf(1);
    expect(query.bool.should[0].bool.should).to.have.lengthOf(4);
    expect(query.bool.should[0].bool.should[0].multi_match.query).to.equal('test test2');
    expect(query.bool.should[0].bool.should[0].multi_match.type).to.equal('most_fields');
    expect(query.bool.must).to.have.lengthOf(0);
    expect(query.bool.must_not).to.have.lengthOf(0);
    expect(query.bool.filter).to.have.lengthOf(0);
  });

  it('does basic tags', function() {
    let query = wikiUtil.createWikiQuery(wikiUtil.parseQueryTerms('tag:tough'));

    expect(query.bool, 'should tag').to.deep.equal({
      should: [{
        bool: {
          minimum_should_match: 1,
          should: [
            { term: { 'wiki.allBaseTags': 'tough' } },
          ]
        }
      }],
      must: [],
      must_not: [],
      filter: []
    });

    query = wikiUtil.createWikiQuery(wikiUtil.parseQueryTerms('+tag:tough'));

    expect(query.bool, 'must tag').to.deep.equal({
      filter: [{
        bool: {
          minimum_should_match: 1,
          should: [
            { term: { 'wiki.allBaseTags': 'tough' } },
          ]
        }
      }],
      should: [],
      must_not: [],
      must: []
    });

    query = wikiUtil.createWikiQuery(wikiUtil.parseQueryTerms('-tag:tough'));

    expect(query.bool, 'must_not tag').to.deep.equal({
      must_not: [{
        bool: {
          minimum_should_match: 1,
          should: [
            { term: { 'wiki.allBaseTags': 'tough' } },
          ]
        }
      }],
      should: [],
      must: [],
      filter: []
    });
  });

  it('does basic phrases', function() {
    let query = wikiUtil.createWikiQuery(wikiUtil.parseQueryTerms('"tough cookies"'));

    expect(query.bool.should).to.have.lengthOf(1);
    expect(query.bool.should[0].bool.should).to.have.lengthOf(2);
    expect(query.bool.should[0].bool.should[0].multi_match.query).to.equal('tough cookies');
    expect(query.bool.should[0].bool.should[0].multi_match.type).to.equal('phrase');
    expect(query.bool.must).to.have.lengthOf(0);
    expect(query.bool.must_not).to.have.lengthOf(0);
    expect(query.bool.filter).to.have.lengthOf(0);

    query = wikiUtil.createWikiQuery(wikiUtil.parseQueryTerms('+"tough cookies"'));

    expect(query.bool.must).to.have.lengthOf(1);
    expect(query.bool.must[0].bool.should).to.have.lengthOf(2);
    expect(query.bool.must[0].bool.should[0].multi_match.query).to.equal('tough cookies');
    expect(query.bool.must[0].bool.should[0].multi_match.type).to.equal('phrase');
    expect(query.bool.should).to.have.lengthOf(0);
    expect(query.bool.must_not).to.have.lengthOf(0);
    expect(query.bool.filter).to.have.lengthOf(0);

    query = wikiUtil.createWikiQuery(wikiUtil.parseQueryTerms('-"tough cookies"'));

    expect(query.bool.must_not).to.have.lengthOf(1);
    expect(query.bool.must_not[0].bool.should).to.have.lengthOf(2);
    expect(query.bool.must_not[0].bool.should[0].multi_match.query).to.equal('tough cookies');
    expect(query.bool.must_not[0].bool.should[0].multi_match.type).to.equal('phrase');
    expect(query.bool.should).to.have.lengthOf(0);
    expect(query.bool.must).to.have.lengthOf(0);
    expect(query.bool.filter).to.have.lengthOf(0);
  });

  it('searches for tag string values', function() {
    let query = wikiUtil.createWikiQuery(wikiUtil.parseQueryTerms('tag-type:article'));

    expect(query.bool, 'should string tag').to.deep.equal({
      should: [{
        term: {
          'wiki.rels.tag-type': 'article',
        }
      }],
      must: [],
      must_not: [],
      filter: []
    });

    query = wikiUtil.createWikiQuery(wikiUtil.parseQueryTerms('+tag-type:article'));

    expect(query.bool, 'must string tag').to.deep.equal({
      filter: [{
        term: {
          'wiki.rels.tag-type': 'article',
        }
      }],
      should: [],
      must_not: [],
      must: []
    });

    query = wikiUtil.createWikiQuery(wikiUtil.parseQueryTerms('-tag-type:article'));

    expect(query.bool, 'must_not string tag').to.deep.equal({
      must_not: [{
        term: {
          'wiki.rels.tag-type': 'article',
        }
      }],
      must: [],
      should: [],
      filter: []
    });
  });

  it('searches for tag article values', function() {
    let query = wikiUtil.createWikiQuery(wikiUtil.parseQueryTerms('implies:"Tom monkey"'));

    expect(query.bool, 'should article tag').to.deep.equal({
      should: [{
        term: {
          'wiki.rels.implies': 'tom-monkey',
        }
      }],
      must: [],
      must_not: [],
      filter: []
    });
  });

  it('handles JavaScript object prototype names', function() {
    let query = wikiUtil.createWikiQuery(wikiUtil.parseQueryTerms('watch:value'));

    expect(query.bool).to.deep.equal({
      should: [{
        term: {
          'wiki.rels.watch': 'value',
        }
      }],
      must: [],
      must_not: [],
      filter: []
    });
  });

  it('searches for hashtags', function() {
    let query = wikiUtil.createWikiQuery(wikiUtil.parseQueryTerms('#hashtag'));

    expect(query.bool, 'should article tag').to.deep.equal({
      should: [{
        term: {
          'wiki.bodyReferencedHashtags': 'hashtag',
        }
      }],
      must: [],
      must_not: [],
      filter: []
    });
  });

  it('allows switching between reviewed and unreviewed articles', function() {
    let query = wikiUtil.createWikiQuery(wikiUtil.parseQueryTerms('#hashtag'), {unreviewed: true});

    expect(query.bool).to.deep.equal({
      should: [{
        term: {
          'wikiUnreviewed.bodyReferencedHashtags': 'hashtag',
        }
      }],
      must: [],
      must_not: [],
      filter: []
    });
  });
});   // end createWikiQuery
