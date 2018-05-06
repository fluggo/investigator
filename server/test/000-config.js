// Use local elasticsearch for testing
const config = require('../config');

config.reloadConfig({
  indexPrefix: 'test-',
  elasticsearch: {
    "hosts": [
      "http://elasticsearch:9200"
    ],
    apiVersion: '5.2',
    //"log": "debug"
  },
  logging: {
    test: {},
    stdout: { level: 'error' },
  }
});

require('../wiki/test');
require('../users/test');
require('../netflow/test');

after(function() {
  // Close Elasticsearch so we can exit
  require('../es').client.close();
});
