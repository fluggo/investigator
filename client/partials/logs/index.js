'use strict';

var angular = require('angular');
var module = angular.module('investigator');
var d3 = require('d3');

// Require all the template pages; browserify will turn these into angular templates
require('./bunyan/entry.html');
require('./wsa/entry.html');
require('./wsa/search.html');
require('./cylance/entry.html');
require('./cylance/search.html');
require('./msvista/entry.html');
require('./msvista/search.html');
require('./msvista/stats.html');
require('./sql/search.html');
require('./sql/entry.html');
require('./syslog/search.html');
require('./running-programs.html');

const logColumns = require('../../../common/logcolumns.js');

module.directive('logTable', function factory($log, $location, $sniffer, $parse, app, d3service) {
  return {
    restrict: 'A',

    link: function(scope, element, attrs) {
      var getData = $parse(attrs.data);
      var getColumns = $parse(attrs.columns);
      var getSortProp = attrs.sortProp && $parse(attrs.sortProp);
      var getSortOrder = attrs.sortOrder && $parse(attrs.sortOrder)
      var onSort = attrs.onSort && $parse(attrs.onSort);
      var onAddTerm = attrs.onAddTerm && $parse(attrs.onAddTerm);
      var onRemoveTerm = attrs.onRemoveTerm && $parse(attrs.onRemoveTerm);

      var elem = d3.select(element[0]);

      var headerRow = elem.append('thead').append('tr');
      var tbody = elem.append('tbody');

      function addTerm(type, term) {
        scope.$apply(function() {
          //$log.log('Entering', d.time);
          if(onAddTerm)
            onAddTerm(scope, {type: type, term: term});
        });
      }

      function removeTerm(type, term) {
        scope.$apply(function() {
          //$log.log('Entering', d.time);
          if(onRemoveTerm)
            onRemoveTerm(scope, {type: type, term: term});
        });
      }

      var callbacks = {
        addTerm: addTerm,
        removeTerm: removeTerm,
      };

      function rebuild() {
        var newData = getData(scope);
        var columns = getColumns(scope);
        var sortProp = getSortProp && getSortProp(scope);
        var sortOrder = getSortOrder && getSortOrder(scope) || 'desc';

        if(!newData)
          return;

        //$log.log('Rebuilding', new Date());

        headerRow.selectAll('th').remove();

        headerRow.selectAll('th')
          .data(columns)
          .enter()
          .append('th')
          .classed('clickable-cell', col => col.sortable || col.searchable)
          .on('click', function(col) {
            if(col.searchable && d3.event.button === 0 && d3.event.shiftKey && !d3.event.ctrlKey && !d3.event.altKey) {
              d3.event.preventDefault();
              d3.event.stopPropagation();
              callbacks.addTerm('exists', col.name);
            }
            else if(col.searchable && d3.event.button === 0 && !d3.event.shiftKey && d3.event.ctrlKey && !d3.event.altKey) {
              d3.event.preventDefault();
              d3.event.stopPropagation();
              callbacks.removeTerm('exists', col.name);
            }
            else if(col.sortable && d3.event.button === 0 && !d3.event.shiftKey && !d3.event.ctrlKey && !d3.event.altKey) {
              d3.event.preventDefault();
              d3.event.stopPropagation();
              onSort && onSort(scope, {
                sortProp: col.name,
                sortOrder: col.name === sortProp ? ((sortOrder === 'desc') ? 'asc' : 'desc') : (col.defaultSortOrder || 'asc'),
              });
            }
          })
          .each(function(col) {
            var self = d3.select(this);

            self.append('span')
              .text(col.displayName);

            if(col.sortable) {
              self.append('i')
                .attr('class', 'fa fa-fw')
                .classed('text-muted', col.name !== sortProp)
                .classed('fa-sort', col.name !== sortProp)
                .classed('fa-sort-desc', col.name === sortProp && sortOrder === 'desc')
                .classed('fa-sort-asc', col.name === sortProp && sortOrder === 'asc');
            }
          });

        var rowElements = tbody.selectAll('tr').data(newData, d => d._id);

        rowElements.exit().remove();

        //$log.log('Row elements remaining:', rowElements.size());

        var tds = rowElements
          .enter()
          .append('tr')
          .merge(rowElements)
          .order()
            .selectAll('td')
            .data(function(row) {
              return columns.map(col => { return { column: col, row: row }; });
            }, d => d.column.name);

        tds.exit().remove();

        tds
          .enter()
          .append('td')
          .each(function(d) {
            // Let the column write its cell
            d.column.writeCell(d3.select(this), d.column.getter(d.row), d.row, callbacks);
          })
          .merge(tds)
          .order()
          .each(function(d) {
            // Let the column write its cell
            if(d.column.rewriteCell)
              d.column.rewriteCell(d3.select(this), d.column.getter(d.row), d.row, callbacks);
          });

        function mouseenter(d) {
          scope.$apply(function() {
            //$log.log('Entering', d.time);
            if(onTimePicked)
              onTimePicked(scope, {time: d.time, data: d});
          });
        }

        function mouseleave(d) {
          scope.$apply(function() {
            //$log.log('Leaving', d.time);
            if(onTimePicked)
              onTimePicked(scope, {time: null, data: null});
          });
        }
      }

      var group = [attrs.data];

      if(attrs.sortProp)
        group.push(attrs.sortProp);

      if(attrs.sortOrder)
        group.push(attrs.sortOrder);

      scope.$watchGroup(group, function() {
        var newData = getData(scope);

        if(!newData)
          return;

        rebuild();
      });

      scope.$watchCollection(attrs.columns, function() {
        rebuild();
      });
    }
  };
});

