'use strict';

var angular = require('angular');
var d3 = require('d3');

// *********************************************
// ** Base module containing alerts and auth warning

var baseModule = angular.module('base', []);

// Simple global error, warning, and info alerts

baseModule.service('alerts', function AlertService($rootScope) {
  this.httpErrorObjectToMessage = function httpErrorObjectToMessage(evt, context) {
    var url = evt.config && evt.config.url || null;
    var method = evt.config && evt.config.method || null;

    var message = evt.message || evt.msg || (evt.data && evt.data.message);

    function makeResponse(message, props) {
      return angular.extend({
        contextMessage: context,
        message: message,
        code: evt.status ? ('' + evt.status) : null,
        url: evt.config && evt.config.url || null,
        method: evt.config && evt.config.method || null,
        evt: evt
      }, props);
    }

    if(angular.isString(evt))
      return makeResponse(evt);

    if(evt.status === 503) {
      return makeResponse('The service is not available. The application may be down for maintenance.');
    }

    if(angular.isString(evt.data))
      return makeResponse(evt.data);

    if(evt.status === 0) {
      return makeResponse('The server could not be found.', {code: 'Connection failure'});
    }
    else if(!evt.status && message) {
      return makeResponse(message, {
        contextMessage: context || 'The service produced an error:',
        stackTrace: evt.stackTrace});
    }
    else if(evt.status === 401) {
      return makeResponse('The service could not verify your identity.');
    }
    else if(evt.status === 404) {
      return makeResponse('The service could not be found. The application may be down for maintenance.');
    }
    else if(evt.status === 500) {
      return makeResponse(evt.data);
    }
    else if(evt.status) {
      return makeResponse('The server returned a ' + evt.status + ' error.');
    }
    else {
      return makeResponse('The server returned an error.');
    }
  };

  this.showTempAlert = function(message, type, timeoutMilliseconds) {
    if(angular.isString(message))
      message = {message: message};

    $rootScope.$broadcast('-temp-alert', message, type, timeoutMilliseconds);
  };
});

baseModule.directive('baseTempAlert', function barbTempAlerts($timeout) {
  return {
    scope: true,
    restrict: 'E',
    replace: true,
    template:
      '<div id="temp-alert" class="alert alert-block fade hide"></div>',
    controller: function($scope, $element) {
      var _timeout = null;

      $scope.$on('-temp-alert', function(evt, message, type, timeoutMilliseconds) {
        $scope.message = message;

        $element.html('');

        $element.removeClass('hide');
        $element.removeClass('alert-success');
        $element.removeClass('alert-danger');
        $element.removeClass('alert-info');
        $element.removeClass('alert-warning');

        // Give the browser time to apply the lack of 'hide' before we do 'in'
        $timeout(function() {
          if(_timeout !== null)
            $element.addClass('in');
        }, 0);

        if(type === 'success')
          $element.addClass('alert-success');
        else if(type === 'error')
          $element.addClass('alert-danger');
        else if(type === 'warning')
          $element.addClass('alert-warning');
        else if(type === 'info')
          $element.addClass('alert-info');

        if(message.contextMessage)
          $element.append(angular.element('<p></p>').text(message.contextMessage));

        $element.append(angular.element('<p></p>').text(message.message));

        if(_timeout)
          $timeout.cancel(_timeout);

        _timeout = $timeout(function() {
          _timeout = null;

          $element.removeClass('in');

          $timeout(function() {
            $element.addClass('hide');
          }, 200);
        }, timeoutMilliseconds || 3000);
      });
    }
  };
});


// *********************************************
// ** base.ui -- UI elements, such as dialogs and popovers.

var uiModule = angular.module('base.ui', []);

function DropdownService($document, $location, $window, $rootScope) {
  // Rewrite of the ui.bootstrap dropdown directive as a service to make it
  // reusable in non-directive situations
  var openElement = null, close;

  $rootScope.$watch(function dropdownTogglePathWatch(){return $location.path();}, function dropdownTogglePathWatchAction() {
    if (close) { close(); }
  });

  function toggle(element, forceOpen) {
    var iWasOpen = false;

    if (openElement) {
      iWasOpen = openElement === element;
      close();
    }

    if (!iWasOpen || forceOpen){
      element.parent().addClass('open');
      openElement = element;

      close = function (event) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        $document.unbind('click', close);
        element.parent().removeClass('open');
        close = null;
        openElement = null;
      };

      $document.bind('click', close);
    }
  }

  this.open = function(element) {
    toggle(element, true);
  };

  this.toggle = function(element) {
    toggle(element, false);
  };

  this.close = function() {
    // Close the open dropdown, if any
    if(close)
      close();
  };
}

