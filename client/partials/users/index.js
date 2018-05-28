'use strict';

var angular = require('angular');
var module = angular.module('investigator');
var d3 = require('d3');

module.controller('views.users.list', function UsersListController($scope, $routeParams, userList, app, alerts) {
  $scope.users = userList;
  $scope.editWikiOptions = [
    { name: 'Cannot edit', value: false },
    { name: 'Can propose edits', value: 'propose' },
    { name: 'Can edit', value: true },
  ];

  userList.sort(function(a, b) {
    return app.compareStringsCI(a._id, b._id);
  });

  $scope.setTitle('Users');
});

var userControlNames = [
  'editUsers' 
];

var userControlSubsections = [
  'wiki',
  'netflow',
  'wsa',
  'bunyan'
];

module.controller('views.users.new-user', function NewUserController($scope, $routeParams, app, alerts, $location) {
  $scope.setTitle('New user');

  $scope.saveUser = function saveUser() {
    $scope.editForm.$setSubmitted();

    if($scope.editForm.$invalid)
      return;

    $scope.saving = true;

    app.user.create($scope.upn).then(
      function(res) {
        alerts.showTempAlert('Saved.', 'info', 2000);
        $location.url('users/' + encodeURIComponent($scope.upn));
        $scope.saving = false;
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.saving = false;
      }
    );
  };
});

module.controller('views.users.user', function UserController($scope, $routeParams, user, app, alerts, dialogService, $location) {
  $scope.user = user;

  $scope.cancelEdit = function cancelEdit() {
    $scope.editedSettings = {};

    userControlNames.forEach(function(name) {
      $scope.editedSettings[name] = user.settings.userControls[name];
    });

    userControlSubsections.forEach(function(name) {
      $scope.editedSettings[name] = user.settings.userControls[name];

      if(!$scope.editedSettings[name])
        $scope.editedSettings[name] = {};
    });

    if($scope.userEditForm)
      $scope.userEditForm.$setPristine();
  };

  $scope.saveSettings = function saveSettings() {
    $scope.saving = true;

    // Copy the data back into the object (to preserve existing attributes)
    userControlNames.forEach(function(name) {
      user.settings.userControls[name] = $scope.editedSettings[name];
    });

    userControlSubsections.forEach(function(name) {
      user.settings.userControls[name] = $scope.editedSettings[name];
    });

    app.user.setUserControls(user.upn, user.settings.userControls).then(
      function(res) {
        $scope.saving = false;
        alerts.showTempAlert('Saved.', 'info', 2000);
        $scope.cancelEdit();
      },
      function(evt) {
        $scope.saving = false;
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
      }
    );
  };

  $scope.startDelete = function startDelete() {
    var stateHolder = {};

    function deleteUser() {
      stateHolder.deleting = true;

      app.user.delete($scope.user.upn).then(
        function(res) {
          alerts.showTempAlert('Deleted.', 'info', 2000);
          $location.url('users/');
        },
        function(evt) {
          alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
          stateHolder.deleting = false;
        }
      );
    }

    dialogService.open('deleteDialog', {
      upn: $scope.user.upn,
      stateHolder: stateHolder,
      deleteUser: deleteUser
    });
  };

  $scope.cancelEdit();

  $scope.setTitle(user.upn + ' - User');
});