module.controller('views.logs.bunyan.entry', function LogBunyanEntryController($scope, bunyanEntry, $log, alerts) {
  $scope.setTitle('Bunyan');
  $scope.entry = bunyanEntry._source;
  $scope.entry.log.eventTime = $scope.entry.log.eventTime && new Date($scope.entry.log.eventTime);

  if($scope.entry.bunyan.level <= 19) {
    $scope.level = 'trace';
  }
  else if($scope.entry.bunyan.level <= 29) {
    $scope.level = 'debug';
  }
  else if($scope.entry.bunyan.level <= 39) {
    $scope.level = 'info';
  }
  else if($scope.entry.bunyan.level <= 49) {
    $scope.level = 'warning';
  }
  else if($scope.entry.bunyan.level <= 59) {
    $scope.level = 'error';
  }
  else {
    $scope.level = 'fatal';
  }

  var knownKeysList = ['name', 'hostname', 'pid', 'level', 'interest', 'err', 'msg', 'time', 'v'];
  var knownKeys = {};

  knownKeysList.forEach(function(key) { knownKeys[key] = true; });

  Object.keys($scope.entry.bunyan).forEach(function(key) {
    if(!knownKeys[key]) {
      if(!$scope.custom)
        $scope.custom = {};

      $scope.custom[key] = $scope.entry.bunyan[key];
    }
  });
});

module.controller('views.logs.wsa.entry', function LogWsaEntryController($scope, wsaEntry, $log, alerts) {
  $scope.setTitle('WSA');
  $scope.entry = wsaEntry._source;
  $scope.entry.log.eventTime = $scope.entry.log.eventTime && new Date($scope.entry.log.eventTime);
  $scope.entry.log.receivedTime = $scope.entry.log.receivedTime && new Date($scope.entry.log.receivedTime);

  $scope.decisionCategory = $scope.entry.wsa.aclDecision.replace(/_.*$/, '');
  $scope.decisionStatus = logColumns.WSA_CATEGORY_STATUS[$scope.decisionCategory] || 'DEFAULT';
  $scope.httpStatusCodes = logColumns.HTTP_STATUS_CODES;

  $scope.urlCategory = logColumns.WSA_CATEGORY_MAP.get($scope.entry.wsa.urlCategory);
});

module.controller('views.logs.msvista.entry', function LogVistaEntryController($scope, msvistaEntry, $log, alerts, app) {
  $scope.setTitle('Windows event log');
  $scope.entry = msvistaEntry._source;
  $scope.entry.log.eventTime = $scope.entry.log.eventTime && new Date($scope.entry.log.eventTime);
  $scope.entry.log.receivedTime = $scope.entry.log.receivedTime && new Date($scope.entry.log.receivedTime);

/*  if(!Object.keys($scope.entry.msvistalog.other).length) {
    $scope.entry.msvistalog.other = undefined;
  }*/

  if($scope.entry.msvistalog.system.correlation.activityId) {
    $scope.loadingActivities = true;

    app.logs.getVistaLogEntriesByActivityId($scope.entry.msvistalog.system.correlation.activityId).then(
      function(resp) {
        $scope.activities = resp;

        // Elide each activity's text
        var ELIDE_LENGTH = 250;

        resp.hits.hits.forEach(function(hit) {
          hit._source.log.eventTime = new Date(hit._source.log.eventTime);
          hit.elided = (hit._source.log.message.length > ELIDE_LENGTH) ? (hit._source.log.message.substring(0, ELIDE_LENGTH - 3) + '...') : hit._source.log.message;
        });

        $scope.loadingActivities = false;
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.loadingActivities = false;
      }
    );
  }
});

