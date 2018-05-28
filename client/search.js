'use strict';

const angular = require('angular');
const d3 = require('d3');

function compareStringsCI(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();

  if(a < b)
    return -1;

  if(a > b)
    return 1;

  return 0;
}

function escapeRegexp(str) {
  return str && str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
}

const angularModule = angular.module('investigator.Search', ['ngRoute']);

angularModule.service('SearchService', function SearchService($document) {
  const self = this;

  this.buildSearchTerms = function buildSearchTerms(searchText) {
    if(!searchText || !searchText.length)
      return [];

    return searchText.toLowerCase().split(/\s+/g);
  };

  this.inStringScore = function inStringScore(searchTerms, targetString, points) {
    // searchTerms: array of terms to look for
    // targetString: string to search
    // points: points this target is worth; e.g. a match on symbol is
    //    worth more than a match on manager
    var maxPoints = 0, term, i, index;
    targetString = targetString.toLowerCase();

    for(i = 0; i < searchTerms.length; i++) {
      term = searchTerms[i];
      index = targetString.indexOf(term);

      if(index === 0) {
        if(term.length === targetString.length) {
          // Exact match!
          maxPoints = Math.max(maxPoints, term.length * points * 10.0);
        }

        maxPoints = Math.max(maxPoints, term.length * points);
      }

      if(index > 0) {
        maxPoints = Math.max(maxPoints, term.length * points * 0.25);
      }
    }

    return maxPoints;
  };

  var MATCH_NONE = 0, MATCH_IN = 1, MATCH_TOP = 2, MATCH_FULL = 3;

  this.makeMatch = function makeMatch(searchTerms, name, target) {
    var result = {name: name, value: target, matchType: MATCH_NONE};
    target = target.toLowerCase();
    var term, i, index;

    for(i = 0; i < searchTerms.length; i++) {
      term = searchTerms[i];
      index = target.indexOf(term);

      if(index < 0)
        continue;

      result.matchStart = index;
      result.matchLength = term.length;

      if(index === 0) {
        if(term.length === target.length && result.matchType < MATCH_FULL)
          result.matchType = MATCH_FULL;

        if(result.matchType < MATCH_TOP)
          result.matchType = MATCH_TOP;
      }

      if(result.matchType < MATCH_IN)
        result.matchType = MATCH_IN;
    }

    return result;
  };

  function combineMatches(matches, separator) {
    // Produces sequences of bold/unbold text to render (paint-texts)
    var result = [];

    matches.forEach(function(match, index) {
      if(index !== 0 && separator)
        result.push({bold: false, text: separator});

      if(angular.isString(match)) {
        result.push({bold: false, text: match});
        return;
      }

      if(match.name)
        result.push({bold: false, text: match.name});

      if(match.value) {
        if(match.matchType) {
          result.push({bold: false, text: match.value.substring(0, match.matchStart)});
          result.push({bold: true, text: match.value.substring(match.matchStart, match.matchStart + match.matchLength)});
          result.push({bold: false, text: match.value.substring(match.matchStart + match.matchLength, match.value.length)});
        }
        else {
          result.push({bold: false, text: match.value});
        }
      }
    });

    return result;
  }

  var boldTemplate = $document[0].createElement('span');
  boldTemplate.setAttribute('class', 'bold');

  function coalescePaintTexts(paintTexts) {
    var result = [];
    var lastMatch = null;

    paintTexts.forEach(function(pt) {
      if(!pt.text || !pt.text.length)
        return;

      if(lastMatch) {
        if(lastMatch.bold === pt.bold) {
          lastMatch.text += pt.text;
        }
        else {
          result.push(lastMatch);
          lastMatch = pt;
        }
      }
      else {
        lastMatch = pt;
      }
    });

    if(lastMatch)
      result.push(lastMatch);

    return result;
  }

  function createLine(paintTexts) {
    // Creates a DIV with the given paintTexts
    paintTexts = coalescePaintTexts(paintTexts);

    var div = $document[0].createElement('div');

    paintTexts.forEach(function(pt) {
      var node = $document[0].createTextNode(pt.text);
      var boldNode;

      if(pt.bold) {
        boldNode = boldTemplate.cloneNode(false);
        boldNode.appendChild(node);
        node = boldNode;
      }

      div.appendChild(node);
    });

    return angular.element(div);
  }

  // makeBoldedLine: Creates a DIV containing bolded text (spans with the "bold" class)
  // based on the given matches.
  //
  //  matches: An array of strings (which will not be bolded) and matches (returned
  //    from makeMatch).
  //  separator: Optional string to place between items in *matches*.
  this.makeBoldedLine = function makeBoldedLine(matches, separator) {
    return createLine(combineMatches(matches, separator));
  };
});

