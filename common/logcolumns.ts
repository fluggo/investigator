'use strict';

import * as d3 from 'd3';
import * as d3filters from './d3filters';
import * as util from './util';
import * as templates from './logtemplates';

const CAT_STAND = 'Standard';
const CAT_ALL = 'Identifiers';
const CAT_LOGON = 'Logon';
const CAT_SOURCE = 'Source Identifiers';
const CAT_TARGET = 'Target Identifiers';
const CAT_VERDICT = 'Verdict';
const CAT_POLICY = 'Policies';
const CAT_THREAT = 'Threat';
const CAT_EXTERNALDEVICE = 'External Device';

export const WSA_CATEGORY_STATUS: { [x: string]: string } = {
  'ALLOW': 'SUCCESS',
  'BLOCK': 'FAILURE',
  'DECRYPT': 'WARN',
  'DEFAULT': 'SUCCESS',
  'DROP': 'FAILURE',
  'MONITOR': 'WARN',
  'NO': 'FAILURE',
  'OTHER': 'FAILURE',
  'PASSTHRU': "SUCCESS",
  'REDIRECT': 'WARN',
  'SAAS': 'SUCCESS'
};

export const HTTP_STATUS_CODES: { [x: string]: string } = {
  '100': 'Continue',
  '101': 'Switching protocols',
  '102': 'Processing',
  '200': 'OK',
  '201': 'Created',
  '202': 'Accepted',
  '203': 'Non-authoritative information',
  '204': 'No content',
  '205': 'Reset content',
  '206': 'Partial content',
  '207': 'Multi-status',
  '300': 'Multiple choices',
  '301': 'Moved permanently',
  '302': 'Found',
  '303': 'See other',
  '304': 'Not modified',
  '305': 'Use proxy',
  '306': 'Switch proxy',
  '307': 'Temporary redirect',
  '308': 'Permanent redirect',
  '400': 'Bad request',
  '401': 'Unauthorized',
  '403': 'Forbidden',
  '404': 'Not found',
  '405': 'Method not allowed',
  '406': 'Not acceptable',
  '407': 'Proxy authentication required',
  '408': 'Request timeout',
  '409': 'Conflict',
  '410': 'Gone',
  '411': 'Length required',
  '412': 'Precondition failed',
  '413': 'Payload too large',
  '414': 'URI too long',
  '415': 'Unsupported media type',
  '416': 'Range not satisfiable',
  '417': 'Expectation failed',
  '418': "I'm a teapot",
  '429': 'Too many requests',
  '500': 'Internal server error',
  '501': 'Not implemented',
  '502': 'Bad gateway',
  '503': 'Service unavailable',
  '504': 'Gateway timeout',
  '505': 'HTTP version not supported',
};

export function quoteTerm(term: string): string {
  return /[:\s]/.test(term) ? ('"' + term + '"') : term;
}

type ColumnValue<V> = V | V[] | undefined;

interface Formatter<T, V> {
  (value: ColumnValue<V>, entry: LogDocument<T>): string
}

interface ColumnOptions<T, V> {
  baseUrl?: string;
  sortField?: string;
  sortable?: boolean;
  searchable?: boolean;
  defaultSortOrder?: 'desc' | 'asc';
  format?: Formatter<T, V>;
  getTerm?: Formatter<T, V>;
  toEsTerm?: (v: string) => any;
}

interface LogDocument<T> {
  _index: string;
  _id: string;
  _source: T;
  highlight?: any;
}

interface LogGetter<T, V>{
  (log: LogDocument<T>): ColumnValue<V>
}

/** Callbacks from the page to alter the search query based on the user's interaction with the table cell. */
interface AlterTermCallbacks {
  /**
   * Adds a required term to the search.
   * @param field Field to search, or null to add a global search term.
   * @param term Term to search for.
   */
  addTerm(field: string | null, term: string): void;

  /**
   * Adds an excluded term to the search.
   * @param field Field to search, or null to add a global search term.
   * @param term Term to exclude from the search.
   */
  removeTerm(field: string | null, term: string): void;
}

class Column {
  field: string;
  name: string;
  displayName: string;
  category: string;
  sortable: boolean;
  searchable: boolean;
  index: number;
  sortField: string;
  defaultSortOrder: 'desc' | 'asc';

  /**
   * Converts the user's search term to the appropriate Elasticsearch query value.
   * @param searchTerm Search term value supplied by the user.
   * 
   * Only used server-side.
   */
  toEsTerm(searchTerm: string): any {
    return searchTerm;
  }
}

class DefaultColumn<T extends templates.BaseLogEntry, V = string> extends Column {
  getter: LogGetter<T, V>;
  baseUrl: string;
  $$hashKey: string;

  constructor(name: string, field: string, displayName: string, category: string, getter: LogGetter<T, V>, options: ColumnOptions<T, V> = {}) {
    super();

    options = options || {};
    this.name = name;
    this.field = field;
    this.displayName = displayName;
    this.category = category;
    this.getter = getter;
    this.baseUrl = options.baseUrl || 'logs/msvista';
    this.sortField = options.sortField || field;
    this.sortable = (options.sortable !== undefined) ? options.sortable : true;
    this.searchable = (options.searchable !== undefined) ? options.searchable : true;
    this.$$hashKey = name;

    if(options.format)
      this.format = options.format;

    if(options.getTerm)
      this.getTerm = options.getTerm;

    if(options.toEsTerm)
      this.toEsTerm = options.toEsTerm;

    this.defaultSortOrder = options.defaultSortOrder || 'asc';
  }

  format(value: ColumnValue<V>, entry: any): string {
    if(value === undefined)
      return '';

    if(typeof value === 'boolean')
      return value ? 'True' : 'False';

    return `${value}`;
  }

  getTerm(value: ColumnValue<V>, entry: any): string {
    return `${value}`;
  }

  writeCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<V>, HTMLElement, any>, value: ColumnValue<V>, entry: LogDocument<T>, callbacks: AlterTermCallbacks) {
    value = util.asArray(value);

    if(value.length === 0) {
      return;
    }
    else if(value.length === 1) {
      if(this.searchable) {
        var term = this.getTerm(value[0], entry);

        td.classed('clickable-cell', true)
          .append('a')
          .attr('style', 'display: inline-block; width: 100%; height: 100%;')
          .attr('href', this.baseUrl + '/search?q=' + encodeURIComponent('+' + this.name + ':' + quoteTerm(term)))
          .text(this.format(value[0], entry))
          .on('click', d => {
            if(d3.event.button === 0 && d3.event.shiftKey && !d3.event.ctrlKey && !d3.event.altKey) {
              d3.event.preventDefault();
              d3.event.stopPropagation();
              callbacks.addTerm(this.name, term);
            }
            else if(d3.event.button === 0 && !d3.event.shiftKey && d3.event.ctrlKey && !d3.event.altKey) {
              d3.event.preventDefault();
              d3.event.stopPropagation();
              callbacks.removeTerm(this.name, term);
            }
          });
      }
      else {
        td.text(this.format(value[0], entry));
      }
    }
    else {
      if(this.searchable) {
        td.append('ul')
          .classed('list-unstyled', true)
          .selectAll('li')
          .data<ColumnValue<V>>(value)
          .enter()
          .append('li')
          .append('a')
          .attr('href', d => this.baseUrl + '/search?q=' + encodeURIComponent('+' + this.name + ':' + quoteTerm(this.getTerm(d, entry))))
          .text(d => this.format(d, entry))
          .on('click', d => {
            if(d3.event.button === 0 && d3.event.shiftKey && !d3.event.ctrlKey && !d3.event.altKey) {
              d3.event.preventDefault();
              d3.event.stopPropagation();
              callbacks.addTerm(this.name, this.getTerm(d, entry));
            }
            else if(d3.event.button === 0 && !d3.event.shiftKey && d3.event.ctrlKey && !d3.event.altKey) {
              d3.event.preventDefault();
              d3.event.stopPropagation();
              callbacks.removeTerm(this.name, this.getTerm(d, entry));
            }
          });
      }
      else {
        td.append('ul').classed('list-unstyled', true)
          .selectAll('li')
          .data<ColumnValue<V>>(value)
          .enter()
          .append('li').text(d => this.format(d, entry));
      }
    }
  }
}

class IntegerColumn<T extends templates.BaseLogEntry> extends DefaultColumn<T, number> {
  toEsTerm(searchTerm: string): any {
    let number = +searchTerm;

    if(!isNaN(number))
      return number;
  }
}

class BooleanColumn<T extends templates.BaseLogEntry> extends DefaultColumn<T, boolean> {
  toEsTerm(searchTerm: string): any {
    return searchTerm === 'true';
  }
}

class UppercaseColumn<T extends templates.BaseLogEntry> extends DefaultColumn<T, string> {
  toEsTerm(searchTerm: string): any {
    return searchTerm.toUpperCase();
  }
}

class LowercaseColumn<T extends templates.BaseLogEntry> extends DefaultColumn<T, string> {
  toEsTerm(searchTerm: string): any {
    return searchTerm.toLowerCase();
  }
}

class VistaTimeClassColumn extends DefaultColumn<templates.VistaLogEntry, Date> {
  constructor() {
    super('time', 'log.eventTime', 'Time', CAT_STAND, (a: any) => a, { defaultSortOrder: 'desc' });
  }

  writeCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<Date>, HTMLElement, any>, value: ColumnValue<Date>, entry: LogDocument<templates.VistaLogEntry>, callbacks: AlterTermCallbacks) {
    const time = util.asScalar(value);

    const ago = d3filters.ago(time, {precise: true}),
      full = d3filters.ago(time, {precise: true, alwaysFull: true});

    td.style('white-space', 'pre');
    td.append('a')
      .classed('ago-full-time', true)
      .attr('href', 'logs/msvista/entry/' + encodeURIComponent(entry._index.substring(11)) + '/' + encodeURIComponent(entry._id))
      .text(full);
    td.append('a')
      .classed('ago-short-time', true)
      .attr('href', 'logs/msvista/entry/' + encodeURIComponent(entry._index.substring(11)) + '/' + encodeURIComponent(entry._id))
      .attr('title', full)
      .text(ago);
    td.append('br');

    var label = td.append('span')
      .attr('class', 'label cursor-pointer')
      .on('click', d => {
        if(d3.event.button === 0 && d3.event.shiftKey && !d3.event.ctrlKey && !d3.event.altKey) {
          callbacks.addTerm('type', entry._source.msvistalog.system.eventType);
        }
        else if(d3.event.button === 0 && !d3.event.shiftKey && d3.event.ctrlKey && !d3.event.altKey) {
          callbacks.removeTerm('type', entry._source.msvistalog.system.eventType);
        }
      });

    if(entry._source.msvistalog.system.eventType === 'INFO') {
      label.classed('label-info', true)
        .append('i').attr('class', 'fa fa-info-circle');
      label.append('span').text(' Info');
    }
    else if(entry._source.msvistalog.system.eventType === 'WARNING') {
      label.classed('label-warning', true)
        .append('i').attr('class', 'fa fa-exclamation-triangle');
      label.append('span').text(' Warning');
    }
    else if(entry._source.msvistalog.system.eventType === 'CRITICAL') {
      label.classed('label-danger', true)
        .append('i').attr('class', 'fa fa-times-circle');
      label.append('span').text(' CRITICAL');
    }
    else if(entry._source.msvistalog.system.eventType === 'ERROR') {
      label.classed('label-danger', true)
        .append('i').attr('class', 'fa fa-times-circle');
      label.append('span').text(' Error');
    }
    else if(entry._source.msvistalog.system.eventType === 'AUDIT_FAILURE') {
      label.classed('label-warning', true)
        .append('i').attr('class', 'fa fa-exclamation-triangle');
      label.append('span').text(' Audit Failure');
    }
    else if(entry._source.msvistalog.system.eventType === 'AUDIT_SUCCESS') {
      label.classed('label-success', true)
        .append('i').attr('class', 'fa fa-check-circle');
      label.append('span').text(' Audit Success');
    }
  }

  rewriteCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<Date>, HTMLElement, any>, value: ColumnValue<Date>, entry: LogDocument<templates.VistaLogEntry>, callbacks: AlterTermCallbacks) {
    td.selectAll('*').remove();
    this.writeCell(td, value, entry, callbacks);
  }
}

class WsaTimeDecisionColumn extends DefaultColumn<templates.WsaLogEntry, Date | string> {
  constructor() {
    super('time', 'log.eventTime', 'Time', CAT_STAND, entry => entry._source.log.eventTime, { defaultSortOrder: 'desc' });
  }

  writeCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<Date | string>, HTMLElement, any>, value: ColumnValue<Date | string>, entry: LogDocument<templates.WsaLogEntry>, callbacks: AlterTermCallbacks) {
    const labelClasses: { [x: string]: string } = {
      SUCCESS: 'label-success',
      WARNING: 'label-warning',
      FAILURE: 'label-danger',
      DEFAULT: 'label-default',
    };

    const time = util.asDate(util.asScalar(value));

    td.style('white-space', 'pre');
    td.append('a')
      .attr('href', 'logs/wsa/entry/' + encodeURIComponent(entry._index.substring(7)) + '/' + encodeURIComponent(entry._id))
      .attr('title', d3filters.date(time, '%A %Y-%m-%d %H:%M:%S.%L%Z'))
      .text(d3filters.ago(time));
    td.append('br');

    const decisionCategory = entry._source.wsa.aclDecision.split('_')[0];
    const decisionStatus = WSA_CATEGORY_STATUS[decisionCategory] || 'DEFAULT';

    var label = td.append('span')
      .attr('class', 'label cursor-pointer')
      .on('click', d => {
        if(d3.event.button === 0 && d3.event.shiftKey && !d3.event.ctrlKey && !d3.event.altKey) {
          callbacks.addTerm('aclDecision', entry._source.wsa.aclDecision);
        }
        else if(d3.event.button === 0 && !d3.event.shiftKey && d3.event.ctrlKey && !d3.event.altKey) {
          callbacks.removeTerm('aclDecision', entry._source.wsa.aclDecision);
        }
      })
      .classed(labelClasses[decisionStatus] || 'label-default', true)
      .text(entry._source.wsa.aclDecision);
  }

  rewriteCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<Date | string>, HTMLElement, any>, time: Date | string, entry: LogDocument<templates.WsaLogEntry>, callbacks: AlterTermCallbacks) {
    td.selectAll('*').remove();
    this.writeCell(td, time, entry, callbacks);
  }
}

/** Column that provides color-coded formatting of the HTTP response code. */
class WsaResponseCodeColumn extends DefaultColumn<templates.WsaLogEntry, number> {
  constructor() {
    super('responseCode', 'wsa.response.httpResponseCode', 'Response Code', CAT_STAND, entry => entry._source.wsa.response && entry._source.wsa.response.httpResponseCode, { defaultSortOrder: 'desc' });
  }

  writeCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<number>, HTMLElement, any>, value: ColumnValue<number>, entry: LogDocument<templates.WsaLogEntry>, callbacks: AlterTermCallbacks) {
    let classes: { label: string; icon: string };
    const responseCode = util.asScalar(value);

    if(responseCode === undefined)
      return;

    if(responseCode < 200)
      classes = { label: 'info', icon: 'fa-info-circle' };
    else if(responseCode < 300)
      classes = { label: 'success', icon: 'fa-check-circle' };
    else if(responseCode < 400)
      classes = { label: 'info', icon: 'fa-mail-forward' };
    else if(responseCode < 500)
      classes = { label: 'warning', icon: 'fa-warning' };
    else
      classes = { label: 'danger', icon: 'fa-times-circle' };

/*
    <span ng-if="::entry.wsa.response.httpResponseCode < 200" class="label label-info"><i class="fa fa-info-circle"></i> {{::entry.wsa.response.httpResponseCode}} {{::httpStatusCodes[entry.wsa.response.httpResponseCode] || 'Unknown'}}</span>
    <span ng-if="::entry.wsa.response.httpResponseCode >= 200 && entry.wsa.response.httpResponseCode < 300" class="label label-success"><i class="fa fa-check-circle"></i> {{::entry.wsa.response.httpResponseCode}} {{::httpStatusCodes[entry.wsa.response.httpResponseCode] || 'Unknown'}}</span>
    <span ng-if="::entry.wsa.response.httpResponseCode >= 300 && entry.wsa.response.httpResponseCode < 400" class="label label-info"><i class="fa fa-mail-forward"></i> {{::entry.wsa.response.httpResponseCode}} {{::httpStatusCodes[entry.wsa.response.httpResponseCode] || 'Unknown'}}</span>
    <span ng-if="::entry.wsa.response.httpResponseCode >= 400 && entry.wsa.response.httpResponseCode < 500" class="label label-warning"><i class="fa fa-warning"></i> {{::entry.wsa.response.httpResponseCode}} {{::httpStatusCodes[entry.wsa.response.httpResponseCode] || 'Unknown'}}</span>
    <span ng-if="::entry.wsa.response.httpResponseCode >= 500" class="label label-danger"><i class="fa fa-times-circle"></i> {{::entry.wsa.response.httpResponseCode}} {{::httpStatusCodes[entry.wsa.response.httpResponseCode] || 'Unknown'}}</span>
*/

    const label = td.append('span')
      .attr('class', 'label cursor-pointer')
      .classed('label-' + classes.label, true)
      .on('click', d => {
        if(d3.event.button === 0 && d3.event.shiftKey && !d3.event.ctrlKey && !d3.event.altKey) {
          callbacks.addTerm('responseCode', this.getTerm(responseCode, entry));
        }
        else if(d3.event.button === 0 && !d3.event.shiftKey && d3.event.ctrlKey && !d3.event.altKey) {
          callbacks.removeTerm('responseCode', this.getTerm(responseCode, entry));
        }
      })

    label.append('i').attr('class', 'fa ' + classes.icon);
    label.append('span').text(` ${value} ${HTTP_STATUS_CODES[responseCode] || 'Unknown'}`);
  }
}

class MessageColumn extends DefaultColumn<templates.BaseLogEntry, string> {
  constructor() {
    super('message', 'log.message', 'Message', CAT_STAND,
      entry => (entry.highlight && entry.highlight['log.message'][0]) || entry._source.log.message,
      { sortField: '_score', defaultSortOrder: 'desc', sortable: false });
  }

  writeCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<string>, HTMLElement, any>, value: ColumnValue<string>, entry: LogDocument<templates.BaseLogEntry>, callbacks: AlterTermCallbacks) {
    const msg = util.asScalar(value);

    td.classed('log-message', true);
    td.property('msg', msg);

    //td.style('white-space', '')
    // Pull out any highlights
    let currentOffset = 0
    const highlights: { start: number; length: number; }[] = [];

    const msgNoHighlights: string = (msg || '').replace(/<highlight>([^<]+)<\/highlight>/g, function(match, p1, offset) {
      highlights.push({start: offset - currentOffset, length: p1.length});
      currentOffset += match.length - p1.length;
      return p1;
    });

    const words = util.segmentTextStandard(msgNoHighlights);

    // Build HTML
    let currentHighlight = 0;

    words.forEach(function(word, i) {
      const preword = msgNoHighlights.substring(i === 0 ? 0 : (words[i - 1].index + words[i - 1].word.length), word.index);

      if(preword.length !== 0)
        td.append('span').text(preword);

      let highlight = false;

      if(currentHighlight < highlights.length && word.index === highlights[currentHighlight].start) {
        currentHighlight++;
        highlight = true;
      }

      td.append('span')
        .attr('class', 'segmented-word')
        .classed('red-highlight', highlight)
        .text(word.word)
        .on('click', d => {
          if(d3.event.button === 0 && d3.event.shiftKey && !d3.event.ctrlKey && !d3.event.altKey) {
            callbacks.addTerm(null, word.word);
          }
          else if(d3.event.button === 0 && !d3.event.shiftKey && d3.event.ctrlKey && !d3.event.altKey) {
            callbacks.removeTerm(null, word.word);
          }
        });
    });

    const postword = (words.length === 0) ? msgNoHighlights : msgNoHighlights.substring(words[words.length - 1].index + words[words.length - 1].word.length);

    if(postword.length !== 0) {
      td.append('span').text(postword);
    }
  }

  rewriteCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<string>, HTMLElement, any>, msg: ColumnValue<string>, entry: LogDocument<templates.BaseLogEntry>, callbacks: AlterTermCallbacks) {
    if(td.property('msg') !== msg) {
      td.selectAll('*').remove();
      this.writeCell(td, msg, entry, callbacks);
    }
  }
}

class WsaUrlColumn extends DefaultColumn<templates.WsaLogEntry, string> {
  constructor() {
    super('url', '', 'URL', CAT_STAND,
      entry => entry._source.wsa.request.url,
      { sortField: '_score', defaultSortOrder: 'desc' });
  }

  writeCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<string>, HTMLElement, any>, value: ColumnValue<string>, entry: LogDocument<templates.WsaLogEntry>, callbacks: AlterTermCallbacks) {
    const msg = util.asScalar(value);

    td.classed('log-message', true);
    td.style('word-break', 'break-all');
    td.property('msg', msg);

    //td.style('white-space', '')
    // Pull out any highlights
    let currentOffset = 0
    const highlights: { start: number; length: number; }[] = [];

    const msgNoHighlights: string = (msg || '').replace(/<highlight>([^<]+)<\/highlight>/g, function(match, p1, offset) {
      highlights.push({start: offset - currentOffset, length: p1.length});
      currentOffset += match.length - p1.length;
      return p1;
    });

    const words = util.segmentTextStandard(msgNoHighlights);

    // Build HTML
    let currentHighlight = 0;

    words.forEach((word, i) => {
      var preword = msgNoHighlights.substring(i === 0 ? 0 : (words[i - 1].index + words[i - 1].word.length), word.index);

      if(preword.length !== 0)
        td.append('span').text(preword);

      var highlight = false;

      if(currentHighlight < highlights.length && highlights[currentHighlight].start >= word.index && (highlights[currentHighlight].start + highlights[currentHighlight].length) <= (word.index + word.word.length)) {
        highlight = true;
      }

      const mainSpan = td.append('span')
        .attr('class', 'segmented-word')
        .on('click', function(d) {
          if(d3.event.button === 0 && d3.event.shiftKey && !d3.event.ctrlKey && !d3.event.altKey) {
            callbacks.addTerm(null, word.word);
          }
          else if(d3.event.button === 0 && !d3.event.shiftKey && d3.event.ctrlKey && !d3.event.altKey) {
            callbacks.removeTerm(null, word.word);
          }
        });

      if(highlight && highlights[currentHighlight].start > word.index) {
        mainSpan.append('span').text(word.word.substring(0, highlights[currentHighlight].start - word.index));
        mainSpan.append('span')
          .classed('red-highlight', true)
          .text(word.word.substring(highlights[currentHighlight].start - word.index));
      }
      else {
        mainSpan
          .classed('red-highlight', highlight)
          .text(word.word);
      }

      if(highlight)
        currentHighlight++;
    });

    const postword: string = (words.length === 0) ? msgNoHighlights : msgNoHighlights.substring(words[words.length - 1].index + words[words.length - 1].word.length);

    if(postword.length !== 0) {
      td.append('span').text(postword);
    }
  }

  rewriteCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<string>, HTMLElement, any>, value: ColumnValue<string>, entry: LogDocument<templates.WsaLogEntry>, callbacks: AlterTermCallbacks) {
    if(td.property('msg') !== value) {
      td.selectAll('*').remove();
      this.writeCell(td, value, entry, callbacks);
    }
  }
}

function collectAll(doc: LogDocument<templates.BaseLogEntry>, name: keyof templates.LogCommonProperties) {
  var arr = ([] as any[]).concat(doc._source.log.source && util.asArray<any>(doc._source.log.source[name]), util.asArray<any>(doc._source.log.target && doc._source.log.target[name]), util.asArray<any>(doc._source.log.all && doc._source.log.all[name]));
  return arr.length === 0 ? undefined : arr;
}

