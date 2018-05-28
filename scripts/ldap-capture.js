'use strict';

const config = require('../server/config');
const logger = config.logger;

const es = require('../server/es');
const ldapService = require('../server/ldap');
const mapping = require('../server/ldap/mapping');
const util = require('../common/util');

const d3 = require('d3');

const ldap = require('ldapjs');
const fs = require('fs');
const async = require('async');
const child_process = require('child_process');

const certs = config.loadCerts();

const oldFilesSet = new Set();
const newFilesSet = new Set();

function createSubdirs(callback) {
  logger.debug('Checking existing files...');

  const HEX_CHARS = '0123456789abcdef';

  function mkdir(path, callback) {
    fs.mkdir(path, function(err) {
      // Ignore if the directory already exists
      if(err && err.code === 'EEXIST')
        return callback();

      return callback(err);
    });
  }

  function mkdirAndReadFiles(path, callback) {
    fs.mkdir(path, function(err) {
      // Ignore if the directory already exists
      if(err && err.code !== 'EEXIST')
        return callback(err);

      fs.readdir(path, function(err, files) {
        if(err)
          return callback(err);

        files.forEach(function(file) { oldFilesSet.add(file); });
        callback();
      });
    });
  }

  // Create base directories
  async.each(HEX_CHARS, mkdir, function(err) {
    const subdirs = [];

    for(let i = 0; i < 16; i++)
      for(let j = 0; j < 16; j++)
        subdirs.push(HEX_CHARS[i] + '/' + HEX_CHARS[j]);

    async.each(subdirs, mkdirAndReadFiles, callback);
  });
}

const esIndexQueue = new es.StaticIndexer({alias: 'ldap', mapping: mapping.MAPPING});

const jsonWriteQueue = async.queue(function(task, callback) {
  if(!task)
    return callback();

  newFilesSet.add(task.guid + '.json');

  const path = task.guid[0] + '/' + task.guid[1] + '/' + task.guid + '.json';
  fs.writeFile(path, JSON.stringify(task.json, null, 2), callback);
}, 4);

function pullLdap(server, baseDN, callback) {
  const client = ldap.createClient({
    url: 'ldaps://' + server,
    tlsOptions: {
      ca: certs,
    },
    logger,
  });

  function bindClient(callback) {
    logger.debug(`Binding to LDAP on ${server}...`);
    client.bind('user', 'user', callback);
  }

  function writeObjects(callback) {
    logger.debug(`Pulling new data from ${server}...`);

    // Security descriptor flags
    // https://msdn.microsoft.com/en-us/library/windows/desktop/aa366987(v=vs.85).aspx
    // https://msdn.microsoft.com/en-us/library/cc223323.aspx
    var securityDescriptorControl = new ldap.Control({type: '1.2.840.113556.1.4.801'});

    securityDescriptorControl._toBer = function(ber) {
      const asn1 = require('asn1');
      const BerWriter = asn1.BerWriter;

      var writer = new BerWriter();
      writer.startSequence();
      writer.writeInt(7);
      writer.endSequence();

      ber.writeBuffer(writer.buffer, 0x04);
    }

    client.search(baseDN, {
      scope: 'sub',
      filter: "(|(objectCategory=*)(showInAdvancedViewOnly=TRUE))",
      attributes: ["*", "parentGUID", "msDS-PrincipalName", "msDS-AllowedToDelegateTo", "nTSecurityDescriptor", "msDS-User-Account-Control-Computed"],
      paged: true,
    }, [securityDescriptorControl], function(err, res) {
      if(err)
        return callback(err);

      res.on('searchEntry', function(entry) {
        //console.log(entry.objectName);
        var result = {ldap: {}};

        entry.attributes.forEach(function(attr) {
          //console.log(attr);
          var handler = mapping.FIELD_LOOKUP[attr.type] || mapping.DefaultField;

          if(!handler || mapping.IGNORE_FIELDS.has(attr.type))
            return;

          result.ldap[attr.type] = handler.json(attr);
        });

        var emails = new Set();

        if(result.ldap.proxyAddresses) {
          ldapService.uncollapseArray(result.ldap.proxyAddresses).forEach(function(addr) {
            addr = addr.toLowerCase();

            if(addr.indexOf('smtp:') === 0)
              emails.add(addr.substring(5));
          });
        }

        if(result.ldap.mail) {
          ldapService.uncollapseArray(result.ldap.mail).forEach(function(addr) {
            emails.add(addr.toLowerCase());
          });
        }

        var name;

        if(result.ldap.objectClass.indexOf('user') !== -1) {
          // "name" attribute tends to work better for accounts
          name = result.ldap.name || result.ldap.displayName || result.ldap.cn || result.ldap.distinguishedName;
        }
        else {
          // Otherwise try to display the display name
          name = result.ldap.displayName || result.ldap.name || result.ldap.cn || result.ldap.distinguishedName;
        }

        result.common = {
          name: name,
          email: ldapService.collapseArray(Array.from(emails)) || undefined,
          upn: result.ldap.userPrincipalName,
          samName: result.ldap['msDS-PrincipalName'],
        };

        result.ldapDecoded = {};

        if(result.ldap.userAccountControl !== undefined) {
          let uac = result.ldap.userAccountControl | (result.ldap['msDS-User-Account-Control-Computed']);

          result.ldapDecoded.userAccountControl = Object.keys(mapping.UAC_FLAGS).reduce(function(result, flag) {
            result[flag] = (mapping.UAC_FLAGS[flag] & uac) !== 0;
            return result;
          }, {});
        }

        var splitDN = util.parseDN(result.ldap.distinguishedName, {decodeValues: false}).map(obj => obj.type + '=' + obj.value);
        result.ldapDecoded.parentDistinguishedName = splitDN.slice(1).join(',');
        result.ldapDecoded.parentDistinguishedNameAll = [];

        for(let i = 1; i < splitDN.length; i++) {
          result.ldapDecoded.parentDistinguishedNameAll.push(splitDN.slice(i).join(','));
        }

        //console.log(result.ldap['objectGUID']);
        //console.log(JSON.stringify(result, null, 2));

        jsonWriteQueue.push({guid: result.ldap.objectGUID, json: result});
        esIndexQueue.push(result, result.ldap.objectGUID, 'ldap-object');
        //console.log(entry.ldap[0].vals);
      });
      res.on('page', function(entry) {
        console.error(`PAGE (${server})`);
      });
      res.on('error', function(err) {
        logger.error({custom: { server: server, baseDN: baseDN }, err: err}, 'In-request error on server ${server}.');
        console.error('In-request error:', err);
        client.unbind();
        return callback(err);
      });
      res.on('end', function(res) {
        console.error(`END (${server})`);
        client.unbind();
        return callback();
      });
    });
  }

  return async.series([bindClient, writeObjects], callback);
}

