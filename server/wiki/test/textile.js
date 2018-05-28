// https://mochajs.org/
// http://chaijs.com/api/bdd/
'use strict';

const chai = require('chai'), expect = chai.expect;

describe('Textile', function() {
  const textile = require('../../../common/textile');

  it('parses links', function() {
    var jsonml = textile.jsonml("There is a link to http://www.google.com here.");

    expect(jsonml).to.deep.equal([
      'div',
      ['p', "There is a link to ", ['a', {href: 'http://www.google.com'}, "http://www.google.com"], " here."],
    ]);
  });

  it('parses hashtags', function() {
    var jsonml = textile.jsonml("Dealing with #hashtags is a #pain. #ya-know");

    expect(jsonml).to.deep.equal([
      'div',
      ['p', "Dealing with ",
        ['hashtag', {}, ['tag', {href: 'hashtags'}, "#hashtags"]],
        " is a ",
        ['hashtag', {}, ['tag', {href: 'pain'}, "#pain"]],
        ". ",
        ['hashtag', {}, ['tag', {href: 'ya-know'}, "#ya-know"]]],
    ]);
  });

  it('parses hashtags with values', function() {
    var jsonml = textile.jsonml("Dealing with #hashtags:1234 is a #pain. #ya-know");

    expect(jsonml).to.deep.equal([
      'div',
      ['p', "Dealing with ",
        ['hashtag', {}, ['tag', {href: 'hashtags'}, "#hashtags"], ':', ['value', '1234']],
        " is a ",
        ['hashtag', {}, ['tag', {href: 'pain'}, "#pain"]],
        ". ",
        ['hashtag', {}, ['tag', {href: 'ya-know'}, "#ya-know"]]],
    ]);
  });
});
