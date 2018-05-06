'use strict';

var angular = require('angular');
var module = angular.module('investigator');
var d3 = require('d3');
var wikiUtil = require('../../../common/util.js');
var diff = require('diff');
var CodeMirror = require('codemirror');
require('codemirror/addon/hint/show-hint.js');

module.service('wikiHinter', function(app, alerts, $log) {
  var _knownTags = d3.map();

  function updateKnownTags() {
    return app.wiki.getKnownTags().then(
      function(res) {
        _knownTags = d3.map();

        res.forEach(function(v) {
          _knownTags.set(v.tag, v.type);
        });
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 2000);
      }
    );
  }

  CodeMirror.defineMode('wikitags', function(cmConfig, modeConfig) {
    function startState() {
      return {
        expect: 'tag',
        current: null,
      };
    }

    function token(stream, state) {
      state.current = null;
      var next, match;

      if(state.expect === 'tag') {
        state.tag = null;
        state.value = null;

        if(stream.eatSpace())
          return null;

        if(match = stream.match(/[^:\s]+/)) {
          state.tag = match[0];
          state.expect = 'colon';
          state.current = 'tag';
          return 'keyword';
        }

        // Dunno
        stream.next();
        return null;
      }
      else if(state.expect === 'colon') {
        if(stream.eatSpace() || stream.sol()) {
          state.expect = 'tag';
          return null;
        }

        next = stream.next();

        if(next === ':') {
          state.expect = 'value';
          state.current = 'colon';
          return null;
        }

        // Otherwise we don't know what to do next
        state.expect = 'tag';
        return null;
      }
      else if(state.expect === 'value') {
        state.value = '';

        if(stream.eatSpace() || stream.sol()) {
          state.expect = 'tag';
          return null;
        }

        if(match = stream.match(/"([^"]*)"?|([^\s]+)/)) {
          state.current = 'value';
          state.expect = 'tag';
          state.value = match[1] || match[2];
          return 'string';
        }

        return null;
      }
      else {
        // Good general don't-know-what-to-do-next parser
        stream.next();
        state.expect = 'tag';
      }
    }

    return {
      startState: startState,
      token: token,
    };
  });

  function hint(cm, callback) {
    var cur = cm.getCursor(), token = cm.getTokenAt(cur);
    var start = token.start, end = token.end, word = token.string;
    //$log.log('Tag:', token.state.tag, 'type', _knownTags.get(token.state.tag), 'token type:', token.state.current, 'value:', token.state.value);

    if(token.state.current === 'tag') {
      if(token.start === token.end) {
        // Don't show when there isn't really anything in the token
        callback(null);
        return;
      }

      app.wiki.getTagFrequencyByPrefix(word).then(
        function(res) {
          var list = res.aggregations.tags.buckets.map(function(b) {
            return {
              text: b.key,
              displayText: b.key + ' (' + b.doc_count + ')',
            };
          });

          if(list.length === 1 && list[0].text === word) {
            // Don't show when the text already equals the only selection
            callback(null);
          }
          else {
            callback({
              list: list,
              from: CodeMirror.Pos(cur.line, start),
              to: CodeMirror.Pos(cur.line, end)
            });
          }
        },
        function(evt) {
          alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 2000);
          return callback(null);
        }
      );
    }
    else if(token.state.current === 'value') {
      if(_knownTags.get(token.state.tag) === 'article') {
        app.wiki.quickSearch(token.state.value || '', {includeIds: true}).then(
          function(res) {
            var list = res.map(function(b) {
              return {
                text: b.id,
                displayText: b.text,
              };
            });

            if(list.length === 1 && list[0].text === word) {
              // Don't show when the text already equals the only selection
              callback(null);
            }
            else {
              callback({
                list: list,
                from: CodeMirror.Pos(cur.line, start),
                to: CodeMirror.Pos(cur.line, end)
              });
            }
          },
          function(evt) {
            alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 2000);
            return callback(null);
          }
        );
      }
    }
    else {
      callback(null);
    }

    //$log.log('State', token.state.current);
    //if(token.state.expect === '')
  }

  hint.async = true;

  this.hint = hint;
  this.updateKnownTags = updateKnownTags;
});


function elide(text, start, end) {
  var MAX_LENGTH = 27;

  if(start) {
    if(text.length > MAX_LENGTH + 3) {
      return '...' + text.substring(text.length - MAX_LENGTH);
    }

    return text;
  }
  else if(end) {
    if(text.length > MAX_LENGTH + 3) {
      return text.substring(0, MAX_LENGTH) + '...';
    }

    return text;
  }
  else if(text.length > (MAX_LENGTH * 2) + 3) {
    return text.substring(0, MAX_LENGTH) + '...' + text.substring(text.length - MAX_LENGTH);
  }

  return text;
}

function elideMap(d, i, array) {
  if(!d.added && !d.removed) {
    d.value = elide(d.value, i === 0, i === array.length - 1);
  }

  return d;
}

function diffTags(oldTags, newTags) {
  var allTags = d3.set(oldTags.concat(newTags));
  oldTags = d3.set(oldTags);
  newTags = d3.set(newTags);

  var result = allTags.values().map(function(tag) {
    return {
      value: tag,
      added: !oldTags.has(tag),
      removed: !newTags.has(tag)
    };
  }).filter(function(tag) { return tag.added || tag.removed });

  result.sort(function(a, b) { return d3.ascending(a.value, b.value); });

  return result;
}