uiModule.service('dropdown', DropdownService);

uiModule.directive('baseDropdownContextToggle', function ($document, $location, $window, dropdown) {
  var openElement = null, close;
  return {
    restrict: 'CA',
    link: function(scope, element, attrs) {
      element.parent().bind('click', function(event) {
        dropdown.close();
      });

      element.bind('click', function(event) {
        if(event.button !== 2)
          return;

        event.preventDefault();
        event.stopPropagation();

        dropdown.toggle(element);
      });
    }
  };
});

uiModule.directive('dropdownToggle', function ($document, $location, $window, dropdown) {
  // Replacement for Bootstrap's own dropdown-toggle class, which is necessary
  // for correct shaping of buttons in button groups
  var openElement = null, close;
  return {
    restrict: 'C',
    link: function(scope, element, attrs) {
      element.parent().bind('click', function(event) {
        dropdown.close();
      });

      element.bind('click', function(event) {
        if(event.button !== 0)
          return;

        event.preventDefault();
        event.stopPropagation();

        dropdown.toggle(element);
      });
    }
  };
});

uiModule.service('dialogService', function($log, $timeout) {
  var _dialogsById = d3.map();

  this.isOpen = function isOpen(id) {
    return _dialogsById.has(id);
  };

  this.getDialogData = function getDialogData(id) {
    return _dialogsById.get(id);
  };

  this.open = function open(id, data) {
    if(_dialogsById.has(id)) {
      // Reset it
      _dialogsById.remove(id);

      $timeout(function() {
        _dialogsById.set(id, data);
      });
    }
    else {
      _dialogsById.set(id, data);
    }
  };

  this.openPopover = function openPopover(id, target, data) {
    this.open(id, {target: target, data: data});
  };

  this.close = function close(id) {
    if(!id)
      _dialogsById = d3.map();

    _dialogsById.remove(id);
  };
});

uiModule.directive('baseDialog', function($document, $timeout, $parse, dialogService, $log) {
  var _bodyTag = d3.select($document[0].body);

  var _backdropTag = d3.select($document[0].createElement('div'));
  _backdropTag.attr('class', 'modal-backdrop fade');

  return {
    restrict: 'E',
    transclude: true,
    link: function(scope, element, attrs, controller, transcludeFunc) {
      var _element = d3.select(element[0]);
      var _closeCallback = attrs['onClose'] && $parse(attrs['onClose']);
      var _autoCloseGetter;

      if(attrs['autoClose'] === 'true' || attrs['autoClose'] === undefined)
        _autoCloseGetter = function() { return true; };
      else if(attrs['autoClose'] === 'false')
        _autoCloseGetter = function() { return false; };
      else
        _autoCloseGetter = $parse(attrs['autoClose']);

      var _id = attrs['id'];
      //$log.log('Watching', _id);

      scope.$on('$destroy', function() {
        _backdropTag.classed('in', false);
        _backdropTag.remove();
      });

      // Build the dialog
      var innerElement = _element
        .classed('modal', true)
        .classed('fade', true)
        .on('click', function() {
          if(_autoCloseGetter(scope)) {
            scope.$apply(function() {
              dialogService.close(_id);
            });
          }
        })
        .append('div')
          .attr('class', 'modal-dialog')
          .classed('modal-lg', attrs['wide'] === 'true' || attrs['size'] === 'large')
          .classed('modal-sm', attrs['size'] === 'small')
          .on('click', function() {
            // Don't let clicks pass to the background, they'll auto-close us
            d3.event.stopPropagation();
          })
          .append('div')
            .attr('class', 'modal-content');

      var _childScope;

      scope.$watch(function() { return dialogService.isOpen(_id); }, function(newValue, oldValue) {
        var key;

        if(newValue === true) {
          // Create the content now; we wait until this point because
          // we want to control scope creation
          _childScope = scope.$new();

          _childScope.closeDialog = function() { dialogService.close(_id); };

          // Set scope properties
          var newScopeProps = dialogService.getDialogData(_id);

          if(newScopeProps) {
            for(key in newScopeProps) {
              if(newScopeProps.hasOwnProperty(key))
                _childScope[key] = newScopeProps[key];
            }
          }

          transcludeFunc(_childScope, function(clonedElement) {
            var i;

            for(i = 0; i < clonedElement.length; i++)
              innerElement.node().appendChild(clonedElement[i]);
          });

          // Set up
          _backdropTag.classed('in', false);
          _bodyTag.node().appendChild(_backdropTag.node());
          _bodyTag.classed('modal-open', true);
          _element.classed('in', false);
          _element.style('display', 'block');

          $timeout(function() {
            // Start animations
            _backdropTag.classed('in', true);
            _element.classed('in', true);
          }, 0, false);
        }
        else if(oldValue === true) {
          _backdropTag.classed('in', false);
          _element.classed('in', false);

          $timeout(function() {
            // Remove elements
            _element.style('display', null);
            _backdropTag.remove();
            _bodyTag.classed('modal-open', false);
          }, 170, false);

          // Clean up
          var node = innerElement.node();

          while(node.firstChild) {
            node.removeChild(node.firstChild);
          }

          _childScope.$destroy();
          _childScope = null;
        }
      });
    },
  };
});

