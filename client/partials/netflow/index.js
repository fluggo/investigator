'use strict';

var angular = require('angular');
var module = angular.module('investigator');
var d3 = require('d3');

module.directive('netflowGraph', function factory($log, $location, $sniffer, $parse, app) {
  var lastId = 0;

  function timeFormat(formats) {
    return function(date) {
      var i = formats.length - 1, f = formats[i];
      while(!f[1](date)) f = formats[--i];
      return f[0](date);
    };
  }

  var customTimeFormat = timeFormat([
    [d3.timeFormat("%Y"), function() { return true; }],
    [d3.timeFormat("%B"), function(d) { return d.getMonth(); }],
    [d3.timeFormat("%b %-d"), function(d) { return d.getDate() !== 1; }],
    [d3.timeFormat("%a %-d"), function(d) { return d.getDay() && d.getDate() !== 1; }],
    [d3.timeFormat("%-I %p"), function(d) { return d.getHours(); }],
    [d3.timeFormat("%-I:%M"), function(d) { return d.getMinutes(); }],
    [d3.timeFormat(":%S"), function(d) { return d.getSeconds(); }],
    [d3.timeFormat(".%L"), function(d) { return d.getMilliseconds(); }]
  ]);

  return {
    restrict: 'A',

    link: function(scope, element, attrs) {
      var getData = $parse(attrs.data);
      var onTimePicked = attrs.onTimePicked && $parse(attrs.onTimePicked);
      //var getCurrentGraph = $parse(attrs.currentGraph);
      //var getTimeHighlightRange = attrs.timeHighlightRange && $parse(attrs.timeHighlightRange);

      var id = ++lastId;
      var _neverSized = true;

      var margin = {top: 0, right: 0, bottom: 30, left: 90};

      var padding = 0;
      var svg = d3.select(element[0]);

      function getSize() {
        return {
          width: (svg.node().clientWidth || svg.node().parentNode.clientWidth) - margin.left - margin.right,
          height: (svg.node().clientHeight || svg.node().parentNode.clientHeight) - margin.top - margin.bottom
        };
      }

      var size = getSize();

      var x = d3.scaleTime().range([0, size.width]);
      var y = d3.scaleLinear().range([size.height, 0]).clamp(true);
      var xAxis = d3.axisBottom(x).ticks(4).tickFormat(customTimeFormat),
        yAxis = d3.axisLeft(y).ticks(4).tickFormat(function(v) { return app.formatBps(v, 1); });

      // Set a custom format function for negative values
      var formatInteger = d3.format(',d');
      var formatTwoDigits = d3.format(',.2f');

      //yAxis.tickFormat(formatDollarPrice);

      // Establish the drawing order: background, grid lines, data, axes
      var defs = svg.append('defs');

      var chartArea = svg.append('g')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

      var chart = chartArea.append('g').attr('class', 'bars');

      chartArea.append('g').attr('class', 'x axis visible').attr('transform', 'translate(0,' + size.height + ')').call(xAxis);
      chartArea.append('g').attr('class', 'y axis visible').call(yAxis);

      function regraph(resized) {
        var newData = getData(scope);
        //var currentGraph = getCurrentGraph(scope);

        if(!newData)
          return;

        var xdomain = d3.extent(newData, function(d) { return d.time; });

        xdomain[1] = d3.timeMinute.offset(xdomain[1], 1);

        x.domain(xdomain);

        var ydomain = d3.extent(newData, function(d) { return d.in_bytes.value * 8 / 60; });

        if(ydomain[0] === ydomain[1]) {
          yAxis.ticks(1);
          ydomain[0] -= 0.05;
          ydomain[1] += 0.05;
        }
        else {
          yAxis.ticks(5);
        }

        y.domain(ydomain);
        y.nice();

        var xrange = x.range();
        var yrange = y.range();

        if(resized || _neverSized) {
          _neverSized = false;

          size = getSize();
          svg.attr('viewBox', '0 0 ' + (size.width + margin.left + margin.right) + ' ' + (size.height + margin.top + margin.bottom));

          x.range([0, size.width]);
          y.range([size.height, 0]);
        }

        // Transition the axes
        var t = svg;//.transition().duration(250).ease('cubic-out');

        t.select('.x.axis.visible').call(xAxis);
        t.select('.y.axis.visible').call(yAxis);

        var barWidth = size.width / newData.length;

        var bars = chart.selectAll('rect')
          .data(newData);

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

        bars.enter().append('rect')
          .on('mouseenter', mouseenter)
          .on('mouseleave', mouseleave)
          .merge(bars)
            .attr('x', function(d) { return x(d.time); })
            .attr('y', function(d) { return y(d.in_bytes.value * 8 / 60); })
            .attr('width', function(d) { return barWidth; })
            .attr('height', function(d) { return y(0) - y(d.in_bytes.value * 8 / 60); })
        bars.exit().remove();
      }

      scope.$on('resize', function() {
        var newSize = getSize();

        if(newSize.width !== size.width || newSize.height !== size.height) {
          size = newSize;
          regraph(true);
        }
      });

      scope.$watch(attrs.data, function() {
        var newData = getData(scope);

        if(!newData || newData.length === 0)
          return;

        regraph(true);
      });
    }
  };
});

