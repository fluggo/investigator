'use strict';

const angular = require('angular');
require('angular-websocket');
require('angular-route');
require('angular-aria');

angular.module('investigator.AppConfig', [], function($provide) {
  var clientVersion = document.head.getAttribute('data-client-version');
  var wsBasePath = document.head.getAttribute('data-ws-base-path');

  $provide.constant('AppClientVersion', clientVersion);
  $provide.constant('WebSocketBasePath', wsBasePath);
});

// Declare the angularModule and its dependencies
const angularModule = angular.module('investigator', [
  'investigator.AppConfig',
  'base',
  'base.ui',
  'base.d3filters',
  'ngRoute',
  'investigator.Search',
  'investigator.Routes',
  'angular-websocket',
]);

// All submodules
var d3 = require('d3');
require('./routes');
require('./search');
require('./base');
require('./template');
require('./partials/ldap');
require('./partials/logs');
require('./partials/netflow');
require('./partials/wiki');
require('./partials/users');
require('./partials/cylance');

// All CSS (for now)
require('./www/js/app.css');
require('bootswatch/paper/bootstrap.min.css');
require('codemirror/lib/codemirror.css');
require('codemirror/addon/hint/show-hint.css');
require('angular/angular-csp.css');

const extend = require('extend');

angularModule.directive('reltime', function(app, $log) {
  return {
    restrict: 'CA',
    require: 'ngModel',
    link: function(scope, elem, attrs, ctrl) {
      ctrl.$validators.reltime = function(modelValue, viewValue) {
        return !!app.parseRelativeDate(viewValue);
      };
    }
  };
});

angularModule.filter('timeTillCounter', function() {
  var twoDigit = d3.format('02f');

  return function(input, pattern) {
    if(input === undefined || input === null)
      return null;

    var now = Date.now(), then = input.getTime();
    var diff = Math.max(0, then - now);

    diff = Math.floor(diff / 1000);

    var sec = diff % 60;
    diff = Math.floor(diff / 60);

    var min = diff % 60;
    diff = Math.floor(diff / 60);

    var hour = diff % 24;
    diff = Math.floor(diff / 24);

    var days = diff;

    var result = '';

    if(days || pattern === 'd') {
      if(days === 1)
        result = '1 day ';
      else
        result = days + ' days ';
    }

    if(hour || days || pattern === 'd' || pattern === 'h') {
      result += twoDigit(hour) + ':';
    }

    result += twoDigit(min) + ':' + twoDigit(sec);

    return result;
  };
});

angularModule.directive('timeTillCounter', function($parse, timeTillCounterFilter) {
  return function(scope, element, attrs) {
    var getTime = $parse(attrs.time);

    function updateTime() {
      element.text(timeTillCounterFilter(getTime(scope)));
    }

    scope.$watch(updateTime);
  };
});

angularModule.filter('bytes', function(app) {
  return app.formatBytes;
});

