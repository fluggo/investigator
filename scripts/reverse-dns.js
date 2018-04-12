'use strict';

const dns = require('dns');
const async = require('async');

var input = '';

process.stdin.on('data', function(buf) {
  input += buf;
});
process.stdin.on('end', function() {
  var ipList = input.split(/\n/g).filter(function(ip) { return ip !== ''; });

  function get(ip, callback) {
    dns.reverse(ip, function(err, result) {
      if(err) {
        console.error(`Could not get ${ip}`);
        return callback(null, 'Unknown');
      }

      return callback(null, result);
    });
  }

  async.map(ipList, get, function(err, results) {
    if(err) {
      console.error(err);
      return;
    }

    ipList.forEach(function(ip, i) {
      console.log(`${ip}: ${results[i]}`);
    });
  });
});

process.stdin.setEncoding('utf-8');
process.stdin.resume();