module.controller('views.logs.msvista.search', function LogVistaSearchController($scope, $routeParams, $route, $log, app, $location, $timeout, alerts) {
  $scope.searchString = null;
  $scope.shadowSearchString = '';
  $scope.page = 1;
  $scope.pageCount = 0;
  $scope.selectedReportingIp = null;
  $scope.searchPerformed = false;
  $scope.sortProp = 'time';
  $scope.sortOrder = 'desc';
  $scope.displaySortProp = 'time';
  $scope.displaySortOrder = 'desc';
  var ITEMS_PER_PAGE = 50;
  var _lastSearch = null;

  const defaultColumnList = ['time', 'computer', 'provider', 'event', 'task', 'message'];

  $scope.columnList = ['time', 'computer', 'provider', 'event', 'task', 'message'];

  $scope.defaultColumnsForSelection = d3.nest()
    .key(col => col.category)
    .entries(logColumns.msvistaColumns);
  $scope.availableColumns = d3.set();

  $scope.removeColumn = function removeColumn(name) {
    $scope.columnList = $scope.columnList.filter(a => a !== name);
    updateColumnList();
  };

  $scope.addColumn = function addColumn(name) {
    const column = logColumns.msvistaColumnsByName.get(name);

    if(column) {
      let found = false;

      for(let i = column.index - 1; !found && i >= 0; i--) {
        if($scope.columnSet.has(logColumns.msvistaColumns[i].name)) {
          // We have this column already, insert our new column after it
          found = true;
          $scope.columnList.splice($scope.columnList.indexOf(logColumns.msvistaColumns[i].name) + 1, 0, name);
        }
      }

      if(!found)
        $scope.columnList.splice(0, 0, name);
    }
    else {
      $scope.columnList.push(name);
    }

    updateColumnList();
  };

  $scope.moveColumnLeft = function moveColumnLeft(index) {
    $scope.columnList.splice(index - 1, 2, $scope.columnList[index], $scope.columnList[index - 1]);
    updateColumnList();
  };

  $scope.moveColumnRight = function moveColumnRight(index) {
    $scope.moveColumnLeft(index + 1);
  };

  $scope.updateFromColumnString = function updateFromColumnString() {
    $scope.columnList = $scope.shadowColumnString.split(/\s+/g).map(a => a.trim());
    updateColumnList();
  };

  function updateColumnList() {
    $scope.shadowColumnString = $scope.columnList.join(' ');
    $scope.columnSet = d3.set($scope.columnList);
    $scope.tableColumns = $scope.columnList.map(function(name) {
      return logColumns.msvistaColumnsByName.get(name) ||
        new logColumns.DefaultColumn(name, null, name, null, d => d._source.msvistalog.other[name], { searchable: false, sortable: false });
    });

    $location.search('cols', (defaultColumnList.join(',') === $scope.columnList.join(',')) ? null : $scope.columnList.join(','));
  }

  function pullRouteUpdate() {
    const colsList = $location.search()['cols'];

    if(colsList) {
      $scope.columnList = colsList.split(',');
    }

    updateColumnList();

    $scope.commitSearch({
      newSearch: $location.search()['q'] || '',
      page: parseInt($location.search()['page']) || 1,
      sortProp: $location.search()['sort'] || 'time',
      sortOrder: $location.search()['order'] || 'desc',
      forceRefresh: false});
  }

  $scope.commitSearchDelay = function() {
    $timeout(function() {
      $scope.commitSearch({page: 1});
    }, 1);
  };

  $scope.commitSearch = function commitSearch(options) {
    options = options || {};
    var newSearch = options.newSearch || $scope.shadowSearchString;
    var forceRefresh = (options.forceRefresh === undefined) ? true : options.forceRefresh;

    $scope.searchString = newSearch;
    $scope.shadowSearchString = $scope.searchString;
    $scope.page = options.page || $scope.page;
    $scope.sortOrder = options.sortOrder || $scope.sortOrder;
    $scope.sortProp = options.sortProp || $scope.sortProp;
    $location.search('q', (newSearch === '') ? null : newSearch);
    $location.search('page', ($scope.page === 1) ? null : $scope.page);
    $location.search('sort', ($scope.sortProp === 'time') ? null : $scope.sortProp);
    $location.search('order', ($scope.sortOrder === 'desc') ? null : $scope.sortOrder);

    $scope.setTitle(newSearch + ' - Windows event log search');

    fetchResults(forceRefresh);

    if($scope.searchForm)
      $scope.searchForm.$setPristine();
  };

  $scope.$on('timeRangeChanged', pullRouteUpdate);
  $scope.$on('$routeUpdate', pullRouteUpdate);
  $scope.$on('user/settingsChanged', pullRouteUpdate);

  if(!$scope.settings.defaultSettings) {
    // The settings have already been loaded, pull the route
    pullRouteUpdate();
  }

  function fetchResults(forceRefresh) {
    var q = $scope.searchString && $scope.searchString.trim() || '';

    if(!q.length) {
      $scope.searchResults = null;
      $scope.graphData = null;
      $scope.searchPerformed = false;
      _lastSearch = null;
      return;
    }

    var queryParams = {
      q: q,
      start: $scope.timeRange.start,
      end: $scope.timeRange.end,
      size: ITEMS_PER_PAGE,
      from: ($scope.page - 1) * ITEMS_PER_PAGE,
      sortProp: $scope.sortProp,
      sortOrder: $scope.sortOrder,
    };

    if(angular.equals(_lastSearch, queryParams) && !forceRefresh) {
      return;
    }

    _lastSearch = queryParams;
    $scope.loading = true;
    $scope.searchPerformed = true;

    app.logs.searchVistaLogs(queryParams).then(
      function(resp) {
        $scope.totalHits = resp.hits.total;
        $scope.pageCount = Math.ceil(resp.hits.total / ITEMS_PER_PAGE);

        resp.hits.hits.forEach(function(hit) {
          hit._source.log.eventTime = hit._source.log.eventTime && new Date(hit._source.log.eventTime);
          hit._source.log.receivedTime = hit._source.log.receivedTime && new Date(hit._source.log.receivedTime);
        });

        // Compute the possible columns from the result set
        $scope.availableColumns = d3.set(logColumns.msvistaColumns
          .map(col => resp.hits.hits.some(row => col.getter(row) !== undefined) ? col.name : null)
          .filter(v => v));

        $scope.displaySortProp = queryParams.sortProp;
        $scope.displaySortOrder = queryParams.sortOrder;
        $scope.searchResults = resp;
        $scope.loading = false;
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.loading = false;
      }
    );
  }

  $scope.setTimeRangeActive();
  $scope.setTitle('Windows event log search');
  $scope.searchResults = null;

  function appendTerm(symbol, type, term) {
    var result = (symbol || '') + (type ? (type + ':') : '') + logColumns.quoteTerm(term);

    $scope.shadowSearchString += ' ' + result;
  }

  $scope.addTerm = function addTerm(type, term) {
    appendTerm('+', type, term);
  };

  $scope.removeTerm = function removeTerm(type, term) {
    appendTerm('-', type, term);
  };
});

module.component('msvistaEntry', {
  templateUrl: require('./msvista/entry-template.html'),
  controller: function() {
    this.$onChanges = function onChanges() {
      this.eventTime = this.entry && new Date(this.entry.log.eventTime);
    };
  },
  bindings: {
    entry: '<',
    index: '<',
    id: '<',
  }
});

module.controller('views.logs.running-programs', function StatusCurrentController($scope, $routeParams, $location, $log, app, currentStatuses) {
  $scope.setTitle('Running Programs');

  currentStatuses.forEach(function(status) {
    $log.log(status);
    status.status.processStartTime = new Date(status.status.processStartTime);
    status.status.processBuildTime = new Date(status.status.processBuildTime);
    status.log.eventTime = new Date(status.log.eventTime);
  });

  $scope.hosts = d3.nest()
    .key(function(d) { return d.log.source.hostname; })
    .sortKeys(app.compareStringsCI)
    .entries(currentStatuses);
});

module.controller('views.logs.msvista.stats', function VistaStatsController($scope, $routeParams, statsObj, $log, app, alerts) {
  $scope.setTitle('Windows event log stats');
  $scope.statsObj = statsObj;

  const computersByName = d3.map();
  $scope.totalCount = statsObj.statistical[0].hits.total;
  $scope.statsTotalCount = statsObj.statistical[0].aggregations.sample.doc_count;
  $scope.lastDayCount = statsObj.lastDay[0].hits.total;

  statsObj.statistical[0].aggregations.sample.byComputer.buckets.forEach(stat => {
    computersByName.set(stat.key, {
      name: stat.key,
      sampled: {
        minEventTime: new Date(stat.minEventTime.value),
        maxEventTime: new Date(stat.maxEventTime.value),
        minReceivedTime: new Date(stat.minReceivedTime.value),
        maxReceivedTime: new Date(stat.maxReceivedTime.value),
        count: stat.doc_count,
      }
    });
  });

  statsObj.lastDay[0].aggregations.byComputer.buckets.forEach(stat => {
    let computer = computersByName.get(stat.key);

    if(!computer) {
      computer = { name: stat.key };
      computersByName.set(stat.key, computer);
    }

    computer.lastDay = {
      minEventTime: new Date(stat.minEventTime.value),
      maxEventTime: new Date(stat.maxEventTime.value),
      minReceivedTime: new Date(stat.minReceivedTime.value),
      maxReceivedTime: new Date(stat.maxReceivedTime.value),
      eventsPerSecond: stat.doc_count / ((stat.maxEventTime.value - stat.minEventTime.value) * 0.001),
      count: stat.doc_count,
    };
  });

  $scope.stats = computersByName.values();
  $scope.stats.sort((a, b) => d3.descending(a.sampled && a.sampled.count || a.lastDay.count, b.sampled && b.sampled.count || b.lastDay.count));

});