// Declare the root controller for our application
// (the div[@id="app"] element has an ng-controller attribute that uses this)
angularModule.controller('AppController', function AppController($rootScope, $scope, $location, $q, $log, $anchorScroll, $interval, $window, $document, $routeParams, $route, appSocket, alerts, dialogService, app, d3service) {
  $rootScope.routeParams = $routeParams;
  $rootScope.top = { timeRangeLocked: false };
  $rootScope.d3number = d3service.number;
  $rootScope.formatBytes = app.formatBytes;
  $rootScope.settings = { defaultSettings: true };
  $rootScope.reloadRoute = function() {
    $route.reload();
  };

  // Empty interval function to make the time fields reload occasionally
  $interval(function() {}, 1000);

  $rootScope.socketStatus = 'closed';
  $rootScope.timeRangeActive = false;

  $scope.$on('appSocket/status-changed', function(evt, status) {
    $rootScope.socketStatus = status;
    //$log.log(status);

    if(status === 'open') {
      // Put here anything you might want to do at socket startup
    }
  });

  $rootScope.setTimeRangeActive = function setTimeRangeActive() {
    $rootScope.timeRangeActive = true;
  };

  $scope.$on('$routeChangeStart', function(evt) {
    //$log.log('$routeChangeStart', evt);
    $scope.routeLoading = true;
  });

  $scope.$on('$routeUpdate', function(evt, data) {
    //$log.log('$routeUpdate', evt, data);
  });

  $scope.$on('$routeChangeSuccess', function(evt, current, previous) {
    //$log.log('$routeChangeSuccess', evt, current, previous);
    $scope.routeLoading = false;
    $scope.routeChangeError = null;
    dialogService.close();
    resetTimeEditor();
    $rootScope.setTitle();
    $rootScope.timeRangeActive = false;
  });

  $scope.$on('$routeChangeError', function(event, current, previous, rejection) {
    if(rejection.redirectTo) {
      $location.replace();
      return $location.url(rejection.redirectTo);
    }

    $scope.routeLoading = false;
    $scope.routeChangeError = alerts.httpErrorObjectToMessage(rejection);
    $rootScope.timeRangeActive = false;
    dialogService.close();
    resetTimeEditor();
  });

  $rootScope.wikiStats = {};

  $rootScope.$on('appSocket/wiki/stats', function(evt, data) {
    // Amend the contents of the wiki stats
    extend($rootScope.wikiStats, data.data);
  });

  $rootScope.setTitle = function setTitle(title) {
    $rootScope.title = title;

    if(title)
      title = title + ' - Investigator';
    else
      title = 'Investigator';

    $document[0].title = title;
  };

  $rootScope.encodeURIComponent = encodeURIComponent;

  $rootScope.$on('appSocket/user', function(evt, data) {
    $rootScope.settings = data.settings;

    if(data.settings.userSettings.timeRange && !$rootScope.top.timeRangeLocked) {
      //$log.log('New time range:', data.settings.userSettings.timeRange);
      setTimeRange(data.settings.userSettings.timeRange, true);
    }

    $rootScope.$broadcast('user/settingsChanged', data.settings);
  });

  /****** TIME SELECTION ******/
  var predefinedTimes = [
    { col: 1, start: 'now-30d', end: 'now', label: 'Last 30 days'},
    { col: 1, start: 'now-60d', end: 'now', label: 'Last 60 days'},
    { col: 1, start: 'now-90d', end: 'now', label: 'Last 90 days'},
    { col: 1, start: 'now-6M',  end: 'now', label: 'Last 6 months'},
    { col: 1, start: 'now-1y',  end: 'now', label: 'Last 1 year'  },
    { col: 1, start: 'now-2y',  end: 'now', label: 'Last 2 years' },
    { col: 1, start: 'now-5y',  end: 'now', label: 'Last 5 years' },
    { col: 2, start: 'now-1d/d', end: 'now-1d/d', label: 'Yesterday'},
    { col: 2, start: 'now-2d/d', end: 'now-2d/d', label: 'Day before yesterday'},
    { col: 2, start: 'now-7d/d', end: 'now-7d/d', label: 'This day last week'},
    { col: 2, start: 'now-1w/w', end: 'now-1w/w', label: 'Previous week'},
    { col: 2, start: 'now-1M/M', end: 'now-1M/M', label: 'Previous month'},
    { col: 2, start: 'now-1y/y', end: 'now-1y/y', label: 'Previous year'},
    { col: 3, start: 'now/d', end: 'now/d', label: 'Today' },
    { col: 3, start: 'now/d', end: 'now'  , label: 'Today so far'},
    { col: 3, start: 'now/w', end: 'now/w', label: 'This week'},
    { col: 3, start: 'now/w', end: 'now'  , label: 'This week so far'},
    { col: 3, start: 'now/M', end: 'now/M', label: 'This month'},
    { col: 3, start: 'now/y', end: 'now/y', label: 'This year'},
    { col: 4, start: 'now-5m',  end: 'now', label: 'Last 5 minutes' },
    { col: 4, start: 'now-15m', end: 'now', label: 'Last 15 minutes' },
    { col: 4, start: 'now-30m', end: 'now', label: 'Last 30 minutes' },
    { col: 4, start: 'now-1h',  end: 'now', label: 'Last 1 hour' },
    { col: 4, start: 'now-3h',  end: 'now', label: 'Last 3 hours' },
    { col: 4, start: 'now-6h',  end: 'now', label: 'Last 6 hours' },
    { col: 4, start: 'now-12h', end: 'now', label: 'Last 12 hours' },
    { col: 4, start: 'now-24h', end: 'now', label: 'Last 24 hours' }
  ];

  predefinedTimes.forEach(function(def, index) {
    def.id = 'label-' + def.col + '-' + index;
  });

  var predefinedTimeColumns = [1,2,3,4].map(function(column) {
    return predefinedTimes.filter(function(def) { return def.col === column; });
  });

  $rootScope.top.predefinedTimeColumns = predefinedTimeColumns;

  // Set the default time range');
  $rootScope.timeRange = { start: 'now-1h', end: 'now' };
  $rootScope.top.enteredStart = $rootScope.timeRange.start;
  $rootScope.top.enteredEnd = $rootScope.timeRange.end;

  function find(array, func) {
    for(var i = 0; i < array.length; i++) {
      if(func(array[i]))
        return array[i];
    }

    return undefined;
  }

  function checkPredefined() {
    $rootScope.top.selectedPredefinedTime = find(predefinedTimes, function(def) {
      return def.start === $rootScope.timeRange.start && def.end === $rootScope.timeRange.end;
    });
  }

  checkPredefined();

  function resetTimeEditor() {
    $rootScope.top.showTimeEditor = false;
    $rootScope.top.showTimeEntryHelp = false;
    $rootScope.top.enteredStart = $rootScope.timeRange.start;
    $rootScope.top.enteredEnd = $rootScope.timeRange.end;
    $rootScope.top.timeEntryForm.$setPristine();
    checkPredefined();
  }

  $rootScope.top.toggleTimeEditor = function toggleTimeEditor() {
    if(!$rootScope.top.showTimeEditor) {
      $rootScope.top.showTimeEditor = true;
    }
    else {
      // Treat as cancel
      resetTimeEditor();
    }
  };

  function setTimeRange(options, external) {
    // options { start: date, end: date }
    // external: true if another window sent this to us

    var newTimeRange = { start: options.start || $rootScope.timeRange.start, end: options.end || $rootScope.timeRange.end };
    //$log.log('setTimeRange', options, $rootScope.timeRange);

    if(angular.equals(newTimeRange, $rootScope.timeRange))
      return;

    $rootScope.timeRange = newTimeRange;

    resetTimeEditor();

    if(!external && !$rootScope.top.timeRangeLocked) {
      $rootScope.settings.userSettings.timeRange = $rootScope.timeRange;
      app.user.setUserSettings($rootScope.settings.userSettings);
    }

    $rootScope.$broadcast('timeRangeChanged');
  }

  $rootScope.top.setTimeRange = setTimeRange;

  $rootScope.top.commitTimeEntry = function commitTimeEntry() {
    //$log.log('commitTimeEntry');
    setTimeRange({start: $rootScope.top.enteredStart, end: $rootScope.top.enteredEnd}, false);
  };

  /********** Window resizing ************/
  var waitingForFrame = false;

  $window.addEventListener('resize', function() {
    if(waitingForFrame)
      return;

    waitingForFrame = true;
    requestAnimationFrame(function() {
      $rootScope.$apply(function() {
        $rootScope.$broadcast('resize');
      });
      waitingForFrame = false;
    });
  });

});