angularModule.directive('quickSearch', function(SearchService, $log, $parse, $location, $document, $q, app) {
  return {
    scope: true,
    restrict: 'A',
    controller: function($scope, $attrs) {
      var MAX_COUNT = 40;
      var self = this;

      $scope.onSelect = $parse($attrs.onSelect);

      $scope.searchText = '';
      $scope.searchResults = null;
      $scope.highlightIndex = null;

      d3.select($document[0]).on('click', function() {
        $scope.$apply(function() {
          self.cancelSearch();
        });
      });

      this.highlightNext = function highlightNext(count) {
        if(!$scope.searchResults || !$scope.searchResults.length)
          return;

        if($scope.highlightIndex === null)
          $scope.highlightIndex = 0;
        else
          $scope.highlightIndex = Math.min($scope.highlightIndex + (count || 1), $scope.searchResults.length - 1);
      };

      this.highlightPrevious = function highlightPrevious(count) {
        if(!$scope.searchResults || !$scope.searchResults.length)
          return;

        if($scope.highlightIndex === null)
          $scope.highlightIndex = 0;
        else
          $scope.highlightIndex = Math.max($scope.highlightIndex - (count || 1), 0);
      };

      this.cancelSearch = function cancelSearch() {
        $scope.searchText = '';
      };

      this.commitSearch = function commitSearch(index) {
        if($scope.searchResults && $scope.searchResults.length) {
          $location.url($scope.searchResults[(index === undefined) ? $scope.highlightIndex : index].href);
        }

        $scope.searchText = '';
      };

      var timeoutPromise = null;

      $scope.$watch('searchText', function(searchText) {
        if(!searchText || !searchText.trim().length) {
          $scope.searchResults = null;
          return;
        }

        app.wiki.quickSearch(searchText).then(
          function(res) {
            if($scope.searchText !== searchText) {
              // No longer relevant
              return;
            }

            $scope.searchResults = res;
            $scope.highlightIndex = 0;
          },
          function(evt) {
            alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 2000);
            $scope.searchResults = null;
          }
        );
      });
    }
  };
});

angularModule.component('quickSearchList', {
  require: {
    quickSearch: '^quickSearch',
  },
  bindings: {
    highlightIndex: '<',
    searchResults: '<',
  },
  template: require('./template/quick-search-results.html'),
  controller: function($element, SearchService, $log) {
    var lastSearchResults = [];

    function runHighlights(index) {
      var rawElement = $element[0];
      var highlightedElement = d3.select(rawElement).nodes()[index];

      if(!highlightedElement)
        return;

      // Scroll into view
      if(highlightedElement.offsetTop + highlightedElement.offsetHeight > rawElement.scrollTop + rawElement.clientHeight) {
        // Scroll down
        rawElement.scrollTop = highlightedElement.offsetTop + highlightedElement.offsetHeight - rawElement.clientHeight;
      }
      else if(highlightedElement.offsetTop < rawElement.scrollTop) {
        // Scroll up
        rawElement.scrollTop = highlightedElement.offsetTop;
      }
    }

    this.commit = function(index) {
      this.quickSearch.commitSearch(index);
    }

    this.$onChanges = function $onChanges(changesObj) {
      if(changesObj.highlightIndex) {
        runHighlights(changesObj.highlightIndex.currentValue);
      }

      if(changesObj.searchResults) {
        this.lastSearchResults = changesObj.searchResults.currentValue;
        //$log.log(this.lastSearchResults);
        $element[0].scrollTop = 0;

        if(this.lastSearchResults) {
          // Produce matches and make divs
          this.lastSearchResults.forEach(function(row) {
            if(row.type === 'wiki-article') {
              row.icon = 'fa-sticky-note-o';
              row.typeText = 'Wiki article';
            }

            row.bottomText = [row.category, row.typeText].filter(function(t) { return t }).join(', ');
          });
        }
      }
    }
  }
});