module.controller('views.logs.wsa.search', function LogWsaSearchController($scope, $routeParams, $route, $log, app, $location, $timeout, alerts) {
  $scope.searchString = null;
  $scope.shadowSearchString = '';
  $scope.page = 1;
  $scope.pageCount = 0;
  $scope.selectedReportingIp = null;
  $scope.searchPerformed = false;
  $scope.sortProp = 'time';
  $scope.sortOrder = 'desc';
  $scope.displaySortProp = 'time';
  $scope.displaySortOrder = 'desc';
  var ITEMS_PER_PAGE = 50;
  var _lastSearch = null;

  const defaultColumnList = ['time', 'clientIp', 'samName', 'category', 'fqdn', 'method', 'url', 'responseCode', 'mimeType', 'avc.appName', 'avc.appType'];

  $scope.columnList = defaultColumnList.slice();

  $scope.defaultColumnsForSelection = d3.nest()
    .key(col => col.category)
    .entries(logColumns.wsaColumns);
  $scope.availableColumns = d3.set();

  $scope.removeColumn = function removeColumn(name) {
    $scope.columnList = $scope.columnList.filter(a => a !== name);
    updateColumnList();
  };

  $scope.addColumn = function addColumn(name) {
    const column = logColumns.wsaColumnsByName.get(name);

    if(column) {
      let found = false;

      for(let i = column.index - 1; !found && i >= 0; i--) {
        if($scope.columnSet.has(logColumns.wsaColumns[i].name)) {
          // We have this column already, insert our new column after it
          found = true;
          $scope.columnList.splice($scope.columnList.indexOf(logColumns.wsaColumns[i].name) + 1, 0, name);
        }
      }

      if(!found)
        $scope.columnList.splice(0, 0, name);
    }
    else {
      $scope.columnList.push(name);
    }

    updateColumnList();
  };

  $scope.moveColumnLeft = function moveColumnLeft(index) {
    $scope.columnList.splice(index - 1, 2, $scope.columnList[index], $scope.columnList[index - 1]);
    updateColumnList();
  };

  $scope.moveColumnRight = function moveColumnRight(index) {
    $scope.moveColumnLeft(index + 1);
  };

  $scope.updateFromColumnString = function updateFromColumnString() {
    $scope.columnList = $scope.shadowColumnString.split(/\s+/g).map(a => a.trim());
    updateColumnList();
  };

  function updateColumnList() {
    $scope.columnList = $scope.columnList.filter(name => logColumns.wsaColumnsByName.has(name));
    $scope.shadowColumnString = $scope.columnList.join(' ');
    $scope.columnSet = d3.set($scope.columnList);
    $scope.tableColumns = $scope.columnList.map(name => logColumns.wsaColumnsByName.get(name));

    $location.search('cols', (defaultColumnList.join(',') === $scope.columnList.join(',')) ? null : $scope.columnList.join(','));
  }

  function pullRouteUpdate() {
    const colsList = $location.search()['cols'];

    if(colsList) {
      $scope.columnList = colsList.split(',');
    }

    updateColumnList();

    $scope.commitSearch({
      newSearch: $location.search()['q'] || '',
      page: parseInt($location.search()['page']) || 1,
      sortProp: $location.search()['sort'] || 'time',
      sortOrder: $location.search()['order'] || 'desc',
      forceRefresh: false});
  }

  $scope.commitSearchDelay = function() {
    $timeout(function() {
      $scope.commitSearch({page: 1});
    }, 1);
  };

  $scope.commitSearch = function commitSearch(options) {
    options = options || {};
    var newSearch = options.newSearch || $scope.shadowSearchString;
    var forceRefresh = (options.forceRefresh === undefined) ? true : options.forceRefresh;

    $scope.searchString = newSearch;
    $scope.shadowSearchString = $scope.searchString;
    $scope.page = options.page || $scope.page;
    $scope.sortOrder = options.sortOrder || $scope.sortOrder;
    $scope.sortProp = options.sortProp || $scope.sortProp;
    $location.search('q', (newSearch === '') ? null : newSearch);
    $location.search('page', ($scope.page === 1) ? null : $scope.page);
    $location.search('sort', ($scope.sortProp === 'time') ? null : $scope.sortProp);
    $location.search('order', ($scope.sortOrder === 'desc') ? null : $scope.sortOrder);

    $scope.setTitle(newSearch + ' - WSA log search');

    fetchResults(forceRefresh);

    if($scope.searchForm)
      $scope.searchForm.$setPristine();
  };

  $scope.$on('timeRangeChanged', pullRouteUpdate);
  $scope.$on('$routeUpdate', pullRouteUpdate);
  $scope.$on('user/settingsChanged', pullRouteUpdate);

  if(!$scope.settings.defaultSettings) {
    // The settings have already been loaded, pull the route
    pullRouteUpdate();
  }

  function fetchResults(forceRefresh) {
    var q = $scope.searchString && $scope.searchString.trim() || '';

    if(!q.length) {
      $scope.searchResults = null;
      $scope.graphData = null;
      $scope.searchPerformed = false;
      _lastSearch = null;
      return;
    }

    var queryParams = {
      q: q,
      start: $scope.timeRange.start,
      end: $scope.timeRange.end,
      size: ITEMS_PER_PAGE,
      from: ($scope.page - 1) * ITEMS_PER_PAGE,
      sortProp: $scope.sortProp,
      sortOrder: $scope.sortOrder,
    };

    if(angular.equals(_lastSearch, queryParams) && !forceRefresh) {
      return;
    }

    _lastSearch = queryParams;
    $scope.loading = true;
    $scope.searchPerformed = true;

    app.logs.searchWsaLogs(queryParams).then(
      function(resp) {
        $scope.totalHits = resp.hits.total;
        $scope.pageCount = Math.ceil(resp.hits.total / ITEMS_PER_PAGE);

        resp.hits.hits.forEach(function(hit) {
          hit._source.log.eventTime = hit._source.log.eventTime && new Date(hit._source.log.eventTime);
          hit._source.log.receivedTime = hit._source.log.receivedTime && new Date(hit._source.log.receivedTime);
        });

        // Compute the possible columns from the result set
        $scope.availableColumns = d3.set(logColumns.wsaColumns
          .map(col => resp.hits.hits.some(row => col.getter(row) !== undefined) ? col.name : null)
          .filter(v => v));

        $scope.displaySortProp = queryParams.sortProp;
        $scope.displaySortOrder = queryParams.sortOrder;
        $scope.searchResults = resp;
        $scope.loading = false;
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.loading = false;
      }
    );
  }

  $scope.setTimeRangeActive();
  $scope.setTitle('WSA log search');
  $scope.searchResults = null;

  function appendTerm(symbol, type, term) {
    var result = (symbol || '') + (type ? (type + ':') : '') + logColumns.quoteTerm(term);

    $scope.shadowSearchString += ' ' + result;
  }

  $scope.addTerm = function addTerm(type, term) {
    appendTerm('+', type, term);
  };

  $scope.removeTerm = function removeTerm(type, term) {
    appendTerm('-', type, term);
  };
});