angularModule.service('appSocket', function AppSocket($websocket, $rootScope, $timeout, $log, $q, WebSocketBasePath) {
  // See http://clintberry.com/2013/angular-js-websocket-service/
  var _callbacks = {};
  var _currentCallbackId = 0;
  var _socket;

  function getCallbackId() {
    _currentCallbackId += 1;

    if(_currentCallbackId > 10000)
      _currentCallbackId = 0;

    return _currentCallbackId;
  }

  function handleMessage(message) {
    if(message.type === 'cbres' || message.type === 'cbrej' || message.type === 'cbnot') {
      //$log.log('Callback received', message);

      var callbackObj = _callbacks[message.id];

      if(!callbackObj) {
        $log.error('Callback received for invalid callback ID', message.id);
        return;
      }

      if(message.type === 'cbrej') {
        delete _callbacks[message.id];
        callbackObj.defer.reject(message.data);
      }
      else if(message.type === 'cbres') {
        delete _callbacks[message.id];
        callbackObj.defer.resolve(message.data);
      }
      else if(message.type === 'cbnot') {
        callbackObj.defer.notify(message.data);
      }
    }
    else {
      $rootScope.$broadcast('appSocket/' + message.type, message);
    }
  }

  function rejectOutstandingMessages() {
    Object.keys(_callbacks).forEach(function(key) {
      _callbacks[key].defer.reject({message: 'Connection failed.'});
    });

    _callbacks = {};
  }

  function start() {
    // First unregister events from the previous event source, if any
    if(_socket) {
      _socket.onMessageCallbacks.pop();
      _socket.onCloseCallbacks.pop();
      _socket.onOpenCallbacks.pop();

      _socket.close();
      _socket = null;
    }

    // Let everyone know we've closed it
    $rootScope.$broadcast('appSocket/status-changed', 'connecting');

    _socket = $websocket(WebSocketBasePath + '_service/main');

    _socket.onOpen(function() {
      $rootScope.$broadcast('appSocket/status-changed', 'open');
    });

    _socket.onClose(function() {
      rejectOutstandingMessages();
      $rootScope.$broadcast('appSocket/status-changed', 'closed');
      $timeout(start, 2000);
    });

    _socket.onError(function(evt) {
      rejectOutstandingMessages();
      $log.error('Socket closing because of an error', evt);
    });

    _socket.onMessage(function(evt) {
      handleMessage(JSON.parse(evt.data));
    });
  }

  this.sendRequest = function request(name, data) {
    var defer = $q.defer();

    if(!_socket) {
      defer.reject('The socket doesn\'t exist yet.');
      return defer.promise;
    }

    var callbackObj = {
      defer: defer,
    };

    var requestObj = {
      type: 'cbreq',
      name: name,
      data: data,
      id: getCallbackId()
    };

    _callbacks[requestObj.id] = callbackObj;
    _socket.send(requestObj);
    return defer.promise;
  };

  start();
});