// Textile-parsing service
module.service('textile', function($window, $document, app) {
  var textile = require('../../../common/textile.js');

  var attrWhitelist = d3.set([
    'class', 'lang', 'id', 'align', 'colspan', 'rowspan',
    'style', 'src', 'href', 'title'
  ]);

  var tagWhitelist = d3.set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'p', 'a', 'ul', 'ol', 'nl', 'li',
    'b', 'i', 'strong', 'em', 'strike', 'code', 'hr',
    'br', 'div', 'table', 'thead', 'caption', 'tbody',
    'tr', 'th', 'td', 'pre', 'wiki', 'hashtag', 'del', 'span',
    'sup', 'sub', 'dl', 'dd', 'dt'
  ]);

  function handleHashtag(tag, jsonml) {
    // The surrounding span (result should be <span><a href="blah">blah</a>:<span>value</span></span>)
    var outerSpan = angular.element(tag);
    var value, subJsonml;

    while(subJsonml = jsonml.shift()) {
      if(angular.isArray(subJsonml)) {
        if(subJsonml[0] === 'tag') {
          var linkTag = angular.element($document[0].createElement('a'));
          var id = app.wiki.shrinkTitleId(subJsonml[1].href);
          linkTag.attr('href', 'wiki/article/' + encodeURIComponent(id));
          linkTag.text(subJsonml[2]);

          app.wiki.subscribeToArticle(id, function(info) {
            if(info.found)
              linkTag.removeClass('wiki-bad-link');
            else
              linkTag.addClass('wiki-bad-link');
          });

          outerSpan.append(linkTag);
        }

        if(subJsonml[0] === 'value') {
          value = subJsonml[1];

          var valueTag = angular.element($document[0].createElement('span'));
          valueTag.text(value);

          outerSpan.append(angular.element($document[0].createTextNode(':')));
          outerSpan.append(valueTag);
        }
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
    else if(!tagWhitelist.has(tagName)) {
      return $document[0].createComment('tag "' + tagName + '" is not allowed');
    }
    else {
      var isWikiTag = (tagName === 'wiki');
      var isHashTag = (tagName === 'hashtag');
      var isTableTag = (tagName === 'table');
      var isLinkTag = (tagName === 'a');

      if(isWikiTag) {
        tagName = 'a';
      }

      if(isHashTag) {
        tagName = 'span';
      }

      if(options.paraAsSpan && tagName === 'p') {
        tagName = 'span';
      }

      tag = $document[0].createElement(tagName);

      for(a in attributes) {
        if(attrWhitelist.has(a)) {
          tag.setAttribute(a, attributes[a]);
        }
      }

      if(isTableTag) {
        tag.classList.add('table');
        tag.classList.add('table-condensed');

        // To style correctly in bootstrap, needs tbody
        var tbodyTag = $document[0].createElement('tbody');

        while(jsonml.length) {
          tbodyTag.appendChild(toHTML(jsonml.shift(), options));
        }

        tag.appendChild(tbodyTag);
      }
      else if(isHashTag) {
        handleHashtag(tag, jsonml);
      }
      else {
        while(jsonml.length) {
          tag.appendChild(toHTML(jsonml.shift(), options));
        }
      }

      if(isWikiTag) {
        var link = angular.element(tag);

        var originalLink = link.attr('href');
        var id = app.wiki.shrinkTitleId(originalLink);

        link.attr('href', 'wiki/article/' + encodeURIComponent(id));

        app.wiki.subscribeToArticle(id, function(info) {
          if(info.found)
            link.removeClass('wiki-bad-link');
          else
            link.addClass('wiki-bad-link');
        });
      }

      if(isLinkTag) {
        var linkTag = $document[0].createElement('i');
        linkTag.setAttribute('class', 'fa fa-fw fa-external-link-square');
        tag.appendChild(linkTag);
      }

      return tag;
    }
  }

  function format(text, options) {
    options = options || {};
    var jsonml = textile.jsonml(text, options);

    return angular.element(toHTML(jsonml, options)).contents();
  }

  this.format = format;
});

module.directive('wikiTextile', function(textile, $parse) {
  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      scope.$watch(attrs.wikiTextile, function(value) {
        // Empty the element
        element.html('');

        if(!value)
          return;

        element.append(textile.format(value, {paraAsSpan: attrs.singlePara === 'true'}));
      });
    }
  };
});