module.controller('views.logs.cylance.search', function LogCylanceSearchController($scope, $routeParams, $route, $log, app, $location, $timeout, alerts) {
  $scope.searchString = null;
  $scope.shadowSearchString = '';
  $scope.page = 1;
  $scope.pageCount = 0;
  $scope.selectedReportingIp = null;
  $scope.searchPerformed = false;
  $scope.sortProp = 'time';
  $scope.sortOrder = 'desc';
  $scope.displaySortProp = 'time';
  $scope.displaySortOrder = 'desc';
  var ITEMS_PER_PAGE = 50;
  var _lastSearch = null;

  const defaultColumnList = ['time', 'eventType', 'eventName', 'message'];

  $scope.columnList = defaultColumnList.slice();

  $scope.defaultColumnsForSelection = d3.nest()
    .key(col => col.category)
    .entries(logColumns.cylanceColumns);
  $scope.availableColumns = d3.set();

  $scope.removeColumn = function removeColumn(name) {
    $scope.columnList = $scope.columnList.filter(a => a !== name);
    updateColumnList();
  };

  $scope.addColumn = function addColumn(name) {
    const column = logColumns.cylanceColumnsByName.get(name);

    if(column) {
      let found = false;

      for(let i = column.index - 1; !found && i >= 0; i--) {
        if($scope.columnSet.has(logColumns.cylanceColumns[i].name)) {
          // We have this column already, insert our new column after it
          found = true;
          $scope.columnList.splice($scope.columnList.indexOf(logColumns.cylanceColumns[i].name) + 1, 0, name);
        }
      }

      if(!found)
        $scope.columnList.splice(0, 0, name);
    }
    else {
      $scope.columnList.push(name);
    }

    updateColumnList();
  };

  $scope.moveColumnLeft = function moveColumnLeft(index) {
    $scope.columnList.splice(index - 1, 2, $scope.columnList[index], $scope.columnList[index - 1]);
    updateColumnList();
  };

  $scope.moveColumnRight = function moveColumnRight(index) {
    $scope.moveColumnLeft(index + 1);
  };

  $scope.updateFromColumnString = function updateFromColumnString() {
    $scope.columnList = $scope.shadowColumnString.split(/\s+/g).map(a => a.trim());
    updateColumnList();
  };

  function updateColumnList() {
    $scope.shadowColumnString = $scope.columnList.join(' ');
    $scope.columnSet = d3.set($scope.columnList);
    $scope.tableColumns = $scope.columnList.map(function(name) {
      return logColumns.cylanceColumnsByName.get(name);
    });

    $location.search('cols', (defaultColumnList.join(',') === $scope.columnList.join(',')) ? null : $scope.columnList.join(','));
  }

  function pullRouteUpdate() {
    const colsList = $location.search()['cols'];

    if(colsList) {
      $scope.columnList = colsList.split(',');
    }

    updateColumnList();

    $scope.commitSearch({
      newSearch: $location.search()['q'] || '',
      page: parseInt($location.search()['page']) || 1,
      sortProp: $location.search()['sort'] || 'time',
      sortOrder: $location.search()['order'] || 'desc',
      forceRefresh: false});
  }

  $scope.commitSearchDelay = function() {
    $timeout(function() {
      $scope.commitSearch({page: 1});
    }, 1);
  };

  $scope.commitSearch = function commitSearch(options) {
    options = options || {};
    var newSearch = options.newSearch || $scope.shadowSearchString;
    var forceRefresh = (options.forceRefresh === undefined) ? true : options.forceRefresh;

    $scope.searchString = newSearch;
    $scope.shadowSearchString = $scope.searchString;
    $scope.page = options.page || $scope.page;
    $scope.sortOrder = options.sortOrder || $scope.sortOrder;
    $scope.sortProp = options.sortProp || $scope.sortProp;
    $location.search('q', (newSearch === '') ? null : newSearch);
    $location.search('page', ($scope.page === 1) ? null : $scope.page);
    $location.search('sort', ($scope.sortProp === 'time') ? null : $scope.sortProp);
    $location.search('order', ($scope.sortOrder === 'desc') ? null : $scope.sortOrder);

    $scope.setTitle(newSearch + ' - Windows event log search');

    fetchResults(forceRefresh);

    if($scope.searchForm)
      $scope.searchForm.$setPristine();
  };

  $scope.$on('timeRangeChanged', pullRouteUpdate);
  $scope.$on('$routeUpdate', pullRouteUpdate);
  $scope.$on('user/settingsChanged', pullRouteUpdate);

  if(!$scope.settings.defaultSettings) {
    // The settings have already been loaded, pull the route
    pullRouteUpdate();
  }

  function fetchResults(forceRefresh) {
    var q = $scope.searchString && $scope.searchString.trim() || '';

    if(!q.length) {
      $scope.searchResults = null;
      $scope.graphData = null;
      $scope.searchPerformed = false;
      _lastSearch = null;
      return;
    }

    var queryParams = {
      q: q,
      start: $scope.timeRange.start,
      end: $scope.timeRange.end,
      size: ITEMS_PER_PAGE,
      from: ($scope.page - 1) * ITEMS_PER_PAGE,
      sortProp: $scope.sortProp,
      sortOrder: $scope.sortOrder,
    };

    if(angular.equals(_lastSearch, queryParams) && !forceRefresh) {
      return;
    }

    _lastSearch = queryParams;
    $scope.loading = true;
    $scope.searchPerformed = true;

    app.logs.searchCylanceLogs(queryParams).then(
      function(resp) {
        $scope.totalHits = resp.hits.total;
        $scope.pageCount = Math.ceil(resp.hits.total / ITEMS_PER_PAGE);

        resp.hits.hits.forEach(function(hit) {
          hit._source.log.eventTime = hit._source.log.eventTime && new Date(hit._source.log.eventTime);
          hit._source.log.receivedTime = hit._source.log.receivedTime && new Date(hit._source.log.receivedTime);
        });

        // Compute the possible columns from the result set
        $scope.availableColumns = d3.set(logColumns.cylanceColumns
          .map(col => resp.hits.hits.some(row => col.getter(row) !== undefined) ? col.name : null)
          .filter(v => v));

        $scope.displaySortProp = queryParams.sortProp;
        $scope.displaySortOrder = queryParams.sortOrder;
        $scope.searchResults = resp;
        $scope.loading = false;
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.loading = false;
      }
    );
  }

  $scope.setTimeRangeActive();
  $scope.setTitle('Cylance log search');
  $scope.searchResults = null;

  function appendTerm(symbol, type, term) {
    var result = (symbol || '') + (type ? (type + ':') : '') + logColumns.quoteTerm(term);

    $scope.shadowSearchString += ' ' + result;
  }

  $scope.addTerm = function addTerm(type, term) {
    appendTerm('+', type, term);
  };

  $scope.removeTerm = function removeTerm(type, term) {
    appendTerm('-', type, term);
  };
});