module.controller('views.netflow.search', function NetflowSearchController($scope, $routeParams, $route, $log, app, $location, $timeout, alerts, dialogService) {
  $scope.searchString = null;
  $scope.shadowSearchString = '';
  $scope.selectedReportingIp = null;
  $scope.searchPerformed = false;
  var _lastSearch = null;

  $scope.switchToGraph = function switchToGraph() {
    $location.path('netflow/raw-search');
    $route.reload();
  };

  $scope.handleEnter = function handleEnter(data) {
    $scope.highlightedData = data || $scope.searchResults.aggregations;
  };

  function pullRouteUpdate() {
    $scope.commitSearch({
      newSearch: $location.search()['q'] || '',
      reportingIp: $location.search()['src'] || null,
      forceRefresh: false});
  }

  $scope.commitSearchDelay = function() {
    $timeout(function() {
      $scope.commitSearch();
    }, 1);
  };

  $scope.commitSearch = function commitSearch(options) {
    options = options || {};
    var newSearch = options.newSearch || $scope.shadowSearchString;
    var newReportingIp = (options.reportingIp === undefined) ? $scope.selectedReportingIp : options.reportingIp;
    var forceRefresh = (options.forceRefresh === undefined) ? true : options.forceRefresh;

    $scope.searchString = newSearch;
    $scope.shadowSearchString = $scope.searchString;
    $scope.selectedReportingIp = newReportingIp;
    $location.search('q', (newSearch === '') ? null : newSearch);
    $location.search('src', newReportingIp);

    $scope.setTitle(newSearch + ' - Netflow search');

    fetchResults(forceRefresh);

    if($scope.searchForm)
      $scope.searchForm.$setPristine();
  };

  $scope.$on('timeRangeChanged', pullRouteUpdate);
  $scope.$on('$routeUpdate', pullRouteUpdate);
  $scope.$on('user/settingsChanged', pullRouteUpdate);

  function fetchResults(forceRefresh) {
    var q = $scope.searchString && $scope.searchString.trim() || '';

    if(!q.length) {
      $scope.searchResults = null;
      $scope.graphData = null;
      $scope.searchPerformed = false;
      _lastSearch = null;
      return;
    }

    var queryParams = {q: q, reportingIp: $scope.selectedReportingIp, start: $scope.timeRange.start, end: $scope.timeRange.end};

    if(angular.equals(_lastSearch, queryParams) && !forceRefresh) {
      return;
    }

    _lastSearch = queryParams;
    $scope.loading = true;
    $scope.searchPerformed = true;

    app.netflow.search(queryParams).then(
      function(resp) {
        //$log.log(resp);
        $scope.searchResults = resp;

        /*resp.hits.hits.forEach(function(hit) {
          hit._source['@timestamp'] = new Date(hit._source['@timestamp']);
        });*/

        $scope.graphData = resp.aggregations.by_time.buckets.forEach(function(bucket) {
          bucket.time = new Date(bucket.key);
        });

        resp.aggregations.packets_across_sources.global.by_reporting_ip.buckets.forEach(function(bucket) {
          bucket.label = bucket.key + ' (' + bucket.doc_count + ((bucket.doc_count === 1) ? ' flow)' : ' flows)');
        });

        $scope.loading = false;
        $scope.handleEnter(null);
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.loading = false;
      }
    );
  }

  $scope.setTimeRangeActive();
  $scope.setTitle('Netflow search');
  $scope.searchResults = null;

  $scope.openIpPopover = function(ip, $event) {
    var ipdata = {
      hosts: null,
      loading: true,
      error: null,
    };

    app.dns.reverse(ip).then(
      function(hosts) {
        ipdata.hosts = hosts;
        ipdata.loading = false;
      },
      function(err) {
        ipdata.loading = false;
        ipdata.error = err;
      }
    );

    dialogService.openPopover('hostlist', $event.currentTarget, {ipdata: ipdata});
  };

  $scope.closeIpPopover = function() {
    dialogService.close('hostlist');
  }
});