angularModule.directive('quickSearchTextBox', function($parse, SearchService, $log) {
  return {
    restrict: 'A',
    require: '^quickSearch',
    link: function(scope, element, attrs, quickSearch) {
      element.bind('keydown', function(event) {
        scope.$apply(function() {
          // We require the DOM 3 level keyboard events, or at least a shim
          if(event.key === 'ArrowDown') {
            quickSearch.highlightNext();
            event.stopPropagation();
            event.preventDefault();
          }
          else if(event.key === 'ArrowUp') {
            quickSearch.highlightPrevious();
            event.stopPropagation();
            event.preventDefault();
          }
          else if(event.key === 'PageDown') {
            quickSearch.highlightNext(10);
            event.stopPropagation();
            event.preventDefault();
          }
          else if(event.key === 'PageUp') {
            quickSearch.highlightPrevious(10);
            event.stopPropagation();
            event.preventDefault();
          }
          else if(event.key === 'Escape') {
            quickSearch.cancelSearch();
            //element[0].blur();
            event.stopPropagation();
            event.preventDefault();
          }
          else if(event.key === 'Enter') {
            quickSearch.commitSearch();
            //element[0].blur();
            event.stopPropagation();
            event.preventDefault();
          }
        });
      });
    }
  };
});

angularModule.controller('view.logs.sql.details', function SqlLogDetailsController($scope, $routeParams, $location, $log, logItem) {
  $scope.hit = {_source: logItem};

  $scope.postTime = logItem.postTime && new Date(logItem.postTime);
  $scope.timestamp = logItem.timestamp && new Date(logItem.timestamp);

  if(logItem.eventType === 'DEADLOCK_GRAPH') {
    // Parse the DEADLOCK_GRAPH, which is XML, into something more friendly
    var parser = new DOMParser();
    var deadlockGraphXml = parser.parseFromString(logItem.textData, 'application/xml');

    var timeFormat = d3.time.format('%Y-%m-%dT%H:%M:%S.%L');
    var map = Array.prototype.map;

    $scope.deadlocks = map.call(deadlockGraphXml.documentElement.querySelectorAll('deadlock'), function(deadlockXml) {
      return {
        victim: deadlockXml.getAttribute('victim'),
        processes: map.call(deadlockXml.querySelector('process-list').childNodes, function(processXml) {
          return {
            id: processXml.getAttribute('id'),
            taskPriority: processXml.getAttribute('taskpriority') && +processXml.getAttribute('taskpriority'),
            logUsed: processXml.getAttribute('logused') && +processXml.getAttribute('logused'),
            waitResource: processXml.getAttribute('waitresource'),
            waitTime: processXml.getAttribute('waitTime') && +processXml.getAttribute('waitTime'),
            ownerId: processXml.getAttribute('ownerId'),
            transactionName: processXml.getAttribute('transactionname'),
            lastTransactionStarted: processXml.getAttribute('lasttranstarted') && timeFormat.parse(processXml.getAttribute('lasttranstarted')),
            xdes: processXml.getAttribute('XDES'),
            lockMode: processXml.getAttribute('lockMode'),
            schedulerId: processXml.getAttribute('schedulerid') && +processXml.getAttribute('schedulerid'),
            kpid: processXml.getAttribute('kpid') && +processXml.getAttribute('kpid'),
            status: processXml.getAttribute('status'),
            spid: processXml.getAttribute('spid') && +processXml.getAttribute('spid'),
            sbid: processXml.getAttribute('sbid') && +processXml.getAttribute('sbid'),
            ecid: processXml.getAttribute('ecid') && +processXml.getAttribute('ecid'),
            priority: processXml.getAttribute('priority') && +processXml.getAttribute('priority'),
            transactionCount: processXml.getAttribute('trancount') && +processXml.getAttribute('trancount'),
            lastBatchStarted: processXml.getAttribute('lastbatchstarted') && timeFormat.parse(processXml.getAttribute('lastbatchstarted')),
            lastBatchCompleted: processXml.getAttribute('lastbatchcompleted') && timeFormat.parse(processXml.getAttribute('lastbatchcompleted')),
            clientApp: processXml.getAttribute('clientapp'),
            hostname: processXml.getAttribute('hostname'),
            hostPid: processXml.getAttribute('hostpid') && +processXml.getAttribute('hostpid'),
            loginName: processXml.getAttribute('loginname'),
            isolationLevel: processXml.getAttribute('isolationlevel'),
            xactId: processXml.getAttribute('xactid') && +processXml.getAttribute('xactid'),
            currentDatabase: processXml.getAttribute('currentdb') && +processXml.getAttribute('currentdb'),
            lockTimeout: processXml.getAttribute('lockTimeout') && +processXml.getAttribute('lockTimeout'),
            clientOption1: processXml.getAttribute('clientoption1') && +processXml.getAttribute('clientoption1'),
            clientOption2: processXml.getAttribute('clientoption2') && +processXml.getAttribute('clientoption2'),
            executionStack: map.call(processXml.querySelector('executionStack').childNodes, function(frameXml) {
              return {
                procedureName: frameXml.getAttribute('procname'),
                line: +frameXml.getAttribute('line'),
                text: frameXml.textContent,
              };
            }),
            inputBuffer: processXml.querySelector('inputbuf').textContext,
          };
        }),
        resources: map.call(deadlockXml.querySelector('resource-list').childNodes, function(resourceXml) {
          if(resourceXml.nodeName === 'pagelock') {
            return {
              type: 'pagelock',
              fileId: +resourceXml.getAttribute('fileid'),
              pageId: +resourceXml.getAttribute('pageid'),
              dbid: +resourceXml.getAttribute('dbid'),
              objectName: resourceXml.getAttribute('objectname'),
              id: resourceXml.getAttribute('id'),
              mode: resourceXml.getAttribute('mode'),
              associatedObjectId: +resourceXml.getAttribute('associatedObjectId'),
              owners: map.call(resourceXml.querySelector('owner-list').childNodes, function(ownerNode) {
                return {
                  id: ownerNode.getAttribute('id'),
                  mode: ownerNode.getAttribute('mode'),
                };
              }),
              waiters: map.call(resourceXml.querySelector('waiter-list').childNodes, function(waiterNode) {
                return {
                  id: waiterNode.getAttribute('id'),
                  mode: waiterNode.getAttribute('mode'),
                  requestType: waiterNode.getAttribute('requestType'),
                };
              }),
            };
          }
          else if(resourceXml.nodeName === 'keylock') {
            return {
              type: 'keylock',
              hobtid: resourceXml.getAttribute('hobtid'),
              dbid: +resourceXml.getAttribute('dbid'),
              objectName: resourceXml.getAttribute('objectname'),
              indexName: resourceXml.getAttribute('indexname'),
              id: resourceXml.getAttribute('id'),
              mode: resourceXml.getAttribute('mode'),
              associatedObjectId: +resourceXml.getAttribute('associatedObjectId'),
              owners: map.call(resourceXml.querySelector('owner-list').childNodes, function(ownerNode) {
                return {
                  id: ownerNode.getAttribute('id'),
                  mode: ownerNode.getAttribute('mode'),
                };
              }),
              waiters: map.call(resourceXml.querySelector('waiter-list').childNodes, function(waiterNode) {
                return {
                  id: waiterNode.getAttribute('id'),
                  mode: waiterNode.getAttribute('mode'),
                  requestType: waiterNode.getAttribute('requestType'),
                };
              }),
            };
          }
          else {
            return {
              type: resourceXml.nodeName,
              owners: map.call(resourceXml.querySelector('owner-list').childNodes, function(ownerNode) {
                return {
                  id: ownerNode.getAttribute('id'),
                  mode: ownerNode.getAttribute('mode'),
                };
              }),
              waiters: map.call(resourceXml.querySelector('waiter-list').childNodes, function(waiterNode) {
                return {
                  id: waiterNode.getAttribute('id'),
                  mode: waiterNode.getAttribute('mode'),
                  requestType: waiterNode.getAttribute('requestType'),
                };
              }),
            };
          }
        })
      };
    });

  }

  if(logItem && logItem.textData) {
    if(logItem.eventType === 'DEADLOCK_GRAPH')
      $scope.setTitle('Deadlock - SQL Log Details');
    else
      $scope.setTitle(logItem.textData);
  }
  else {
    $scope.setTitle('SQL Log Details');
  }
});

