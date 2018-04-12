'use strict';

var d3 = require('d3');

function shrinkTitleId(value) {
  return value.toLowerCase().split(/[:/\\\-""?,&+ ]+/).filter(val => val !== '').join('-');
}

function expandTitleId(value) {
  return value.split('-').map(function(val, i) {
    if(val === '')
      return '';

    return i === 0 ? val[0].toUpperCase() + val.substring(1) : val;
  }).join(' ');
}

function parseTag(tag) {
  tag = tag.trim();
  var colon = tag.indexOf(':');

  if(colon !== -1) {
    var result = {tag: shrinkTitleId(tag.substring(0, colon)), value: tag.substring(colon + 1)};

    if(result.value.length >= 2 && result.value[0] === '"' && result.value[result.value.length - 1] === '"')
      result.value = result.value.substr(1, result.value.length - 2);

    return result;
  }

  return {tag: shrinkTitleId(tag)};
}

function buildTag(tag, value) {
  tag = shrinkTitleId(tag);

  if(value) {
    if(value.indexOf(' ') !== -1)
      return tag + ':"' + value + '"';

    return tag + ':' + value;
  }

  return tag;
}

function shrinkTag(value) {
  var tag = parseTag(value);
  return buildTag(tag.tag, tag.value);
}

function wikiLinkToHref(link) {
  if(link.indexOf('article:') === 0) {
    return 'wiki/article/' + shrinkTitleId(link.substring(8));
  }

  return 'wiki/article/' + shrinkTitleId(link);
}

function parseTags(value) {
  var TAG_RE = /(?:[^\s:]+:)?"[^""]+"|[^\s]+/g;
  var result = [];
  var match = null;

  while((match = TAG_RE.exec(value)) !== null) {
    result.push(shrinkTag(match[0]));
  }

  result.sort(function(a, b) {
    return d3.ascending(a.indexOf(':') === -1 ? 1 : 0, b.indexOf(':') === -1 ? 1 : 0) ||
      d3.ascending(a, b);
  });

  return result;
}

function decodeDNCharacter(value, p1) {
  if(p1.length == 2) {
    return String.fromCharCode(parseInt(p1, 16));
  }
  else {
    return p1;
  }
}

function parseDN(value, options) {
  var options = options || {};

  if(typeof options.decodeValues === 'undefined')
    options.decodeValues = true;

  var result = [];
  var regex = /([^,=]+)=((?:\\[0-9A-Fa-f]{2}|\\.|[^,])+),?/g;
  var match;

  while((match = regex.exec(value)) !== null) {
    result.push({
      type: match[1].toUpperCase(),
      value: options.decodeValues ? match[2].replace(/\\([0-9A-Fa-f]{2}|.)/g, decodeDNCharacter) : match[2]
    });
  }

  return result;
}

function parsePlainHighlights(text) {
  var highlightRegex = /<!@highlight@!>(.*?)<\/!@highlight@!>/g;
  var rawString = '', match, lastMatchEnd = 0/*, offset*/;
  var highlights = [];

  while((match = highlightRegex.exec(text)) !== null) {
    rawString += text.substring(lastMatchEnd, match.index);
    rawString += match[1];

    highlights.push({type: 'highlight', start: rawString.length - match[1].length, end: rawString.length});

    // Skip the tag characters from now on
    //offset += highlightRegex[0].length - highlightRegex[1].length;

    lastMatchEnd = highlightRegex.lastIndex;
  }

  if(lastMatchEnd !== text.length) {
    rawString += text.substring(lastMatchEnd);
  }

  // Combine
  var result = ['span'], i, lastIndex = 0;

  for(i = 0; i < highlights.length; i++) {
    if(lastIndex !== highlights[i].start) {
      result.push(rawString.substring(lastIndex, highlights[i].start));
    }

    if(highlights[i].type === 'highlight') {
      result.push(['span', {class: 'highlight'}, rawString.substring(highlights[i].start, highlights[i].end)]);
    }

    lastIndex = highlights[i].end;
  }

  if(lastIndex !== rawString.length) {
    result.push(rawString.substring(lastIndex));
  }

  return result;
}

var RELDATE_PARSEFORMATS = [
  d3.timeParse('%Y-%m-%d %H:%M:%S.%L'),
  d3.timeParse('%Y-%m-%d %I:%M:%S.%L %p'),
  d3.timeParse('%Y-%m-%d %H:%M:%S'),
  d3.timeParse('%Y-%m-%d %I:%M:%S %p'),
  d3.timeParse('%Y-%m-%d %-H:%M:%S'),
  d3.timeParse('%Y-%m-%d %-I:%M:%S %p'),
  d3.timeParse('%Y-%m-%d %H:%M'),
  d3.timeParse('%Y-%m-%d %I:%M %p'),
  d3.timeParse('%Y-%m-%d %-H:%M'),
  d3.timeParse('%Y-%m-%d %-I:%M %p'),
  d3.timeParse('%Y-%m-%d'),
  d3.timeParse('%m-%d-%Y'),
  d3.timeParse('%-m-%d-%Y'),
  d3.timeParse('%m/%d/%Y'),
  d3.timeParse('%-m/%d/%Y'),
];

