'use strict';

var angular = require('angular');
var module = angular.module('investigator');
var d3 = require('d3');

function uncollapseArray(val) {
  if(!val || angular.isArray(val))
    return val;

  return [val];
}

module.controller('views.cylance.device.object', function CylanceDeviceController($scope, $routeParams, deviceObj, $log, app, alerts) {
  $scope.device = deviceObj._source.device;

  $scope.device.mac = uncollapseArray($scope.device.mac);
  $scope.device.ip = uncollapseArray($scope.device.ip);
  $scope.device.zones = uncollapseArray($scope.device.zones);
  $scope.device.lastReportedUser = uncollapseArray($scope.device.lastReportedUser);

  $scope.device.onlineDate = $scope.device.onlineDate && new Date($scope.device.onlineDate);
  $scope.device.offlineDate = $scope.device.offlineDate && new Date($scope.device.offlineDate);
  $scope.device.createdTime = $scope.device.createdTime && new Date($scope.device.createdTime);

  if($scope.device.threats) {
    $scope.device.threats.forEach(function(t) {
      t.firstFound = t.firstFound && new Date(t.firstFound);
      t.lastFound = t.lastFound && new Date(t.lastFound);
      t.createdTime = t.createdTime && new Date(t.createdTime);
      t.modifiedTime = t.modifiedTime && new Date(t.modifiedTime);
    });

    $scope.device.threats.sort(function(a, b) { return d3.descending(a.firstFound, b.firstFound); });
  }

  if($scope.device.events) {
    $scope.device.events.forEach(function(t) {
      t.timestamp = t.timestamp && new Date(t.timestamp);
      t.fileName = t.filePath.replace(/^.*\\/, '');
    });

    $scope.device.events.sort(function(a, b) { return d3.descending(a.timestamp, b.timestamp); });
  }

  $scope.setTitle(deviceObj._source.device.name + ' - Cylance device');
});

module.controller('views.cylance.device.search', function CylanceDeviceSearchController($scope, $routeParams, $log, app, $location, alerts) {
  $scope.searchString = null;
  $scope.page = 1;
  $scope.pageCount = 0;
  $scope.shadowSearchString = '';
  var _lastSearch = null;
  var ITEMS_PER_PAGE = 100;

  function pullRouteUpdate() {
    $scope.commitSearch({
      newSearch: $location.search()['q'] || '',
      page: parseInt($location.search()['page']) || 1,
      forceRefresh: false});
  }

  $scope.commitSearch = function commitSearch(options) {
    options = options || {};
    var newSearch = options.newSearch || $scope.shadowSearchString;
    var forceRefresh = (options.forceRefresh === undefined) ? true : options.forceRefresh;

    $scope.searchString = newSearch;
    $scope.shadowSearchString = $scope.searchString;
    $scope.page = options.page || $scope.page;
    $location.search('q', (newSearch === '') ? null : newSearch);
    $location.search('page', ($scope.page === 1) ? null : $scope.page);

    $scope.setTitle(newSearch + ' - Cylance device search');

    fetchResults(forceRefresh);

    if($scope.searchForm)
      $scope.searchForm.$setPristine();
  };

  $scope.$on('$routeUpdate', pullRouteUpdate);
  pullRouteUpdate();

  function fetchResults(forceRefresh) {
    var q = $scope.searchString && $scope.searchString.trim() || '';

    if(!q.length) {
      $scope.results = null;
      return;
    }

    $scope.loading = true;

    var queryParams = {q: q, size: ITEMS_PER_PAGE, from: ($scope.page - 1) * ITEMS_PER_PAGE};

    if(angular.equals(_lastSearch, queryParams) && !forceRefresh)
      return;

    _lastSearch = queryParams;

    app.cylance.device.stringSearch(queryParams).then(
      function(resp) {
        //$log.log(resp);
        $scope.searchResults = resp;

/*        resp.hits.hits.forEach(function(hit) {
          hit._source['@timestamp'] = new Date(hit._source['@timestamp']);
        });*/

        $scope.pageCount = Math.ceil(resp.hits.total / ITEMS_PER_PAGE);

        $scope.loading = false;
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.loading = false;
      }
    );
  }

  $scope.setTitle('Cylance device search');
  $scope.searchResults = null;
});


