'use strict';

const config = require('../server/config.js');
const logger = config.logger;

const es = require('../server/es.js');
const https = require('https');
const d3 = require('d3');
const async = require('async');

const TIME_PARSE = d3.timeParse('%-m/%-d/%Y %-I:%M:%S %p');

const authToken = config.cylance.authToken;

const mapping = require('../server/cylance/mapping.js');
const esIndexQueue = new es.StaticIndexer({alias: 'cylance', mapping: mapping.MAPPING});

if(config.cylance.index === undefined)
  config.cylance.index = true;

function collapseArray(val) {
  if(val.length === 0 || val[0] === '')
    return undefined;

  if(val.length === 1)
    return val[0];

  return val;
}

function couldBeEmpty(val) {
  if(!val || val === '')
    return undefined;

  return val;
}

function fetchDeviceReport(callback) {
  const options = {
    hostname: 'sample.cylance.com',
    port: 443,
    path: '/Reports/ThreatDataReportV1/devices/' + authToken,
    method: 'GET',
    rejectUnauthorized: true,
  };

  const req = https.request(options, res => {
    var result = '';
    res.setEncoding('utf8');

    res.on('data', chunk => {
      result = result + chunk;
    });
    res.on('end', () => {
      return callback(null, d3.csvParseRows(result, (row, i) => {
        if(i === 0)
          return undefined;

        return {
          common: {},
          device: {
            name: row[0],
            serialNumber: row[1],
            os: row[2].trim(),
            agentVersion: row[3],
            policy: row[4],
            zones: collapseArray(row[5].split(', ')),
            mac: collapseArray(row[6].split(',').map(m => m.toLowerCase().replace(/[^a-f0-9]/g, ''))),
            ip: collapseArray(row[7].split(',').filter(ip => ip.indexOf(':') === -1)),
            lastReportedUser: collapseArray(row[8].toUpperCase().split(',')),
            backgroundDetection: row[9] !== 'False',
            createdTime: TIME_PARSE(row[10]),
            filesAnalyzed: +row[11],
            online: row[12] === 'True',
            onlineDate: (row[13] === '') ? undefined : TIME_PARSE(row[13]),
            offlineDate: (row[14] === '') ? undefined : TIME_PARSE(row[14]),
          },
        };
      }));
    });
  });

  req.on('error', e => {
    return callback(e);
  });

  req.end();
}

function fetchThreatsBySerialNumber(callback) {
  const options = {
    hostname: 'sample.cylance.com',
    port: 443,
    path: '/Reports/ThreatDataReportV1/threats/' + authToken,
    method: 'GET',
    rejectUnauthorized: true,
  };

  const req = https.request(options, res => {
    var pageData = '';
    res.setEncoding('utf8');

    res.on('data', chunk => {
      pageData = pageData + chunk;
    });
    res.on('end', () => {
      const rows = d3.csvParseRows(pageData, (row, i) => {
        if(i === 0)
          return undefined;

        return {
          deviceName: row[20],
          serialNumber: row[21],
          threat: {
            fileName: row[0],
            fileStatus: row[1],
            cylanceScore: +row[2],
            signatureStatus: row[3],
            avIndustry: couldBeEmpty(row[4]),
            globalQuarantined: row[5] === 'Yes',
            safelisted: row[6] === 'Yes',
            signed: row[7] === 'True',
            certTimestamp: couldBeEmpty(row[8]),
            certIssuer: couldBeEmpty(row[9]),
            certPublisher: couldBeEmpty(row[10]),
            certSubject: couldBeEmpty(row[11]),
            productName: couldBeEmpty(row[12]),
            description: couldBeEmpty(row[13]),
            fileVersion: couldBeEmpty(row[14]),
            companyName: couldBeEmpty(row[15]),
            copyright: couldBeEmpty(row[16]),
            sha256: row[17].toLowerCase(),
            md5: row[18].toLowerCase(),
            classification: couldBeEmpty(row[19]),
            fileSize: +row[22],
            filePath: row[23],
            driveType: row[24],
            fileOwner: couldBeEmpty(row[25].toUpperCase()),
            createdTime: TIME_PARSE(row[26]),
            modifiedTime: TIME_PARSE(row[27]),
            accessTime: TIME_PARSE(row[28]),
            running: row[29] === 'True',
            autoRun: row[30] === 'True',
            everRun: row[31] === 'True',
            firstFound: TIME_PARSE(row[32]),
            lastFound: TIME_PARSE(row[33]),
            detectedBy: row[34],
          }
        };
      });

      const result = new Map();

      for(let row of rows) {
        let list = result.get(row.serialNumber);

        if(!list) {
          list = [];
          result.set(row.serialNumber, list);
        }

        list.push(row.threat);
      }

      return callback(null, result);
    });
  });

  req.on('error', e => {
    return callback(e);
  });

  req.end();
}

function fetchEventsBySerialNumber(callback) {
  const options = {
    hostname: 'sample.cylance.com',
    port: 443,
    path: '/Reports/ThreatDataReportV1/events/' + authToken,
    method: 'GET',
    rejectUnauthorized: true,
  };

  const req = https.request(options, res => {
    var pageData = '';
    res.setEncoding('utf8');

    res.on('data', chunk => {
      pageData = pageData + chunk;
    });
    res.on('end', () => {
      const rows = d3.csvParseRows(pageData, (row, i) => {
        if(i === 0)
          return undefined;

        return {
          deviceName: row[2],
          serialNumber: row[11],

          event: {
            sha256: row[0].toLowerCase(),
            md5: row[1].toLowerCase(),
            timestamp: TIME_PARSE(row[3]),
            filePath: row[4],
            eventStatus: row[5],
            cylanceScore: (row[6] !== '') ? +row[6] : undefined,
            classification: couldBeEmpty(row[7]),
            running: row[8] === 'True',
            everRun: row[9] === 'True',
            detectedBy: row[10],
          }
        };
      });

      const result = new Map();

      for(let row of rows) {
        let list = result.get(row.serialNumber);

        if(!list) {
          list = [];
          result.set(row.serialNumber, list);
        }

        list.push(row.event);
      }

      return callback(null, result);
    });
  });

  req.on('error', e => {
    return callback(e);
  });

  req.end();
}

function pullDevices(callback) {
  return fetchDeviceReport((err, devices) => {
    if(err)
      return console.log(err);

    return fetchThreatsBySerialNumber((err, threatsBySerialNumber) => {
      if(err)
        return console.log(err);

      return fetchEventsBySerialNumber((err, eventsBySerialNumber) => {
        if(err)
          return console.log(err);

        devices.forEach(dev => {
          dev.device.threats = threatsBySerialNumber.get(dev.device.serialNumber);
          dev.device.events = eventsBySerialNumber.get(dev.device.serialNumber);

          if(config.cylance.index)
            esIndexQueue.push(dev, dev.device.serialNumber, mapping.CYLANCE_DEVICE);
        });

        //console.log(JSON.stringify(devices, null, 2));
        return callback();
      });
    });
  });
}

async.series([
  callback => async.parallel([
    //createSubdirs,
    callback => config.cylance.index ? esIndexQueue.createIndex(callback) : callback(),
    //connect,
  ], callback),
  pullDevices,
  //waitForFiles,
  //deleteOldObjects,
  callback => async.parallel([
    //updateGit,
    callback => config.cylance.index ? esIndexQueue.end(callback) : callback(),
  ], callback),
], function(err) {
  if(err)
    logger.fatal(err, 'Error while capturing Cylance entries.');

  es.client.close();

  logger.debug('Done.')
});