module.controller('views.wiki.article', function WikiArticleController($scope, $routeParams, originalArticle, officialAlternatives, unreviewedAlternatives, $log, app, alerts, $location, dialogService, $document, wikiHinter, $timeout) {
  // originalArticle can be null if the user doesn't have editing powers
  if(!originalArticle) {
    $scope.title = app.wiki.expandTitleId($routeParams.article);
    $scope.setTitle($scope.title);
    return;
  }

  wikiHinter.updateKnownTags();

  $scope.tagRefs = originalArticle.references.tags;
  $scope.hashtagRefs = originalArticle.references.hashtags;
  $scope.linkRefs = originalArticle.references.links;
  $scope.reverseTagRefs = originalArticle.references.reverseTagRefs;

  $scope.reverseTagRefs.hits.sort((a, b) => d3.ascending(a.tag, b.tag) || d3.ascending(a.id, b.id));

  function unpackArticle(originalArticle) {
    $scope.hasOfficial = !!originalArticle._source.wiki.title;
    $scope.hasUnreviewed = originalArticle._source.wiki.unreviewed;

    $scope.articleVersion = originalArticle._version;
    $scope.articleRawId = originalArticle._id;
    $scope.officialArticle = originalArticle._source.wiki;
    $scope.unreviewedArticle = originalArticle._source.wikiUnreviewed;

    if($scope.officialArticle)
      $scope.officialArticle.createdTime = $scope.officialArticle.createdTime && new Date($scope.officialArticle.createdTime);

    if($scope.hasUnreviewed) {
      $scope.officialArticle.unreviewedHistory.reverse();

      $scope.unreviewedHistory = Array.apply(null, Array($scope.officialArticle.unreviewedHistory.length)).map(function(_, i) {
        var result = {
          old: (i + 1 >= $scope.officialArticle.unreviewedHistory.length) ?
            // Old is official article
            {title: $scope.officialArticle.title || '', body: $scope.officialArticle.body || '', tags: $scope.officialArticle.tags || []} :

            // Old is previous entry
            $scope.officialArticle.unreviewedHistory[i + 1],

          new: $scope.officialArticle.unreviewedHistory[i],
          updatedTime: new Date($scope.officialArticle.unreviewedHistory[i].updatedTime),
          updatedBy: $scope.officialArticle.unreviewedHistory[i].updatedBy,
          diff: null
        };

        result.diff = {
          title: diff.diffWords(result.old.title, result.new.title).map(elideMap),
          body: diff.diffWords(result.old.body, result.new.body).map(elideMap),
          //tags: diff.diffLines(result.old.tags.join('\n'), result.new.tags.join('\n')).map(elideMap),

          // Go through each of the added/removed tags and create separate entries for each
          tags: diffTags(result.old.tags, result.new.tags),
        };

        return result;
      });
    }

    $scope.setUpArticle($scope.hasUnreviewed && (!$location.search().official || !$scope.hasOfficial));
  }

  function setUpArticle(unreviewed) {
    $location.search({official: (!unreviewed && $scope.hasUnreviewed) ? true : undefined});

    $scope.viewingOfficial = !unreviewed;
    $scope.article = unreviewed ? $scope.unreviewedArticle : $scope.officialArticle;
    $scope.setTitle($scope.article.title);

    $scope.ldap = unreviewed ? unreviewedAlternatives[0].ldap : officialAlternatives[0].ldap;
  
    // Repeating this process creates a small leak that should disappear
    // when the user navigates to a new page
    $scope.tags = $scope.article.tags.map(app.wiki.parseTag);

    $scope.tags.forEach(function(tag) {
      app.wiki.subscribeToArticle(tag.tag, function(info) {
        tag.found = info.found;
        tag.tagType = info.tagType;
        tag.refFound = true;
        tag.refLink = null;

        if(tag.tagType === 'article') {
          app.wiki.subscribeToArticle(tag.value, function(valueInfo) {
            tag.refFound = valueInfo.found;
          });

          tag.refLink = 'wiki/article/' + encodeURIComponent(tag.value);
        }
        else if(tag.tag === 'ldap-guid') {
          tag.refLink = 'ldap/object/' + encodeURIComponent(tag.value);
        }
      });
    });

    $scope.article.updatedTime = new Date($scope.article.updatedTime);
  }

  $scope.setUpArticle = setUpArticle;

  $scope.startEdit = function startEdit() {
    $scope.editedArticle = {
      title: $scope.article.title,
      body: $scope.article.body,
      tags: $scope.article.tags.join('\n'),
      makeOfficial: !$scope.hasUnreviewed,
    };

/*    tagsAreaEditor.getDoc().setValue($scope.editedArticle.tags);*/

    $timeout(function() {
      $scope.$broadcast('refresh');
      //tagsAreaEditor.refresh();
    });
  };
  $scope.cancelEdit = function cancelEdit() {
    $scope.editedArticle = null;
  };

  $scope.startDelete = function startDelete() {
    var stateHolder = {};

    function deleteArticle() {
      stateHolder.deleting = true;

      app.wiki.deleteArticle($scope.articleRawId).then(
        function(res) {
          alerts.showTempAlert('Deleted.', 'info', 2000);
          $location.url('wiki/search');
        },
        function(evt) {
          alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
          stateHolder.deleting = false;
        }
      );
    }

    dialogService.open('deleteDialog', {
      title: $scope.article.title,
      stateHolder: stateHolder,
      deleteArticle: deleteArticle
    });
  };

  $scope.saveArticle = function saveArticle() {
    var newArticle = {
      title: $scope.editedArticle.title,
      body: $scope.editedArticle.body,
      tags: app.wiki.parseTags($scope.editedArticle.tags),
    };

    $scope.saving = true;

    $log.log($scope.settings.userControls.wiki.edit !== true, !$scope.editedArticle.makeOfficial);

    app.wiki.updateArticle($scope.articleRawId, $scope.articleVersion, newArticle, {unreviewed: ($scope.settings.userControls.wiki.edit !== true) || !$scope.editedArticle.makeOfficial}).then(
      function(res) {
        alerts.showTempAlert('Saved.', 'info', 2000);
        $scope.saving = false;

        unpackArticle(res);

        $scope.editedArticle = null;

        var newUrl = 'wiki/article/' + res._id;

        if('/' + newUrl !== $location.url()) {
          $location.replace();
          $location.url(newUrl);
        }
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.saving = false;
      }
    );
  };

  unpackArticle(originalArticle);
});

module.controller('views.wiki.new-article', function WikiNewArticleController($scope, $routeParams, $log, app, alerts, $location, $document, wikiHinter, $timeout) {
  $scope.editedArticle = {
    title: app.wiki.expandTitleId($location.search().name || ''),
    body: '',
    tags: 'tagme',
  };

  wikiHinter.updateKnownTags();

  $scope.setTitle('New article');

  $scope.saveArticle = function saveArticle() {
    $scope.editForm.$setSubmitted();

    if($scope.editForm.$invalid)
      return;

    var newArticle = {
      title: $scope.editedArticle.title,
      body: $scope.editedArticle.body,
      tags: app.wiki.parseTags($scope.editedArticle.tags),
    };

    $scope.saving = true;

    app.wiki.createArticle(newArticle).then(
      function(res) {
        alerts.showTempAlert('Saved.', 'info', 2000);
        $location.url('wiki/article/' + res._id);
        $scope.saving = false;
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.saving = false;
      }
    );
  };
});