angularModule.service('app', function(appSocket, d3service, alerts, $rootScope, $log) {
  var utilService = require('../common/util');

  function compareStringsCI(a, b) {
    a = a.toLowerCase();
    b = b.toLowerCase();

    if(a < b)
      return -1;

    if(a > b)
      return 1;

    return 0;
  }

  this.compareStringsCI = compareStringsCI;

  function uncollapseArray(value) {
    if(!angular.isDefined(value) || (angular.isArray(value) && !angular.isString(value))) {
      return value;
    }

    return [value];
  }

  this.uncollapseArray = uncollapseArray;

  // Common functions for the cluster
  this.cluster = (function() {
    return {
      getState: function getState() {
        return appSocket.sendRequest('cluster/state');
      },
      getHealth: function getHealth() {
        return appSocket.sendRequest('cluster/health');
      },
      getStats: function getStats() {
        return appSocket.sendRequest('cluster/stats');
      },
    };
  })();

  // Common functions for the wiki
  this.wiki = (function() {
    // map of articleId => { callbacks: [], info: { exists: false } }
    var _knownArticleMap = d3.map();
    var _nextSubscribeList = d3.set();

    function updateArticleInfo(id, newInfo) {
      // Sets the "exists" flag and calls all the callbacks
      var obj = _knownArticleMap.get(id);

      if(!obj)
        return;

      for(var prop in newInfo) {
        if(newInfo.hasOwnProperty(prop))
          obj.info[prop] = newInfo[prop];
      }

      obj.callbacks.forEach(function(callback) { callback(obj.info); });
    }

    $rootScope.$on('$routeChangeStart', function(evt, current, previous) {
      // Clear the callback list so it doesn't grow without bounds
      _knownArticleMap = d3.map();
    });

    $rootScope.$on('appSocket/wiki/article-changed', function(evt, data) {
      data = data.data;

      if(data.changeType === 'created')
        updateArticleInfo(data.id, {found: true});
      else if(data.changeType === 'deleted')
        updateArticleInfo(data.id, {found: false});
    });

    $rootScope.$watch(function() {
      // Peek at the list of things we were told to ask about
      if(_nextSubscribeList.size() === 0)
        return;

      // Pull the list and reset the next-list
      var nextList = _nextSubscribeList.values();
      _nextSubscribeList = d3.set();

      // Get initial information about the articles
      checkArticlesExist(nextList).then(function(data) {
          // We now know which articles exist and which don't; call the callbacks
          data.forEach(function(info) { updateArticleInfo(info.id, info); });
        },
        function(err) {
          alerts.showTempAlert(alerts.httpErrorObjectToMessage(err), 'error', 5000);
        });
    });

    function checkArticlesExist(ids) {
      return appSocket.sendRequest('wiki/check-articles-exist', ids);
    }

    function subscribeToArticle(articleId, callback) {
      var callbackObj = _knownArticleMap.get(articleId);

      if(!callbackObj) {
        callbackObj = { callbacks: [callback], info: { id: articleId } };
        _knownArticleMap.set(articleId, callbackObj);
        _nextSubscribeList.add(articleId);
      }
      else {
        callbackObj.callbacks.push(callback);
        callback(callbackObj.info);
      }
    }

    return {
      search: function search(req) {
        return appSocket.sendRequest('wiki/search', req);
      },
      getArticleById: function getArticleById(id, options) {
        return appSocket.sendRequest('wiki/get-article-by-id', {id: id, options: options});
      },
      getArticlesByLdapGuid: function getArticlesByLdapGuid(guids, options) {
        return appSocket.sendRequest('wiki/get-articles-by-ldap-guid', {guids: guids, options: options});
      },
      updateArticle: function updateArticle(id, version, article, options) {
        return appSocket.sendRequest('wiki/update-article', {id: id, version: version, article: article, options: options});
      },
      createArticle: function createArticle(article) {
        return appSocket.sendRequest('wiki/create-article', {article: article});
      },
      deleteArticle: function deleteArticle(id) {
        return appSocket.sendRequest('wiki/delete-article', {id: id});
      },
      findAllTags: function findAllTags() {
        return appSocket.sendRequest('wiki/find-all-tags');
      },
      getTagReport: function getTagReport(req) {
        return appSocket.sendRequest('wiki/tag-report', req);
      },
      wikiReviewSearch: function wikiReviewSearch(q, options) {
        return appSocket.sendRequest('wiki/wiki-review-search', {q: q, options: options});
      },
      mapToWiki: function mapToWiki(id, options) {
        return appSocket.sendRequest('wiki/map-to-wiki', {id: id, options: options});
      },
      getArticleHistory: function getArticleHistory(uuid, options) {
        return appSocket.sendRequest('wiki/get-history', {uuid: uuid, options: options});
      },
      getArticleByUuid: function getArticleByUuid(uuid) {
        return appSocket.sendRequest('wiki/get-article-by-uuid', {uuid: uuid});
      },
      getUnreviewedArticles: function getUnreviewedArticles() {
        return appSocket.sendRequest('wiki/get-unreviewed-articles', {});
      },
      getTagFrequencyByPrefix: function getTagFrequencyByPrefix(prefix) {
        return appSocket.sendRequest('wiki/get-tag-frequency-by-prefix', {prefix: prefix});
      },
      getKnownTags: function getKnownTags(prefix) {
        return appSocket.sendRequest('wiki/get-known-tags', {});
      },
      quickSearch: function quickSearch(q, options) {
        return appSocket.sendRequest('wiki/quick-search', {q: q, options: options});
      },
      findDuplicateTagValues: function findDuplicateTagValues(tags) {
        return appSocket.sendRequest('wiki/find-duplicate-tag-values', {tags: tags});
      },
      checkArticlesExist: checkArticlesExist,
      subscribeToArticle: subscribeToArticle,
      wikiLinkToHref: utilService.wikiLinkToHref,
      expandTitleId: utilService.expandTitleId,
      shrinkTitleId: utilService.shrinkTitleId,
      parseTag: utilService.parseTag,
      parseTags: utilService.parseTags,
      combineRecommendations: utilService.combineWikiRecommendations,
      shrinkTag: utilService.shrinkTag,
      buildTag: utilService.buildTag,
    };
  })();

  // Common functions for LDAP
  this.ldap = (function() {
    const COMPUTER_TYPE = { order: 3, type: 'computer', icon: 'fa-laptop', name: 'Computer', pluralName: 'Computers' };
    const PERSON_TYPE = { order: 4, type: 'person', icon: 'fa-user', name: 'User', pluralName: 'Users' };
    const GROUP_TYPE = { order: 2, type: 'group', icon: 'fa-users', name: 'Group', pluralName: 'Groups' };
    const VOLUME_TYPE = { order: 5, type: 'volume', icon: 'fa-hdd-o', name: 'Volume', pluralName: 'Volumes' };
    const PRINTQUEUE_TYPE = { order: 6, type: 'printQueue', icon: 'fa-print', name: 'Print queue', pluralName: 'Print queues' };
    const OU_TYPE = { order: 1, type: 'organizationalUnit', icon: 'fa-folder', name: 'Organizational unit', pluralName: 'Organizational units' };
    const GPO_TYPE = { order: 7, type: 'groupPolicy', icon: 'fa-shield', name: 'Group policy', pluralName: 'Group policies' };
    const UNKNOWN_TYPE = { order: 10, type: 'unknown', icon: 'fa-cog', name: 'Unknown', pluralName: 'Unknown' };
    Object.freeze(COMPUTER_TYPE);
    Object.freeze(PERSON_TYPE);
    Object.freeze(GROUP_TYPE);
    Object.freeze(VOLUME_TYPE);
    Object.freeze(PRINTQUEUE_TYPE);
    Object.freeze(OU_TYPE);
    Object.freeze(GPO_TYPE);
    Object.freeze(UNKNOWN_TYPE);

    const typesByName = d3.map([COMPUTER_TYPE, PERSON_TYPE, GROUP_TYPE, VOLUME_TYPE, PRINTQUEUE_TYPE, OU_TYPE, GPO_TYPE, UNKNOWN_TYPE], v => v.type);

    function getObjectType(classList) {
      var set = d3.set(classList || []);

      if(set.has('computer')) {
        return COMPUTER_TYPE;
      }
      else if(set.has('person')) {
        return PERSON_TYPE;
      }
      else if(set.has('group')) {
        return GROUP_TYPE;
      }
      else if(set.has('volume')) {
        return VOLUME_TYPE;
      }
      else if(set.has('printQueue')) {
        return PRINTQUEUE_TYPE;
      }
      else if(set.has('organizationalUnit')) {
        return OU_TYPE;
      }
      else if(set.has('groupPolicyContainer')) {
        return GPO_TYPE;
      }
      else {
        return UNKNOWN_TYPE;
      }
    }

    function getObjectTypeByName(type) {
      return typesByName.get(type);
    }

    function getDisplayName(obj) {
      return obj.common.name;
    }

    return {
      search: function search(req) {
        return appSocket.sendRequest('ldap/search', req);
      },

      stringSearch: function stringSearch(req) {
        return appSocket.sendRequest('ldap/string-search', req);
      },

      wikiReviewSearch: function wikiReviewSearch(req) {
        return appSocket.sendRequest('ldap/wiki-review-search', req);
      },

      getObjectsById: function getObjectsById(ids, options) {
        return appSocket.sendRequest('ldap/get-objects-by-id', {ids: ids, options: options});
      },

      getObjectsByDN: function getObjectsByDN(dns, options) {
        return appSocket.sendRequest('ldap/get-objects-by-dn', {dns: dns, options: options});
      },

      getMembersById: function getMembersById(id) {
        return appSocket.sendRequest('ldap/get-members-by-id', {id: id});
      },

      getMembershipById: function getMembershipById(id) {
        return appSocket.sendRequest('ldap/get-membership-by-id', {id: id});
      },

      getChildren: function getChildren(parentGuid, options) {
        return appSocket.sendRequest('ldap/get-children', {parentGuid: parentGuid, options: options});
      },

      getUnusedAccountsReport: function getUnusedAccountsReport(options) {
        return appSocket.sendRequest('ldap/reports/unused-accounts', options);
      },

      getAdminsReport: function getAdminsReport(options) {
        return appSocket.sendRequest('ldap/reports/admins');
      },

      getDomainControllerRoles: function getDomainControllerRoles() {
        return appSocket.sendRequest('ldap/reports/domain-controller-roles');
      },

      sortObjects: function sortObjects(a, b) {
        var order = d3.ascending(getObjectType(a.ldap.objectClass).order, getObjectType(b.ldap.objectClass).order);

        if(order !== 0)
          return order;

        return compareStringsCI(getDisplayName(a), getDisplayName(b));
      },

      getDisplayName: getDisplayName,
      getObjectType: getObjectType,
      parseDN: utilService.parseDN,
      getObjectTypeByName: getObjectTypeByName,
    };
  })();

  this.logs = (function() {
    return {
      getBunyanEntry: function getBunyanEntry(index, id) {
        return appSocket.sendRequest('logs/get-bunyan-entry', {index: index, id: id});
      },
      getWsaLogEntry: function getWsaLogEntry(index, id) {
        return appSocket.sendRequest('logs/get-wsalog-entry', {index: index, id: id});
      },
      getCylanceLogEntry: function getCylanceLogEntry(index, id) {
        return appSocket.sendRequest('logs/get-cylance-entry', {index: index, id: id});
      },
      getSqlLogEntry: function getSqlLogEntry(index, id) {
        return appSocket.sendRequest('logs/get-sqllog-entry', {index: index, id: id});
      },
      getVistaLogEntry: function getVistaLogEntry(index, id) {
        return appSocket.sendRequest('logs/get-msvista-entry', {index: index, id: id});
      },
      getVistaLogEntriesByActivityId: function getVistaLogEntriesByActivityId(id) {
        return appSocket.sendRequest('logs/get-msvista-entries-by-activityid', {id: id});
      },
      getVistaLogStats: function getVistaLogStats() {
        return appSocket.sendRequest('logs/get-msvista-stats', {});
      },
      findAdminLogins: function findAdminLogins(q) {
        return appSocket.sendRequest('logs/msvista/find-admin-logins', q);
      },
      searchVistaLogs: function searchVistaLogs(q) {
        return appSocket.sendRequest('logs/search-msvista', q);
      },
      searchWsaLogs: function searchWsaLogs(q) {
        return appSocket.sendRequest('logs/search-wsalog', q);
      },
      searchSqlLogs: function searchWsaLogs(q) {
        return appSocket.sendRequest('logs/search-sqllog', q);
      },
      searchCylanceLogs: function searchCylanceLogs(q) {
        return appSocket.sendRequest('logs/search-cylance', q);
      },
      searchSyslogLogs: function searchSyslogLogs(q) {
        return appSocket.sendRequest('logs/search-syslog', q);
      },
      getRunningPrograms: function getRunningPrograms() {
        return appSocket.sendRequest('logs/running-programs');
      },
    };
  })();

  this.netflow = (function() {
    return {
      search: function search(req) {
        return appSocket.sendRequest('netflow/search', req);
      },
      rawSearch: function search(req) {
        return appSocket.sendRequest('netflow/raw-search', req);
      },
      getHealth: function getHealth() {
        return appSocket.sendRequest('netflow/health');
      },
    };
  })();

  this.cylance = (function() {
    return {
      device: (function() {
        return {
          stringSearch: function stringSearch(req) {
            return appSocket.sendRequest('cylance/device/string-search', req);
          },
          getObjectsById: function getObjectsById(ids, options) {
            return appSocket.sendRequest('cylance/device/get-objects-by-id', {ids: ids, options: options});
          }
        };
      })(),
    };
  })();

  this.raw = (function() {
    return {
      search: function search(req) {
        return appSocket.sendRequest('raw/search', req);
      },
    };
  })();

  this.user = (function() {
    return {
      get: function get(upn) {
        return appSocket.sendRequest('user/get', {upn: upn});
      },
      getList: function getList() {
        return appSocket.sendRequest('user/get-list', {});
      },
      create: function createUser(upn) {
        return appSocket.sendRequest('user/create', {upn: upn, settings: {}});
      },
      delete: function deleteUser(upn) {
        return appSocket.sendRequest('user/delete', {upn: upn});
      },
      setUserSettings: function setUserSettings(userSettings) {
        return appSocket.sendRequest('user/set-user-settings', {userSettings: userSettings});
      },
      setUserControls: function setUserControls(upn, userControls) {
        return appSocket.sendRequest('user/set-user-controls', {upn: upn, userControls: userControls});
      },
    };
  })();

  this.dns = (function() {
    return {
      reverse: function reverse(ip) {
        return appSocket.sendRequest('dns/reverse', {ip: ip});
      },
    };
  })();

  this.formatBytes = function formatBytes(bytes, precision) {
    if (isNaN(parseFloat(bytes)) || !isFinite(bytes))
        return '-';

    if (typeof precision === 'undefined')
      precision = 3;

    if(bytes === 0)
      return '0 B';

    var units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'],
      number = Math.floor(Math.log(bytes) / Math.log(1024));
    return d3service.number(bytes / Math.pow(1024, Math.floor(number)), '.3r') + ' ' + units[number];
  };

  this.formatBps = function formatBps(bps, precision) {
    if (isNaN(parseFloat(bps)) || !isFinite(bps))
        return '-';

    if (typeof precision === 'undefined')
      precision = 3;

    if(bps === 0)
      return '0 bps';

    var units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps', 'Pbps'],
      number = Math.floor(Math.log(bps) / Math.log(1000));
    return d3service.number(bps / Math.pow(1000, Math.floor(number)), '.3r') + ' ' + units[number];
  };

  this.parsePlainHighlights = utilService.parsePlainHighlights;
  this.parseRelativeDate = utilService.parseRelativeDate;
  this.segmentTextStandard = utilService.segmentTextStandard;
});

