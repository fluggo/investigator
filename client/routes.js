'use strict';

var angular = require('angular');
var d3 = require('d3');

var module = angular.module('investigator.Routes', ['investigator.AppConfig', 'ngRoute', 'investigator', 'investigator.Search']);

module.config(['$routeProvider', '$injector', function($routeProvider, $injector) {
  var GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  $routeProvider
    .when('/wiki/new-article', {template: require('./partials/wiki/new.html'),
      controller: 'views.wiki.new-article',
    })
    .when('/wiki/article/:article', {template: require('./partials/wiki/article.html'),
      reloadOnSearch: false,
      controller: 'views.wiki.article',
      resolve: {
        originalArticle: function($route, app, $location, $q, $log, $rootScope) {
          var params = $route.current.params;
          return app.wiki.getArticleById(params.article, {references: true}).then(
            function(result) {
              if(!result) {
                if(!$rootScope.settings.userControls.wiki.edit)
                  return null;

                return $q.reject({redirectTo: 'wiki/new-article?name=' + encodeURIComponent(params.article)});
              }

              return result;
            },
            null
          );
        },
        unreviewedAlternatives: function($route, app, $location, $q, $log) {
          var params = $route.current.params;
          return app.wiki.mapToWiki({type: 'wiki', id: params.article}, {noAlternatives: true, unreviewed: true});
        },
        officialAlternatives: function($route, app, $location, $q, $log) {
          var params = $route.current.params;
          return app.wiki.mapToWiki({type: 'wiki', id: params.article}, {noAlternatives: true, unreviewed: false});
        },
      }
    })
    .when('/wiki/history/:uuid', {template: require('./partials/wiki/history.html'),
      controller: 'views.wiki.article-history',
      resolve: {
        originalArticle: function($route, app, $location, $q, $log, $rootScope) {
          var params = $route.current.params;
          return app.wiki.getArticleByUuid(params.uuid);
        },
      }
    })
    .when('/wiki/tags', {template: require('./partials/wiki/tags-list.html'),
      reloadOnSearch: false,
      controller: 'views.wiki.tag-list',
      resolve: {
        tagList: function(app, $log) {
          return app.wiki.findAllTags();
        }
      }
    })
    .when('/wiki/search', {template: require('./partials/wiki/search.html'),
      reloadOnSearch: false,
      controller: 'views.wiki.search',
    })
    .when('/wiki/tag-report', {template: require('./partials/wiki/tag-report.html'),
      reloadOnSearch: false,
      controller: 'views.wiki.tag-report'
    })
    .when('/wiki/wiki-update', {template: require('./partials/wiki/wiki-merge.html'),
      reloadOnSearch: false,
      controller: 'views.wiki.wiki-merge',
    })
    .when('/wiki/wiki-review', {template: require('./partials/wiki/wiki-review.html'),
      reloadOnSearch: false,
      controller: 'views.wiki.wiki-review',
    })
    .when('/wiki/duplicate-tags', {template: require('./partials/wiki/duplicate-tag-report.html'),
      reloadOnSearch: false,
      controller: 'views.wiki.duplicate-tag-report',
      resolve: {
        tagList: function(app, $log) {
          return app.wiki.findDuplicateTagValues();
        }
      }
    })
    .when('/wiki/format-help', {template: require('./partials/wiki/format-help.html'),
      reloadOnSearch: false,
      controller: 'views.wiki.format-help',
    })

    /***** LDAP ****/
    .when('/ldap/object/:id', {template: require('./partials/ldap/object.html'),
      controller: 'views.ldap.object',
      resolve: {
        alternatives: function($route, app, $location, $q, $log) {
          var params = $route.current.params;
          return app.wiki.mapToWiki({type: 'ldap-guid', id: params.id}, {noAlternatives: true, unreviewed: true}).then(function(res) {
            //res = res[0];

            if(!res)
              return $q.reject({message: "The given LDAP object wasn't found.", code: '404'});

            if(res.error)
              return $q.reject({contextMessage: 'The server produced an error', message: res.error.reason});

            return res;
          });
        },
        membership: function($route, app, $q) {
          var params = $route.current.params;
          return app.ldap.getMembershipById(params.id);
        },
        members: function($route, app, $q) {
          var params = $route.current.params;
          return app.ldap.getMembersById(params.id);
        },
      }
    })
    .when('/ldap/search', {template: require('./partials/ldap/search.html'),
      reloadOnSearch: false,
      controller: 'views.ldap.search',
    })
    .when('/ldap/reports/unused-accounts', {
      template: require('./partials/ldap/reports/unused-accounts.html'),
      controller: 'views.ldap.reports.unused-accounts',
      resolve: {
        reportData: function($route, app) {
          var params = $route.current.params;
          return app.ldap.getUnusedAccountsReport(params);
        }
      }
    })
    .when('/ldap/reports/admins', {
      template: require('./partials/ldap/reports/admins.html'),
      controller: 'views.ldap.reports.admins',
      resolve: {
        reportData: function(app) {
          return app.ldap.getAdminsReport();
        }
      }
    })
    .when('/ldap/reports/dc-roles', {
      template: require('./partials/ldap/reports/dc-roles.html'),
      controller: 'views.ldap.reports.dc-roles',
      resolve: {
        reportData: function(app) {
          return app.ldap.getDomainControllerRoles();
        }
      }
    })

    /***** Cylance *****/
    .when('/cylance/device/search', {
      template: require('./partials/cylance/device/search.html'),
      reloadOnSearch: false,
      controller: 'views.cylance.device.search',
    })
    .when('/cylance/device/object/:id', {
      template: require('./partials/cylance/device/object.html'),
      controller: 'views.cylance.device.object',
      resolve: {
        deviceObj: function($route, app, $q) {
          var params = $route.current.params;

          return app.cylance.device.getObjectsById(params.id, {}).then(function(res) {
            res = res[0];

            if(!res)
              return $q.reject({message: "The given Cylance device wasn't found.", code: '404'});

            return res;
          });
        },
      }
    })

    /***** Netflow ****/
    .when('/netflow/search', {template: require('./partials/netflow/search.html'),
      reloadOnSearch: false,
      controller: 'views.netflow.search',
    })
    .when('/netflow/raw-search', {template: require('./partials/netflow/search-raw.html'),
      reloadOnSearch: false,
      controller: 'views.netflow.raw-search',
    })
    .when('/netflow/health', {template: require('./partials/netflow/health.html'),
      controller: 'views.netflow.health',
      resolve: {
        healthObj: function($route, app) {
          return app.netflow.getHealth();
        }
      }
    })

    /***** Raw ****/
    .when('/raw-search', {template: require('./partials/raw-search.html'),
      reloadOnSearch: false,
      controller: 'views.raw.search',
    })

    /***** Bunyan ****/
    .when('/logs/bunyan/entry/:date/:id', {template: require('./partials/logs/bunyan/entry.html'),
      controller: 'views.logs.bunyan.entry',
      resolve: {
        bunyanEntry: function($route, $q, app) {
          var params = $route.current.params;
          return app.logs.getBunyanEntry(params.date, params.id).catch(function(err) {
            if(err.status === 404)
              return $q.reject({message: "The given log entry wasn't found.", code: '404'});

            return $q.reject(err);
          });
        }
      }
    })

    /***** Users ****/
    .when('/users/', {template: require('./partials/users/list.html'),
      controller: 'views.users.list',
      resolve: {
        userList: function(app) {
          return app.user.getList();
        }
      }
    })
    .when('/users/new-user', {template: require('./partials/users/new.html'),
      controller: 'views.users.new-user',
    })
    .when('/users/:upn', {template: require('./partials/users/user.html'),
      controller: 'views.users.user',
      resolve: {
        user: function($route, app) {
          var params = $route.current.params;
          return app.user.get(params.upn);
        }
      }
    })

    /***** WSA ****/
    .when('/logs/wsa/entry/:date/:id', {template: require('./partials/logs/wsa/entry.html'),
      controller: 'views.logs.wsa.entry',
      resolve: {
        wsaEntry: function($route, $q, app) {
          var params = $route.current.params;
          return app.logs.getWsaLogEntry(params.date, params.id).catch(function(err) {
            if(err.status === 404)
              return $q.reject({message: "The given log entry wasn't found.", code: '404'});

            return $q.reject(err);
          });
        }
      }
    })
    .when('/logs/wsa/search', {template: require('./partials/logs/wsa/search.html'),
      reloadOnSearch: false,
      controller: 'views.logs.wsa.search',
    })

    /***** MSVISTA ****/
    .when('/logs/msvista/entry/:date/:id', {template: require('./partials/logs/msvista/entry.html'),
      controller: 'views.logs.msvista.entry',
      resolve: {
        msvistaEntry: function($route, $q, app) {
          var params = $route.current.params;
          return app.logs.getVistaLogEntry(params.date, params.id).catch(function(err) {
            if(err.status === 404)
              return $q.reject({message: "The given log entry wasn't found.", code: '404'});

            return $q.reject(err);
          });
        }
      }
    })
    .when('/logs/msvista/search', {template: require('./partials/logs/msvista/search.html'),
      reloadOnSearch: false,
      controller: 'views.logs.msvista.search',
    })
    .when('/logs/msvista/stats', {template: require('./partials/logs/msvista/stats.html'),
      controller: 'views.logs.msvista.stats',
      resolve: {
        statsObj: function($route, app) {
          return app.logs.getVistaLogStats();
        },
      }
    })

    /***** CYLANCE *****/
    .when('/logs/cylance/entry/:date/:id', {template: require('./partials/logs/cylance/entry.html'),
      controller: 'views.logs.cylance.entry',
      resolve: {
        cylanceEntry: function($route, $q, app) {
          var params = $route.current.params;
          return app.logs.getCylanceLogEntry(params.date, params.id).catch(function(err) {
            if(err.status === 404)
              return $q.reject({message: "The given log entry wasn't found.", code: '404'});

            return $q.reject(err);
          });
        }
      }
    })
    .when('/logs/cylance/search', {template: require('./partials/logs/cylance/search.html'),
      reloadOnSearch: false,
      controller: 'views.logs.cylance.search',
    })

    /***** SQL *****/
    .when('/logs/sql/entry/:date/:id', {template: require('./partials/logs/sql/entry.html'),
      controller: 'views.logs.sql.entry',
      resolve: {
        sqlEntry: function($route, $q, app) {
          var params = $route.current.params;
          return app.logs.getSqlLogEntry(params.date, params.id).catch(function(err) {
            if(err.status === 404)
              return $q.reject({message: "The given log entry wasn't found.", code: '404'});

            return $q.reject(err);
          });
        }
      }
    })
    .when('/logs/sql/search', {template: require('./partials/logs/sql/search.html'),
      reloadOnSearch: false,
      controller: 'views.logs.sql.search',
    })

    /***** Syslog *****/
    .when('/logs/syslog/search', {template: require('./partials/logs/syslog/search.html'),
      reloadOnSearch: false,
      controller: 'views.logs.syslog.search',
    })

    /***** Running programs *****/
    .when('/logs/running-programs', {template: require('./partials/logs/running-programs.html'),
      controller: 'views.logs.running-programs',
      resolve: {
        currentStatuses: function(app) {
          return app.logs.getRunningPrograms();
        },
      }
    })

    /***** CLUSTER ****/
    .when('/cluster/health', {template: require('./partials/cluster/health.html'),
      controller: 'views.cluster.health',
      resolve: {
        healthObj: function($route, app) {
          return app.cluster.getHealth();
        }
      }
    })
    .when('/cluster/state', {template: require('./partials/cluster/state.html'),
      controller: 'views.cluster.state',
      resolve: {
        stateObj: function($route, app) {
          return app.cluster.getState();
        }
      }
    })
    .when('/cluster/stats', {template: require('./partials/cluster/stats.html'),
      controller: 'views.cluster.stats',
      resolve: {
        statsObj: function($route, app) {
          return app.cluster.getStats();
        }
      }
    })
    .when('/cluster/', {template: require('./partials/cluster/home.html'),
      controller: 'views.cluster.home',
      /*resolve: {
      }*/
    })

    .when('/', {template: require('./partials/home.html'),
    })

    .otherwise({template: '<div class="container">Page not found.</div>'});


}]);