module.controller('views.wiki.search', function WikiSearchController($scope, $routeParams, $log, app, $location, alerts) {
  $scope.searchString = null;
  $scope.shadowSearchString = '';
  $scope.page = 1;
  $scope.pageCount = 0;
  var _lastSearch = null;

  function pullRouteUpdate() {
    $scope.commitSearch({
      newSearch: $location.search()['q'] || '',
      page: parseInt($location.search()['page']) || 1,
      forceRefresh: false});
  }

  $scope.commitSearch = function commitSearch(options) {
    if(!options)
      options = {};

    var newSearch = options.newSearch || $scope.shadowSearchString;
    var page = (options.page === undefined) ? $scope.page : options.page;
    var forceRefresh = (options.forceRefresh === undefined) ? true : options.forceRefresh;

    $scope.searchString = newSearch;
    $scope.shadowSearchString = $scope.searchString;
    $scope.page = page || $scope.page;
    $location.search('q', (newSearch === '') ? null : newSearch);
    $location.search('page', (page === 1) ? null : page);

    $scope.setTitle(newSearch + ' - Wiki search');

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

    var queryParams = {q: q, size: 20, from: ($scope.page - 1) * 20, unreviewed: true};

    if(angular.equals(_lastSearch, queryParams) && !forceRefresh)
      return;

    _lastSearch = queryParams;

    $scope.loading = true;

    app.wiki.search(queryParams, {unreviewed: true}).then(
      function(resp) {
        $scope.pageCount = Math.ceil(resp.hits.total / 20);

        //$log.log(resp);
        $scope.searchResults = resp;
        //$log.log(resp);

        $scope.searchResults.hits.hits.forEach(function(hit) {
          hit.summary = hit._source.wikiUnreviewed.body.split(/\n/)[0];
        });

        $scope.loading = false;
        $scope.searchPerformed = true;
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.loading = false;
      }
    );
  }

  $scope.setTitle('Wiki search');
  $scope.searchResults = null;
});

module.controller('views.wiki.article-history', function WikiArticleHistoryController($scope, $routeParams, $log, app, $location, alerts, originalArticle) {
  $scope.originalArticle = originalArticle;

  $scope.page = 1;
  $scope.pageCount = 0;
  $scope.itemCount = null;
  var _lastSearch = null;
  var PAGE_SIZE = 10;

  function pullRouteUpdate() {
    $scope.commitSearch({
      page: parseInt($location.search()['page']) || 1,
      forceRefresh: false});
  }

  $scope.commitSearch = function commitSearch(options) {
    if(!options)
      options = {};

    var page = (options.page === undefined) ? $scope.page : options.page;
    var forceRefresh = (options.forceRefresh === undefined) ? true : options.forceRefresh;

    $scope.page = page || $scope.page;
    $location.search('page', (page === 1) ? null : page);

    fetchResults(forceRefresh);
  };

  $scope.$on('$routeUpdate', pullRouteUpdate);
  pullRouteUpdate();

  function fetchResults(forceRefresh) {
    var queryParams = {size: PAGE_SIZE + 1, from: ($scope.page - 1) * PAGE_SIZE};

    if(angular.equals(_lastSearch, queryParams) && !forceRefresh)
      return;

    _lastSearch = queryParams;

    $scope.loading = true;

    app.wiki.getArticleHistory($routeParams.uuid, queryParams).then(
      function(resp) {
        $scope.pageCount = Math.ceil((resp.hits.total - 1) / PAGE_SIZE);
        $scope.itemCount = resp.hits.total;

        /*resp.hits.hits.forEach(function(hit) {
          // Sort tags so they diff well
          hit._source.tags.sort()
        });*/

        $scope.rawResults = resp.hits.hits;

        // On the last page (the one that ends with the first version), include the first commit
        var lastPage = $scope.page >= $scope.pageCount;
        var itemsOnThisPage = resp.hits.hits.length - (lastPage ? 0 : 1);

        $scope.searchResults = Array.apply(null, Array(itemsOnThisPage)).map(function(_, i) {
          var firstCommit = lastPage && i === itemsOnThisPage - 1;
          var result = {
            old: firstCommit ? {title: '', body: '', tags: []} : resp.hits.hits[i + 1]._source,
            new: resp.hits.hits[i]._source,
            updatedTime: new Date(resp.hits.hits[i]._source.updatedTime),
            updatedBy: resp.hits.hits[i]._source.updatedBy,
            diff: null,
            firstCommit: firstCommit,
          };

          result.diff = {
            title: diff.diffWords(result.old.title, result.new.title).map(elideMap),
            body: diff.diffWords(result.old.body, result.new.body).map(elideMap),
            //tags: diff.diffLines(result.old.tags.join('\n'), result.new.tags.join('\n')).map(elideMap),

            // Go through each of the added/removed tags and create separate entries for each
            tags: diffTags(result.old.tags, result.new.tags),
          };

          // Prepare diffs for the unreviewed history
          if(result.new.unreviewedHistory) {
            result.new.unreviewedHistory.reverse();

            result.unreviewedHistory = Array.apply(null, Array(result.new.unreviewedHistory.length)).map(function(_, i) {
              var subresult = {
                old: (i + 1 >= result.new.unreviewedHistory.length) ?
                  // Old is official article
                  {title: result.old.title, body: result.old.body || '', tags: result.old.tags || []} :

                  // Old is previous entry
                  result.new.unreviewedHistory[i + 1],

                new: result.new.unreviewedHistory[i],
                updatedTime: new Date(result.new.unreviewedHistory[i].updatedTime),
                updatedBy: result.new.unreviewedHistory[i].updatedBy,
                diff: null
              };

              subresult.diff = {
                title: diff.diffWords(subresult.old.title, subresult.new.title).map(elideMap),
                body: diff.diffWords(subresult.old.body, subresult.new.body).map(elideMap),
                //tags: diff.diffLines(result.old.tags.join('\n'), result.new.tags.join('\n')).map(elideMap),

                // Go through each of the added/removed tags and create separate entries for each
                tags: diffTags(subresult.old.tags, subresult.new.tags),
              };

              return subresult;
            });

          }

          return result;
        });

        $scope.loading = false;
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.loading = false;
      }
    );
  }

  $scope.setTitle('Wiki history');
  $scope.searchResults = null;
});

module.controller('views.wiki.tag-list', function WikiTagListController($scope, $routeParams, $log, app, $location, alerts, tagList) {
  $scope.setTitle('Wiki tags');

  $scope.generalTags = [];
  $scope.valuedTags = [];

  tagList.forEach(function(tag) {
    if(tag.article && tag.article.tagType)
      $scope.valuedTags.push(tag);
    else
      $scope.generalTags.push(tag);
  });
});