module.controller('views.logs.cylance.entry', function LogCylanceEntryController($scope, cylanceEntry, $log, alerts) {
  $scope.setTitle('Cylance');
  $scope.entry = cylanceEntry._source;
  $scope.entry.log.eventTime = $scope.entry.log.eventTime && new Date($scope.entry.log.eventTime);
  $scope.entry.log.receivedTime = $scope.entry.log.receivedTime && new Date($scope.entry.log.receivedTime);

  function arrayify(v) {
    if(!v)
      return v;

    if(angular.isArray(v))
      return v;

    return [v];
  }

  $scope.entry.cylance.ip = arrayify($scope.entry.cylance.ip);
  $scope.entry.cylance.zone = arrayify($scope.entry.cylance.zone);
  $scope.entry.cylance.deviceName = arrayify($scope.entry.cylance.deviceName);
});

module.controller('views.logs.sql.search', function LogSqlSearchController($scope, $routeParams, $route, $log, app, $location, $timeout, alerts) {
  $scope.searchString = null;
  $scope.shadowSearchString = '';
  $scope.page = 1;
  $scope.pageCount = 0;
  $scope.selectedReportingIp = null;
  $scope.searchPerformed = false;
  $scope.sortProp = 'time';
  $scope.sortOrder = 'desc';
  $scope.displaySortProp = 'time';
  $scope.displaySortOrder = 'desc';
  $scope.formatMessages = true;
  var ITEMS_PER_PAGE = 50;
  var _lastSearch = null;

  const defaultColumnList = ['time', 'SPID', 'HostName', 'LoginName', 'ApplicationName', 'text'];

  $scope.columnList = defaultColumnList.slice();

  $scope.defaultColumnsForSelection = d3.nest()
    .key(col => col.category)
    .entries(logColumns.sqlColumns);
  $scope.availableColumns = d3.set();

  $scope.removeColumn = function removeColumn(name) {
    $scope.columnList = $scope.columnList.filter(a => a !== name);
    updateColumnList();
  };

  $scope.addColumn = function addColumn(name) {
    const column = logColumns.sqlColumnsByName.get(name);

    if(column) {
      let found = false;

      for(let i = column.index - 1; !found && i >= 0; i--) {
        if($scope.columnSet.has(logColumns.sqlColumns[i].name)) {
          // We have this column already, insert our new column after it
          found = true;
          $scope.columnList.splice($scope.columnList.indexOf(logColumns.sqlColumns[i].name) + 1, 0, name);
        }
      }

      if(!found)
        $scope.columnList.splice(0, 0, name);
    }
    else {
      $scope.columnList.push(name);
    }

    updateColumnList();
  };

  $scope.moveColumnLeft = function moveColumnLeft(index) {
    $scope.columnList.splice(index - 1, 2, $scope.columnList[index], $scope.columnList[index - 1]);
    updateColumnList();
  };

  $scope.moveColumnRight = function moveColumnRight(index) {
    $scope.moveColumnLeft(index + 1);
  };

  $scope.updateFromColumnString = function updateFromColumnString() {
    $scope.columnList = $scope.shadowColumnString.split(/\s+/g).map(a => a.trim());
    updateColumnList();
  };

  function updateColumnList() {
    $scope.columnList = $scope.columnList.filter(name => logColumns.sqlColumnsByName.has(name));
    $scope.shadowColumnString = $scope.columnList.join(' ');
    $scope.columnSet = d3.set($scope.columnList);
    $scope.tableColumns = $scope.columnList.map(function(name) {
      return logColumns.sqlColumnsByName.get(name) ||
        new logColumns.DefaultColumn(name, null, name, null, d => d._source.sql[name], { searchable: false, sortable: false });
    });

    $location.search('cols', (defaultColumnList.join(',') === $scope.columnList.join(',')) ? null : $scope.columnList.join(','));
  }

  function pullRouteUpdate() {
    const colsList = $location.search()['cols'];

    if(colsList) {
      $scope.columnList = colsList.split(',');
    }

    updateColumnList();

    $scope.commitSearch({
      newSearch: $location.search()['q'] || '',
      page: parseInt($location.search()['page']) || 1,
      sortProp: $location.search()['sort'] || 'time',
      sortOrder: $location.search()['order'] || 'desc',
      forceRefresh: false});
  }

  $scope.commitSearchDelay = function() {
    $timeout(function() {
      $scope.commitSearch({page: 1});
    }, 1);
  };

  $scope.commitSearch = function commitSearch(options) {
    options = options || {};
    var newSearch = options.newSearch || $scope.shadowSearchString;
    var forceRefresh = (options.forceRefresh === undefined) ? true : options.forceRefresh;

    $scope.searchString = newSearch;
    $scope.shadowSearchString = $scope.searchString;
    $scope.page = options.page || $scope.page;
    $scope.sortOrder = options.sortOrder || $scope.sortOrder;
    $scope.sortProp = options.sortProp || $scope.sortProp;
    $location.search('q', (newSearch === '') ? null : newSearch);
    $location.search('page', ($scope.page === 1) ? null : $scope.page);
    $location.search('sort', ($scope.sortProp === 'time') ? null : $scope.sortProp);
    $location.search('order', ($scope.sortOrder === 'desc') ? null : $scope.sortOrder);

    $scope.setTitle(newSearch + ' - SQL log search');

    fetchResults(forceRefresh);

    if($scope.searchForm)
      $scope.searchForm.$setPristine();
  };

  $scope.$on('timeRangeChanged', pullRouteUpdate);
  $scope.$on('$routeUpdate', pullRouteUpdate);
  $scope.$on('user/settingsChanged', pullRouteUpdate);

  if(!$scope.settings.defaultSettings) {
    // The settings have already been loaded, pull the route
    pullRouteUpdate();
  }

  function fetchResults(forceRefresh) {
    var q = $scope.searchString && $scope.searchString.trim() || '';

    if(!q.length) {
      $scope.searchResults = null;
      $scope.graphData = null;
      $scope.searchPerformed = false;
      _lastSearch = null;
      return;
    }

    var queryParams = {
      q: q,
      start: $scope.timeRange.start,
      end: $scope.timeRange.end,
      size: ITEMS_PER_PAGE,
      from: ($scope.page - 1) * ITEMS_PER_PAGE,
      sortProp: $scope.sortProp,
      sortOrder: $scope.sortOrder,
    };

    if(angular.equals(_lastSearch, queryParams) && !forceRefresh) {
      return;
    }

    _lastSearch = queryParams;
    $scope.loading = true;
    $scope.searchPerformed = true;

    app.logs.searchSqlLogs(queryParams).then(
      function(resp) {
        $scope.totalHits = resp.hits.total;
        $scope.pageCount = Math.ceil(resp.hits.total / ITEMS_PER_PAGE);

        resp.hits.hits.forEach(function(hit) {
          hit._source.log.eventTime = hit._source.log.eventTime && new Date(hit._source.log.eventTime);
          hit._source.log.receivedTime = hit._source.log.receivedTime && new Date(hit._source.log.receivedTime);
        });

        // Compute the possible columns from the result set
        $scope.availableColumns = d3.set(logColumns.sqlColumns
          .map(col => resp.hits.hits.some(row => col.getter(row) !== undefined) ? col.name : null)
          .filter(v => v));

        $scope.displaySortProp = queryParams.sortProp;
        $scope.displaySortOrder = queryParams.sortOrder;
        $scope.searchResults = resp;
        $scope.loading = false;
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.loading = false;
      }
    );
  }

  $scope.setTimeRangeActive();
  $scope.setTitle('SQL log search');
  $scope.searchResults = null;

  function appendTerm(symbol, type, term) {
    var result = (symbol || '') + (type ? (type + ':') : '') + logColumns.quoteTerm(term);

    $scope.shadowSearchString += ' ' + result;
  }

  $scope.addTerm = function addTerm(type, term) {
    appendTerm('+', type, term);
  };

  $scope.removeTerm = function removeTerm(type, term) {
    appendTerm('-', type, term);
  };
});