angularModule.directive('searchHighlighter', function($document, $window) {
  function toPlainText(jsonml, options) {
    // Reduce the textile to plain text, preserving the "highlight" element we're looking for

    jsonml = jsonml.concat();

    if(typeof jsonml === 'string') {
      return jsonml;
    }

    var tagName = jsonml.shift(),
      attributes = {},
      tag, a;

    // Grab the attributes list if there is one (object at jsonml[1] originally)
    if(jsonml.length && typeof jsonml[0] === 'object' && !angular.isArray(jsonml[0])) {
      attributes = jsonml.shift();
    }

    if(tagName === '!') {
      // Ignore comments
      return '';
    }
    else {
      if(tagName === 'highlight') {
        return '<highlight>' + jsonml.map(function(json) { return toPlainText(json); }).join('') + '</highlight>';
      }
      else {
        return jsonml.map(function(json) { return toPlainText(json); }).join('');
      }
    }
  }

  function toHTML(jsonml, options) {
    // We don't trust the textile library to create HTML;
    // we're going to do it with the DOM and place our restrictions on the result
    // This is pretty much a copy of what's in the library

    jsonml = jsonml.concat();

    if(typeof jsonml === 'string') {
      return $document[0].createTextNode(jsonml);
    }

    var tagName = jsonml.shift(),
      attributes = {},
      tag, a;

    // Grab the attributes list if there is one (object at jsonml[1] originally)
    if(jsonml.length && typeof jsonml[0] === 'object' && !angular.isArray(jsonml[0])) {
      attributes = jsonml.shift();
    }

    if(tagName === '!') {
      // It'd be silly to put anything other than text in here,
      // so hopefully that's all that's in the array
      return $document[0].createComment(jsonml.join(''));
    }
    else {
      if(tagName === 'highlight') {
        tag = $document[0].createElement('strong');
      }
      else {
        tag = $document[0].createElement('span');
      }

      while(jsonml.length) {
        tag.appendChild(toHTML(jsonml.shift(), options));
      }

      return tag;
    }
  }

  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      var textile = require('../common/textile');

      scope.$watch(attrs.searchHighlighter, function(value) {
        // Empty the element
        element.html('');

        if(!value)
          return;

        // Run it through once to try to remove all markup
        var jsonml = textile.jsonml(value, {});
        var plainText = toPlainText(jsonml);

        // Now run it through again to try to pick out the highlight
        jsonml = textile.jsonml(plainText, {});

        element.append(toHTML(jsonml));
      });
    }
  };
});