module.controller('views.wiki.tag-report', function WikiTagReportController($scope, $routeParams, $log, app, $location, alerts) {
  $scope.searchString = null;
  $scope.shadowSearchString = '';
  $scope.tagString = '';
  $scope.tagList = [];
  var _lastSearch = null;

  function pullRouteUpdate() {
    $scope.commitSearch({
      newSearch: $location.search()['q'] || '',
      tagList: $location.search()['tags'] || '',
      forceRefresh: false});
  }

  $scope.commitSearch = function commitSearch(options) {
    if(!options)
      options = {};

    //$log.log($scope.tagString);
    //$log.log(options.tagList || $scope.tagString);

    var newSearch = options.newSearch || $scope.shadowSearchString;
    var tagList = (options.tagList || $scope.tagString).split(/[\s,]+/g).filter(function(str) { return str.length !== 0; });
    var forceRefresh = (options.forceRefresh === undefined) ? true : options.forceRefresh;

    $scope.searchString = newSearch;
    $scope.shadowSearchString = $scope.searchString;
    $scope.tagList = tagList;
    $scope.tagString = tagList.join(', ');
    $location.search('q', (newSearch === '') ? null : newSearch);
    $location.search('tags', (tagList.length === 0) ? null : tagList.join(','));

    $scope.setTitle(newSearch + ' - Wiki tag report');

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
      return;
    }

    var queryParams = {q: q, tags: $scope.tagList};

    if(angular.equals(_lastSearch, queryParams) && !forceRefresh)
      return;

    _lastSearch = queryParams;

    $scope.loading = true;

    app.wiki.getTagReport(queryParams).then(
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

  $scope.setTitle('Wiki tag report');
  $scope.searchResults = null;
});

module.controller('views.wiki.wiki-merge', function WikiMergeController($scope, $routeParams, $log, app, $location, $q, alerts, wikiHinter) {
  $scope.searchString = null;
  $scope.page = 1;
  $scope.pageCount = 0;
  $scope.shadowSearchString = '';
  $scope.shadowShowSuggestions = false;
  var _lastSearch = null;

  wikiHinter.updateKnownTags();

  function pullRouteUpdate() {
    $scope.commitSearch({
      newSearch: $location.search()['q'] || '',
      showSuggestions: ($location.search()['sugg'] === 't') || '',
      forceRefresh: false});
  }

  $scope.commitSearch = function commitSearch(options) {
    options = options || {};
    var newSearch = options.newSearch || $scope.shadowSearchString;
    var forceRefresh = (options.forceRefresh === undefined) ? true : options.forceRefresh;
    $scope.showSuggestions = (options.showSuggestions === undefined) ? $scope.shadowShowSuggestions : options.showSuggestions;

    $scope.searchString = newSearch;
    $scope.shadowSearchString = $scope.searchString;
    $scope.shadowShowSuggestions = $scope.showSuggestions;
    $location.search('q', (newSearch === '') ? null : newSearch);
    $location.search('sugg', $scope.showSuggestions ? 't' : null);

    $scope.setTitle(newSearch + ' - Wiki update');

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
      $scope.entriesLoaded = [];
      $scope.entriesChecked = 0;
      return;
    }

    var queryParams = {q: q};

    if(angular.equals(_lastSearch, queryParams) && !forceRefresh)
      return;

    _lastSearch = queryParams;

    $scope.loading = true;

    app.wiki.wikiReviewSearch(queryParams.q, {unreviewed: true}).then(
      function(resp) {
        //$log.log(resp);
        $scope.searchResults = resp;
        $scope.entriesLoaded = [];
        $scope.entriesChecked = 0;

        //resp.hits.hits.forEach(function(hit) {
          //hit._type = app.ldap.getObjectType(hit.fields['ldap.objectClass']);
        //});

        $scope.loading = false;

        checkNextEntries();
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        $scope.loading = false;
      }
    );
  }

  $scope.monthAgo = d3.timeMonth.offset(new Date(), -1);

  function checkNextEntries() {
    var count = 50;
    var nextCheckIds = $scope.searchResults.slice($scope.entriesChecked, Math.min($scope.entriesChecked + count, $scope.searchResults.length));
    var found = 0;

    $scope.loadingNext = true;

    $q.all(
      nextCheckIds.map(function(id) {
        var entry = {
          id: id,
          name: '[' + id.type + ' ' + id.id + ']',
          error: null,
          alternatives: null,
          open: true,
          saved: false,
          display: true,
          loading: true };

        $scope.entriesLoaded.push(entry);

        var options = $scope.showSuggestions ? {withSuggestionsOnly: true} : {withRecommendationsOnly: true};
        options.unreviewed = true;

        return app.wiki.mapToWiki(id, options).then(
          function(res) {
            if(res === null || res.length === 0) {
              entry.loading = false;
              entry.display = false;
              return;
            }

            if(res.length === 1 && res[0].error) {
              entry.error = res[0].error;
              entry.loading = false;
              return;
            }

            //$log.log('Result received for ', id.type, id.id);
            //$log.log(res);

            entry.alternatives = res;
            entry.currentIndex = 0;
            entry.current = entry.alternatives[0];

            entry.setAlternative = function(index) {
              entry.currentIndex = index;
              entry.current = entry.alternatives[index];
            };

            found++;

            if(id.type === 'ldap-guid') {
              if(entry.alternatives[0].ldap)
                entry.name = 'LDAP: ' + app.ldap.getDisplayName(entry.alternatives[0].ldap._source);
            }
            else if(id.type === 'wiki') {
              if(entry.alternatives[0].wiki)
                entry.name = entry.alternatives[0].wiki._source.wikiUnreviewed.title || entry.alternatives[0].wiki._source.wiki.title;
            }
            

            if(entry.alternatives[0].ldap) {
              entry.objectType = app.ldap.getObjectType(entry.alternatives[0].ldap._source.ldap.objectClass);
            }

            entry.loading = false;
          },
          function(err) {
            $log.error('Error received for ', id.type, id.id);

            entry.error = err;
            entry.loading = false;
          }
        );
      })
    ).finally(function() {
        $scope.entriesChecked = $scope.entriesChecked + nextCheckIds.length;

        // Don't make the user press the button again if we didn't find anything
        if($scope.entriesChecked < $scope.searchResults.length && found === 0) {
          return checkNextEntries();
        }

        $scope.loadingNext = false;
      });
  }

  $scope.checkNextEntries = checkNextEntries;

  $scope.setTitle('Wiki update');
  $scope.searchResults = null;
  $scope.entriesChecked = 0;
  $scope.entriesLoaded = [];
});