export const msvistaColumns: Column[] = [
  new VistaTimeClassColumn(),
  new DefaultColumn<templates.VistaLogEntry>('tag', 'log.tag', 'Tags', CAT_STAND, entry => entry._source.log.tag, {sortable: false}),
  new DefaultColumn<templates.VistaLogEntry>('computer', 'msvistalog.system.computer', 'Computer', CAT_STAND, entry => entry._source.msvistalog.system.computer),
  new DefaultColumn<templates.VistaLogEntry>('provider', 'msvistalog.system.provider.eventSourceName', 'Provider', CAT_STAND, entry => entry._source.msvistalog.system.provider.eventSourceName),
  new IntegerColumn<templates.VistaLogEntry>('event', 'msvistalog.system.eventId', 'Event ID', CAT_STAND, entry => entry._source.msvistalog.system.eventId),
  new DefaultColumn<templates.VistaLogEntry>('channel', 'msvistalog.system.channel', 'Channel', CAT_STAND, entry => entry._source.msvistalog.system.channel),
  new IntegerColumn<templates.VistaLogEntry>('process', 'msvistalog.system.execution.processId', 'Process ID', CAT_STAND,
    entry => (entry._source.msvistalog.system.execution.processId === 0) ? undefined : entry._source.msvistalog.system.execution.processId),
  new IntegerColumn<templates.VistaLogEntry>('thread', 'msvistalog.system.execution.threadId', 'Thread ID', CAT_STAND,
    entry => (entry._source.msvistalog.system.execution.threadId === 0) ? undefined : entry._source.msvistalog.system.execution.threadId),
  new IntegerColumn<templates.VistaLogEntry>('opcode', 'msvistalog.system.opcode', 'Opcode', CAT_STAND, entry => entry._source.msvistalog.system.opcode, {
    format: function(value, entry) {
      return entry._source.msvistalog.system.opcodeName;
    },
  }),
  new UppercaseColumn<templates.VistaLogEntry>('user', 'msvistalog.system.samName', 'User', CAT_STAND, entry => entry._source.msvistalog.system.samName),
  new UppercaseColumn<templates.VistaLogEntry>('activity', 'msvistalog.system.correlation.activityId', 'Activity', CAT_STAND, entry => entry._source.msvistalog.system.correlation && entry._source.msvistalog.system.correlation.activityId),
  new DefaultColumn<templates.VistaLogEntry, number>('task', 'msvistalog.system.task', 'Task', CAT_STAND, entry => entry._source.msvistalog.system.task, {
    format: function(value, entry) {
      return entry._source.msvistalog.system.taskName;
    },
  }),
  new MessageColumn(),
  new IntegerColumn<templates.VistaLogEntry>('logon.logonType', 'msvistalog.logon.logonType', 'Logon Type', CAT_LOGON,
    entry => entry._source.msvistalog.logon && entry._source.msvistalog.logon.logonType, {
    format: function(logonType) {
      switch(logonType) {
        case 2:
          return 'Interactive';
        case 3:
          return 'Network';
        case 4:
          return 'Batch';
        case 5:
          return 'Service';
        case 7:
          return 'Unlock';
        case 8:
          return 'Network clear-text';
        case 9:
          return 'New credentials';
        case 10:
          return 'Remote interactive';
        case 11:
          return 'Cached interactive';
        default:
          return logonType + '';
      }
    },
  }),
  new DefaultColumn<templates.VistaLogEntry>('logon.logonProcessName', 'msvistalog.logon.logonProcessName', 'Logon Process Name', CAT_LOGON,
    entry => entry._source.msvistalog.logon && entry._source.msvistalog.logon.logonProcessName),
  new DefaultColumn<templates.VistaLogEntry>('logon.authenticationPackageName', 'msvistalog.logon.authenticationPackageName', 'Auth Package Name', CAT_LOGON,
    entry => entry._source.msvistalog.logon && entry._source.msvistalog.logon.authenticationPackageName),
  new DefaultColumn<templates.VistaLogEntry>('logon.lmPackageName', 'msvistalog.logon.lmPackageName', 'LM Package Name', CAT_LOGON,
    entry => entry._source.msvistalog.logon && entry._source.msvistalog.logon.lmPackageName),
  new IntegerColumn<templates.VistaLogEntry>('logon.keyLength', 'msvistalog.logon.keyLength', 'Key Length', CAT_LOGON,
    entry => entry._source.msvistalog.logon && entry._source.msvistalog.logon.keyLength),
  new DefaultColumn<templates.VistaLogEntry>('logon.workstationName', 'msvistalog.logon.workstationName', 'Workstation Name', CAT_LOGON,
    entry => entry._source.msvistalog.logon && entry._source.msvistalog.logon.workstationName),
  new DefaultColumn<templates.VistaLogEntry>('logon.logonGuid', 'msvistalog.logon.logonGuid', 'Logon GUID', CAT_LOGON,
    entry => entry._source.msvistalog.logon && entry._source.msvistalog.logon.logonGuid),
  new DefaultColumn<templates.VistaLogEntry>('logon.processName', 'msvistalog.logon.processName', 'Process Name', CAT_LOGON,
    entry => entry._source.msvistalog.logon && entry._source.msvistalog.logon.processName),
  new DefaultColumn<templates.VistaLogEntry>('logon.transitedServices', 'msvistalog.logon.transmittedServices', 'Transited Services', CAT_LOGON,
    entry => entry._source.msvistalog.logon && entry._source.msvistalog.logon.transmittedServices),
  new IntegerColumn<templates.VistaLogEntry>('logon.statusCode', 'msvistalog.logon.statusCode', 'Status Code', CAT_LOGON,
    entry => entry._source.msvistalog.logon && entry._source.msvistalog.logon.statusCode),
  new IntegerColumn<templates.VistaLogEntry>('logon.subStatusCode', 'msvistalog.logon.subStatusCode', 'Sub-Status Code', CAT_LOGON,
    entry => entry._source.msvistalog.logon && entry._source.msvistalog.logon.subStatusCode),
  new LowercaseColumn<templates.VistaLogEntry>('logon.memberName', 'msvistalog.logon.memberName', 'Member Name', CAT_LOGON,
    entry => entry._source.msvistalog.logon && entry._source.msvistalog.logon.memberName, {sortable: false}),
  new UppercaseColumn<templates.VistaLogEntry>('logon.memberSid', 'msvistalog.logon.memberSid', 'Member SID', CAT_LOGON,
    entry => entry._source.msvistalog.logon && entry._source.msvistalog.logon.memberSid),
  new IntegerColumn<templates.VistaLogEntry>('logon.ticketEncryptionType', 'msvistalog.logon.ticketEncryptionType', 'Ticket Encryption Type', CAT_LOGON,
    entry => entry._source.msvistalog.logon && entry._source.msvistalog.logon.ticketEncryptionType, {
    format: function(ticketEncryptionType) {
      // https://www.iana.org/assignments/kerberos-parameters/kerberos-parameters.xhtml
      switch(ticketEncryptionType) {
        case 1:
          return 'des-cbc-crc';
        case 2:
          return 'des-cbc-md4';
        case 3:
          return 'des-cbc-md5';
        case 5:
          return 'des3-cbc-md5';
        case 7:
          return 'des3-cbc-sha1';
        case 9:
          return 'dsaWithSHA1-CmsOID';
        case 10:  return 'md5WithRSAEncryption-CmsOID';
        case 11:  return 'sha1WithRSAEncryption-CmsOID';
        case 12:  return 'rc2CBC-EnvOID';
        case 13:  return 'rsaEncryption-EnvOID';
        case 14:  return 'rsaES-OAEP-ENV-OID';
        case 15:  return 'des-ede3-cbc-Env-OID';
        case 16:  return 'des3-cbc-sha1-kd';
        case 17:  return 'aes128-cts-hmac-sha1-96';
        case 18:  return 'aes256-cts-hmac-sha1-96';
        case 19:  return 'aes128-cts-hmac-sha256-128';
        case 20:  return 'aes256-cts-hmac-sha384-192';
        case 23:  return 'rc4-hmac';
        case 24:  return 'rc4-hmac-exp';
        case 25:  return 'camellia128-cts-cmac';
        case 26:  return 'camellia256-cts-cmac';
        case 65:  return 'subkey-keymaterial';
        default:
          return ticketEncryptionType + '';
      }
    },
  }),

  new DefaultColumn('ip', 'log.all.ip', 'IP', CAT_ALL, entry => collectAll(entry, 'ip')),
  new IntegerColumn('port', 'log.all.port', 'Port', CAT_ALL, entry => collectAll(entry, 'port')),
  new UppercaseColumn('hostname', 'log.all.hostname', 'Hostname', CAT_ALL, entry => collectAll(entry, 'hostname')),
  new LowercaseColumn('fqdn', 'log.all.fqdn', 'FQDN', CAT_ALL, entry => collectAll(entry, 'fqdn')),
  new UppercaseColumn('samName', 'log.all.samName', 'SAM Name', CAT_ALL, entry => collectAll(entry, 'samName')),
  new UppercaseColumn('sid', 'log.all.sid', 'SID', CAT_ALL, entry => collectAll(entry, 'sid')),
  new UppercaseColumn('domain', 'log.all.domain', 'Domain', CAT_ALL, entry => collectAll(entry, 'domain')),
  new DefaultColumn('upn', 'log.all.upn', 'UPN', CAT_ALL, entry => collectAll(entry, 'upn')),
  new DefaultColumn('logonId', 'log.all.logonId', 'Logon ID', CAT_ALL, entry => collectAll(entry, 'logonId')),

  new DefaultColumn('source.ip', 'log.source.ip', 'Source IP', CAT_SOURCE, entry => entry._source.log.source && entry._source.log.source.ip),
  new IntegerColumn('source.port', 'log.source.port', 'Source Port', CAT_SOURCE, entry => entry._source.log.source && entry._source.log.source.port),
  new UppercaseColumn('source.hostname', 'log.source.hostname', 'Source Hostname', CAT_SOURCE, entry => entry._source.log.source && entry._source.log.source.hostname),
  new LowercaseColumn('source.fqdn', 'log.source.fqdn', 'Source FQDN', CAT_SOURCE, entry => entry._source.log.source && entry._source.log.source.fqdn),
  new UppercaseColumn('source.samName', 'log.source.samName', 'Source SAM Name', CAT_SOURCE, entry => entry._source.log.source && entry._source.log.source.samName),
  new UppercaseColumn('source.sid', 'log.source.sid', 'Source SID', CAT_SOURCE, entry => entry._source.log.source && entry._source.log.source.sid),
  new UppercaseColumn('source.domain', 'log.source.domain', 'Source Domain', CAT_SOURCE, entry => entry._source.log.source && entry._source.log.source.domain),
  new DefaultColumn('source.upn', 'log.source.upn', 'Source UPN', CAT_SOURCE, entry => entry._source.log.source && entry._source.log.source.upn),
  new DefaultColumn('source.logonId', 'log.source.logonId', 'Source Logon ID', CAT_SOURCE, entry => entry._source.log.source && entry._source.log.source.logonId),

  new DefaultColumn('target.ip', 'log.target.ip', 'Target IP', CAT_TARGET, entry => entry._source.log.target && entry._source.log.target.ip),
  new IntegerColumn('target.port', 'log.target.port', 'Target Port', CAT_TARGET, entry => entry._source.log.target && entry._source.log.target.port),
  new UppercaseColumn('target.hostname', 'log.target.hostname', 'Target Hostname', CAT_TARGET, entry => entry._source.log.target && entry._source.log.target.hostname),
  new LowercaseColumn('target.fqdn', 'log.target.fqdn', 'Target FQDN', CAT_TARGET, entry => entry._source.log.target && entry._source.log.target.fqdn),
  new UppercaseColumn('target.samName', 'log.target.samName', 'Target SAM Name', CAT_TARGET, entry => entry._source.log.target && entry._source.log.target.samName),
  new UppercaseColumn('target.sid', 'log.target.sid', 'Target SID', CAT_TARGET, entry => entry._source.log.target && entry._source.log.target.sid),
  new UppercaseColumn('target.domain', 'log.target.domain', 'Target Domain', CAT_TARGET, entry => entry._source.log.target && entry._source.log.target.domain),
  new UppercaseColumn('target.serviceName', 'log.target.serviceName', 'Target Service Name', CAT_TARGET, entry => entry._source.log.target && entry._source.log.target.serviceName),
  new DefaultColumn('target.upn', 'log.target.upn', 'Target UPN', CAT_TARGET, entry => entry._source.log.target && entry._source.log.target.upn),
  new DefaultColumn('target.logonId', 'log.target.logonId', 'Target Logon ID', CAT_TARGET, entry => entry._source.log.target && entry._source.log.target.logonId),

];

msvistaColumns.forEach((col, i) => {
  col.index = i;
});

export const msvistaColumnsByName = util.toMap(msvistaColumns, col => col.name);

import { categories } from './wsacat';
export const WSA_CATEGORY_MAP = util.toMap(categories, cat => `IW_${cat.id}`);

