'use strict';

var angular = require('angular');
var module = angular.module('investigator');
var d3 = require('d3');

// Require all the template pages; browserify will turn these into angular templates
require('./object.html');
require('./search.html');
require('./reports/admins.html');
require('./reports/unused-accounts.html');
require('./reports/dc-roles.html');
require('./template/ldap-object-link.html');
require('./template/ldap-short-view.html');

module.directive('ldapObjectLink', function($rootScope, app, $log) {
  // List of lookups to be done on the next digest cycle
  var _upcomingLookups = [];

  $rootScope.$watch(function() {
    if(_upcomingLookups.length === 0)
      return;

    var currentLookups = _upcomingLookups;
    _upcomingLookups = [];

    var dnLookups = d3.map(), guidLookups = d3.map();

    function addmap(map, key, obj) {
      var array = map.get(key);

      if(!array) {
        array = [];
        map.set(key, array);
      }

      array.push(obj);
    }

    currentLookups.forEach(function(lookup) {
      if(lookup.objectGuid)
        addmap(guidLookups, lookup.objectGuid, lookup);
      else if(lookup.distinguishedName)
        addmap(dnLookups, lookup.distinguishedName, lookup);
    });

    function handleResponse(res) {
      res.forEach(function(summary) {
        summary = summary._source;

        var dnLookup = dnLookups.get(summary.ldap.distinguishedName),
          guidLookup = guidLookups.get(summary.ldap.objectGUID);

        if(dnLookup)
          dnLookup.forEach(function(obj) { obj.summary = summary; });

        if(guidLookup)
          guidLookup.forEach(function(obj) { obj.summary = summary; });
      });
    }

    if(!guidLookups.empty()) {
      app.ldap.getObjectsById(guidLookups.keys(), {summary: true}).then(
        handleResponse,
        function(err) {
          $log.error('Error when fetching object summaries for LDAP links:', err);
        });
    }

    if(!dnLookups.empty()) {
      app.ldap.getObjectsByDN(dnLookups.keys(), {summary: true}).then(
        handleResponse,
        function(err) {
          $log.error('Error when fetching object summaries for LDAP links:', err);
        });
    }
  });

  function populateScope(scope, summary) {
    if(!summary) {
      scope.ldapType = app.ldap.getObjectType(null);
      scope.name = scope.distinguishedName || scope.objectGuid;
    }
    else {
      scope.objectGuid = summary.ldap.objectGUID;
      scope.distinguishedName = summary.ldap.distinguishedName;
      scope.ldapType = app.ldap.getObjectType(summary.ldap.objectClass);
      scope.name = app.ldap.getDisplayName(summary);
      scope.summary = summary;

      scope.domainTop = app.ldap.parseDN(summary.ldap.distinguishedName).slice(-2).map(function(val) { return val.value; }).join('.');
    }
  }

  return {
    restrict: 'E',
    scope: {distinguishedName: '=?', objectGuid: '=?', summary: '=?', showDomain: '@'},
    templateUrl: 'partials/ldap/template/ldap-object-link.html',
    link: function(scope, element) {
      scope.$watch('fetchData.summary', function(newValue) {
        populateScope(scope, newValue);
      });

      if(scope.summary) {
        scope.fetchData = {summary: scope.summary};
      }
      else {
        if(!scope.distinguishedName && !scope.objectGuid)
          return;

        scope.fetchData = {
          distinguishedName: scope.distinguishedName,
          objectGuid: scope.objectGuid
        };

        _upcomingLookups.push(scope.fetchData);
      }
    }
  };
});

