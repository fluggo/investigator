'use strict';

const d3 = require('d3');

var numberPatterns = d3.map();

module.exports.number = function(input, pattern) {
  var formatter = numberPatterns.get(pattern);

  if(!formatter) {
    formatter = d3.format(pattern);
    numberPatterns.set(pattern, formatter);
  }

  if(input === undefined || input === null)
    return '';

  return formatter(input);
};

// Display an "ago" marker that gives the time in relative terms
var todayFormatter = d3.timeFormat('%H:%M:%S');
var yesterdayFormatter = d3.timeFormat('%H:%M:%S yesterday');
var weekdayFormatter = d3.timeFormat('%A %H:%M');
var dateFormatter = d3.timeFormat('%A %Y-%m-%d %H:%M');

var todayPreciseFormatter = d3.timeFormat('%H:%M:%S.%L%Z');
var yesterdayPreciseFormatter = d3.timeFormat('%H:%M:%S yesterday');
var weekdayPreciseFormatter = d3.timeFormat('%A %H:%M:%S.%L%Z');
var datePreciseFormatter = d3.timeFormat('%A %Y-%m-%d %H:%M:%S.%L%Z');

module.exports.ago = function ago(input, options) {
  if(!input)
    return 'Never';

  options = options || {};
  options.todayFormatter = options.todayFormatter || (options.precise ? todayPreciseFormatter : todayFormatter);
  options.yesterdayFormatter = options.yesterdayFormatter || (options.precise ? yesterdayFormatter : yesterdayFormatter);
  options.weekdayFormatter = options.weekdayFormatter || (options.precise ? weekdayPreciseFormatter : weekdayFormatter);
  options.dateFormatter = options.dateFormatter || (options.precise ? datePreciseFormatter : dateFormatter);

  if(options.alwaysFull)
    return options.dateFormatter(input);

  var now = new Date();
  var diff = now.getTime() - input.getTime();
  var hour, result;

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
    // Today
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

var datePatterns = d3.map();

module.exports.date = function date(input, pattern) {
  var formatter = datePatterns.get(pattern);

  if(!formatter) {
    formatter = d3.timeFormat(pattern);
    datePatterns.set(pattern, formatter);
  }

  if(input === undefined || input === null)
    return '';

  return formatter(input);
};