var RELDATE_FORMAT = (function() {
  var MILLI = d3.timeFormat('%Y-%m-%d %H:%m:%S.%L'),
    SEC = d3.timeFormat('%Y-%m-%d %H:%m:%S'),
    DAY = d3.timeFormat('%Y-%m-%d');

    return function(d) {
      if(d.getMilliseconds)
        return MILLI(d);

      if(d.getSeconds() || d.getMinutes() || d.getHours())
        return SEC(d);

      return DAY(d);
    };
})();

var RELDATE_REGEX = /^now(?:-(\d+)([smhdwMy]))?(?:\/([smhdwMy]))?$/;

var RELDATE_INTERVALS = {
  s: d3.timeSecond,
  m: d3.timeMinute,
  h: d3.timeHour,
  d: d3.timeDay,
  w: d3.timeWeek, // sunday
  M: d3.timeMonth,
  y: d3.timeYear
};

function parseRelativeDate(str) {
  // Shortcut out if it's just straight up now
  if(str === 'now')
    return {date: null, relative: null, rounding: null};

  // Try to parse an absolute date out
  var absDate = null;

  RELDATE_PARSEFORMATS.forEach(function(parser) {
    absDate = absDate || parser(str);
  });

  if(absDate) {
    return {date: absDate, relative: null, rounding: null};
  }

  // Ensure we're relative now
  if(str.indexOf('now') !== 0)
    return null;

  var result = {date: null, relative: null, rounding: null};
  var regResult = RELDATE_REGEX.exec(str);

  if(!regResult)
    return null;

  if(regResult[1]) {
    result.relative = {value: -(+regResult[1]), unit: regResult[2]};
  }

  if(regResult[3]) {
    result.rounding = regResult[3];
  }

  return result;
}

function formatRelativeDate(rel) {
  if(rel.date) {
    return RELDATE_FORMAT(rel.date);
  }

  return 'now' +
    (rel.relative ? (rel.relative.value + rel.relative.unit) : '') +
    (rel.rounding || '');
}

function createRelativeDate(rel, roundUp, now) {
  now = now || new Date();
  rel = parseRelativeDate(rel);

  if(!rel)
    return null;

  if(rel.date)
    return rel.date;

  var result = now;

  if(rel.relative) {
    result = RELDATE_INTERVALS[rel.relative.unit].offset(result, rel.relative.value);
  }

  if(rel.rounding) {
    if(roundUp) {
      result = RELDATE_INTERVALS[rel.rounding].ceil(result);
    }
    else {
      result = RELDATE_INTERVALS[rel.rounding].floor(result);
    }
  }

  return result;
}

/*** Wiki recommendations ***/
function combineWikiRecommendations(recommendations, article) {
  /* recommendations is:
      {
        title: "Intended title of article",
        clear: [<array of tags to completely remove before we start, including valued variants>],
        require: [<array of tags that must be on the article to find it again>],
        recommend: {tag: true to add or false to remove}, // pre-select these changes; algo is pretty sure about these
        suggest: {tag: true to add or false to remove}, // do not pre-select these changes; algo is guessing
        possibilities: [],  // tags that are associated with this class of things; algo has no idea
      }
  */

  var changes = d3.map();
  var possibilities = [];

  if(!article) {
    recommendations.require.forEach(function(tag) {
      changes.set(tag, {tag: tag, level: 1, levelName: 'require', action: 'add'});
    });

    Object.keys(recommendations.recommend).forEach(function(tag) {
      if(!changes.has(tag) && recommendations.recommend[tag])
        changes.set(tag, {tag: tag, level: 2, levelName: 'recommend', action: 'add'});
    });

    Object.keys(recommendations.suggest).forEach(function(tag) {
      if(!changes.has(tag) && recommendations.suggest[tag] && recommendations.recommend[tag] === undefined)
        changes.set(tag, {tag: tag, level: 3, levelName: 'suggest', action: 'add'});
    });

    recommendations.possibilities.forEach(function(tag) {
      if(!changes.has(tag))
        possibilities.push({tag: tag, isSet: false});
    });
  }

  if(article) {
    var clearSet = new d3.set(recommendations.clear);
    var existingTags = new d3.set(article.tags);

    existingTags.each(function(tag) {
      var parsedTag = parseTag(tag);

      if(clearSet.has(parsedTag.tag))
        changes.set(tag, {tag: tag, level: 2, levelName: 'recommend', action: 'remove'});
    });

    recommendations.require.forEach(function(tag) {
      changes.set(tag, {tag: tag, level: 1, levelName: 'require', action: existingTags.has(tag) ? 'keep' : 'add'});
    });

    Object.keys(recommendations.recommend).forEach(function(tag) {
      if(recommendations.require[tag] !== undefined)
        return;

      if(recommendations.recommend[tag] === undefined)
        return;

      if(existingTags.has(tag) || recommendations.recommend[tag]) {
        changes.set(tag, {
          tag: tag,
          level: 2,
          levelName: 'recommend',
          action: recommendations.recommend[tag] ? (existingTags.has(tag) ? 'keep' : 'add') : 'remove'
        });
      }
    });

    Object.keys(recommendations.suggest).forEach(function(tag) {
      if(changes.has(tag))
        return;

      if(recommendations.suggest[tag] === undefined)
        return;

      if(existingTags.has(tag) || recommendations.suggest[tag]) {
        changes.set(tag, {
          tag: tag,
          level: 3,
          levelName: 'suggest',
          action: recommendations.suggest[tag] ? (existingTags.has(tag) ? 'keep' : 'add') : 'remove'
        });
      }
    });

    recommendations.possibilities.forEach(function(tag) {
      if(!changes.has(tag))
        possibilities.push({tag: tag, isSet: existingTags.has(tag)});
    });
  }

  var result = {
    title: recommendations.title,
    body: recommendations.body,
    changes: changes.values(),
    possibilities: possibilities,
  };

  result.changes.sort(function(a, b) {
    return d3.ascending(a.level, b.level) ||
      // Add, then keep, to remove
      d3.ascending(a.action, b.action) ||
      // Valued tags first
      d3.ascending((a.tag.indexOf(':') >= 0) ? 0 : 1, (b.tag.indexOf(':') >= 0) ? 0 : 1) ||
      // Sort by tags
      d3.ascending(a.tag, b.tag);
  });

  return result;
}

