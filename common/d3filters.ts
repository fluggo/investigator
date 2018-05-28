import * as d3 from 'd3';

type NumberFormatter = (value: number | { valueOf(): number }) => string;
const _cachedNumberPatterns = new Map<string, NumberFormatter>();

export function number(input: number | { valueOf(): number } | null | undefined, pattern: string) {
  let formatter: NumberFormatter | undefined = _cachedNumberPatterns.get(pattern);

  if(!formatter) {
    formatter = d3.format(pattern);
    _cachedNumberPatterns.set(pattern, formatter);
  }

  if(input === undefined || input === null)
    return '';

  return formatter(input);
};

// Display an "ago" marker that gives the time in relative terms
const todayFormatter = d3.timeFormat('%H:%M:%S');
const yesterdayFormatter = d3.timeFormat('%H:%M:%S yesterday');
const weekdayFormatter = d3.timeFormat('%A %H:%M');
const dateFormatter = d3.timeFormat('%A %Y-%m-%d %H:%M');

const todayPreciseFormatter = d3.timeFormat('%H:%M:%S.%L%Z');
const yesterdayPreciseFormatter = d3.timeFormat('%H:%M:%S yesterday');
const weekdayPreciseFormatter = d3.timeFormat('%A %H:%M:%S.%L%Z');
const datePreciseFormatter = d3.timeFormat('%A %Y-%m-%d %H:%M:%S.%L%Z');

interface AgoOptions {
  /** True to specify past times to the millisecond. */
  precise?: boolean;

  /** True to always specify the full date and time. */
  alwaysFull?: boolean;

  /** Optional alternate format function for a time today. */
  todayFormatter?: (date: Date) => string;

  /** Optional alternate format function for a time yesterday. */
  yesterdayFormatter?: (date: Date) => string;

  /** Optional alternate format function for a time within the last week. */
  weekdayFormatter?: (date: Date) => string;

  /** Optional alternate format function for a full date and time. */
  dateFormatter?: (date: Date) => string;
}

/**
 * Formats a date as a string relative to the current time.
 * @param input Date to format.
 * @param options Options to change the output.
 */
export function ago(input: Date | null | undefined, options: AgoOptions = {}) {
  if(!input)
    return 'Never';

  options.todayFormatter = options.todayFormatter || (options.precise ? todayPreciseFormatter : todayFormatter);
  options.yesterdayFormatter = options.yesterdayFormatter || (options.precise ? yesterdayFormatter : yesterdayFormatter);
  options.weekdayFormatter = options.weekdayFormatter || (options.precise ? weekdayPreciseFormatter : weekdayFormatter);
  options.dateFormatter = options.dateFormatter || (options.precise ? datePreciseFormatter : dateFormatter);

  if(options.alwaysFull)
    return options.dateFormatter(input);

  const now = new Date();
  let diff = now.getTime() - input.getTime();
  let hour: number, result: string;

  if(diff < 1000) {
    return 'Just now';
  }
  else if( diff < 1000 * 60 ) {
    // In the last minute
    diff = Math.round(diff / 1000);
    return (diff === 1) ? '1 second ago' : (diff + ' seconds ago');
  }
  else if( diff < 1000 * 60 * 60 ) {
    // In the last hour
    diff = Math.round(diff / (1000 * 60));
    return (diff === 1) ? '1 minute ago' : (diff + ' minutes ago');
  }
  else if( diff < 1000 * 60 * 60 * 4 ) {
    // In the last four hours
    diff = Math.round(diff / (1000 * 60));
    hour = Math.floor(diff / 60);
    diff -= hour * 60;

    result = (hour === 1) ? '1 hour ' : (hour + ' hours ');

    if(diff !== 0) {
      result += (diff === 1) ? 'and 1 minute ' : (diff + ' minutes ');
    }

    return result + 'ago';
  }
  else if(d3.timeDay.floor(input).getTime() === d3.timeDay.floor(now).getTime()) {
    // Today
    return options.todayFormatter(input);
  }
  else if(d3.timeDay.floor(input).getTime() === d3.timeDay.offset(d3.timeDay.floor(now), -1).getTime()) {
    // Yesterday
    return options.yesterdayFormatter(input);
  }
  else if( diff < 1000 * 60 * 60 * 24 * 7 ) {
    // Within the last week
    return options.weekdayFormatter(input);
  }
  else {
    return options.dateFormatter(input);
  }
};

const _cachedDatePatterns = new Map<string, (date: Date) => string>();

export function date(input: Date | null | undefined, pattern: string) {
  let formatter = _cachedDatePatterns.get(pattern);

  if(!formatter) {
    formatter = d3.timeFormat(pattern);
    _cachedDatePatterns.set(pattern, formatter);
  }

  if(input === undefined || input === null)
    return '';

  return formatter(input);
};
