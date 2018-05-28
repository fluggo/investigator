
import * as d3time from 'd3-time';
import { timeParse, timeFormat } from 'd3-time-format';
import { ascending } from 'd3-array';
import { XRegExp } from 'xregexp';

/**
 * Returns true if the value is not null or undefined. Useful for filters.
 * @param value Value to check.
 */
export function notEmpty<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Converts a list to a map.
 */
export function toMap<K, V>(list: V[], keyfunc: (value: V) => K): Map<K, V> {
  return new Map(list.map((v: V): [K, V] => [keyfunc(v), v]));
}

/**
 * Converts any scalar or array to an array.
 * @param v Scalar or array to convert. If undefined or null, returns an empty array. If already an array, returns an array.
 */
export function asArray<T>(v: T | T[] | undefined | null): T[] {
  if(v === undefined || v === null)
    return [];

  if(Array.isArray(v))
    return v;

  return [v];
}

/**
 * Converts any scalar or array to a scalar.
 * @param v Scalar or array to convert. If undefined, null, or empty, returns undefined. If scalar, returns a scalar. If an array, returns the first element.
 */
export function asScalar<T>(v: T | T[] | undefined | null): T | undefined {
  if(Array.isArray(v))
    return v[0];
  else if(v === undefined || v === null)
    return undefined;
  else
    return v;
}

/**
 * Ensures a Date/string is converted to a date.
 * @param v Value to convert to a date.
 */
export function asDate(v: Date | number | string | undefined): Date | undefined {
  if(v === undefined)
    return undefined;
  else if(typeof v === 'string' || typeof v === 'number')
    return new Date(v);
  else
    return v;
}

/**
 * Combines several arrays into one.
 * @param v Arrays to combine.
 */
export function combineArrays<T>(v: T[][]): T[] {
  return ([] as T[]).concat(...v);
}

export function shrinkTitleId(value: string): string {
  return value.toLowerCase().split(/[:/\\\-""?,&+ ]+/).filter(val => val !== '').join('-');
}

export function expandTitleId(value: string): string {
  return value.split('-').map(function(val, i) {
    if(val === '')
      return '';

    return i === 0 ? val[0].toUpperCase() + val.substring(1) : val;
  }).join(' ');
}

export interface Tag {
  tag: string;
  value?: string;
}

export function parseTag(tag: string): Tag {
  tag = tag.trim();
  const colon = tag.indexOf(':');

  if(colon !== -1) {
    const result: Tag = {tag: shrinkTitleId(tag.substring(0, colon)), value: tag.substring(colon + 1)};

    if(result.value && result.value.length >= 2 && result.value[0] === '"' && result.value[result.value.length - 1] === '"')
      result.value = result.value.substr(1, result.value.length - 2);

    return result;
  }

  return {tag: shrinkTitleId(tag)};
}

export function buildTag(tag: string, value: string | null | undefined): string {
  tag = shrinkTitleId(tag);

  if(value) {
    if(value.indexOf(' ') !== -1)
      return tag + ':"' + value + '"';

    return tag + ':' + value;
  }

  return tag;
}

export function shrinkTag(value: string) {
  const tag = parseTag(value);
  return buildTag(tag.tag, tag.value);
}

export function wikiLinkToHref(link: string): string {
  if(link.indexOf('article:') === 0) {
    return 'wiki/article/' + shrinkTitleId(link.substring(8));
  }

  return 'wiki/article/' + shrinkTitleId(link);
}

/**
 * Splits a string into tags, suitable for parsing via `parseTag`.
 * @param value String to parse.
 */
export function parseTags(value: string): string[] {
  const TAG_RE = /(?:[^\s:]+:)?"[^""]+"|[^\s]+/g;
  const result: string[] = [];
  let match: RegExpExecArray | null = null;

  while((match = TAG_RE.exec(value)) !== null) {
    result.push(shrinkTag(match[0]));
  }

  result.sort(function(a, b) {
    return ascending(a.indexOf(':') === -1 ? 1 : 0, b.indexOf(':') === -1 ? 1 : 0) ||
      ascending(a, b);
  });

  return result;
}

function decodeDNCharacter(value: any, p1: string) {
  if(p1.length == 2) {
    return String.fromCharCode(parseInt(p1, 16));
  }
  else {
    return p1;
  }
}

interface DNSegment {
  type: string;
  value: string;
}