angularModule.directive('plainSearchHighlighter', function($document, $window, app) {
  function toHTML(jsonml, options) {
    // We don't trust the textile library to create HTML;
    // we're going to do it with the DOM and place our restrictions on the result
    // This is pretty much a copy of what's in the library

    jsonml = jsonml.concat();

    if(typeof jsonml === 'string') {
      return $document[0].createTextNode(jsonml);
    }

    var tagName = jsonml.shift(),
      attributes = {},
      tag, a;

    // Grab the attributes list if there is one (object at jsonml[1] originally)
    if(jsonml.length && typeof jsonml[0] === 'object' && !angular.isArray(jsonml[0])) {
      attributes = jsonml.shift();
    }

    if(tagName === '!') {
      // It'd be silly to put anything other than text in here,
      // so hopefully that's all that's in the array
      return $document[0].createComment(jsonml.join(''));
    }
    else {
      if(tagName === 'strong') {
        tag = $document[0].createElement('strong');
      }
      else {
        tag = $document[0].createElement('span');
      }

      while(jsonml.length) {
        tag.appendChild(toHTML(jsonml.shift(), options));
      }

      return tag;
    }
  }

  return {
    restrict: 'A',
    link: function(scope, element, attrs) {

      scope.$watch(attrs.plainSearchHighlighter, function(value) {
        // Empty the element
        element.html('');

        if(!value)
          return;

        var jsonml = app.parsePlainHighlights(value);
        element.append(toHTML(jsonml));
      });
    }
  };
});

