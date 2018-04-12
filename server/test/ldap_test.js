// https://mochajs.org/
// http://chaijs.com/api/bdd/
'use strict';

const chai = require('chai'), expect = chai.expect;

describe('LDAP utils:', function() {
  const util = require('../../common/util.js');

  describe('parseDN:', function() {
    it('parses basic DNs', function() {
      expect(util.parseDN('DC=example,DC=com')).to.deep.equal([
        { type: 'DC', value: 'example' },
        { type: 'DC', value: 'com' },
      ]);

      expect(util.parseDN('CN=thing,DC=example,DC=com')).to.deep.equal([
        { type: 'CN', value: 'thing'},
        { type: 'DC', value: 'example' },
        { type: 'DC', value: 'com' },
      ]);
    });

    it('handles escaped characters', function() {
      expect(util.parseDN('CN=Brown\\, Charlie,DC=example,DC=com'), 'basic escape').to.deep.equal([
        { type: 'CN', value: 'Brown, Charlie' },
        { type: 'DC', value: 'example' },
        { type: 'DC', value: 'com' },
      ]);

      expect(util.parseDN('CN=Brown\\0D Charlie,DC=example,DC=com'), 'hex escape').to.deep.equal([
        { type: 'CN', value: 'Brown\r Charlie' },
        { type: 'DC', value: 'example' },
        { type: 'DC', value: 'com' },
      ]);
    });

    it('leaves escaped characters if requested', function() {
      expect(util.parseDN('CN=Brown\\, Charlie,DC=example,DC=com', {decodeValues: false}), 'basic escape').to.deep.equal([
        { type: 'CN', value: 'Brown\\, Charlie' },
        { type: 'DC', value: 'example' },
        { type: 'DC', value: 'com' },
      ]);

      expect(util.parseDN('CN=Brown\\0D Charlie,DC=example,DC=com', {decodeValues: false}), 'hex escape').to.deep.equal([
        { type: 'CN', value: 'Brown\\0D Charlie' },
        { type: 'DC', value: 'example' },
        { type: 'DC', value: 'com' },
      ]);
    });

    it('uppercases keywords', function() {
      expect(util.parseDN('dc=example,dc=com')).to.deep.equal([
        { type: 'DC', value: 'example' },
        { type: 'DC', value: 'com' },
      ]);
    });
  });
});

