
module.exports = function(config) {
  config.set({

    // base path, that will be used to resolve files and exclude
    basePath: '.',

    frameworks: ['jasmine'],
    browsers: ['Chrome'],

    // list of files / patterns to load in the browser
    files: [
      'www/static/d3-3.5.9/d3.js',
      'www/static/angular-1.4.7/angular.js',
      'www/static/angular-1.4.7/angular-messages.js',
      'www/static/angular-1.4.7/angular-route.js',
      'www/static/angular-1.4.7/angular-aria.js',
      'www/static/angular-1.4.7/angular-mocks.js',
      'www/static/angular-websocket-1.0.14/angular-websocket.js',
      'www/static/angular-websocket-1.0.14/angular-websocket-mock.js',
      'www/js/*.js',
      'test_client/setup/*.js',
      'test_client/**/*.js'
    ],
  });
};