module.controller('views.logs.sql.entry', function LogSqlEntryController($scope, sqlEntry, $log, alerts) {
  $scope.setTitle('SQL');
  $scope.entry = sqlEntry._source;
  $scope.entry.log.eventTime = $scope.entry.log.eventTime && new Date($scope.entry.log.eventTime);
  $scope.entry.log.receivedTime = $scope.entry.log.receivedTime && new Date($scope.entry.log.receivedTime);

  function arrayify(v) {
    if(!v)
      return v;

    if(angular.isArray(v))
      return v;

    return [v];
  }

/*  $scope.entry.cylance.ip = arrayify($scope.entry.cylance.ip);
  $scope.entry.cylance.zone = arrayify($scope.entry.cylance.zone);
  $scope.entry.cylance.deviceName = arrayify($scope.entry.cylance.deviceName);*/
});

module.controller('views.logs.syslog.search', function LogSyslogSearchController($scope, $routeParams, $route, $log, app, $location, $timeout, alerts) {
  $scope.searchString = null;
  $scope.shadowSearchString = '';
  $scope.page = 1;
  $scope.pageCount = 0;
  $scope.selectedReportingIp = null;
  $scope.searchPerformed = false;
  $scope.sortProp = 'time';
  $scope.sortOrder = 'desc';
  $scope.displaySortProp = 'time';
  $scope.displaySortOrder = 'desc';
  $scope.formatMessages = true;
  var ITEMS_PER_PAGE = 50;
  var _lastSearch = null;

  const defaultColumnList = ['time', 'reportingIp', 'message'];

  $scope.columnList = defaultColumnList.slice();

  $scope.defaultColumnsForSelection = d3.nest()
    .key(col => col.category)
    .entries(logColumns.syslogColumns);
  $scope.availableColumns = d3.set();

  $scope.removeColumn = function removeColumn(name) {
    $scope.columnList = $scope.columnList.filter(a => a !== name);
    updateColumnList();
  };

  $scope.addColumn = function addColumn(name) {
    const column = logColumns.syslogColumnsByName.get(name);

    if(column) {
      let found = false;

      for(let i = column.index - 1; !found && i >= 0; i--) {
        if($scope.columnSet.has(logColumns.syslogColumns[i].name)) {
          // We have this column already, insert our new column after it
          found = true;
          $scope.columnList.splice($scope.columnList.indexOf(logColumns.syslogColumns[i].name) + 1, 0, name);
        }
      }

      if(!found)
        $scope.columnList.splice(0, 0, name);
    }
    else {
      $scope.columnList.push(name);
    }

    updateColumnList();
  };

  $scope.moveColumnLeft = function moveColumnLeft(index) {
    $scope.columnList.splice(index - 1, 2, $scope.columnList[index], $scope.columnList[index - 1]);
    updateColumnList();
  };

  $scope.moveColumnRight = function moveColumnRight(index) {
    $scope.moveColumnLeft(index + 1);
  };

  $scope.updateFromColumnString = function updateFromColumnString() {
    $scope.columnList = $scope.shadowColumnString.split(/\s+/g).map(a => a.trim());
    updateColumnList();
  };

  function updateColumnList() {
    $scope.columnList = $scope.columnList.filter(name => logColumns.syslogColumnsByName.has(name));
    $scope.shadowColumnString = $scope.columnList.join(' ');
    $scope.columnSet = d3.set($scope.columnList);
    $scope.tableColumns = $scope.columnList.map(function(name) {
      return logColumns.syslogColumnsByName.get(name);
    });

    $location.search('cols', (defaultColumnList.join(',') === $scope.columnList.join(',')) ? null : $scope.columnList.join(','));
  }

  function pullRouteUpdate() {
    const colsList = $location.search()['cols'];

    if(colsList) {
      $scope.columnList = colsList.split(',');
    }

    updateColumnList();

    $scope.commitSearch({
      newSearch: $location.search()['q'] || '',
      page: parseInt($location.search()['page']) || 1,
      sortProp: $location.search()['sort'] || 'time',
      sortOrder: $location.search()['order'] || 'desc',
      forceRefresh: false});
  }

  $scope.commitSearchDelay = function() {
    $timeout(function() {
      $scope.commitSearch({page: 1});
    }, 1);
  };

  $scope.commitSearch = function commitSearch(options) {
    options = options || {};
    var newSearch = options.newSearch || $scope.shadowSearchString;
    var forceRefresh = (options.forceRefresh === undefined) ? true : options.forceRefresh;

    $scope.searchString = newSearch;
    $scope.shadowSearchString = $scope.searchString;
    $scope.page = options.page || $scope.page;
    $scope.sortOrder = options.sortOrder || $scope.sortOrder;
    $scope.sortProp = options.sortProp || $scope.sortProp;
    $location.search('q', (newSearch === '') ? null : newSearch);
    $location.search('page', ($scope.page === 1) ? null : $scope.page);
    $location.search('sort', ($scope.sortProp === 'time') ? null : $scope.sortProp);
    $location.search('order', ($scope.sortOrder === 'desc') ? null : $scope.sortOrder);

    $scope.setTitle(newSearch + ' - Syslog search');

    fetchResults(forceRefresh);

    if($scope.searchForm)
      $scope.searchForm.$setPristine();
  };

  $scope.$on('timeRangeChanged', pullRouteUpdate);
  $scope.$on('$routeUpdate', pullRouteUpdate);
  $scope.$on('user/settingsChanged', pullRouteUpdate);

  if(!$scope.settings.defaultSettings) {
    // The settings have already been loaded, pull the route
    pullRouteUpdate();
  }

  function fetchResults(forceRefresh) {
    var q = $scope.searchString && $scope.searchString.trim() || '';

    if(!q.length) {
      $scope.searchResults = null;
      $scope.graphData = null;
      $scope.searchPerformed = false;
      _lastSearch = null;
      return;
    }

    var queryParams = {
      q: q,
      start: $scope.timeRange.start,
      end: $scope.timeRange.end,
      size: ITEMS_PER_PAGE,
      from: ($scope.page - 1) * ITEMS_PER_PAGE,
      sortProp: $scope.sortProp,
      sortOrder: $scope.sortOrder,
    };

    if(angular.equals(_lastSearch, queryParams) && !forceRefresh) {
      return;
    }

    _lastSearch = queryParams;
    $scope.loading = true;
    $scope.searchPerformed = true;

    app.logs.searchSyslogLogs(queryParams).then(
      function(resp) {
        $scope.totalHits = resp.hits.total;
        $scope.pageCount = Math.ceil(resp.hits.total / ITEMS_PER_PAGE);

        resp.hits.hits.forEach(function(hit) {
          hit._source.log.eventTime = hit._source.log.eventTime && new Date(hit._source.log.eventTime);
          hit._source.log.receivedTime = hit._source.log.receivedTime && new Date(hit._source.log.receivedTime);
        });

        // Compute the possible columns from the result set
        $scope.availableColumns = d3.set(logColumns.syslogColumns
          .map(col => resp.hits.hits.some(row => col.getter(row) !== undefined) ? col.name : null)
          .filter(v => v));

        $scope.displaySortProp = queryParams.sortProp;
        $scope.displaySortOrder = queryParams.sortOrder;
        $scope.searchResults = resp;
        $scope.loading = false;
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.loading = false;
      }
    );
  }

  $scope.setTimeRangeActive();
  $scope.setTitle('SQL log search');
  $scope.searchResults = null;

  function appendTerm(symbol, type, term) {
    var result = (symbol || '') + (type ? (type + ':') : '') + logColumns.quoteTerm(term);

    $scope.shadowSearchString += ' ' + result;
  }

  $scope.addTerm = function addTerm(type, term) {
    appendTerm('+', type, term);
  };

  $scope.removeTerm = function removeTerm(type, term) {
    appendTerm('-', type, term);
  };
});