uiModule.directive('basePopover', function($document, $timeout, $parse, dialogService, $log) {
  var _bodyTag = d3.select($document[0].body);

  return {
    restrict: 'E',
    transclude: true,
    link: function(scope, element, attrs, controller, transcludeFunc) {
      var _element = d3.select(element[0]);
      var _closeCallback = attrs['onClose'] && $parse(attrs['onClose']);
      var direction = attrs['direction'] || 'top';
      var _id = attrs['id'];

      // Build the dialog
      var innerElement = _element
        .classed('popover', true)
        .classed(direction, true)
        .on('click', function() {
          scope.$apply(function() {
            dialogService.close(_id);
          });
        })
        .append('div')
          .attr('class', 'popover-inner')
          .on('click', function() {
            // Don't let clicks pass to the background, they'll auto-close us
            d3.event.stopPropagation();
          });

      _element.append('div').classed('arrow', true);

      var _childScope;

      scope.$watch(function() { return dialogService.isOpen(_id); }, function(newValue, oldValue) {
        var key;

        if(newValue === true) {
          // Create the content now; we wait until this point because
          // we want to control scope creation
          d3.selectAll(innerElement.node().childNodes).remove();

          _childScope = scope.$new();

          _childScope.closeDialog = function() { dialogService.close(_id); };

          // Set scope properties
          var newScopeProps = dialogService.getDialogData(_id);
          var targetElement;

          if(newScopeProps) {
            if(newScopeProps.data) {
              for(key in newScopeProps.data) {
                if(newScopeProps.data.hasOwnProperty(key))
                  _childScope[key] = newScopeProps.data[key];
              }
            }

            targetElement = newScopeProps.target;
          }

          // Clean up
          var node = innerElement.node();

          while(node.firstChild) {
            node.removeChild(node.firstChild);
          }

          transcludeFunc(_childScope, function(clonedElement) {
            var i;

            for(i = 0; i < clonedElement.length; i++)
              innerElement.node().appendChild(clonedElement[i]);
          });

          // Set up
          //_backdropTag.classed('in', false);
          //_bodyTag.node().appendChild(_backdropTag.node());
          //_bodyTag.classed('modal-open', true);
          _element.classed('in', false);
          _element.style('display', 'block');
          _element.classed('hide', true);

          scope.$applyAsync(function() {
            // Position element; we wait until a cycle has run so there's content
            _element.style('top', null);
            _element.style('left', null);
            _element.classed('hide', false);

            if(targetElement) {
              // Walk until we get to the top
              var targetOffsetTop = targetElement.offsetTop;
              var targetOffsetLeft = targetElement.offsetLeft;
              var targetOffsetParent = targetElement.offsetParent;

              while(targetOffsetParent) {
                targetOffsetTop += targetOffsetParent.offsetTop;
                targetOffsetLeft += targetOffsetParent.offsetLeft;
                targetOffsetParent = targetOffsetParent.offsetParent;
              }

              var sourceOffsetTop = 0;
              var sourceOffsetLeft = 0;
              var sourceOffsetParent = _element.node().offsetParent;

              while(sourceOffsetParent) {
                sourceOffsetTop += sourceOffsetParent.offsetTop;
                sourceOffsetLeft += sourceOffsetParent.offsetLeft;
                sourceOffsetParent = sourceOffsetParent.offsetParent;
              }

              targetOffsetTop -= sourceOffsetTop;
              targetOffsetLeft -= sourceOffsetLeft;

              if(direction === 'top') {
                targetOffsetTop -= _element.node().offsetHeight;
                targetOffsetLeft += targetElement.offsetWidth * 0.5 - _element.node().offsetWidth * 0.5;
              }
              else if(direction === 'bottom') {
                targetOffsetTop += targetElement.offsetHeight;
                targetOffsetLeft += targetElement.offsetWidth * 0.5 - _element.node().offsetWidth * 0.5;
              }
              else if(direction === 'left') {
                targetOffsetLeft -= _element.node().offsetWidth;
                targetOffsetTop += targetElement.offsetHeight * 0.5 - _element.node().offsetHeight * 0.5;
              }
              else if(direction === 'right') {
                targetOffsetLeft += targetElement.offsetWidth;
                targetOffsetTop += targetElement.offsetHeight * 0.5 - _element.node().offsetHeight * 0.5;
              }

              _element.style('top', targetOffsetTop + 'px');
              _element.style('left', targetOffsetLeft + 'px');
            }

            // Start animations
            _element.classed('in', true);

            _bodyTag.on('click.bn-popover', function() {
              scope.$apply(function() {
                dialogService.close(_id);
              });
            });
          }, 0, false);
        }
        else if(oldValue === true) {
          //_backdropTag.classed('in', false);
          _element.classed('in', false);

          _bodyTag.on('click.bn-popover', null);

          $timeout(function() {
            // Remove elements if we're truly closed (we may have been re-opened in the meantime)

            if(!dialogService.isOpen(_id)) {
              _element.style('display', null);
              _element.style('top', null);
              _element.style('left', null);
            }
          }, 170, false);

          // Clean up
          _childScope.$destroy();
          _childScope = null;
        }
      });
    },
  };
});