module.controller('views.ldap.object', function LdapObjectController($scope, $routeParams, alternatives, membership, members, $log, app, alerts) {
  $scope.alternatives = alternatives;

  var ldapTop = alternatives[0].ldap;
  var ldapObj = alternatives[0].ldap._source;

  $scope.alternativeIndex = 0;
  $scope.alternative = alternatives[0];

  $scope.setAlternative = function(index) {
    $scope.alternativeIndex = index;
    $scope.alternative = alternatives[index];
  };

  function normalizeLists(value) {
    if(!angular.isDefined(value) || (angular.isArray(value) && !angular.isString(value))) {
      return value;
    }

    return [value];
  }

  $scope.monthAgo = d3.timeMonth.offset(new Date(), -1);

  $scope.ldap = ldapObj.ldap;
  $scope.userAccountControl = ldapObj.ldapDecoded.userAccountControl;

  $scope.memberOf = membership.map(s => s._source);
  $scope.member = members.map(s => s._source);

  $scope.memberOf.sort(app.ldap.sortObjects);
  $scope.member.sort(app.ldap.sortObjects);

  if(ldapObj.ldap.servicePrincipalName) {
    $scope.servicePrincipalName = normalizeLists(ldapObj.ldap.servicePrincipalName);
    $scope.servicePrincipalName.sort(app.compareStringsCI);
  }

  if(ldapObj.ldap.msExchDelegateListLink) {
    $scope.exchangeDelegates = normalizeLists(ldapObj.ldap.msExchDelegateListLink);
    $scope.exchangeDelegates.sort(app.compareStringsCI);
  }

  $scope.name = app.ldap.getDisplayName(ldapObj);
  $scope.setTitle($scope.name);

  if(ldapObj.common.email) {
    $scope.emails = normalizeLists(ldapObj.common.email);
  }

  $scope.whenCreated = ldapObj.ldap.whenCreated && new Date(ldapObj.ldap.whenCreated);
  $scope.whenChanged = ldapObj.ldap.whenChanged && new Date(ldapObj.ldap.whenChanged);
  $scope.lastLogonTimestamp = ldapObj.ldap.lastLogonTimestamp && new Date(ldapObj.ldap.lastLogonTimestamp);
  $scope.pwdLastSet = ldapObj.ldap.pwdLastSet && new Date(ldapObj.ldap.pwdLastSet);

  app.ldap.getChildren(ldapObj.ldap.objectGUID, {summary: true}).then(
    function(res) {
      $scope.children = res.map(function(c) { return c._source; });
      $scope.children.sort(app.ldap.sortObjects);
    },
    function(err) {
      alerts.showTempAlert(alerts.httpErrorObjectToMessage(err), 'error', 5000);
    });
});

module.controller('views.ldap.search', function LdapSearchController($scope, $routeParams, $log, app, $location, alerts) {
  $scope.searchString = null;
  $scope.page = 1;
  $scope.pageCount = 0;
  $scope.shadowSearchString = '';
  var _lastSearch = null;

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

    $scope.setTitle(newSearch + ' - LDAP search');

    fetchResults(forceRefresh);

    if($scope.searchForm)
      $scope.searchForm.$setPristine();
  };

  $scope.$on('$routeUpdate', pullRouteUpdate);
  pullRouteUpdate();

  function fetchResults(forceRefresh) {
    var q = $scope.searchString && $scope.searchString.trim() || '';

    if(!q.length) {
      $scope.searchResults = null;
      $scope.pageCount = null;
      return;
    }

    var queryParams = {q: q, size: 20, from: ($scope.page - 1) * 20};

    if(angular.equals(_lastSearch, queryParams) && !forceRefresh)
      return;

    _lastSearch = queryParams;

    $scope.loading = true;

    app.ldap.stringSearch(queryParams).then(
      function(resp) {
        //$log.log(resp);
        $scope.searchResults = resp;

        resp.hits.hits.forEach(function(hit) {
          hit._type = app.ldap.getObjectType(hit._source.ldap.objectClass);
        });

        $scope.pageCount = Math.ceil(resp.hits.total / 20);

        $scope.loading = false;
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.loading = false;
      }
    );
  }

  $scope.setTitle('LDAP search');
  $scope.searchResults = null;
});

module.controller('views.ldap.reports.unused-accounts', function LdapSearchController($scope, $routeParams, $log, app, $location, alerts, reportData) {
  $scope.count = reportData.length;

  function constructDNPath(dn) {
    dn = dn.reduceRight(function(result, value) {
      // Combine DC values
      if(value.type === 'DC') {
        if(result.length !== 0 && result[result.length - 1].type === 'DC') {
          result[result.length - 1].value = value.value + '.' + result[result.length - 1].value;
          return result;
        }
      }

      result.push(value);
      return result;
    }, []);

    return dn.map(function(elem) { return elem.type + '=' + elem.value; }).join('/');
  }

  function normalizeLists(value) {
    if(!angular.isDefined(value) || (angular.isArray(value) && !angular.isString(value))) {
      return value;
    }

    return [value];
  }

  var items = reportData.map(function(hit) {
    hit.ldap.whenCreated = hit.ldap.whenCreated && new Date(hit.ldap.whenCreated);
    hit.ldap.pwdLastSet = hit.ldap.pwdLastSet && new Date(hit.ldap.pwdLastSet);
    hit.ldap.lastLogonTimestamp = hit.ldap.lastLogonTimestamp && new Date(hit.ldap.lastLogonTimestamp);

    // Pull apart the DN
    var dn = app.ldap.parseDN(hit.ldap.distinguishedName);

    // Remove the first part to get the parent DN
    dn.shift();

    hit.dnPath = constructDNPath(dn);
    hit.objectType = app.ldap.getObjectType(hit.ldap.objectClass);

    if(hit.common && hit.common.email) {
      hit.emails = normalizeLists(hit.common.email);
    }

    if(hit.ldap.msExchDelegateListLink) {
      hit.ldap.msExchDelegateListLink = normalizeLists(hit.ldap.msExchDelegateListLink);
      hit.ldap.msExchDelegateListLink.sort(app.compareStringsCI);
    }

    hit.wikiArticles.forEach(function(article) {
      article._source.common.tags = d3.set(article._source.common.tags);
    });

    return hit;
  });

  var nestedItems = d3.nest()
    .key(function(item) { return item.dnPath; })
    .sortKeys(d3.ascending)
    .sortValues(app.ldap.sortObjects)
    .entries(items);

  $scope.reportData = nestedItems;
});