var protoNumbers = {
  '1': 'ICMP',
  '2': 'IGMP',
  '4': 'IPv4',
  '6': 'TCP',
  '17': 'UDP',
  '47': 'GRE',
  '88': 'EIGRP',
  '103': 'PIM',
};

function getIcmpMessage(type, code) {
  if(type === 0) {
    return 'Echo reply';
  }
  else if(type === 3) {
    if(type === 0)
      return 'Destination network unreachable';
    else if(type === 1)
      return 'Destination host unreachable';
    else if(type === 2)
      return 'Destination protocol unreachable';
    else if(type === 3)
      return 'Destination port unreachable';
    else if(type === 4)
      return 'Fragmentation required';
    else if(type === 5)
      return 'Source route failed';
    else if(type === 6)
      return 'Destination network unknown';
    else if(type === 7)
      return 'Destination host unknown';
    else if(type === 8)
      return 'Source host isolated';
    else if(type === 9)
      return 'Network administratively prohibited';
    else if(type === 10)
      return 'Host administratively prohibited';
    else
      return 'Unknown destination unreachable (code ' + code + ')';
  }
  else if(type === 8) {
    return 'Echo request';
  }
  else if(type === 9) {
    return 'Router advertisement';
  }
  else if(type === 10) {
    return 'Router solicitation';
  }
  else if(type === 11) {
    if(code === 0)
      return 'TTL expired in transit';
    else if(code === 1)
      return 'Fragment reassembly time exceeded';
  }
  else if(type === 12) {
    return 'Bad IP header (code ' + code + ')';
  }
  else if(type === 13) {
    return 'Timestamp';
  }
  else if(type === 14) {
    return 'Timestamp reply';
  }

  return null;
}