angularModule.controller('views.syslog.search', function SyslogSearchController($scope, $routeParams, $log, app, $location, alerts) {
  $scope.searchString = null;
  $scope.page = 1;
  $scope.pageCount = 0;
  $scope.pageList = [];
  $scope.shadowSearchString = '';
  var _lastSearch = null;
  var ITEMS_PER_PAGE = 100;

  function pullRouteUpdate() {
    $scope.commitSearch({
      newSearch: $location.search()['q'] || '',
      page: parseInt($location.search()['page']) || 1,
      sortOrder: $location.search()['order'] || 'time',
      forceRefresh: false});
  }

  $scope.commitSearch = function commitSearch(options) {
    options = options || {};
    var newSearch = options.newSearch || $scope.shadowSearchString;
    var forceRefresh = (options.forceRefresh === undefined) ? true : options.forceRefresh;

    $scope.searchString = newSearch;
    $scope.shadowSearchString = $scope.searchString;
    $scope.page = options.page || $scope.page;
    $scope.sortOrder = options.sortOrder || $scope.sortOrder;
    $location.search('q', (newSearch === '') ? null : newSearch);
    $location.search('page', ($scope.page === 1) ? null : $scope.page);
    $location.search('order', ($scope.sortOrder === 'time') ? null : $scope.sortOrder);

    $scope.setTitle(newSearch + ' - Syslog search');

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

    var queryParams = {q: q, size: ITEMS_PER_PAGE, from: ($scope.page - 1) * ITEMS_PER_PAGE, sortOrder: $scope.sortOrder};

    if(angular.equals(_lastSearch, queryParams) && !forceRefresh)
      return;

    _lastSearch = queryParams;

    app.syslog.search(queryParams).then(
      function(resp) {
        //$log.log(resp);
        $scope.searchResults = resp;

        resp.hits.hits.forEach(function(hit) {
          hit._source['@timestamp'] = new Date(hit._source['@timestamp']);
        });

        $scope.pageCount = Math.ceil(resp.hits.total / ITEMS_PER_PAGE);

        $scope.loading = false;
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.loading = false;
      }
    );
  }

  $scope.setTitle('Syslog search');
  $scope.searchResults = null;
});