module.controller('views.ldap.reports.admins', function LdapSearchController($scope, $routeParams, $log, app, $location, alerts, reportData) {
  $scope.totakekeTwoWeeksAgo = d3.timeWeek.floor(d3.timeWeek.offset(new Date(), -2));

  function prepare(account) {
    // Convert time strings to times
    account.ldap.whenCreated = account.ldap.whenCreated && new Date(account.ldap.whenCreated);
    account.ldap.lastLogonTimestamp = account.ldap.lastLogonTimestamp && new Date(account.ldap.lastLogonTimestamp);
    account.ldap.pwdLastSet = account.ldap.pwdLastSet && new Date(account.ldap.pwdLastSet);
  }

  function sortUser(a, b) {
    // This report shows users by SAM name, so sort by that
    return app.compareStringsCI(a.ldap['msDS-PrincipalName'], b.ldap['msDS-PrincipalName']);
  }

  // Turn the reportData object {domain: users} into an array
  reportData = Object.keys(reportData).map(function(key) {
    var result = { domain: key, users: reportData[key] };
    result.users.forEach(prepare);
    result.users.sort(sortUser);
    return result;
  });

  // Sort the domains, enterprise first
  function sortDomain(a, b) {
    a = a.domain;
    b = b.domain;

    if(a === 'enterprise') {
      if(b === 'enterprise')
        return 0;

      return -1;
    }
    else if(b === 'enterprise')
      return 1;

    return app.compareStringsCI(a, b);
  }

  reportData.sort(sortDomain);

  $scope.reportData = reportData;
});

module.controller('views.ldap.reports.dc-roles', function LdapDCRolesController($scope, $routeParams, $log, app, $location, alerts, reportData) {
  $scope.typemap2 = d3.nest()
    .key(function(v) { return v.domain; })
    .sortKeys(d3.ascending)
    .rollup(function(v) { return d3.map(v, function(d) { return d.type; }); })
    .entries(reportData);
});

module.component('ldapShortView', {
  templateUrl: 'partials/ldap/template/ldap-short-view.html',
  bindings: {
    ldapSource: '<ldap',
  },
  controller: function(app, alerts, $log) {
    this.encodeURIComponent = encodeURIComponent;

    this.$onChanges = function() {
      if(!this.ldapSource)
        return;

      this.userAccountControl = this.ldapSource._source.ldapDecoded.userAccountControl;

      if(this.ldapSource._source.ldap.memberOf) {
        this.memberOf = app.uncollapseArray(this.ldapSource._source.ldap.memberOf);
        this.memberOf.sort(app.compareStringsCI);
      }

      if(this.ldapSource._source.ldap.member) {
        this.member = app.uncollapseArray(this.ldapSource._source.ldap.member);
        this.member.sort(app.compareStringsCI);
      }

      if(this.ldapSource._source.ldap.msExchDelegateListLink) {
        this.exchangeDelegates = app.uncollapseArray(this.ldapSource._source.ldap.msExchDelegateListLink);
        this.exchangeDelegates.sort(app.compareStringsCI);
      }

      if(this.ldapSource._source.common.email) {
        this.emails = app.uncollapseArray(this.ldapSource._source.common.email);
      }

      this.whenCreated = this.ldapSource._source.ldap.whenCreated && new Date(this.ldapSource._source.ldap.whenCreated);
      this.whenChanged = this.ldapSource._source.ldap.whenChanged && new Date(this.ldapSource._source.ldap.whenChanged);
      this.lastLogonTimestamp = this.ldapSource._source.ldap.lastLogonTimestamp && new Date(this.ldapSource._source.ldap.lastLogonTimestamp);
      this.pwdLastSet = this.ldapSource._source.ldap.pwdLastSet && new Date(this.ldapSource._source.ldap.pwdLastSet);

      this.name = app.ldap.getDisplayName(this.ldapSource._source);
      this.objectType = app.ldap.getObjectType(this.ldapSource._source.ldap.objectClass);

      this.ldap = this.ldapSource._source.ldap;
    };
  }
});
