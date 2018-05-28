'use strict';

const es = require('../es');

const CYLANCE_DEVICE = 'cylance-device';

const MAPPING = {
  [CYLANCE_DEVICE]: {
    include_in_all: false,
    dynamic: false,
    properties: {
      common: es.COMMON_MAPPING,
      device: {
        properties: {
          name: {
            type: 'text',
            analyzer: 'lowercase',
            copy_to: 'common.name',
          },
          serialNumber: {
            type: 'keyword',
          },

          os: {
            type: 'text',
          },
          agentVersion: {
            type: 'keyword',
          },
          policy: {
            type: 'keyword',
          },
          zones: {
            type: 'keyword',
          },

          mac: {
            type: 'keyword',
            copy_to: 'common.mac',
          },
          ip: {
            type: 'ip',
            copy_to: 'common.ip',
          },

          lastReportedUser: {
            type: 'keyword',
            copy_to: 'common.samName',
          },

          backgroundDetection: {
            type: 'boolean',
          },

          createdTime: {
            type: 'date',
          },

          filesAnalyzed: {
            type: 'long',
          },

          online: {
            type: 'boolean',
          },
          onlineDate: {
            type: 'date',
          },
          offlineDate: {
            type: 'date',
          },

          threats: {
            type: 'nested',
            dynamic: false,
            include_in_all: false,

            properties: {
              fileName: {
                type: 'text',
              },
              fileStatus: {
                type: 'keyword',
              },
              cylanceScore: {
                type: 'byte',
              },
              signatureStatus: {
                type: 'keyword',
              },
              avIndustry: {
                type: 'keyword',
              },

              globalQuarantined: { type: 'boolean' },
              safelisted: { type: 'boolean' },
              signed: { type: 'boolean' },
              /*certTimestamp: couldBeEmpty(row[8]),
              certIssuer: couldBeEmpty(row[9]),
              certPublisher: couldBeEmpty(row[10]),
              certSubject: couldBeEmpty(row[11]),
              productName: couldBeEmpty(row[12]),
              description: couldBeEmpty(row[13]),
              fileVersion: couldBeEmpty(row[14]),
              companyName: couldBeEmpty(row[15]),
              copyright: couldBeEmpty(row[16]),*/
              sha256: {
                type: 'keyword',
              },
              md5: {
                type: 'keyword',
              },
              classification: {
                type: 'keyword',
              },
              fileSize: { type: 'integer' },
              filePath: { type: 'text' },
              driveType: {
                type: 'keyword',
              },
              fileOwner: {
                type: 'keyword',
                //include_in_all: true,
              },
              createdTime: { type: 'date' },
              modifiedTime: { type: 'date' },
              accessTime: { type: 'date' },
              running: { type: 'boolean' },
              autoRun: { type: 'boolean' },
              everRun: { type: 'boolean' },
              firstFound: { type: 'date' },
              lastFound: { type: 'date' },
              detectedBy: {
                type: 'keyword',
              },
            },
          },

          events: {
            type: 'nested',
            dynamic: false,
            include_in_all: false,

            properties: {
              sha256: {
                type: 'keyword',
              },
              md5: {
                type: 'keyword',
              },
              timestamp: { type: 'date' },
              filePath: { type: 'text' },
              eventStatus: {
                type: 'keyword',
              },
              cylanceScore: { type: 'byte' },
              classification: {
                type: 'keyword',
              },
              running: { type: 'boolean' },
              everRun: { type: 'boolean' },
              detectedBy: {
                type: 'keyword',
              },
            },
          },

        },
      },
    }
  },
};

module.exports.MAPPING = MAPPING;
module.exports.CYLANCE_DEVICE = CYLANCE_DEVICE;