function alterTags(originalTags, changes) {
  // originalTags: ['user', 'computer', 'fqdn:example.com'],
  // changes: [{tag: 'admin', action: 'add'}, {tag: 'fqdn:example.com', action: 'keep'}]
  // actions are 'clear', 'add', 'keep', 'remove'; 'clear' actions should come first
  var tags = d3.set(originalTags);

  changes.forEach(function(change) {
    if(change.action === 'clear') {
      originalTags.filter(function(tag) {
        return parseTag(tag).tag === change.tag;
      }).forEach(function(tag) {
        tags.remove(tag);
      });
    }
    else if(change.action === 'add' || change.action === 'keep') {
      tags.add(change.tag);
    }
    else if(change.action === 'remove') {
      tags.remove(change.tag);
    }
  });

  return tags.values();
}

var RE_SEGMENTER = null;

function segmentTextStandard(str) {
  // This is a much-reduced implementation of the Unicode text segmentation
  // algorithm for word identification, found here: http://unicode.org/reports/tr29/
  // This implementation focuses mainly on characters 0x00 through 0xFF
  var XRegExp = require('xregexp');

  if(!RE_SEGMENTER) {
    var MID_LETTER = '\u00b7\u0387\u05f4\u2027\u003a\ufe13\ufe55\uff1a\u02d7';
    var MID_NUM_LET_Q = '\'\.\u2018\u2019\u2024\ufe52\uff07\uff0e';
    var MID_NUM = '\x2c\x3b';
    var EXTEND_NUM_LET = '\\p{Pc}';

    RE_SEGMENTER = XRegExp('[' + EXTEND_NUM_LET + ']*(\\p{Alphabetic}([' + EXTEND_NUM_LET + MID_NUM_LET_Q + MID_LETTER + ']\\p{Alphabetic}+)*[' + EXTEND_NUM_LET + ']*|[0-9]([' + EXTEND_NUM_LET + MID_NUM_LET_Q + MID_NUM + '][0-9]+)*[' + EXTEND_NUM_LET + ']*)+', 'n');
  }

  var result = [];

  XRegExp.forEach(str, RE_SEGMENTER, function(match) {
    result.push({word: match[0], index: match.index});
  });

  return result;
}

var RE_CODE_KEYWORD_SEGMENTER = null;

function segmentTextCodeKeyword(str) {
  // JavaScript version of the code_keyword tokenizer in es.js
  // That regex catches all non-keywords: '(?:[^a-zA-Z0-9_]++[0-9]*+)++'
  var XRegExp = require('xregexp');

  if(!RE_CODE_KEYWORD_SEGMENTER) {
    RE_CODE_KEYWORD_SEGMENTER = XRegExp('[a-zA-Z_][a-zA-Z0-9_]+', 'n');
  }

  var result = [];

  XRegExp.forEach(str, RE_CODE_KEYWORD_SEGMENTER, function(match) {
    result.push({word: match[0], index: match.index});
  });

  return result;
}

module.exports.shrinkTitleId = shrinkTitleId;
module.exports.expandTitleId = expandTitleId;
module.exports.shrinkTag = shrinkTag;
module.exports.wikiLinkToHref = wikiLinkToHref;
module.exports.parseTag = parseTag;
module.exports.parseTags = parseTags;
module.exports.parseDN = parseDN;
module.exports.parsePlainHighlights = parsePlainHighlights;
module.exports.parseRelativeDate = parseRelativeDate;
module.exports.createRelativeDate = createRelativeDate;
module.exports.combineWikiRecommendations = combineWikiRecommendations;
module.exports.alterTags = alterTags;
module.exports.buildTag = buildTag;
module.exports.segmentTextStandard = segmentTextStandard;
module.exports.segmentTextCodeKeyword = segmentTextCodeKeyword;
