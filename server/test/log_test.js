// https://mochajs.org/
// http://chaijs.com/api/bdd/
'use strict';

const chai = require('chai'), expect = chai.expect;

describe('Log utils:', function() {
  const util = require('../../common/util.js');

  describe('parsePlainHighlights function:', function() {
    it('passes through a simple value', function() {
      expect(util.parsePlainHighlights('passthrough')).to.deep.equal(['span', 'passthrough']);
    });

    it('highlights highlights', function() {
      expect(util.parsePlainHighlights('pass<!@highlight@!>through</!@highlight@!>'))
        .to.deep.equal([
          'span',
          'pass',
          ['span', {class:'highlight'}, 'through']
        ]);
    });
  });

  describe('segmentTextStandard function', function() {
    it('segments a single word (WB1/WB2)', function() {
      var result = util.segmentTextStandard('word');

      expect(result).to.deep.equal([
        { word: 'word', index: 0 }
      ]);
    });

    it('breaks at newlines (WB3)', function() {
      expect(util.segmentTextStandard('word\x0dtext'), 'CR').to.deep.equal([
        { word: 'word', index: 0 },
        { word: 'text', index: 5 }
      ]);

      expect(util.segmentTextStandard('word\x0atext'), 'LF').to.deep.equal([
        { word: 'word', index: 0 },
        { word: 'text', index: 5 }
      ]);

      expect(util.segmentTextStandard('word\x0d\x0atext'), 'CRLF').to.deep.equal([
        { word: 'word', index: 0 },
        { word: 'text', index: 6 }
      ]);

      expect(util.segmentTextStandard('word\x0btext'), 'LT').to.deep.equal([
        { word: 'word', index: 0 },
        { word: 'text', index: 5 }
      ]);

      expect(util.segmentTextStandard('word\x0ctext'), 'FF').to.deep.equal([
        { word: 'word', index: 0 },
        { word: 'text', index: 5 }
      ]);

      expect(util.segmentTextStandard('word\x85text'), 'NEL').to.deep.equal([
        { word: 'word', index: 0 },
        { word: 'text', index: 5 }
      ]);

      expect(util.segmentTextStandard('word\u2028text'), 'line separator').to.deep.equal([
        { word: 'word', index: 0 },
        { word: 'text', index: 5 }
      ]);
      expect(util.segmentTextStandard('word\u2029text'), 'paragraph separator').to.deep.equal([
        { word: 'word', index: 0 },
        { word: 'text', index: 5 }
      ]);
    });

    var midNumLet = [['.', 'full stop'], ['\u2018', 'left single quote'], ['\u2019', 'right single quote'],
      ['\u2024', 'one dot leader'], ['\ufe52', 'small full stop'], ['\uff07', 'fullwidth apostrophe'],
      ['\uff0e', 'fullwidth full stop']];
    var midLetter = [['\u00b7', 'middle dot'], ['\u0387', 'greek ano teleia'], ['\u05f4', 'gershayim'],
      ['\u2027', 'hyphenation point'], ['\u003a', 'colon'], ['\ufe13', 'vertical colon'], ['\ufe55', 'small colon'],
      ['\uff1a', 'fullwidth colon'], ['\u02d7', 'modifier letter minus sign']];
    var midNum = [['\u002c', 'comma'], ['\u003b', 'semicolon']];
    var notMidNum = [['\u003a', 'colon'], ['\u002e', 'full stop']];

    it('doesn\'t break at some middle punctuation (WB6/WB7)', function() {
      // Don't break in middle
      expect(util.segmentTextStandard('word\'text'), 'single quote').to.deep.equal([
        { word: 'word\'text', index: 0 }
      ]);

      midNumLet.forEach(function(a) {
        expect(util.segmentTextStandard('word' + a[0] + 'text'), a[1]).to.deep.equal([
          { word: 'word' + a[0] + 'text', index: 0 }
        ]);
      });

      midLetter.forEach(function(a) {
        expect(util.segmentTextStandard('word' + a[0] + 'text'), a[1]).to.deep.equal([
          { word: 'word' + a[0] + 'text', index: 0 }
        ]);
      });

      // But do break elsewhere
      expect(util.segmentTextStandard('word\' text'), 'single quote space').to.deep.equal([
        { word: 'word', index: 0 },
        { word: 'text', index: 6 }
      ]);

      midNumLet.forEach(function(a) {
        expect(util.segmentTextStandard('word' + a[0] + ' text'), a[1] + ' space').to.deep.equal([
          { word: 'word', index: 0 },
          { word: 'text', index: 6 }
        ]);
      });

      midLetter.forEach(function(a) {
        expect(util.segmentTextStandard('word' + a[0] + ' text'), a[1] + ' space').to.deep.equal([
          { word: 'word', index: 0 },
          { word: 'text', index: 6 }
        ]);
      });

      expect(util.segmentTextStandard('word\''), 'single quote end').to.deep.equal([
        { word: 'word', index: 0 },
      ]);

      midNumLet.forEach(function(a) {
        expect(util.segmentTextStandard('word' + a[0]), a[1] + ' end').to.deep.equal([
          { word: 'word', index: 0 },
        ]);
      });

      midLetter.forEach(function(a) {
        expect(util.segmentTextStandard('word' + a[0]), a[1] + ' end').to.deep.equal([
          { word: 'word', index: 0 },
        ]);
      });
    });

    it("doesn't break within numbers (WB8)", function() {
      expect(util.segmentTextStandard('965'), 'number').to.deep.equal([
        { word: '965', index: 0 },
      ]);
    });

    it("doesn't break between numbers and letters (WB9/WB10)", function() {
      expect(util.segmentTextStandard('ab965'), 'WB9').to.deep.equal([
        { word: 'ab965', index: 0 },
      ]);

      expect(util.segmentTextStandard('ab965cd12'), 'WB9 alternating').to.deep.equal([
        { word: 'ab965cd12', index: 0 },
      ]);

      expect(util.segmentTextStandard('ab965c.d12'), 'WB9 + WB6').to.deep.equal([
        { word: 'ab965c.d12', index: 0 },
      ]);

      expect(util.segmentTextStandard('965ab'), 'WB10').to.deep.equal([
        { word: '965ab', index: 0 },
      ]);

      expect(util.segmentTextStandard('965ab12cd'), 'WB10 alternating').to.deep.equal([
        { word: '965ab12cd', index: 0 },
      ]);
    });

    it('doesn\'t break within sequences (WB11/WB12)', function() {
      // Don't break in middle
      expect(util.segmentTextStandard('98\'23'), 'single quote').to.deep.equal([
        { word: '98\'23', index: 0 }
      ]);

      midNumLet.forEach(function(a) {
        expect(util.segmentTextStandard('98' + a[0] + '23'), a[1]).to.deep.equal([
          { word: '98' + a[0] + '23', index: 0 }
        ]);
      });

      midNum.forEach(function(a) {
        expect(util.segmentTextStandard('98' + a[0] + '23'), a[1]).to.deep.equal([
          { word: '98' + a[0] + '23', index: 0 }
        ]);
      });

      expect(util.segmentTextStandard('255.255.255.255'), 'IP').to.deep.equal([
        { word: '255.255.255.255', index: 0 },
      ]);

      expect(util.segmentTextStandard('10.0.0.1'), 'IP').to.deep.equal([
        { word: '10.0.0.1', index: 0 },
      ]);

      expect(util.segmentTextStandard('securepubads.g.doubleclick.net'), 'FQDN').to.deep.equal([
        { word: 'securepubads.g.doubleclick.net', index: 0 },
      ]);

      // But do break elsewhere
      expect(util.segmentTextStandard('98\' 23'), 'single quote space').to.deep.equal([
        { word: '98', index: 0 },
        { word: '23', index: 4 }
      ]);

      midNumLet.forEach(function(a) {
        expect(util.segmentTextStandard('98' + a[0] + ' 23'), a[1] + ' space').to.deep.equal([
          { word: '98', index: 0 },
          { word: '23', index: 4 }
        ]);
      });

      midNum.forEach(function(a) {
        expect(util.segmentTextStandard('98' + a[0] + ' 23'), a[1] + ' space').to.deep.equal([
          { word: '98', index: 0 },
          { word: '23', index: 4 }
        ]);
      });

      expect(util.segmentTextStandard('98\''), 'single quote end').to.deep.equal([
        { word: '98', index: 0 },
      ]);

      midNumLet.forEach(function(a) {
        expect(util.segmentTextStandard('98' + a[0]), a[1] + ' end').to.deep.equal([
          { word: '98', index: 0 },
        ]);
      });

      midNum.forEach(function(a) {
        expect(util.segmentTextStandard('98' + a[0]), a[1] + ' end').to.deep.equal([
          { word: '98', index: 0 },
        ]);
      });
    });

    it('doesn\'t break within extenders (WB13)', function() {
      // Don't break in middle
      expect(util.segmentTextStandard('A_0_'), 'ending in extender').to.deep.equal([
        { word: 'A_0_', index: 0 }
      ]);

      expect(util.segmentTextStandard('_A_0'), 'beginning in extender').to.deep.equal([
        { word: '_A_0', index: 0 }
      ]);

      expect(util.segmentTextStandard('A__A'), 'sample string 15').to.deep.equal([
        { word: 'A__A', index: 0 },
      ]);

      expect(util.segmentTextStandard('A_A'), 'just checking').to.deep.equal([
        { word: 'A_A', index: 0 },
      ]);
    });

    it('handles certain test strings from the Unicode word break test', function() {
      // See http://www.unicode.org/Public/UCD/latest/ucd/auxiliary/WordBreakTest.html
      expect(util.segmentTextStandard('a$-34,567.14%b'), 'test 4').to.deep.equal([
        { word: 'a', index: 0 },
        //{ word: '$', index: 1 },
        //{ word: '-', index: 2 },
        { word: '34,567.14', index: 3 },
        //{ word: '%', index: 12 },
        { word: 'b', index: 13 },
      ]);

      expect(util.segmentTextStandard('c.d'), 'test 6').to.deep.equal([
        { word: 'c.d', index: 0 },
      ]);

      expect(util.segmentTextStandard('C.d'), 'test 7').to.deep.equal([
        { word: 'C.d', index: 0 },
      ]);

      expect(util.segmentTextStandard('c.D'), 'test 8').to.deep.equal([
        { word: 'c.D', index: 0 },
      ]);

      expect(util.segmentTextStandard('C.D'), 'test 9').to.deep.equal([
        { word: 'C.D', index: 0 },
      ]);
    });
  });

});