function deleteOldObjects(callback) {
  const toDelete = [];

  oldFilesSet.forEach(function(file) {
    if(!newFilesSet.has(file)) {
      toDelete.push(file[0] + '/' + file[1] + '/' + file);
    }
  });

  logger.debug(`Deleting ${toDelete.length} old objects...`);

  async.each(toDelete, fs.unlink, callback);
}

function updateGit(callback) {
  function add(callback) {
    logger.debug('Adding git files...');
    child_process.exec('git add -A', function(err, stdout, stderr) {
      if(err)
        return callback(err);

      return callback();
    });
  }

  function commit(callback) {
    logger.debug('Committing to git...');
    child_process.exec('git commit --message="Automatic update" --author="Automated Menuburger <otto@fluggo.com>"', function(err, stdout, stderr) {
      if(err)
        return callback(err);

      return callback();
    });
  }

  function gc(callback) {
    logger.debug('git gc...');
    child_process.exec('git gc', function(err, stdout, stderr) {
      if(err)
        return callback(err);

      return callback();
    });
  }

  async.series([
    add,
    commit,
    gc,
  ], callback);
}

function waitForFiles(callback) {
  // Wait until everything is written before returning
  jsonWriteQueue.push(null, function() {
    return callback();
  });
}


// There are ways to get domain controllers automatically,
// such as looking for objectClass:domain and then searching the
// SRV records at _ldap._tcp.dc._msdcs.(domain).
//
// For now, ask for specific servers in the config.
const domains = config.ldap.servers;

async.series([
  callback => async.parallel([
    createSubdirs,
    callback => esIndexQueue.createIndex(callback),
  ], callback),
  callback => async.parallel(domains.map(domain => {
    return callback => pullLdap(domain.server, domain.baseDN, callback);
  }), callback),
  waitForFiles,
  deleteOldObjects,
  callback => async.parallel([
    updateGit,
    callback => esIndexQueue.end(callback),
  ], callback),
], function(err) {
  if(err)
    logger.fatal(err, 'Error while capturing LDAP entries.');

  es.client.close();

  logger.debug('Done.');

  // Forget it, we just don't get clean exits anymore
  setTimeout(process.exit, 5000);

  //console.error('Waiting on:', process._getActiveRequests(), process._getActiveHandles());
});