export const wsaColumns: Column[] = [
  new WsaTimeDecisionColumn(),
  new DefaultColumn<templates.WsaLogEntry>('reportingIp', 'log.reportingIp', 'Reporting IP', CAT_STAND, entry => entry._source.log.reportingIp, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('clientIp', 'wsa.request.clientIp', 'Client IP', CAT_STAND, entry => entry._source.wsa.request.clientIp, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('category', 'wsa.urlCategory', 'URL Category', CAT_STAND, entry => entry._source.wsa.urlCategory, {baseUrl: 'logs/wsa',
    format: function(value) {
      const cat = util.asScalar(value);

      if(cat === undefined)
        return '';

      if(cat === 'C_Appl')
        return 'Custom application';

      if(cat === 'C_PASS')
        return 'Custom passthru';

      const category = WSA_CATEGORY_MAP.get(cat);
      return category ? category.name : cat;
    }
  }),
  new UppercaseColumn<templates.WsaLogEntry>('aclDecisionBase', 'wsa.aclDecisionBase', 'Base Decision', CAT_STAND, entry => entry._source.wsa.aclDecisionBase, {baseUrl: 'logs/wsa'}),
  new UppercaseColumn<templates.WsaLogEntry>('samName', 'wsa.request.samName', 'SAM Name', CAT_STAND, entry => entry._source.wsa.request.samName, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('fqdn', 'log.target.fqdn', 'FQDN', CAT_STAND, entry => entry._source.log.target && entry._source.log.target.fqdn, {baseUrl: 'logs/wsa'}),
  new UppercaseColumn<templates.WsaLogEntry>('method', 'wsa.request.httpMethod', 'Method', CAT_STAND, entry => entry._source.wsa.request.httpMethod, {baseUrl: 'logs/wsa'}),
  new WsaUrlColumn(),
  new WsaResponseCodeColumn(),
  new DefaultColumn<templates.WsaLogEntry>('mimeType', 'wsa.response.mimeType', 'MIME Type', CAT_STAND, entry => entry._source.wsa.response && entry._source.wsa.response.mimeType, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('malwareCategory', 'wsa.response.malwareCategory', 'Malware Category', CAT_STAND, entry => entry._source.wsa.response && entry._source.wsa.response.malwareCategory, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('sha256', 'wsa.response.sha256Hash', 'SHA256', CAT_STAND, entry => entry._source.wsa.response && entry._source.wsa.response.sha256Hash, {baseUrl: 'logs/wsa'}),
  new IntegerColumn<templates.WsaLogEntry>('elapsedTime', 'wsa.elapsedTime', 'Elasped Time', CAT_STAND, entry => entry._source.wsa.elapsedTime, {baseUrl: 'logs/wsa',
    format: function(time) {
      return time + ' ms';
    },
    searchable: false,
  }),
  new IntegerColumn<templates.WsaLogEntry>('avgBandwidthKbps', 'wsa.avgBandwidthKbps', 'Average Bandwidth', CAT_STAND, entry => entry._source.wsa.avgBandwidthKbps, {baseUrl: 'logs/wsa',
    format: function(bw) {
      return bw + ' Kbps';
    },
    searchable: false,
  }),
  new IntegerColumn<templates.WsaLogEntry>('requestSize', 'wsa.request.size', 'Request Size', CAT_STAND, entry => entry._source.wsa.request.size, {baseUrl: 'logs/wsa',
    searchable: false,
    defaultSortOrder: 'desc',
  }),
  new IntegerColumn<templates.WsaLogEntry>('responseSize', 'wsa.response.size', 'Response Size', CAT_STAND, entry => entry._source.wsa.response && entry._source.wsa.response.size, {baseUrl: 'logs/wsa',
    searchable: false,
    defaultSortOrder: 'desc',
  }),

  new DefaultColumn<templates.WsaLogEntry>('transactionResult', 'wsa.transactionResult', 'Transaction Result', CAT_VERDICT, entry => entry._source.wsa.transactionResult, {baseUrl: 'logs/wsa'}),

  new DefaultColumn<templates.WsaLogEntry>('outboundMalwareVerdict', 'wsa.request.outboundMalwareVerdict', 'Outbound Malware Verdict', CAT_VERDICT, entry => entry._source.wsa.request.outboundMalwareVerdict, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('outboundMalwareThreatName', 'wsa.request.outboundMalwareThreatName', 'Outbound Malware Threat Name', CAT_VERDICT, entry => entry._source.wsa.request.outboundMalwareThreatName, {baseUrl: 'logs/wsa'}),

  new DefaultColumn<templates.WsaLogEntry>('safeSearch', 'wsa.verdict.safeSearch', 'Safe Search', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.safeSearch, {baseUrl: 'logs/wsa'}),
  new IntegerColumn<templates.WsaLogEntry>('webReputationScore', 'wsa.verdict.webReputationScore', 'Web Reputation Score', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.webReputationScore, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('reputationThreatType', 'wsa.verdict.reputationThreatType', 'Reputation Threat Type', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.reputationThreatType, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('externalDlp', 'wsa.verdict.externalDlp', 'External DLP', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.externalDlp, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('ciscoDataSecurity', 'wsa.verdict.ciscoDataSecurity', 'Cisco Data Security', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.ciscoDataSecurity, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('webroot.verdict', 'wsa.verdict.webroot.verdict', 'Webroot Verdict', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.webroot && entry._source.wsa.verdict.webroot.verdict, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('mcafee.verdict', 'wsa.verdict.mcafee.verdict', 'McAfee Verdict', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.mcafee && entry._source.wsa.verdict.mcafee.verdict, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('mcafee.virusType', 'wsa.verdict.mcafee.virusType', 'McAfee Virus Type', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.mcafee && entry._source.wsa.verdict.mcafee.virusType, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('mcafee.virusName', 'wsa.verdict.mcafee.virusName', 'McAfee Virus Name', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.mcafee && entry._source.wsa.verdict.mcafee.virusName, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('sophos.verdict', 'wsa.verdict.sophos.verdict', 'Sophos Verdict', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.sophos && entry._source.wsa.verdict.sophos.verdict, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('sophos.virusName', 'wsa.verdict.sophos.virusName', 'Sophos Virus Name', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.sophos && entry._source.wsa.verdict.sophos.virusName, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('avc.appName', 'wsa.verdict.avc.appName', 'AVC App Name', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.avc && entry._source.wsa.verdict.avc.appName, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('avc.appType', 'wsa.verdict.avc.appType', 'AVC App Type', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.avc && entry._source.wsa.verdict.avc.appType, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('avc.appBehavior', 'wsa.verdict.avc.appBehavior', 'AVC App Behavior', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.avc && entry._source.wsa.verdict.avc.appBehavior, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('amp.verdict', 'wsa.verdict.amp.verdict', 'AMP Verdict', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.amp && entry._source.wsa.verdict.amp.verdict, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('amp.threatName', 'wsa.verdict.amp.threatName', 'AMP Threat Name', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.amp && entry._source.wsa.verdict.amp.threatName, {baseUrl: 'logs/wsa'}),
  new IntegerColumn<templates.WsaLogEntry>('amp.reputationScore', 'wsa.verdict.amp.reputationScore', 'AMP Reputation Score', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.amp && entry._source.wsa.verdict.amp.reputationScore, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('amp.filename', 'wsa.verdict.amp.filename', 'AMP Filename', CAT_VERDICT, entry => entry._source.wsa.verdict && entry._source.wsa.verdict.amp && entry._source.wsa.verdict.amp.filename, {baseUrl: 'logs/wsa'}),

  new DefaultColumn<templates.WsaLogEntry>('policies.decision', 'wsa.policies.decision', 'Decision Policy', CAT_POLICY, entry => entry._source.wsa.policies && entry._source.wsa.policies.decision, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('policies.identity', 'wsa.policies.identity', 'Identity Policy', CAT_POLICY, entry => entry._source.wsa.policies && entry._source.wsa.policies.identity, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('policies.outboundMalware', 'wsa.policies.outboundMalware', 'Outbound Malware Policy', CAT_POLICY, entry => entry._source.wsa.policies && entry._source.wsa.policies.outboundMalware, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('policies.dataSecurity', 'wsa.policies.dataSecurity', 'Data Security Policy', CAT_POLICY, entry => entry._source.wsa.policies && entry._source.wsa.policies.dataSecurity, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('policies.externalDlp', 'wsa.policies.externalDlp', 'External DLP Policy', CAT_POLICY, entry => entry._source.wsa.policies && entry._source.wsa.policies.externalDlp, {baseUrl: 'logs/wsa'}),
  new DefaultColumn<templates.WsaLogEntry>('policies.routingPolicy', 'wsa.policies.routingPolicy', 'Routing Policy', CAT_POLICY, entry => entry._source.wsa.policies && entry._source.wsa.policies.routingPolicy, {baseUrl: 'logs/wsa'}),
];

wsaColumns.forEach((col, i) => {
  col.index = i;
});

export const wsaColumnsByName = util.toMap(wsaColumns, d => d.name);

class CylanceTimeTypeColumn extends DefaultColumn<templates.CylanceLogEntry, Date | string> {
  constructor() {
    super('time', 'log.eventTime', 'Time', CAT_STAND, a => a._source.log.eventTime ? new Date(a._source.log.eventTime) : undefined, { defaultSortOrder: 'desc' });
  }

  writeCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<Date | string>, HTMLElement, any>, value: ColumnValue<Date | string>, entry: LogDocument<templates.BaseLogEntry>, callbacks: AlterTermCallbacks) {
    const time = util.asDate(util.asScalar(value));

    const ago = d3filters.ago(time, {precise: true}), full = d3filters.ago(time, {precise: true, alwaysFull: true});

    td.style('white-space', 'pre');
    td.append('a')
      .classed('ago-full-time', true)
      .attr('href', 'logs/cylance/entry/' + encodeURIComponent(entry._index.substring('cylancelog-'.length)) + '/' + encodeURIComponent(entry._id))
      .text(full);
    td.append('a')
      .classed('ago-short-time', true)
      .attr('href', 'logs/cylance/entry/' + encodeURIComponent(entry._index.substring('cylancelog-'.length)) + '/' + encodeURIComponent(entry._id))
      .attr('title', full)
      .text(ago);
  };

  rewriteCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<Date | string>, HTMLElement, any>, value: ColumnValue<Date | string>, entry: LogDocument<templates.BaseLogEntry>, callbacks: AlterTermCallbacks) {
    td.selectAll('*').remove();
    this.writeCell(td, value, entry, callbacks);
  };
}

class CylanceMessageColumn extends DefaultColumn<templates.CylanceLogEntry, string> {
  constructor() {
    super('message', 'cylance.message', 'Message', CAT_STAND,
      function(entry) { return (entry.highlight && entry.highlight['cylance.message'][0]) || entry._source.cylance.message; },
      { sortField: '_score', defaultSortOrder: 'desc' });
  }

  writeCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<string>, HTMLElement, any>, value: ColumnValue<string>, entry: LogDocument<templates.CylanceLogEntry>, callbacks: AlterTermCallbacks) {
    const msg = util.asScalar(value);

    td.classed('log-message', true);
    td.property('msg', msg);

    //td.style('white-space', '')
    // Pull out any highlights
    const highlights: {start: number, length: number}[] = [];
    let currentOffset = 0;

    var msgNoHighlights = (msg || '').replace(/<highlight>([^<]+)<\/highlight>/g, function(match, p1, offset) {
      highlights.push({start: offset - currentOffset, length: p1.length});
      currentOffset += match.length - p1.length;
      return p1;
    });

    const words = util.segmentTextStandard(msgNoHighlights);

    // Build HTML
    let currentHighlight = 0;

    words.forEach(function(word, i) {
      const preword = msgNoHighlights.substring(i === 0 ? 0 : (words[i - 1].index + words[i - 1].word.length), word.index);

      if(preword.length !== 0)
        td.append('span').text(preword);

      let highlight = false;

      if(currentHighlight < highlights.length && word.index === highlights[currentHighlight].start) {
        currentHighlight++;
        highlight = true;
      }

      td.append('span')
        .attr('class', 'segmented-word')
        .classed('red-highlight', highlight)
        .text(word.word)
        .on('click', d => {
          if(d3.event.button === 0 && d3.event.shiftKey && !d3.event.ctrlKey && !d3.event.altKey) {
            callbacks.addTerm(null, word.word);
          }
          else if(d3.event.button === 0 && !d3.event.shiftKey && d3.event.ctrlKey && !d3.event.altKey) {
            callbacks.removeTerm(null, word.word);
          }
        });
    });

    const postword = (words.length === 0) ? msgNoHighlights : msgNoHighlights.substring(words[words.length - 1].index + words[words.length - 1].word.length);

    if(postword.length !== 0) {
      td.append('span').text(postword);
    }
  };

  rewriteCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<string>, HTMLElement, any>, value: ColumnValue<string>, entry: LogDocument<templates.CylanceLogEntry>, callbacks: AlterTermCallbacks) {
    if(td.property('msg') !== value) {
      td.selectAll('*').remove();
      this.writeCell(td, value, entry, callbacks);
    }
  };
}

class CylanceEventTypeColumn extends DefaultColumn<templates.CylanceLogEntry, string> {
  constructor() {
    super('eventType', 'cylance.eventType', 'Event Type', CAT_STAND, entry => entry._source.cylance.eventType, {baseUrl: 'logs/cylance'});
  }

  writeCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<string>, HTMLElement, any>, v: ColumnValue<string>, entry: LogDocument<templates.CylanceLogEntry>, callbacks: AlterTermCallbacks) {
    const value = util.asScalar(v);

    if(value === undefined)
      return;

    let classes;

    if(value === 'Threat')
      classes = { label: 'warning', icon: 'fa-warning' };
    else if(value === 'AuditLog')
      classes = { label: 'info', icon: 'fa-user' };
    else if(value === 'ExploitAttempt')
      classes = { label: 'danger', icon: 'fa-warning' };
    else if(value === 'Device')
      classes = { label: null, icon: 'fa-laptop' };
    else
      classes = { label: null, icon: null };

    var label = td.append('a')
      //.attr('class', 'label cursor-pointer')
      .style('white-space', 'nowrap')
      .on('click', d => {
        if(d3.event.button === 0 && d3.event.shiftKey && !d3.event.ctrlKey && !d3.event.altKey) {
          callbacks.addTerm('eventType', value);
        }
        else if(d3.event.button === 0 && !d3.event.shiftKey && d3.event.ctrlKey && !d3.event.altKey) {
          callbacks.removeTerm('eventType', value);
        }
      })

    if(classes.label)
      label.classed('text-' + classes.label, true);

    if(classes.icon)
      label.append('i').attr('class', 'fa fa-fw ' + classes.icon);

    label.append('span').text(value);
  };
}

export const cylanceColumns: Column[] = [
  new CylanceTimeTypeColumn(),

  new DefaultColumn('tag', 'log.tag', 'Tags', CAT_STAND, entry => entry._source.log.tag, {baseUrl: 'logs/cylance', sortable: false}),
  new CylanceEventTypeColumn(),
  new DefaultColumn<templates.CylanceLogEntry>('eventName', 'cylance.eventName', 'Event Name', CAT_STAND, entry => entry._source.cylance.eventName, {baseUrl: 'logs/cylance'}),

  new CylanceMessageColumn(),

  new DefaultColumn<templates.CylanceLogEntry>('device', 'cylance.device', 'Device', CAT_STAND, entry => entry._source.cylance.device, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('agentVersion', 'cylance.agentVersion', 'Agent Version', CAT_STAND, entry => entry._source.cylance.agentVersion, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('ip', 'cylance.ip', 'IP', CAT_STAND, entry => entry._source.cylance.ip, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('mac', 'cylance.mac', 'MAC', CAT_STAND, entry => entry._source.cylance.mac, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('samName', 'cylance.samName', 'SAM Name', CAT_STAND, entry => entry._source.cylance.samName, {baseUrl: 'logs/cylance'}),
  new IntegerColumn<templates.CylanceLogEntry>('processId', 'cylance.processId', 'Process ID', CAT_STAND, entry => entry._source.cylance.processId, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('processName', 'cylance.processName.raw', 'Process Name', CAT_STAND, entry => entry._source.cylance.processName, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('os', 'cylance.os.raw', 'OS', CAT_STAND, entry => entry._source.cylance.os, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('loginName', 'cylance.loginName', 'Login Name', CAT_STAND, entry => entry._source.cylance.loginName, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('violationType', 'cylance.violationType', 'Violation Type', CAT_STAND, entry => entry._source.cylance.violationType, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('zone', 'cylance.zone', 'Zone', CAT_STAND, entry => entry._source.cylance.zone, {baseUrl: 'logs/cylance'}),

  new DefaultColumn('reportingIp', 'log.reportingIp', 'Reporting IP', CAT_STAND, entry => entry._source.log.reportingIp, {baseUrl: 'logs/cylance'}),

  new DefaultColumn<templates.CylanceLogEntry>('fileName', 'cylance.fileName.raw', 'File Name', CAT_THREAT, entry => entry._source.cylance.fileName, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('fullPath', 'cylance.fullPath.raw', 'Full Path', CAT_THREAT, entry => entry._source.cylance.fullPath, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('driveType', 'cylance.driveType', 'Drive Type', CAT_THREAT, entry => entry._source.cylance.driveType, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('sha256', 'cylance.sha256', 'SHA256', CAT_THREAT, entry => entry._source.cylance.sha256, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('md5', 'cylance.md5', 'MD5', CAT_THREAT, entry => entry._source.cylance.md5, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('status', 'cylance.status', 'Status', CAT_THREAT, entry => entry._source.cylance.status, {baseUrl: 'logs/cylance'}),
  new IntegerColumn<templates.CylanceLogEntry>('cylanceScore', 'cylance.cylanceScore', 'Cylance Score', CAT_THREAT, entry => entry._source.cylance.cylanceScore, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('fileType', 'cylance.fileType', 'File Type', CAT_THREAT, entry => entry._source.cylance.fileType, {baseUrl: 'logs/cylance'}),
  //new Bool('isRunning', 'cylance.md5', 'MD5', CAT_THREAT, entry => entry._source.cylance.md5, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('detectedBy', 'cylance.detectedBy', 'Detected By', CAT_THREAT, entry => entry._source.cylance.detectedBy, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('threatClass', 'cylance.threatClass', 'Threat Class', CAT_THREAT, entry => entry._source.cylance.threatClass, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('threatSubClass', 'cylance.threatSubClass', 'Threat Subclass', CAT_THREAT, entry => entry._source.cylance.threatSubClass, {baseUrl: 'logs/cylance'}),

  new DefaultColumn<templates.CylanceLogEntry>('policy', 'cylance.policy', 'Policy', CAT_THREAT, entry => entry._source.cylance.policy, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('category', 'cylance.category', 'Category', CAT_THREAT, entry => entry._source.cylance.category, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('userName', 'cylance.userName', 'User Name', CAT_THREAT, entry => entry._source.cylance.userName, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('userEmail', 'cylance.userEmail', 'User Email', CAT_THREAT, entry => entry._source.cylance.userEmail, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('reason', 'cylance.reason', 'Reason', CAT_THREAT, entry => entry._source.cylance.reason, {baseUrl: 'logs/cylance'}),

  new DefaultColumn<templates.CylanceLogEntry>('externalDevice.type', 'cylance.externalDevice.type', 'External Device Type', CAT_EXTERNALDEVICE, entry => entry._source.cylance.externalDevice && entry._source.cylance.externalDevice.type, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('externalDevice.name', 'cylance.externalDevice.name', 'External Device Name', CAT_EXTERNALDEVICE, entry => entry._source.cylance.externalDevice && entry._source.cylance.externalDevice.name, {baseUrl: 'logs/cylance', sortable: false}),
  new DefaultColumn<templates.CylanceLogEntry>('externalDevice.vendorId', 'cylance.externalDevice.vendorId', 'Vendor ID', CAT_EXTERNALDEVICE, entry => entry._source.cylance.externalDevice && entry._source.cylance.externalDevice.vendorId, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('externalDevice.productId', 'cylance.externalDevice.productId', 'Product ID', CAT_EXTERNALDEVICE, entry => entry._source.cylance.externalDevice && entry._source.cylance.externalDevice.productId, {baseUrl: 'logs/cylance'}),
  new DefaultColumn<templates.CylanceLogEntry>('externalDevice.serialNumber', 'cylance.externalDevice.serialNumber', 'Serial Number', CAT_EXTERNALDEVICE, entry => entry._source.cylance.externalDevice && entry._source.cylance.externalDevice.serialNumber, {baseUrl: 'logs/cylance'}),
];

cylanceColumns.forEach((col, i) => {
  col.index = i;
});

export const cylanceColumnsByName = util.toMap(cylanceColumns, d => d.name);

class SqlTimeTypeColumn extends DefaultColumn<templates.SqlLogEntry, Date | string> {
  constructor() {
    super('time', 'log.eventTime', 'Time', CAT_STAND, entry => entry._source.log.eventTime, { defaultSortOrder: 'desc' });
  }

  writeCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<Date | string>, HTMLElement, any>, value: ColumnValue<Date | string>, entry: LogDocument<templates.SqlLogEntry>, callbacks: AlterTermCallbacks) {
    const time = util.asDate(util.asScalar(value));

    td.style('white-space', 'pre');
    td.append('a')
      .attr('href', 'logs/sql/entry/' + encodeURIComponent(entry._index.substring(7)) + '/' + encodeURIComponent(entry._id))
      .attr('title', d3filters.date(time, '%A %Y-%m-%d %H:%M:%S.%L%Z'))
      .text(d3filters.ago(time));
    td.append('br');

    //const decisionCategory = entry._source.wsa.aclDecision.split('_')[0];
    //const decisionStatus = WSA_CATEGORY_STATUS[decisionCategory] || 'DEFAULT';

    var label = td.append('span')
      .attr('class', 'label cursor-pointer label-default')
      .on('click', d => {
        if(d3.event.button === 0 && d3.event.shiftKey && !d3.event.ctrlKey && !d3.event.altKey) {
          callbacks.addTerm('EventType', entry._source.sql.EventType);
        }
        else if(d3.event.button === 0 && !d3.event.shiftKey && d3.event.ctrlKey && !d3.event.altKey) {
          callbacks.removeTerm('EventType', entry._source.sql.EventType);
        }
      })
      //.classed(labelClasses[decisionStatus] || 'label-default', true)
      .text(entry._source.sql.EventType);
  }

  rewriteCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<Date | string>, HTMLElement, any>, value: ColumnValue<Date | string>, entry: LogDocument<templates.SqlLogEntry>, callbacks: AlterTermCallbacks) {
    td.selectAll('*').remove();
    this.writeCell(td, value, entry, callbacks);
  }
}

class SqlTextColumn extends DefaultColumn<templates.SqlLogEntry> {
  constructor() {
    super('text', '', 'Text', CAT_STAND,
      entry => (entry.highlight && (entry.highlight['sql.TSQLCommand'][0] || entry.highlight['sql.TextData'][0])) || entry._source.sql.TSQLCommand || entry._source.sql.TextData,
      { sortField: '_score', defaultSortOrder: 'desc' });
  }

  writeCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<string>, HTMLElement, any>, value: ColumnValue<string>, entry: LogDocument<templates.SqlLogEntry>, callbacks: AlterTermCallbacks) {
    const msg = util.asScalar(value);

    td.classed('log-message', true);
    td.property('msg', msg);

    //td.style('white-space', '')
    // Pull out any highlights
    const highlights: {start: number; length: number;}[] = [];
    let currentOffset = 0;

    var msgNoHighlights = (msg || '').replace(/<highlight>([^<]+)<\/highlight>/g, function(match, p1, offset) {
      highlights.push({start: offset - currentOffset, length: p1.length});
      currentOffset += match.length - p1.length;
      return p1;
    });

    const words = util.segmentTextCodeKeyword(msgNoHighlights);

    // Build HTML
    let currentHighlight = 0;

    words.forEach(function(word, i) {
      const preword = msgNoHighlights.substring(i === 0 ? 0 : (words[i - 1].index + words[i - 1].word.length), word.index);

      if(preword.length !== 0)
        td.append('span').text(preword);

      let highlight = false;

      if(currentHighlight < highlights.length && word.index === highlights[currentHighlight].start) {
        currentHighlight++;
        highlight = true;
      }

      td.append('span')
        .attr('class', 'segmented-word')
        .classed('red-highlight', highlight)
        .text(word.word)
        .on('click', d => {
          if(d3.event.button === 0 && d3.event.shiftKey && !d3.event.ctrlKey && !d3.event.altKey) {
            callbacks.addTerm(null, word.word);
          }
          else if(d3.event.button === 0 && !d3.event.shiftKey && d3.event.ctrlKey && !d3.event.altKey) {
            callbacks.removeTerm(null, word.word);
          }
        });
    });

    const postword = (words.length === 0) ? msgNoHighlights : msgNoHighlights.substring(words[words.length - 1].index + words[words.length - 1].word.length);

    if(postword.length !== 0) {
      td.append('span').text(postword);
    }
  };

  rewriteCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<string>, HTMLElement, any>, value: ColumnValue<string>, entry: LogDocument<templates.SqlLogEntry>, callbacks: AlterTermCallbacks) {
    if(td.property('msg') !== value) {
      td.selectAll('*').remove();
      this.writeCell(td, value, entry, callbacks);
    }
  };
}

const CAT_AUDIT = 'Audit';
const CAT_DDL = 'DDL';
const CAT_STATS = 'Statistics';

function makeSqlDefaultColumn<K extends keyof templates.SqlLogEntry['sql']>(name: K, cat: string) {
  return new DefaultColumn<templates.SqlLogEntry, templates.SqlLogEntry['sql'][K]>(name, 'sql.' + name, name, cat, entry => entry._source.sql[name], {baseUrl: 'logs/sql'});
}

const sqlColumns = [
  new SqlTimeTypeColumn(),

  new DefaultColumn('tag', 'log.tag', 'Tags', CAT_STAND, entry => entry._source.log.tag, {sortable: false}),

  new IntegerColumn<templates.SqlLogEntry>('SPID', 'sql.SPID', 'SPID', CAT_STAND, entry => entry._source.sql.SPID, {baseUrl: 'logs/sql'}),

  makeSqlDefaultColumn('ServerName', CAT_STAND),
  makeSqlDefaultColumn('LoginName', CAT_STAND),
  makeSqlDefaultColumn('LoginSid', CAT_STAND),
  makeSqlDefaultColumn('NTDomainName', CAT_STAND),
  makeSqlDefaultColumn('NTUserName', CAT_STAND),
  makeSqlDefaultColumn('SessionLoginName', CAT_STAND),
  makeSqlDefaultColumn('HostName', CAT_STAND),

  makeSqlDefaultColumn('ApplicationName', CAT_STAND),
  new IntegerColumn<templates.SqlLogEntry>('ClientProcessID', 'sql.ClientProcessID', 'ClientProcessID', CAT_STAND, entry => entry._source.sql.ClientProcessID, {baseUrl: 'logs/sql'}),

  new IntegerColumn<templates.SqlLogEntry>('DatabaseID', 'sql.DatabaseID', 'DatabaseID', CAT_STAND, entry => entry._source.sql.DatabaseID, {baseUrl: 'logs/sql'}),

  new DefaultColumn<templates.SqlLogEntry>('DatabaseName', 'sql.DatabaseName', 'DatabaseName', CAT_STAND, entry => entry._source.sql.DatabaseName, {baseUrl: 'logs/sql'}),
  new DefaultColumn<templates.SqlLogEntry>('SchemaName', 'sql.SchemaName', 'SchemaName', CAT_STAND, entry => entry._source.sql.SchemaName, {baseUrl: 'logs/sql'}),
  new DefaultColumn<templates.SqlLogEntry>('ObjectName', 'sql.ObjectName', 'ObjectName', CAT_STAND, entry => entry._source.sql.ObjectName, {baseUrl: 'logs/sql'}),
  new DefaultColumn<templates.SqlLogEntry>('ObjectType', 'sql.ObjectType', 'ObjectType', CAT_STAND, entry => entry._source.sql.ObjectType, {baseUrl: 'logs/sql'}),
  new DefaultColumn<templates.SqlLogEntry>('OwnerName', 'sql.OwnerName', 'OwnerName', CAT_STAND, entry => entry._source.sql.OwnerName, {baseUrl: 'logs/sql'}),

  new IntegerColumn<templates.SqlLogEntry>('NestLevel', 'sql.NestLevel', 'NestLevel', CAT_STAND, entry => entry._source.sql.NestLevel, {baseUrl: 'logs/sql', searchable: false}),
  new DefaultColumn<templates.SqlLogEntry>('Parameters', 'sql.Parameters', 'Parameters', CAT_STAND, entry => entry._source.sql.Parameters, {baseUrl: 'logs/sql'}),

  makeSqlDefaultColumn('TargetLoginName', CAT_STAND),
  makeSqlDefaultColumn('TargetLoginSid', CAT_STAND),
  makeSqlDefaultColumn('TargetUserName', CAT_STAND),
  makeSqlDefaultColumn('DBUserName', CAT_STAND),
  makeSqlDefaultColumn('SID', CAT_STAND),

  new IntegerColumn<templates.SqlLogEntry>('Permissions', 'sql.Permissions', 'Permissions', CAT_STAND, entry => entry._source.sql.Permissions, {baseUrl: 'logs/sql', searchable: false, sortable: false,
    format: function(v, entry) {
      const value = util.asScalar(v);

      if(value === undefined)
        return '';

      if(entry._source.sql.EventType === 'AUDIT_SCHEMA_OBJECT_ACCESS_EVENT') {
        return [
          (value & 1) && 'SELECT ALL',
          (value & 2) && 'UPDATE ALL',
          (value & 4) && 'REFERENCES ALL',
          (value & 8) && 'INSERT',
          (value & 16) && 'DELETE',
          (value & 32) && 'EXECUTE',
        ].filter(util.notEmpty).join(', ');
      }

      return `${value}`;
    }
  }),

  new SqlTextColumn(),
  //new DefaultColumn('TSQLCommand', 'sql.TSQLCommand', 'TSQL', CAT_STAND, entry => entry._source.sql.TSQLCommand, {baseUrl: 'logs/sql', searchable: false, sortable: false}),
  //new DefaultColumn('TextData', 'sql.TextData', 'TextData', CAT_STAND, entry => entry._source.sql.TextData, {baseUrl: 'logs/sql', searchable: false, sortable: false}),

  new IntegerColumn<templates.SqlLogEntry>('EventClass', 'sql.EventClass', 'EventClass', CAT_AUDIT, entry => entry._source.sql.EventClass, {baseUrl: 'logs/sql'}),
  new IntegerColumn<templates.SqlLogEntry>('EventSubClass', 'sql.EventSubClass', 'EventSubClass', CAT_AUDIT, entry => entry._source.sql.EventSubClass, {baseUrl: 'logs/sql',
    format: function(value, entry) {
      switch(entry._source.sql.EventType) {
        case 'AUDIT_SERVER_OPERATION_EVENT':
          // https://msdn.microsoft.com/en-us/library/ms187867.aspx
          switch(value) {
            case 1:   return 'Administer bulk operations';
            case 2:   return 'Alter settings';
            case 3:   return 'Alter resources';
            case 4:   return 'Authenticate';
            case 5:   return 'External access';
            case 6:   return 'Alter server state';
            case 7:   return 'Unsafe assembly';
            case 8:   return 'Alter connection';
            case 9:   return 'Alter resource governor';
            case 10:  return 'Use any workload group';
            case 11:  return 'View server state';
          }
          break;

        case 'AUDIT_DATABASE_PRINCIPAL_MANAGEMENT_EVENT':
          // https://msdn.microsoft.com/en-us/library/ms187867.aspx
          switch(value) {
            case 1:   return 'Create';
            case 2:   return 'Alter';
            case 3:   return 'Drop';
            case 4:   return 'Dump';
            case 11:  return 'Load';
          }
          break;

        case 'AUDIT_ADD_ROLE_EVENT':
          // https://msdn.microsoft.com/en-us/library/ms187867.aspx
          switch(value) {
            case 1:   return 'Create';
            case 2:   return 'Drop';
          }
          break;

        case 'AUDIT_DATABASE_PRINCIPAL_MANAGEMENT_EVENT':
          // https://msdn.microsoft.com/en-us/library/ms187867.aspx
          switch(value) {
            case 1:   return 'Create';
            case 2:   return 'Alter';
            case 3:   return 'Drop';
            case 4:   return 'Dump';
            case 11:  return 'Load';
          }
          break;

        case 'AUDIT_SERVER_PRINCIPAL_MANAGEMENT_EVENT':
          // https://msdn.microsoft.com/en-us/library/ms188715.aspx
          switch(value) {
            case 1:   return 'Create';
            case 2:   return 'Alter';
            case 3:   return 'Drop';
            case 4:   return 'Dump';
            case 5:   return 'Disable';
            case 6:   return 'Enable';
            case 11:  return 'Load';
          }
          break;

        case 'AUDIT_SERVER_OBJECT_MANAGEMENT_EVENT':
          // https://msdn.microsoft.com/en-us/library/ms175468.aspx
          switch(value) {
            case 1:   return 'Create';
            case 2:   return 'Alter';
            case 3:   return 'Drop';
            case 4:   return 'Dump';
            case 7:   return 'Credential mapped to login';
            case 9:   return 'Credential map dropped';
            case 11:  return 'Load';
          }
          break;

        case 'AUDIT_LOGIN':
        case 'AUDIT_LOGOUT':
          // https://msdn.microsoft.com/en-us/library/ms190260.aspx
          // https://msdn.microsoft.com/en-us/library/ms175827.aspx
          switch(value) {
            case 1:   return 'Nonpooled';
            case 2:   return 'Pooled';
          }
          break;
      }

      return `${value}`;
    }
  }),

  new IntegerColumn<templates.SqlLogEntry>('RequestID', 'sql.RequestID', 'RequestID', CAT_AUDIT, entry => entry._source.sql.RequestID, {baseUrl: 'logs/sql'}),
  new IntegerColumn<templates.SqlLogEntry>('XactSequence', 'sql.XactSequence', 'XactSequence', CAT_AUDIT, entry => entry._source.sql.XactSequence, {baseUrl: 'logs/sql', searchable: false, sortable: false}),
  new IntegerColumn<templates.SqlLogEntry>('EventSequence', 'sql.EventSequence', 'EventSequence', CAT_AUDIT, entry => entry._source.sql.EventSequence, {baseUrl: 'logs/sql', searchable: false, sortable: false}),

  new BooleanColumn<templates.SqlLogEntry>('Success', 'sql.Success', 'Success', CAT_AUDIT, entry => entry._source.sql.Success, {baseUrl: 'logs/sql', sortable: false}),
  new BooleanColumn<templates.SqlLogEntry>('IsSystem', 'sql.IsSystem', 'IsSystem', CAT_AUDIT, entry => entry._source.sql.IsSystem, {baseUrl: 'logs/sql', sortable: false}),
  new IntegerColumn<templates.SqlLogEntry>('Type', 'sql.Type', 'Type', CAT_AUDIT, entry => entry._source.sql.Type, {baseUrl: 'logs/sql'}),
  new IntegerColumn<templates.SqlLogEntry>('GroupID', 'sql.GroupID', 'GroupID', CAT_AUDIT, entry => entry._source.sql.GroupID, {baseUrl: 'logs/sql'}),

  new IntegerColumn<templates.SqlLogEntry>('Reads', 'sql.Reads', 'Reads', CAT_STATS, entry => entry._source.sql.Reads, {baseUrl: 'logs/sql', searchable: false, sortable: false}),
  new IntegerColumn<templates.SqlLogEntry>('Writes', 'sql.Writes', 'Writes', CAT_STATS, entry => entry._source.sql.Writes, {baseUrl: 'logs/sql', searchable: false, sortable: false}),
  new IntegerColumn<templates.SqlLogEntry>('CPU', 'sql.CPU', 'CPU', CAT_STATS, entry => entry._source.sql.CPU, {baseUrl: 'logs/sql',
    format: function(value) {
      const time = util.asScalar(value);
      return (time === undefined) ? '' : `${time} ms`;
    },
    searchable: false,
    sortable: false}),
  new IntegerColumn<templates.SqlLogEntry>('Duration', 'sql.Duration', 'Duration', CAT_STATS, entry => entry._source.sql.Duration, {baseUrl: 'logs/wsa',
    format: function(value) {
      const time = util.asScalar(value);
      return (time === undefined) ? '' : `${time * 0.001} ms`;
    },
    searchable: false,
  }),

  new DefaultColumn<templates.SqlLogEntry, Date | string>('StartTime', 'sql.StartTime', 'StartTime', CAT_STATS, entry => entry._source.sql.StartTime, {baseUrl: 'logs/sql', searchable: false}),
  new DefaultColumn<templates.SqlLogEntry, Date | string>('EndTime', 'sql.EndTime', 'EndTime', CAT_STATS, entry => entry._source.sql.EndTime, {baseUrl: 'logs/sql', searchable: false}),
];

sqlColumns.forEach((col, i) => {
  col.index = i;
});

export const sqlColumnsByName = util.toMap(sqlColumns, d => d.name);

class SyslogTimeColumn extends DefaultColumn<templates.BaseLogEntry, Date | string> {
  constructor() {
    super('time', 'log.eventTime', 'Time', CAT_STAND, entry => entry._source.log.eventTime, { defaultSortOrder: 'desc' });
  }

  writeCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<Date | string>, HTMLElement, any>, value: ColumnValue<Date | string>, entry: LogDocument<templates.BaseLogEntry>, callbacks: AlterTermCallbacks) {
    const time = util.asDate(util.asScalar(value));

    td.style('white-space', 'pre');
    td.append('a')
      //.attr('href', 'logs/syslog/entry/' + encodeURIComponent(entry._index.substring(7)) + '/' + encodeURIComponent(entry._id))
      .attr('title', d3filters.date(time, '%A %Y-%m-%d %H:%M:%S.%L%Z'))
      .text(d3filters.ago(time));
    //td.append('br');

    //const decisionCategory = entry._source.wsa.aclDecision.split('_')[0];
    //const decisionStatus = WSA_CATEGORY_STATUS[decisionCategory] || 'DEFAULT';

/*    var label = td.append('span')
      .attr('class', 'label cursor-pointer label-default')
      .on('click', function(d) {
        if(d3.event.button === 0 && d3.event.shiftKey && !d3.event.ctrlKey && !d3.event.altKey) {
          callbacks.addTerm('EventType', entry._source.sql.EventType);
        }
        else if(d3.event.button === 0 && !d3.event.shiftKey && d3.event.ctrlKey && !d3.event.altKey) {
          callbacks.removeTerm('EventType', entry._source.sql.EventType);
        }
      })
      //.classed(labelClasses[decisionStatus] || 'label-default', true)
      .text(entry._source.sql.EventType);*/
  }

  rewriteCell(td: d3.Selection<HTMLTableCellElement, ColumnValue<Date | string>, HTMLElement, any>, value: ColumnValue<Date | string>, entry: LogDocument<templates.BaseLogEntry>, callbacks: AlterTermCallbacks) {
    td.selectAll('*').remove();
    this.writeCell(td, value, entry, callbacks);
  }
}

export const syslogColumns: Column[] = [
  new SyslogTimeColumn(),

  new DefaultColumn('reportingIp', 'log.reportingIp', 'Reporting IP', CAT_STAND, entry => entry._source.log.reportingIp, {baseUrl: 'logs/syslog'}),
  new DefaultColumn('tag', 'log.tag', 'Tags', CAT_STAND, entry => entry._source.log.tag, {baseUrl: 'logs/syslog', sortable: false}),

  new MessageColumn(),
];

syslogColumns.forEach((col, i) => {
  col.index = i;
});

export const syslogColumnsByName = util.toMap(syslogColumns, d => d.name);
