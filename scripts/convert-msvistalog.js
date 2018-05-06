'use strict';

const readline = require('readline');
const es = require('../server/es');
const d3 = require('d3');

const esDateFormat = d3.timeFormat('%Y.%m.%d');

const rl = readline.createInterface({ input: process.stdin });

const bulkIndexStream = es.getBulkIndexStream({});

const systemFields = new Set([
  'EventTime',
  'Opcode',
  'OpcodeValue',
  'Hostname',
  'Severity',
  'SeverityValue',
  'EventType',
  'Keywords',
  'EventID',
  'SourceName',
  'ProviderGuid',
  'Version',
  'Task',
  'ProcessID',
  'ThreadID',
  'RecordNumber',
  'Domain',
  'AccountType',
  'AccountName',
  'UserID',
  'Message',
  'Category',
  'Channel',
  'EventReceivedTime',
  'SourceModuleName',
  'SourceModuleType',
  'ActivityID',
  'RelatedActivityID',
  'Keywords_Low',
  'Keywords_High'
]);

rl.on('line', line => {
  line = JSON.parse(line);

  //console.log(JSON.stringify(line, null, 2));
  // 9007199254740991
  // -9223372036854775807

  const result = {
    log: {
      receivedTime: new Date(line.EventReceivedTime),
      eventTime: new Date(line.EventTime),
      message: line.Message,
      protocol: line.Protocol && +line.Protocol,
      source: {
        ip: line.SourceAddress,
        port: line.SourcePort && +line.SourcePort,
        samName: line.Domain && (line.Domain + '\\' + line.AccountName).toUpperCase(),
      },
      target: {
        ip: line.DestAddress,
        port: line.DestPort && +line.DestPort,
      },
      tag: ['msvistalog'],
    },
    msvistalog: {
      system: {
        provider: {
          //name: "",   // anyURI
          guid: line.ProviderGuid && line.ProviderGuid.substring(1, line.ProviderGuid.length - 1).toUpperCase(),    // GUID
          eventSourceName: line.SourceName,     // string
        },
        eventId: line.EventID,    // array of unsignedShort?
        eventType: line.EventType,  // string (AUDIT_FAILURE, for example)
        severityName: line.Severity,
        severity: line.SeverityValue,
        version: line.Version,    // unsignedByte,
        //level: "value",   // unsignedByte,
        task: line.Task,    // unsignedShort,
        opcode: line.OpcodeValue, // unsignedShort
        opcodeName: line.Opcode,  // string
        recordNumber: line.RecordNumber,    // possibly long! also, don't index
        keywordsLow: line.Keywords_Low,
        keywordsHigh: line.Keywords_High,
        //keywords: line.Keywords,  // hexint64type, don't really know if it's useful
        // timeCreated
        // eventRecordID (array of unsignedLong?)
        correlation: {
          activityId: line.ActivityID && line.ActivityID.substring(1, line.ActivityID.length - 1).toUpperCase(),    // GUID
          relatedActivityId: line.RelatedActivityID && line.RelatedActivityID.substring(1, line.RelatedActivityID.length - 1).toUpperCase(),    // GUID
        },
        execution: {
          processId: line.ProcessID,      // unsignedInt, required
          threadId: line.ThreadID,      // unsignedInt, required
          //processorId: "value",    // unsignedByte
          //sessionId: +line.SessionID,   // unsignedInt
          //kernelTime: "value",    // unsignedInt
          //userTime: "value", // unsignedInt
          //processorTime: "value", // unsignedInt

        },
        channel: line.Channel, // anyURI
        computer: line.Hostname.toLowerCase(), // string, required
/*        security: {
          samName
          //userId: line.UserID, // Supposed to be SID string, but nxlog has a bug
        }*/
        // Anything else
      },
      category: line.Category,
      otherFields: [],
      other: {
      }
    }
  };

  for(let key of Object.keys(line)) {
    if(!systemFields.has(key)) {
      result.msvistalog.other[key] = line[key];
      result.msvistalog.otherFields.push(key);
    }
  }

  bulkIndexStream.write({ action: { index: { _index: 'msvistalog-' + esDateFormat(result.log.receivedTime), _type: 'msvistalog' } }, doc: result }, (err) => {
    if(err)
      console.log(err);
    else
      console.log(JSON.stringify(result, null, 2));
  });
});