module.controller('views.wiki.wiki-review', function WikiReviewController($scope, $routeParams, $log, app, $location, $q, alerts, dialogService) {
  $scope.loading = true;

  app.wiki.getUnreviewedArticles().then(
    function(resp) {
      $scope.searchResults = resp.hits.hits;

      $scope.searchResults.forEach(function(hit) {
        hit.open = true;
        var officialArticle = hit._source.wiki;
        var unreviewedArticle = hit._source.wikiUnreviewed;
        hit.updatedBy = unreviewedArticle.updatedBy;
        hit.updatedTime = new Date(unreviewedArticle.updatedTime);
        officialArticle.unreviewedHistory.reverse();

        hit.unreviewedHistory = Array.apply(null, Array(officialArticle.unreviewedHistory.length)).map(function(_, i) {
          var result = {
            old: (i + 1 >= officialArticle.unreviewedHistory.length) ?
              // Old is official article
              {title: officialArticle.title || '', body: officialArticle.body || '', tags: officialArticle.tags || []} :

              // Old is previous entry
              officialArticle.unreviewedHistory[i + 1],

            new: officialArticle.unreviewedHistory[i],
            updatedTime: new Date(officialArticle.unreviewedHistory[i].updatedTime),
            updatedBy: officialArticle.unreviewedHistory[i].updatedBy,
            diff: null
          };

          // Make it clear when one person has done all the updates
          if(hit.allUpdatedBy === undefined)
            hit.allUpdatedBy = result.updatedBy;
          else if(hit.allUpdatedBy !== result.updatedBy)
            hit.allUpdatedBy = null;

          result.diff = {
            title: diff.diffWords(result.old.title, result.new.title).map(elideMap),
            body: diff.diffWords(result.old.body, result.new.body).map(elideMap),
            //tags: diff.diffLines(result.old.tags.join('\n'), result.new.tags.join('\n')).map(elideMap),

            // Go through each of the added/removed tags and create separate entries for each
            tags: diffTags(result.old.tags, result.new.tags),
          };

          return result;
        });

        hit.diff = {
          title: diff.diffWords(officialArticle.title || '', unreviewedArticle.title).map(elideMap),
          body: diff.diffWords(officialArticle.body || '', unreviewedArticle.body).map(elideMap),
          tags: diffTags(officialArticle.tags || [], unreviewedArticle.tags),
        };

      });

      $scope.loading = false;
    },
    function(evt) {
      alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
      $scope.loading = false;
    }
  );

  $scope.startDelete = function startDelete(hit) {
    var stateHolder = {};

    function deleteArticle() {
      stateHolder.deleting = true;

      app.wiki.deleteArticle(hit._id).then(
        function(res) {
          alerts.showTempAlert('Deleted.', 'info', 2000);
          dialogService.close('deleteDialog');
          hit.saved = 'Deleted';
          hit.savedLabel = 'label-danger';
          hit.open = false;
        },
        function(evt) {
          alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
          stateHolder.deleting = false;
        }
      );
    }

    dialogService.open('deleteDialog', {
      title: hit._source.wikiUnreviewed.title,
      stateHolder: stateHolder,
      deleteArticle: deleteArticle
    });
  };

  $scope.startRevert = function startRevert(hit) {
    var stateHolder = {};

    function revertArticle() {
      stateHolder.reverting = true;

      return app.wiki.updateArticle(hit._id, hit._version, hit._source.wiki, {unreviewed: false}).then(
        function(res) {
          alerts.showTempAlert('Reverted.', 'info', 2000);
          dialogService.close('revertDialog');
          hit.saved = 'Reverted';
          hit.savedLabel = 'label-danger';
          hit.open = false;
        },
        function(evt) {
          alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
          stateHolder.reverting = false;
        }
      );
    }

    dialogService.open('revertDialog', {
      title: hit._source.wikiUnreviewed.title,
      stateHolder: stateHolder,
      revertArticle: revertArticle
    });
  };

  $scope.acceptChanges = function acceptChanges(hit) {
    hit.saving = true;

    return app.wiki.updateArticle(hit._id, hit._version, hit._source.wikiUnreviewed, {unreviewed: false}).then(
      function(res) {
        alerts.showTempAlert('Saved.', 'info', 2000);
        hit.saved = 'Accepted';
        hit.savedLabel = 'label-success';
        hit.open = false;
        hit.saving = false;
      },
      function(evt) {
        alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
        hit.saving = false;
      }
    );
  }

  $scope.setTitle('Wiki review');
  $scope.searchResults = null;
});

module.controller('views.wiki.duplicate-tag-report', function WikiDuplicateTagReportController($scope, tagList) {
  $scope.setTitle('Duplicate tags');

  $scope.tagList = tagList;
  tagList.sort((a, b) => d3.ascending(a.tag, b.tag));
});