angularModule.controller('view.codesearch', function CodeSearchController($scope, $routeParams, $location, tokenAuthHttp, $log, alerts, $document) {
  $scope.searchString = null;
  $scope.shadowSearchString = '';
  $scope.selected = {};
  var _lastSearch;

  // Reverse map of servers to environments for job links
  $scope.sqlServers = d3.nest()
    .key(function(s) { return 'sql/' + s.server.name.toLowerCase() + '/jobs'; })
    .map(d3.merge($scope.environments.map(function(e) { return e.servers.map(function(s) { return {server:s, environment:e}; }); })), d3.map);

  $scope.setTitle('Code Search');

  function pullRouteUpdate() {
    $scope.selected.projectPath = $location.search()['projectPath'] || null;
    $scope.commitSearch($location.search()['q'] || '', false);
  }

  $scope.commitLocation = function commitLocation() {
    $location.search('projectPath', $scope.selected.projectPath);
  };

  $scope.commitSearch = function commitSearch(newSearch, forceRefresh) {
    newSearch = newSearch || $scope.shadowSearchString;

    $scope.searchString = newSearch;
    $scope.shadowSearchString = $scope.searchString;
    $location.search('q', (newSearch === '') ? null : newSearch);

    $scope.setTitle(newSearch + ' - Code Search');

    fetchResults(forceRefresh);

    if($scope.searchForm)
      $scope.searchForm.$setPristine();
  };

  $scope.$on('$routeUpdate', pullRouteUpdate);
  pullRouteUpdate();

  function createTerm(name, term, op) {
    // Escape the term
    term = (term + '').replace(/[\\:(){}\[\]^"]/g, '\\$&');

    // Quote it if there are any spaces
    if(term.indexOf(' ') !== -1)
      term = '(' + term + ')';

    return name + ':' + (op || '') + term;
  }

  $scope.loading = true;
  $scope.results = null;

  function prepareSourceMap(hitSource) {
    var newLineRe = /.*\r?\n/g;
    var match;
    var lines = [], lineOffsets = [];
    var lastSeenIndex = 0;

    match = newLineRe.exec(hitSource.code);

    while(match) {
      lines.push(match[0]);
      lineOffsets.push(match.index);
      lastSeenIndex = match.index + match[0].length;

      match = newLineRe.exec(hitSource.code);
    }

    lines.push(hitSource.code.substr(lastSeenIndex));
    lineOffsets.push(lastSeenIndex);

    hitSource.lines = lines;
    hitSource.lineOffsets = lineOffsets;
    hitSource.matchingLines = d3.set();
  }

  function findMatchingLines(hitSource, tokenRe) {
    tokenRe.lastIndex = 0;
    var match, line;

    match = tokenRe.exec(hitSource.code);

    while(match) {
      line = d3.bisectRight(hitSource.lineOffsets, match.index + match[1].length) - 1;
      hitSource.matchingLines.add(line);
      hitSource.matchingLines.add(line - 1);
      hitSource.matchingLines.add(line + 1);

      match = tokenRe.exec(hitSource.code);
    }
  }

  function paintLine(text, tokenRegexes) {
    var regions = [];

    tokenRegexes.forEach(function(tokenRegex) {
      tokenRegex.lastIndex = 0;
      var match = tokenRegex.exec(text);

      while(match) {
        // startIndex adds match[1].length because we don't have a lookbehind assertion; match[1] may contain a preceding character
        regions.push({startIndex: match.index + match[1].length, endIndex: match.index + match[0].length});

        match = tokenRegex.exec(text);
      }
    });

    if(!regions.length) {
      // Not sure why we wouldn't have a match, but let's just produce a fake list
      return [{text: text, highlight: false}];
    }

    // Now join the regions
    regions.sort(function(a, b) { return d3.ascending(a.startIndex, b.startIndex); });
    var reducedRegions = [];

    reducedRegions.push(regions.reduce(function(prevValue, currentValue, index, array) {
      if(!prevValue)
        return currentValue;

      if(prevValue.endIndex >= currentValue.startIndex && prevValue.startIndex <= currentValue.endIndex) {
        prevValue.endIndex = Math.max(prevValue.endIndex, currentValue.endIndex);
        prevValue.startIndex = Math.min(prevValue.startIndex, currentValue.startIndex);
        return prevValue;
      }
      else {
        // We're done with prevValue, push it
        reducedRegions.push(prevValue);

        // We might be able to merge the next with currentValue
        return currentValue;
      }
    }, null));

    // Produce the final result
    var result = [];
    var currentIndex = 0;

    reducedRegions.forEach(function(region) {
      if(region.startIndex > currentIndex) {
        result.push({text: text.substr(currentIndex, region.startIndex - currentIndex), highlight: false});
      }

      result.push({text: text.substr(region.startIndex, region.endIndex - region.startIndex), highlight: true});
      currentIndex = region.endIndex;
    });

    if(text.length > currentIndex)
      result.push({text: text.substr(currentIndex), highlight: false});

    return result;
  }

  var _pathSliceRe = /[^\\\/]+(?:\/|\\|$)/g;

  function getProjectFactory() {
    var _cache = d3.map();

    return function getProject(path) {
      var result = _cache.get(path);

      if(!result) {
        result = new Project(path, getProject);
        _cache.set(path, result);
      }

      return result;
    };
  }

  function Project(path, factory) {
    var parts = path.match(_pathSliceRe);
    this.path = '';

    if(parts) {
      this.path = path;
      this.displayPath = parts[parts.length - 1];
      this.parent = factory(parts.slice(0, parts.length - 1).join(''));
      this.parent.childProjects.set(path, this);
      this.depth = parts.length - 1;
    }

    this.childProjects = d3.map();
    this.hits = [];
  }

  Project.prototype.freeze = function freeze() {
    this.childProjects = this.childProjects.values();

    this.childProjects.sort(function(a, b) { return d3.ascending(a.path, b.path); });
    this.hits.sort(function(a, b) { return d3.ascending(a._source.filePath, b._source.filePath); });
    this.open = (this.childProjects.length !== 0) && (this.path !== 'old/');

    this.hitCount = this.hits.length;

    this.childProjects.forEach(function(project) {
      this.hitCount += project.freeze();
    }, this);

    return this.hitCount;
  };

  Project.prototype.expand = function expand() {
    this.open = !this.open;

    if(this.open)
      this.hits.forEach(getFullResult);
  };

  var _tokenRegExps = null;

  function fetchResults(forceRefresh) {
    var q = $scope.searchString && $scope.searchString.trim() || '';

    if(!q.length) {
      $scope.results = null;
      return;
    }

    $scope.loading = true;

    var queryParams = {q: q};

    if($scope.selected.projectPath)
      queryParams.prefix = $scope.selected.projectPath;

    if(angular.equals(_lastSearch, queryParams) && !forceRefresh)
      return;

    _lastSearch = queryParams;

    tokenAuthHttp.get('_service/code-search/global-search', {params: queryParams}).then(
      function(evt) {
        $scope.results = evt.data;

        // Split query into tokens the way ElasticSearch will
        var tokens = q.split(/(?:[^a-zA-Z0-9_]+[0-9]*)+/g).filter(function(token) { return token !== ''; });

        // Everything that remains is now safe to put in a RegExp
        _tokenRegExps = tokens.map(function(token) { return new RegExp('(^|[^a-z_])' + escapeRegexp(token) + '(?![_a-z0-9])', 'gi'); });

        var factory = getProjectFactory();

        evt.data.hits.hits.forEach(function(hit) {
          hit._source.uploadDate = hit._source.uploadDate && new Date(hit._source.uploadDate);
          hit.project = factory(hit._source.projectPath);
          hit.project.hits.push(hit);
        });

        $scope.topProject = factory('');
        $scope.topProject.freeze();

        $scope.loading = false;
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.loading = false;
      }
    );
  }

  function getFullResult(hit) {
    if(hit.loading || hit._source.code)
      return;

    hit.loading = true;

    return tokenAuthHttp.get('_service/code-search/details/' + encodeURIComponent(hit._id)).then(
      function(evt) {
        hit._source = evt.data;

        // Split the code into lines
        prepareSourceMap(hit._source);

        // Find all the lines that contain our tokens
        _tokenRegExps.forEach(function(tokenRe) { findMatchingLines(hit._source, tokenRe); });

        // matchingLines is a d3.set; turn the values back from strings into numbers
        hit._source.matchingLines = hit._source.matchingLines.values()
          .map(function(line) { return +line; })
          .filter(function(line) { return line >= 0 && line < hit._source.lines.length; })
          .sort(d3.ascending);

        // Produce display lines
        hit._source.displayLines = hit._source.matchingLines.map(function(lineIndex) {
          return {
            lineIndex: lineIndex,
            textPaints: paintLine(hit._source.lines[lineIndex], _tokenRegExps)
          };
        });

        hit.loading = false;
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        hit.loading = false;
      }
    );
  }

  $scope.$watch(function() {
    $scope.displayProjects = [];

    if(!$scope.topProject)
      return;

    function recurse(project) {
      $scope.displayProjects.push(project);

      if(project.open)
        project.childProjects.forEach(recurse);
    }

    $scope.topProject.childProjects.forEach(recurse);
  });

  tokenAuthHttp.get('_service/code-search/terms').then(
    function(evt) {
      $scope.terms = evt.data;

      // Slice up the paths and provide shorter alternatives
      // sql/sr-barfwsql1/TOMS.git becomes sql/, sql/sr-barfwsql1/, and sql/sr-barfwsql1/TOMS.git
      var pathsSet = d3.set();

      $scope.terms.projectPaths.forEach(function(path) {
        var parts = path.match(_pathSliceRe), i;
        path = parts[0];
        pathsSet.add(path);

        for(i = 1; i < parts.length; i++) {
          path += parts[i];
          pathsSet.add(path);
        }
      });

      $scope.terms.projectPaths = pathsSet.values();
      $scope.terms.projectPaths.sort(compareStringsCI);

      $scope.loading = false;
    },
    function(evt) {
      alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
      $scope.loading = false;
    }
  );
});
