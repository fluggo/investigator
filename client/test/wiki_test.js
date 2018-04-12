describe('Wiki:', function() {
  beforeEach(function() {
    module('ngWebSocket');
    module('investigator');
  });

  describe('shrinkTitleId function:', function() {
    it('passes through a simple value', inject(['utilService', function(ws) {
      expect(ws.shrinkTitleId('passthrough')).toEqual('passthrough');
    }]));

    it('shrinks nonconformant values', inject(['utilService', function(ws) {
      expect(ws.shrinkTitleId('10.0.0.1 / 24')).toEqual('10.0.0.1-24');
      expect(ws.shrinkTitleId('Case Folding')).toEqual('case-folding');
      expect(ws.shrinkTitleId('allowed$(characters)=[]{}stuff')).toEqual('allowed$(characters)=[]{}stuff');
      expect(ws.shrinkTitleId('not&/"?:allowed\\+dwjidq')).toEqual('not-allowed-dwjidq');
      expect(ws.shrinkTitleId('keep-dashes')).toEqual('keep-dashes');
      expect(ws.shrinkTitleId('-trim extra-')).toEqual('trim-extra');
    }]));
  });

  describe('wikiLinkToHref function:', function() {
    it('translates ordinary links as wiki ids', inject(['utilService', function(ws) {
      expect(ws.wikiLinkToHref('super-mushroom')).toEqual('wiki/article/super-mushroom');
      expect(ws.wikiLinkToHref('Super Mushroom')).toEqual('wiki/article/super-mushroom');
    }]));

    it('translates article: links as wiki ids', inject(['utilService', function(ws) {
      expect(ws.wikiLinkToHref('article:super-mushroom')).toEqual('wiki/article/super-mushroom');
      expect(ws.wikiLinkToHref('article:Super Mushroom')).toEqual('wiki/article/super-mushroom');
    }]));
  });

  describe('parseTags function:', function() {
    it('basic', inject(['utilService', function(ws) {
      expect(ws.parseTags('tagme basic')).toEqual(['tagme', 'basic']);
      expect(ws.parseTags('tagme')).toEqual(['tagme']);
      expect(ws.parseTags('')).toEqual([]);
    }]));
  });
});