angularModule.controller('views.raw.search', function RawSearchController($scope, $routeParams, $log, app, $location, alerts) {
  $scope.searchString = null;
  $scope.page = 1;
  $scope.pageCount = 0;
  $scope.pageList = [];
  $scope.shadowSearchString = '';
  var _lastSearch = null;
  var PAGE_COUNT = 100;

  function pullRouteUpdate() {
    $scope.commitSearch($location.search()['q'] || '', parseInt($location.search()['page']) || 1, false);
  }

  $scope.commitSearch = function commitSearch(newSearch, page, forceRefresh) {
    newSearch = newSearch || $scope.shadowSearchString;

    $scope.searchString = newSearch;
    $scope.shadowSearchString = $scope.searchString;
    $scope.page = page || $scope.page;
    $location.search('q', (newSearch === '') ? null : newSearch);
    $location.search('page', (page === 1) ? null : page);

    $scope.setTitle(newSearch + ' - Raw search');

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

    var queryParams = {q: q, size: PAGE_COUNT, from: ($scope.page - 1) * PAGE_COUNT};

    if(angular.equals(_lastSearch, queryParams) && !forceRefresh)
      return;

    _lastSearch = queryParams;

    app.raw.search(queryParams).then(
      function(resp) {
        //$log.log(resp);
        $scope.searchResults = resp;
        $scope.loading = false;
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.loading = false;
      }
    );
  }

  $scope.setTitle('Raw search');
  $scope.searchResults = null;
});

angularModule.controller('views.cluster.health', function ClusterHealthController($scope, $routeParams, healthObj, $log, app, alerts, $timeout) {
  $scope.setTitle('Cluster health');
  $scope.healthObj = healthObj;

  function fetchAgain() {
    app.cluster.getHealth().then(function(data) {
      $scope.healthObj = data;
      $timeout(fetchAgain, 2000);
    },
    function(err) {
      alerts.showTempAlert(alerts.httpErrorObjectToMessage(err), 'error', 2000);
    });
  }

  $timeout(fetchAgain, 2000);
});

angularModule.controller('views.cluster.state', function ClusterStateController($scope, $routeParams, stateObj, $log, app, alerts) {
  $scope.setTitle('Cluster state');
  $scope.stateObj = stateObj;

  $scope.indexesByAlias = d3.map();
  $scope.unaliasedIndexes = [];
  $scope.offlineIndexes = [];

  angular.forEach(stateObj.metadata.indices, function(value, key) {
    var index = {key: key, value: value};

    value.aliases.forEach(function(alias) {
      var aliasList = $scope.indexesByAlias.get(alias);

      if(!aliasList) {
        aliasList = [];
        $scope.indexesByAlias.set(alias, aliasList);
      }

      aliasList.push(index);
    });

    if(value.aliases.length === 0)
      $scope.unaliasedIndexes.push(index);
  });

  $scope.indexesByAlias.each(function(value) {
    value.sort(function(a, b) {return app.compareStringsCI(a.key, b.key);});
  });

  $scope.indexesByAlias = $scope.indexesByAlias.entries();
  $scope.indexesByAlias.sort(function(a, b) {return app.compareStringsCI(a.key, b.key);});

  $scope.unaliasedIndexes.sort(function(a, b) {return app.compareStringsCI(a.key, b.key);});
});

angularModule.controller('views.cluster.stats', function ClusterStatsController($scope, $routeParams, statsObj, $log, alerts) {
  $scope.setTitle('Cluster stats');
  $scope.statsObj = statsObj;
});

angularModule.controller('views.cluster.home', function ClusterHomeController($scope, $routeParams, $log, alerts) {
  $scope.setTitle('Cluster');
});


angularModule.config(['$locationProvider', function($locationProvider) {
  $locationProvider.html5Mode(true);
}]);

