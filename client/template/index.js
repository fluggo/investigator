var angular = require('angular');
var module = angular.module('base');
var d3 = require('d3');

// Require all the template pages; browserify will turn these into angular templates
require('./error-message.html');
require('./pager.html');
require('./quick-search-results.html');

module.component('pager', {
  templateUrl: 'template/pager.html',
  controller: function() {
    function generatePageList(page, pageCount) {
      var result = [page], i = page, count = 0;

      // Walk down
      while(count < 3) {
        i = i - 1;

        if(i > 0) {
          result.push(i);
        }

        count++;
      }

      // Make sure there's seven, or 1 is in the list
      if(i > 1)
        result.push(1);

      count = 0;
      i = page;

      // Walk up
      while(count < 3) {
        i = i + 1;

        if(i <= pageCount) {
          result.push(i);
        }

        count++;
      }

      // Make sure there's seven, or pageCount is in the list
      if(i < pageCount)
        result.push(pageCount);

      result.sort(d3.ascending);
      return result;
    }

    this.$onChanges = function onChanges() {
      this.pageList = generatePageList(this.page, this.pageCount);
    };
  },
  bindings: {
    pageCount: '<',
    page: '<',
    changePage: '&'
  }
});

module.directive('errorMessage', function() {
  return {
    restrict: 'E',
    scope: {error: '='},
    templateUrl: 'template/error-message.html'
  };
});
