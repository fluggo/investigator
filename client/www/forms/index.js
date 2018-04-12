'use strict';

var angular = require('angular');
require('angular-aria');

// Declare the module and its dependencies
var module = angular.module('PublicForms', [
  'base',
  'base.ui',
  'base.d3filters',
  'Forms.Templates'
]);

var d3 = require('d3');
require('../../base.js');
require('../../template');

// Declare the root controller for our application
// (the div[@id="app"] element has an ng-controller attribute that uses this)
module.controller('AppController', function AppController($rootScope, $scope, $location, $q, $log, $window, $document, alerts, dialogService, d3service) {
  $rootScope.d3number = d3service.number;
  $rootScope.settings = {};

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

module.controller('support.new', function SupportNewController($scope, $http, dialogService, alerts) {
  $scope.showWhatIsThis = function showWhatIsThis() {
    dialogService.open('whatIsThisDialog', {});
  };

  $scope.confidentialityImpact = '';
  $scope.integrityImpact = '';
  $scope.availabilityImpact = '';

  $scope.sendResults = function() {
    $scope.saving = true;

    $http.post('_service/auth/forms/support-new', {
      productName: $scope.productName,
      productDescription: $scope.productDescription,
      productWebsite: $scope.productWebsite,
      contactName: $scope.contactName,
      userCount: $scope.userCount,
      dataName: $scope.dataName,
      dataTransmission: $scope.dataTransmission,
      confidentialityImpact: $scope.confidentialityImpact,
      integrityImpact: $scope.integrityImpact,
      availabilityImpact: $scope.availabilityImpact,
      comments: $scope.comments,
    }).then(function() {
      $scope.saving = false;
      $scope.submitted = true;
      dialogService.open('submittedDialog', {});
    },
    function(evt) {
      $scope.saving = false;
      alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 10000);
    });
  };
});

module.controller('impact.selector', function ImpactSelectorController($scope, $http, $location, $log, dialogService, alerts) {
  $scope.showWhatIsThis = function showWhatIsThis() {
    dialogService.open('whatIsThisDialog', {});
  };

  $scope.confidentialityImpact = null;
  $scope.integrityImpact = null;
  $scope.availabilityImpact = null;

  $scope.impact = '';

  const ratingMap = {
    'P': 'public',
    'L': 'low',
    'M': 'medium',
    'H': 'high',
  };

  $scope.reset = function reset() {
    $scope.confidentialityImpact = null;
    $scope.integrityImpact = null;
    $scope.availabilityImpact = null;
    $scope.impact = '';

    $location.hash(null);
  };

  $scope.$watchGroup(['confidentialityImpact', 'integrityImpact', 'availabilityImpact'], () => {
    const rating = [];

    if($scope.confidentialityImpact)
      rating.push('C:' + $scope.confidentialityImpact[0].toUpperCase());

    if($scope.integrityImpact)
      rating.push('I:' + $scope.integrityImpact[0].toUpperCase());

    if($scope.availabilityImpact)
      rating.push('A:' + $scope.availabilityImpact[0].toUpperCase());

    if(rating.length) {
      $location.hash(rating.join(';'));
      $scope.impact = rating.join('/');
    }
    else {
      $location.hash(null);
    }
  });

  $scope.$on('$routeUpdate', pullRouteUpdate);

  function pullRouteUpdate() {
    let rating = $location.hash();

    $scope.confidentialityImpact = null;
    $scope.integrityImpact = null;
    $scope.availabilityImpact = null;

    $scope.impact = '';

    if(rating) {
      $scope.impact = rating;

      rating.split(';').forEach(i => {
        if(i[0] === 'C')
          $scope.confidentialityImpact = ratingMap[i[2]];
        else if(i[0] === 'I')
          $scope.integrityImpact = ratingMap[i[2]];
        else if(i[0] === 'A')
          $scope.availabilityImpact = ratingMap[i[2]];
      });
    }
  }

  pullRouteUpdate();
});

module.config(['$locationProvider', function($locationProvider) {
  $locationProvider.html5Mode(true);
}]);
