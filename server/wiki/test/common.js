// https://mochajs.org/
// http://chaijs.com/api/bdd/
'use strict';

const chai = require('chai'), expect = chai.expect;

describe('Common wiki utils', function() {
  const util = require('../../../common/util.js');

  describe('shrinkTitleId function:', function() {
    it('passes through a simple value', function() {
      expect(util.shrinkTitleId('passthrough')).to.equal('passthrough');
    });

    it('shrinks nonconformant values', function() {
      expect(util.shrinkTitleId('10.5.35.45 / 24')).to.equal('10.5.35.45-24');
      expect(util.shrinkTitleId('Case Folding')).to.equal('case-folding');
      expect(util.shrinkTitleId('allowed$(characters)=[]{}stuff')).to.equal('allowed$(characters)=[]{}stuff');
      expect(util.shrinkTitleId('not&/"?:allowed\\+dwjidq')).to.equal('not-allowed-dwjidq');
      expect(util.shrinkTitleId('keep-dashes')).to.equal('keep-dashes');
      expect(util.shrinkTitleId('-trim extra-')).to.equal('trim-extra');
    });
  });

  describe('shrinkTag function:', function() {
    it('passes through a simple value', function() {
      expect(util.shrinkTag('passthrough')).to.equal('passthrough');
    });

    it('shrinks nonconformant values', function() {
      expect(util.shrinkTag('10.5.35.45 / 24')).to.equal('10.5.35.45-24');
      expect(util.shrinkTag('Case Folding')).to.equal('case-folding');
      expect(util.shrinkTag('allowed$(characters)=[]{}stuff')).to.equal('allowed$(characters)=[]{}stuff');
      expect(util.shrinkTag('not&/"?allowed\\+,dwjidq')).to.equal('not-allowed-dwjidq');
      expect(util.shrinkTag('keep-dashes')).to.equal('keep-dashes');
      expect(util.shrinkTag('-trim extra-')).to.equal('trim-extra');
    });

    it('shrinks only the left side of valued tags', function() {
      expect(util.shrinkTag('ip:10.5.35.45/24')).to.equal('ip:10.5.35.45/24');
      expect(util.shrinkTag('ip:ThisisBalo[]]ey')).to.equal('ip:ThisisBalo[]]ey');
      expect(util.shrinkTag('Tank&blonk:ThisisBalo[]]ey')).to.equal('tank-blonk:ThisisBalo[]]ey');
    });
  });

  describe('wikiLinkToHref function:', function() {
    it('translates ordinary links as wiki ids', function() {
      expect(util.wikiLinkToHref('super-mushroom')).to.equal('wiki/article/super-mushroom');
      expect(util.wikiLinkToHref('Super Mushroom')).to.equal('wiki/article/super-mushroom');
    });

    it('translates article: links as wiki ids', function() {
      expect(util.wikiLinkToHref('article:super-mushroom')).to.equal('wiki/article/super-mushroom');
      expect(util.wikiLinkToHref('article:Super Mushroom')).to.equal('wiki/article/super-mushroom');
    });
  });

  describe('parseTags', function() {
    it('parses basic tags', function() {
      expect(util.parseTags('tagme basic')).to.deep.equal(['basic', 'tagme']);
      expect(util.parseTags('tagme')).to.deep.equal(['tagme']);
      expect(util.parseTags('')).to.deep.equal([]);
    });

    it('parses valued tags', function() {
      expect(util.parseTags('tagme ip:10.2.12.15')).to.deep.equal(['ip:10.2.12.15', 'tagme']);
      expect(util.parseTags('tagme network:10.0.0.0/8')).to.deep.equal(['network:10.0.0.0/8', 'tagme']);
      expect(util.parseTags('tagme network:10.0.0.0/8 stuff')).to.deep.equal(['network:10.0.0.0/8', 'stuff', 'tagme']);
    });

    it('parses quoted tags', function() {
      expect(util.parseTags('tagme sam-name:"TOAST CRUNCHIES"')).to.deep.equal(['sam-name:"TOAST CRUNCHIES"', 'tagme']);
    });
  });

  describe('parseTag', function() {
    it('parses basic tags', function() {
      expect(util.parseTag('tagme')).to.deep.equal({tag: 'tagme'});
      expect(util.parseTag('TAGME')).to.deep.equal({tag: 'tagme'});
    });

    it('parses valued tags', function() {
      expect(util.parseTag('ip:10.2.12.15')).to.deep.equal({tag: 'ip', value:'10.2.12.15'});
      expect(util.parseTag('sam-name:BURP\\tastic')).to.deep.equal({tag: 'sam-name', value: 'BURP\\tastic'});
    });

    it('parses quoted tags', function() {
      expect(util.parseTag('sam-name:"BURP\\tastic rific"')).to.deep.equal({tag: 'sam-name', value: 'BURP\\tastic rific'});
    });
  });

  describe('expandTitleId function:', function() {
    it('expands title ids', function() {
      expect(util.expandTitleId('infosec-analyst')).to.equal('Infosec analyst');
    });

    it('does not die on empty strings', function() {
      expect(util.expandTitleId('')).to.equal('');
    });
  });

  describe('alterTags', function() {
    it('handles clears', function() {
      var newTags = util.alterTags(['fqdn:example.com', 'user', 'never-login'], [{action: 'clear', tag: 'fqdn'}]);

      expect(newTags).to.have.lengthOf(2)
        .and.have.members(['user', 'never-login']);
    });

    it('handles adds, keeps, and removes', function() {
      var newTags = util.alterTags(['fqdn:example.com', 'user', 'never-login'],
        [
          {action: 'add', tag: 'ldap-guid:246e1e91-d843-42ee-a47d-a487f03274f3'},
          {action: 'keep', tag: 'computer'},  // keep in this context is just an alias for "add"
          {action: 'remove', tag: 'never-login'},
        ]);

      expect(newTags).to.have.lengthOf(4)
        .and.have.members(['fqdn:example.com', 'user', 'computer', 'ldap-guid:246e1e91-d843-42ee-a47d-a487f03274f3']);
    });
  });
});
