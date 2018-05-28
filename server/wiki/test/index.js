// https://mochajs.org/
// http://chaijs.com/api/bdd/
'use strict';

const chai = require('chai'), expect = chai.expect;

// Ensure we're running in testing mode
expect(require('../../config').indexPrefix).to.equal('test-');

require('./textile');
require('./common');
require('./server');