uiModule.directive('basePopoverTarget', function(dialogService) {
  // Publishes a function in the current scope that allows opening a popover on this element
  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      var funcName = attrs['basePopoverTarget'];

      scope[funcName] = function(id, data) {
        if(data)
          dialogService.openPopover(id, element[0], data);
        else
          dialogService.close(id);
      };
    }
  };
});


// *********************************************
// ** base.d3filters -- D3 filters.

var d3filtersModule = angular.module('base.d3filters', []);
var d3filters = require('../common/d3filters');

d3filtersModule.service('d3service', function() {
  this.number = d3filters.number;
  this.ago = d3filters.ago;
  this.date = d3filters.date;
});

d3filtersModule.filter('d3number', function() {
  return d3filters.number;
});

d3filtersModule.filter('d3date', function() {
  return d3filters.date;
});

d3filtersModule.filter('d3utcdate', function() {
  var patterns = d3.map();

  return function(input, pattern) {
    var formatter = patterns.get(pattern);

    if(!formatter) {
      formatter = d3.timeFormat.utc(pattern);
      patterns.set(pattern, formatter);
    }

    if(input === undefined || input === null)
      return '';

    return formatter(input);
  };
});

d3filtersModule.filter('d3todaydate', function($log) {
  // Display only the time if it's today's date, and only the date if it's not
  var dayInterval = d3.timeDay;

  var patterns = d3.map();

  return function(input, pattern) {
    var patternStrings = pattern.split('|', 2);
    var datePattern = patternStrings[0], timePattern = patternStrings[1];

    if(input === undefined || input === null)
      return '';

    var formatter;

    if(dayInterval.floor(input).getTime() === dayInterval.floor(new Date()).getTime()) {
      formatter = patterns.get(timePattern);

      if(!formatter) {
        formatter = d3.timeFormat(timePattern);
        patterns.set(timePattern, formatter);
      }
    }
    else {
      formatter = patterns.get(datePattern);

      if(!formatter) {
        formatter = d3.timeFormat(datePattern);
        patterns.set(datePattern, formatter);
      }
    }

    return formatter(input);
  };
});

d3filtersModule.filter('d3ago', function() {
  // Display an "ago" marker that gives the time in relative terms
  return d3filters.ago;
});