module.controller('views.netflow.raw-search', function NetflowRawSearchController($scope, $routeParams, $route, $log, app, $location, $timeout, alerts, dialogService) {
  $scope.searchString = null;
  $scope.shadowSearchString = '';
  $scope.page = 1;
  $scope.pageCount = 0;
  $scope.selectedReportingIp = null;
  $scope.searchPerformed = false;
  var ITEMS_PER_PAGE = 100;
  var _lastSearch = null;

  $scope.protoNumbers = protoNumbers;

  $scope.switchToGraph = function switchToGraph() {
    $location.path('netflow/search');
    $route.reload();
  };

  function pullRouteUpdate() {
    $scope.commitSearch({
      newSearch: $location.search()['q'] || '',
      page: parseInt($location.search()['page']) || 1,
      reportingIp: $location.search()['src'] || null,
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
    var newReportingIp = (options.reportingIp === undefined) ? $scope.selectedReportingIp : options.reportingIp;
    var forceRefresh = (options.forceRefresh === undefined) ? true : options.forceRefresh;

    $scope.searchString = newSearch;
    $scope.shadowSearchString = $scope.searchString;
    $scope.selectedReportingIp = newReportingIp;
    $scope.page = options.page || $scope.page;
    $location.search('q', (newSearch === '') ? null : newSearch);
    $location.search('src', newReportingIp);
    $location.search('page', ($scope.page === 1) ? null : $scope.page);

    $scope.setTitle(newSearch + ' - Netflow search');

    fetchResults(forceRefresh);

    if($scope.searchForm)
      $scope.searchForm.$setPristine();
  };

  $scope.$on('timeRangeChanged', pullRouteUpdate);
  $scope.$on('$routeUpdate', pullRouteUpdate);
  $scope.$on('user/settingsChanged', pullRouteUpdate);

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
      reportingIp: $scope.selectedReportingIp,
      start: $scope.timeRange.start,
      end: $scope.timeRange.end,
      size: ITEMS_PER_PAGE,
      from: ($scope.page - 1) * ITEMS_PER_PAGE
    };

    if(angular.equals(_lastSearch, queryParams) && !forceRefresh) {
      return;
    }

    _lastSearch = queryParams;
    $scope.loading = true;
    $scope.searchPerformed = true;

    app.netflow.rawSearch(queryParams).then(
      function(resp) {
        $scope.totalHits = resp.hits.total;
        $scope.pageCount = Math.ceil(resp.hits.total / ITEMS_PER_PAGE);

        $scope.packets = resp.hits.hits.map(function(hit) {
          hit = hit._source;
          hit.last_switched = new Date(hit.last_switched);
          hit.first_switched = new Date(hit.first_switched);
          hit.receivedTime = new Date(hit.receivedTime);

          if(hit.protocol === 1) {
            // Decode ICMP codes
            hit.icmpType = hit.l4_dst_port >> 8;
            hit.icmpCode = hit.l4_dst_port & 0xFF;

            hit.icmpMessage = getIcmpMessage(hit.icmpType, hit.icmpCode);
          }

          return hit;
        });

        resp.aggregations.packets_across_sources.global.by_reporting_ip.buckets.forEach(function(bucket) {
          bucket.label = bucket.key + ' (' + bucket.doc_count + ((bucket.doc_count === 1) ? ' flow)' : ' flows)');
        });

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
  $scope.setTitle('Netflow search');
  $scope.searchResults = null;

  $scope.openIpPopover = function(ip, $event) {
    var ipdata = {
      hosts: null,
      loading: true,
      error: null,
    };

    app.dns.reverse(ip).then(
      function(hosts) {
        ipdata.hosts = hosts;
        ipdata.loading = false;
      },
      function(err) {
        ipdata.loading = false;
        ipdata.error = err;
      }
    );

    dialogService.openPopover('hostlist', $event.currentTarget, {ipdata: ipdata});
  };

  $scope.closeIpPopover = function() {
    dialogService.close('hostlist');
  }
});

module.controller('views.netflow.health', function ClusterHealthController($scope, $routeParams, healthObj, $log, app, alerts, $timeout) {
  $scope.setTitle('Netflow health');
  $scope.healthObj = healthObj;

  var maxTime = d3.max(healthObj.aggregations.by_reporting_ip.buckets, function(d) { return d.max_length.value; });
  healthObj.aggregations.by_reporting_ip.buckets.forEach(function(bucket) {
    bucket.timeRatio = bucket.max_length.value / maxTime;
  });

  healthObj.aggregations.by_reporting_ip.buckets.sort(function(a, b) { return d3.descending(a.max_length.value, b.max_length.value); });
});