export function parseDN(value: string, options?: { decodeValues?: boolean }): DNSegment[] {
  options = options || {};

  if(typeof options.decodeValues === 'undefined')
    options.decodeValues = true;

  const result: DNSegment[] = [];
  const regex = /([^,=]+)=((?:\\[0-9A-Fa-f]{2}|\\.|[^,])+),?/g;
  let match: RegExpExecArray | null;

  while((match = regex.exec(value)) !== null) {
    result.push({
      type: match[1].toUpperCase(),
      value: options.decodeValues ? match[2].replace(/\\([0-9A-Fa-f]{2}|.)/g, decodeDNCharacter) : match[2]
    });
  }

  return result;
}

export function parsePlainHighlights(text: string): any {
  const highlightRegex = /<!@highlight@!>(.*?)<\/!@highlight@!>/g;
  const highlights: {type: 'highlight', start: number, end: number}[] = [];
  let match: RegExpExecArray | null;
  let rawString: string = '';
  let lastMatchEnd = 0;

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
  let result: any[] = ['span'], lastIndex = 0;

  for(let i = 0; i < highlights.length; i++) {
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

const RELDATE_PARSEFORMATS: ((dateString: string) => Date | null)[] = [
  timeParse('%Y-%m-%d %H:%M:%S.%L'),
  timeParse('%Y-%m-%d %I:%M:%S.%L %p'),
  timeParse('%Y-%m-%d %H:%M:%S'),
  timeParse('%Y-%m-%d %I:%M:%S %p'),
  timeParse('%Y-%m-%d %-H:%M:%S'),
  timeParse('%Y-%m-%d %-I:%M:%S %p'),
  timeParse('%Y-%m-%d %H:%M'),
  timeParse('%Y-%m-%d %I:%M %p'),
  timeParse('%Y-%m-%d %-H:%M'),
  timeParse('%Y-%m-%d %-I:%M %p'),
  timeParse('%Y-%m-%d'),
  timeParse('%m-%d-%Y'),
  timeParse('%-m-%d-%Y'),
  timeParse('%m/%d/%Y'),
  timeParse('%-m/%d/%Y'),
];

const RELDATE_FORMAT = (function() {
  const MILLI = timeFormat('%Y-%m-%d %H:%m:%S.%L'),
    SEC = timeFormat('%Y-%m-%d %H:%m:%S'),
    DAY = timeFormat('%Y-%m-%d');

  return function(d: Date): string {
    if(d.getMilliseconds)
      return MILLI(d);

    if(d.getSeconds() || d.getMinutes() || d.getHours())
      return SEC(d);

    return DAY(d);
  };
})();

const RELDATE_REGEX = /^now(?:-(\d+)([smhdwMy]))?(?:\/([smhdwMy]))?$/;

const RELDATE_INTERVALS: { [x: string]: d3.CountableTimeInterval; } = {
  s: d3time.timeSecond,
  m: d3time.timeMinute,
  h: d3time.timeHour,
  d: d3time.timeDay,
  w: d3time.timeWeek, // sunday
  M: d3time.timeMonth,
  y: d3time.timeYear
};

/** Unit of time:
 * 
 * * `s` Seconds
 * * `m` Minutes
 * * `h` Hours
 * * `d` Days
 * * `w` Weeks
 * * `M` Months
 * * `y` Years
 */
type TimeUnit = 's' | 'm' | 'h' | 'd' | 'w' | 'M' | 'y';

interface RelativeTimeSpan {
  /** Number of units, negative or positive. */
  value: number;

  /** Unit of time:
   * 
   * * `s` Seconds
   * * `m` Minutes
   * * `h` Hours
   * * `d` Days
   * * `w` Weeks
   * * `M` Months
   * * `y` Years
   */
  unit: TimeUnit;
}

/** Specifies a date, which can be relative to "now" or an absolute time. */
export interface RelativeDate {
  /** The exact time if this value is absolute, or null if it is relative. */
  date: Date | null;

  /** Time span to added to "now". */
  relative: RelativeTimeSpan | null;

  /** Rounding to be applied to the result. */
  rounding: TimeUnit | null;
}

/**
 * Parses a relative date specification. Returns null if the specification could not be parsed.
 * @param str Date specification to parse.
 */
export function parseRelativeDate(str: string): RelativeDate | null {
  // Shortcut out if it's just straight up now
  if(str === 'now')
    return {date: null, relative: null, rounding: null};

  // Try to parse an absolute date out
  let absDate: Date | null = null;

  RELDATE_PARSEFORMATS.forEach(function(parser) {
    absDate = absDate || parser(str);
  });

  if(absDate) {
    return {date: absDate, relative: null, rounding: null};
  }

  // Ensure we're relative now
  if(str.indexOf('now') !== 0)
    return null;

  var result: RelativeDate = {date: null, relative: null, rounding: null};
  var regResult = RELDATE_REGEX.exec(str);

  if(!regResult)
    return null;

  if(regResult[1]) {
    result.relative = {value: -(+regResult[1]), unit: regResult[2] as TimeUnit};
  }

  if(regResult[3]) {
    result.rounding = regResult[3] as TimeUnit;
  }

  return result;
}

/**
 * Formats a relative date specification as a specification string.
 * @param rel Date specification to turn back into a string.
 */
export function formatRelativeDate(rel: RelativeDate): string {
  if(rel.date) {
    return RELDATE_FORMAT(rel.date);
  }

  return 'now' +
    (rel.relative ? (rel.relative.value + rel.relative.unit) : '') +
    (rel.rounding || '');
}

/**
 * Creates a date from a relative date specification. Returns null if the specification could not be parsed.
 * 
 * Relative dates take a few forms:
 * 
 * * `now` Now.
 * * `-1d` Exactly one day ago.
 * * `-1d/h` Exactly one day ago, rounded to the nearest hour.
 * 
 * @param str Relative date specification, e.g. "-3d/d".
 * @param roundUp True to round up if rounding is applied, false to round down.
 * @param now Alternate time to consider "now"; if not specified, uses *now* now.
 */
export function createRelativeDate(str: string, roundUp: boolean, now?: Date): Date | null {
  now = now || new Date();
  const rel = parseRelativeDate(str);

  if(!rel)
    return null;

  if(rel.date)
    return rel.date;

  let result: Date = now;

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
interface Recommendations {
  title: string;
  body: string;
  clear: string[];

  /** Array of tags that must be on the article to find it again. */
  require: string[];

  recommend: { [x: string]: boolean };
  suggest: { [x: string]: boolean };

  /** Tags that are associated with this class of things; algo has no idea. */
  possibilities: string[];
}

function combineWikiRecommendations(recommendations: Recommendations, article) {
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

  const changes = new Map();
  const possibilities: { tag: string, isSet: boolean }[] = [];

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
    const clearSet = new Set(recommendations.clear);
    const existingTags = new Set<string>(article.tags);

    existingTags.forEach(tag => {
      var parsedTag = parseTag(tag);

      if(clearSet.has(parsedTag.tag))
        changes.set(tag, {tag: tag, level: 2, levelName: 'recommend', action: 'remove'});
    });

    recommendations.require.forEach(tag => {
      changes.set(tag, {tag: tag, level: 1, levelName: 'require', action: existingTags.has(tag) ? 'keep' : 'add'});
    });

    Object.keys(recommendations.recommend).forEach(function(tag) {
      if(recommendations.require.indexOf(tag) !== -1)
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
    changes: Array.from(changes.values()),
    possibilities: possibilities,
  };

  result.changes.sort(function(a, b) {
    return ascending(a.level, b.level) ||
      // Add, then keep, to remove
      ascending(a.action, b.action) ||
      // Valued tags first
      ascending((a.tag.indexOf(':') >= 0) ? 0 : 1, (b.tag.indexOf(':') >= 0) ? 0 : 1) ||
      // Sort by tags
      ascending(a.tag, b.tag);
  });

  return result;
}

interface TagChange {
  action: 'clear' | 'add' | 'keep' | 'remove';
  tag: string;
}

function alterTags(originalTags: string[], changes: TagChange[]): string[] {
  // originalTags: ['user', 'computer', 'fqdn:example.com'],
  // changes: [{tag: 'admin', action: 'add'}, {tag: 'fqdn:example.com', action: 'keep'}]
  // actions are 'clear', 'add', 'keep', 'remove'; 'clear' actions should come first
  var tags = new Set(originalTags);

  changes.forEach(function(change) {
    if(change.action === 'clear') {
      originalTags.filter(function(tag) {
        return parseTag(tag).tag === change.tag;
      }).forEach(function(tag) {
        tags.delete(tag);
      });
    }
    else if(change.action === 'add' || change.action === 'keep') {
      tags.add(change.tag);
    }
    else if(change.action === 'remove') {
      tags.delete(change.tag);
    }
  });

  return Array.from(tags.values());
}

let RE_SEGMENTER: RegExp | null = null;

export interface Word {
  word: string;
  index: number;
}

export function segmentTextStandard(str: string): Word[] {
  // This is a much-reduced implementation of the Unicode text segmentation
  // algorithm for word identification, found here: http://unicode.org/reports/tr29/
  // This implementation focuses mainly on characters 0x00 through 0xFF

  if(!RE_SEGMENTER) {
    var MID_LETTER = '\u00b7\u0387\u05f4\u2027\u003a\ufe13\ufe55\uff1a\u02d7';
    var MID_NUM_LET_Q = '\'\.\u2018\u2019\u2024\ufe52\uff07\uff0e';
    var MID_NUM = '\x2c\x3b';
    var EXTEND_NUM_LET = '\\p{Pc}';

    RE_SEGMENTER = XRegExp('[' + EXTEND_NUM_LET + ']*(\\p{Alphabetic}([' + EXTEND_NUM_LET + MID_NUM_LET_Q + MID_LETTER + ']\\p{Alphabetic}+)*[' + EXTEND_NUM_LET + ']*|[0-9]([' + EXTEND_NUM_LET + MID_NUM_LET_Q + MID_NUM + '][0-9]+)*[' + EXTEND_NUM_LET + ']*)+', 'n');
  }

  const result: Word[] = [];

  XRegExp.forEach(str, RE_SEGMENTER, function(match) {
    result.push({word: match[0], index: match.index});
  });

  return result;
}

let RE_CODE_KEYWORD_SEGMENTER: RegExp | null = null;

export function segmentTextCodeKeyword(str: string): Word[] {
  // JavaScript version of the code_keyword tokenizer in es.js
  // That regex catches all non-keywords: '(?:[^a-zA-Z0-9_]++[0-9]*+)++'
  if(!RE_CODE_KEYWORD_SEGMENTER) {
    RE_CODE_KEYWORD_SEGMENTER = XRegExp('[a-zA-Z_][a-zA-Z0-9_]+', 'n');
  }

  const result: Word[] = [];

  XRegExp.forEach(str, RE_CODE_KEYWORD_SEGMENTER, function(match) {
    result.push({word: match[0], index: match.index});
  });

  return result;
}

/** Term found in a search query. */
export interface QueryTerm {
  /** Term to be searched for. */
  term: string;

  /**
   * Type of the term. Can be:
   * 
   * * `phrase` - Phrase match
   * * `term` - Ordinary word for match
   * * `hashtag` - Hashtag match
   * * Other: prefixed term/phrase; e.g. `"name:stuff"` becomes `{ type: 'name', term: 'stuff' }`
   */
  type: 'phrase' | 'hashtag' | 'term' | string;

  /**
   * How the term should be searched. Can be:
   * 
   * * `should` - Result should have this term
   * * `must` - Result must have this (prefix `+`)
   * * `must_not` - Result must not have this (prefix `-`)
   */
  req: 'must' | 'must_not' | 'should';
}

export function parseQueryTerms(query: string): QueryTerm[] {
  // Produces an array of terms:
  // { term: 'term text', type: 'term', req: 'should' }
  // type is:
  //    'term' - ordinary word for match
  //    'phrase' - phrase match
  //    other - prefixed term/phrase with "name:stuff" -> type: 'name', term: 'stuff'
  // req is:
  //    'should' - result should have this
  //    'must' - result must have this (prefix "+")
  //    'must_not' - result

  const QUERY_RE = /[-+]?(?:[^\s:]+:)?"[^""]+"|[^\s]+/g;
  const result: QueryTerm[] = [];
  let match: RegExpExecArray | null = null;

  while((match = QUERY_RE.exec(query)) !== null) {
    let qstr = match[0];

    // Check for must/must not
    let must = (qstr[0] === '+');
    let must_not = (qstr[0] === '-');

    if(must || must_not) {
      qstr = qstr.substr(1);
    }

    let phrase = (qstr[0] === '"');
    let query = null;

    if(phrase) {
      qstr = qstr.substr(1, qstr.length - 2);

      result.push({
        term: qstr,
        type: 'phrase',
        req: must ? 'must' : (must_not ? 'must_not' : 'should'),
      });

      continue;
    }

    if(qstr[0] === '#') {
      // Hashtag
      qstr = qstr.substr(1);

      result.push({
        term: qstr,
        type: 'hashtag',
        req: must ? 'must' : (must_not ? 'must_not' : 'should'),
      });

      continue;
    }

    let tagIndex = qstr.indexOf(':');

    if(tagIndex !== -1) {
      let type = qstr.substr(0, tagIndex), term = qstr.substr(tagIndex + 1);

      if(term[0] === '"') {
        // Un-phrase it
        term = term.substr(1, term.length - 2);
      }

      result.push({
        term: term,
        type: type,
        req: must ? 'must' : (must_not ? 'must_not' : 'should'),
      });

      continue;
    }

    result.push({
      term: qstr,
      type: 'term',
      req: must ? 'must' : (must_not ? 'must_not' : 'should'),
    });
  }

  return result;
}