module.controller('views.wiki.format-help', function WikiFormatHelpController($scope) {
  $scope.setTitle('Formatting help');

  $scope.basicHelp1 =
    'Paragraphs are separated by a blank line...\n\n' +
    '...like this.\n\n' +
    'p. In Textile, these are known as "blocks." You can also explicitly create a paragraph block by starting the line with "@p.@". This lets you add styles between the @p@ and the @.@ to change the block, say...\n\n' +
    'p>. ...by aligning it to the right...\n\n' +
    'p=. ...or center.\n';
  $scope.basicHelp2 =
    'bq. Create a blockquote with @bq.@.\n\n' +
    'bq.. You can also make a block quote that keeps going...\n\n' +
    '...even through paragraphs by starting the blockquote with @bq..@. To end the blockquote...\n\n' +
    'p. ...start a paragraph.\n\n' +
    'Headers are created with @h1.@, @h2.@, and @h3.@.\n\n';
  $scope.basicHelp3 =
    'This is *bold text.*\n\n' +
    'This is _italic text._\n\n' +
    'This is @keyboard style@.\n\n' +
    'This is -strikeout-.\n\n';

  $scope.linkHelp =
    'There are several kinds of links:\n\n'+
    '* A regular link to a website can be made by just inserting the URL: http://redcloth.org/hobix.com/textile/\n' +
    '* You can also change the text of the link by putting the text in quotes before the link: "Textile formatting reference":http://redcloth.org/hobix.com/textile/\n' +
    '* Use double square brackets to link to a wiki article: [[Infosec]]. Spelling matters, but capitalization and punctuation usually don\'t.\n' +
    '* Use a hashtag to tag both the article and the paragraph: #example. If the tag can take a value, put it after a colon: #example:1234.\n';

  $scope.listHelp =
    'You can create bullet lists by putting asterisks in front:\n\n' +
    '* This is a bullet point\n' +
    '* This is another bullet point\n' +
    '** This is a sub-point\n\n' +
    'Numbered lists can be created by putting a hash mark in front:\n\n' +
    '# Step one\n' +
    '# Step two\n' +
    '## Step three\n' +
    '##* You can even mix bullets and numbers.\n';

  $scope.tableHelp =
    'Tables are made out of lines of text where the cells are delimited by vertical bars:\n\n' +
    '| Apples | Oranges |\n' +
    '| 2 | 3 |\n' +
    '| 9 | 5 |\n\n' +
    'To make header cells, add @_.@ to the start of the cell:\n\n' +
    '|_. Apples |_. Oranges |\n' +
    '| 2 | 3 |\n' +
    '| 9 | 5 |\n\n' +
    'There are lots of other formatting possibilities:\n\n' +
    '|_. attribute list |\n' +
    '|<. align left |\n' +
    '|>. align right|\n' +
    '|=. center |\n\n' +
    '|\\2. spans two cols |\n' +
    '| col 1 | col 2 |\n\n' +
    '|/3. spans 3 rows | a |\n' +
    '| b |\n' +
    '| c |\n\n' +
    'See the "full reference":http://redcloth.org/hobix.com/textile/ for more possibilities.\n';
});

module.directive('wikiTagEditor', function($rootScope, wikiHinter, $timeout) {
  return {
    template: '<textarea ng-readonly="readonly" class="form-control input-sm hide" style="font-family: monospace; line-height: 1.2;" cols="{{cols}}" rows="{{rows}}"></textarea>',
    restrict: 'E',
    scope: {
      tags: '<',
      readonly: '<',
      onChange: '&',
      cols: '@',
      rows: '@'
    },
    link: function(scope, element, attr) {
      const tagsAreaEditor = CodeMirror.fromTextArea(element[0].childNodes[0], {
        value: 'tagme',
        mode: 'wikitags',
        theme: 'tagstheme',
        readOnly: scope.readonly,
        lineWrapping: true,
        hintOptions: { hint: wikiHinter.hint, completeSingle: false },
      });

      scope.$watch('readonly', (newValue) => {
        tagsAreaEditor.setOption('readOnly', newValue);
      });

      tagsAreaEditor.getDoc().setValue(scope.tags || '');

      tagsAreaEditor.on('change', function(cm, changeObj) {
        //$log.log('change (', changeObj.removed, ' => ', changeObj.text, ')');

        if(changeObj.text.length === 1 && changeObj.removed.length === 1 && changeObj.text[0] === changeObj.removed[0]) {
          //$log.log('ignoring');
        }
        else {
          tagsAreaEditor.showHint();
        }
      });

      scope.$on('refresh', () => {
        tagsAreaEditor.refresh();
      });

      scope.$watch('tags', (newValue) => {
        const doc = tagsAreaEditor.getDoc();

        if(newValue !== doc.getValue())
          doc.setValue(newValue || '');
      });

      tagsAreaEditor.on('changes', function(cm) {
        const doc = tagsAreaEditor.getDoc();

        $timeout(function() {
          scope.tags = doc.getValue();

          if(scope.onChange)
            scope.onChange({tags: scope.tags});
        });
      });
    }
  };
});

