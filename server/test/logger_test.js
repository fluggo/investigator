// https://mochajs.org/
// http://chaijs.com/api/bdd/
'use strict';

const chai = require('chai'), expect = chai.expect;
const config = require('../config.js');

describe('Logger', function() {
  // BJC: This test will remain here as an example of testing logging, but in reality
  // the bunyan request logger uses its own serializers and ignores ours
  describe('request sanitizer', function() {
    it('removes the authorization header', function() {
      config.clearLogEntries();

      config.logger.info({
        req: {
          method: 'GET',
          url: 'http://blahblah.blah',
          headers: {
            authorization: 'Bearer',
            referer: 'music',
            cookie: 'cookie'
          }
        }
      }, 'Test');

      const logEntries = config.getLogEntries();

      expect(logEntries[0].req).to.deep.equal({
        method: 'GET',
        url: 'http://blahblah.blah',
        headers: {
          referer: 'music',
          cookie: 'cookie'
        }
      });
    });
  });
});