module.component('wikiMiniEditor', {
  template: require('./wiki-mini-editor.html'),
  bindings: {
    recommendations: '<',
    providedArticle: '<article',
    onSaved: '&',
  },
  controller: function(app, alerts, $log, $rootScope) {
    this.encodeURIComponent = encodeURIComponent;
    this.rootScope = $rootScope;

    this.setupCheckboxes = function setupCheckboxes() {
      var preparedRecommendations = app.wiki.combineRecommendations(this.recommendations, this.article);
      var ctrl = this;

      this.hasRecommendations = preparedRecommendations.changes.some(function(change) { return change.action === 'add' || change.action === 'remove'; });

      this.changes = {
        require: preparedRecommendations.changes
          .filter(function(change) { return change.levelName === 'require'; })
          .map(function(change) {
            // Always enable this
            change.checked = true;
            return change;
          }),
        recommend: preparedRecommendations.changes
          .filter(function(change) { return change.levelName === 'recommend'; })
          .map(function(change) {
            // Only automatically enable this if the article doesn't exist yet
            change.checked = (change.action === 'keep' || !ctrl.article);
            return change;
          }),
        suggest: preparedRecommendations.changes
          .filter(function(change) { return change.levelName === 'suggest'; })
          .map(function(change) {
            // Ditto
            change.checked = (change.action === 'keep');
            return change;
          }),
        possibilities: preparedRecommendations.possibilities
          .map(function(poss) {
            poss.checked = poss.isSet;
            return poss;
          })
      };

      this.updateEditedTags();
    };

    this.updateEditedTags = function updateEditedTags() {
      // Parse the tags list written by the user, update the list based on the check boxes, and write it back
      if(!this.editedArticle.tags) {
        this.editedArticle.tags = '';
        this.hasRequiredTags = true;
      }

      // In order to preserve the order of the tags listed by the user, we build a map of tags we care about
      // and whether they should be added/removed from the list (true for added, false for removed)
      var tagChanges = d3.map();

      this.changes.require.forEach(function(change) {
        tagChanges.set(change.tag, (change.action === 'keep' || change.action === 'add') ? change.checked : !change.checked);
      });
      this.changes.recommend.forEach(function(change) {
        tagChanges.set(change.tag, (change.action === 'keep' || change.action === 'add') ? change.checked : !change.checked);
      });
      this.changes.suggest.forEach(function(change) {
        tagChanges.set(change.tag, (change.action === 'keep' || change.action === 'add') ? change.checked : !change.checked);
      });
      this.changes.possibilities.forEach(function(poss) {
        tagChanges.set(poss.tag, poss.checked);
      });

      var seenTags = d3.set();

      // Run through existing tags and decide whether to keep them or throw them away
      this.editedArticle.tags = this.editedArticle.tags.replace(/(?:(?:[^\s:]+:)?"[^""]+"|[^\s]+)\s*/g, function(match) {
        // Canonicalize the tag before we decide if it stays
        var canonical = app.wiki.shrinkTag(match);

        seenTags.add(canonical);

        var keep = tagChanges.get(canonical);

        if(keep === undefined || keep === true)
          return match;

        return '';
      });

      var editedArticle = this.editedArticle;

      tagChanges.each(function(keep, tag) {
        if(keep === true && !seenTags.has(tag)) {
          if(editedArticle.tags.length !== 0 && editedArticle.tags[editedArticle.tags.length - 1] !== ' ')
            editedArticle.tags += ' ';

          editedArticle.tags += tag;
        }
      });

      this.updateCheckedTags();
    };

    this.updateCheckedTags = function updateCheckedTags() {
      this.hasRequiredTags = true;

      var existingTags = d3.set(app.wiki.parseTags(this.editedArticle.tags));
      var ctrl = this;

      function updateChange(change) {
        if(change.levelName === 'require' && !existingTags.has(change.tag))
          ctrl.hasRequiredTags = false;

        change.checked = (change.action === 'add' || change.action === 'keep') ? existingTags.has(change.tag) : !existingTags.has(change.tag);
      }

      this.changes.require.forEach(updateChange);
      this.changes.recommend.forEach(updateChange);
      this.changes.suggest.forEach(updateChange);
      this.changes.possibilities.forEach(function(poss) {
        poss.checked = existingTags.has(poss.tag);
      });
    };

    this.cancelEdit = function cancelEdit() {
      this.editedArticle = {
        title: this.article.title,
        body: this.article.body,
        tags: this.article.tags.join(' '),
      };

      this.setupCheckboxes();

      if(this.wikiEditForm)
        this.wikiEditForm.$setPristine();

      this.editing = false;
    };

    this.setupArticle = function setupArticle(originalArticle) {
      this.hasOfficial = !!originalArticle._source.wiki.title;
      this.hasUnreviewed = originalArticle._source.wiki.unreviewed;

      this.articleVersion = originalArticle._version;
      this.articleRawId = originalArticle._id;
      this.officialArticle = originalArticle._source.wiki;
      this.unreviewedArticle = originalArticle._source.wikiUnreviewed;

      this.viewingOfficial = !this.hasUnreviewed;
      this.article = this.viewingOfficial ? this.officialArticle : this.unreviewedArticle;
      this.article.updatedTime = new Date(this.article.updatedTime);

      this.cancelEdit();
    };

    this.startup = function startup() {
      if(!this.recommendations)
        return;

      this.hasOfficial = false;
      this.hasUnreviewed = false;

      this.article = null;
      this.articleRawId = null;
      this.articleVersion = null;
      this.officialArticle = null;
      this.unreviewedArticle = null;

      if(this.wikiEditForm)
        this.wikiEditForm.$setPristine();

      if(!this.providedArticle) {
        // Create a new sample article
        this.editedArticle = {
          title: this.recommendations.title,
          body: this.recommendations.body,
        };
        this.editing = true;
        this.setupCheckboxes();
      }
      else {
        this.setupArticle(this.providedArticle);
      }
    }

    this.$onInit = function() {
      //startup();
    };

    this.$onChanges = function(changesObj) {
      if(changesObj.recommendations || changesObj.providedArticle) {
        //$log.log(changesObj);
        //$log.log(this.recommendations);
        this.startup();
      }
    };

    this.saveArticle = function saveArticle() {
      var ctrl = this;

      var newArticle = {
        title: this.editedArticle.title,
        body: this.editedArticle.body,
        tags: app.wiki.parseTags(this.editedArticle.tags),
      };

      this.saving = true;

      if(!this.article) {
        this.wikiEditForm.$setSubmitted();

        if(this.wikiEditForm.$invalid)
          return;

        app.wiki.createArticle(newArticle).then(
          function(res) {
            res._source = { wiki: newArticle };
            ctrl.setupArticle(res);

            alerts.showTempAlert('Saved.', 'info', 2000);
            ctrl.saving = false;

            if(ctrl.onSaved)
              ctrl.onSaved();
          },
          function(evt) {
            alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
            ctrl.saving = false;
          }
        );
      }
      else {
        app.wiki.updateArticle(this.articleRawId, this.articleVersion, newArticle, {unreviewed: 'keep'}).then(
          function(res) {
            ctrl.setupArticle(res);

            alerts.showTempAlert('Saved.', 'info', 2000);
            ctrl.saving = false;

            if(ctrl.onSaved)
              ctrl.onSaved();
          },
          function(evt) {
            alerts.showTempAlert(alerts.httpErrorObjectToMessage(evt), 'error', 5000);
            ctrl.saving = false;
          }
        );
      }
    };

    this.applyRecommendations = function applyRecommendations() {
      function update(change) {
        change.checked = true;
      }

      this.changes.require.forEach(update);
      this.changes.recommend.forEach(update);

      this.updateEditedTags();
      this.saveArticle();
    };
  }
});
