'use strict';

/****** This is from the windows-sid package, which won't install on my machine ******/
// https://github.com/0x7f/node-windows-sid/blob/master/lib/index.js

var _32bit = 0x100000000;
var _48bit = 0x1000000000000;
var _64bitLow = 0xFFFFFFFF;
var _64bitHigh = 0xFFFFFFFF00000000;

function binarySidToStringSid(sid) {
  var revision =sid.readUInt8(0);
  // ignored, will just parse until end of buffer
  //var numSubauthorities = sid.readUInt8(1);
  var authority = _32bit * sid.readUInt16BE(2) + sid.readUInt32BE(4);
  var parts = ['S', revision, authority];
  for (var i = 8; i < sid.length; i += 4) {
    parts.push(sid.readUInt32LE(i)); // subauthorities
  }
  return parts.join('-');
}

function stringSidToBinarySid(sid) {
  var parts = sid.split('-');
  assert(parts[0] == 'S');
  var len = 8 + 4 * (parts.length - 3);
  var buf = new Buffer(len);
  buf.writeUInt8(Number(parts[1]), 0); // revision
  buf.writeUInt8(parts.length - 3, 1); // num subauthorities
  var authority = Number(parts[2]);
  buf.writeUInt16BE(Math.round(authority / _32bit), 2); // authority high
  buf.writeUInt32BE(authority & _64bitLow, 4); // authority low
  for (var i = 3; i < parts.length; ++i) {
    var offset = 8 + (i - 3) * 4;
    var subauthority = Number(parts[i]);
    buf.writeUInt32LE(subauthority, offset);
  }
  return buf;
}

/****** END ******/

function decToHex(val, padding) {
  var hex = Number(val).toString(16);
  padding = typeof(padding) === "undefined" || padding === null ? padding = 2 : padding;

  return ('0'.repeat(padding - hex.length)) + hex;
}

function guidBinaryToString(buffer) {
  return decToHex(buffer.readUInt32LE(0), 8) + '-' +
    decToHex(buffer.readUInt16LE(4), 4) + '-' +
    decToHex(buffer.readUInt16LE(6), 4) + '-' +
    decToHex(buffer.readUInt16BE(8), 4) + '-' +
    decToHex(buffer.readUInt16BE(10), 4) +
    decToHex(buffer.readUInt32BE(12), 8);
}

const ldap = require('./index.js');

// Ticks (100-ns) offset from 1601-01-01 to 1970-01-01
const BASE_TICKS = 116444736000000000;
const ldap2date = require('ldap2date');

const GuidField = {
  json: function(attr) {
    return ldap.collapseArray(attr._vals.map(guidBinaryToString));
  },
  mapping: {
    type: 'keyword',
  }
};

const StringGuidField = {
  json: function(attr) {
    return ldap.collapseArray(attr.vals.map(s => s.toLowerCase()));
  },
  mapping: {
    type: 'keyword',
  }
};

const BoolField = {
  json: function(attr) {
    return ldap.collapseArray(attr.vals.map(function(val) { return val === 'TRUE'; }));
  },
  mapping: {
    type: 'boolean'
  }
};

const IntegerField = {
  json: function(attr) {
    return ldap.collapseArray(attr.vals.map(function(val) { return +val; }));
  },
  mapping: {
    type: 'long'
  }
};

const SidField = {
  json: function(attr) {
    return ldap.collapseArray(attr._vals.map(binarySidToStringSid));
  },
  mapping: {
    type: 'keyword',
  }
};

const GeneralizedTimeField = {
  json: function(attr) {
    return ldap.collapseArray(attr.vals.map(ldap2date.parse.bind(ldap2date)));
  },
  mapping: {
    type: 'date'
  },
};

const IntervalTimeField = {
  json: function(attr) {
    return ldap.collapseArray(
      attr.vals.filter(function(val) { return val !== '9223372036854775807' && val !== '0'; })
        .map(function(val) { return new Date((+val - BASE_TICKS) / 10000) })
    );
  },
  mapping: {
    type: 'date'
  },
};

const BinaryField = {
  json: function(attr) {
    return ldap.collapseArray(
      attr._vals.map(function(val) { return val.toString('base64'); })
    );
  },
  mapping: {
    type: 'binary'
  }
};

const StringField = {
  json: function(attr) {
    return ldap.collapseArray(attr.vals);
  },
  mapping: {
    type: 'text',
    copy_to: 'common.content',
    fields: {
      lower: {
        type: 'text',
        analyzer: 'lowercase',
      },
      raw: {
        type: 'keyword',
      }
    }
  },
};

const DNField = {
  json: function(attr) {
    return ldap.collapseArray(attr.vals);
  },
  mapping: {
    type: 'text',
    analyzer: 'lowercase',
    copy_to: ['common.content', 'ldapDecoded.referencedDistinguishedNames'],
    fields: {
      raw: {
        type: 'keyword',
      }
    }
  },
};

const DefaultField = {
  json: function(attr) {
    return ldap.collapseArray(attr.vals);
  }
};


// Values to decode the userAccountControl field
// https://msdn.microsoft.com/en-us/library/windows/desktop/ms680832(v=vs.85).aspx
const UAC_FLAGS = {
  logonScript: 0x1,
  accountDisabled: 0x2,
  homeDirectoryRequired: 0x8,
  lockedOut: 0x10,
  passwordNotRequired: 0x20,
  userCannotChangePassword: 0x40,
  encryptedTextPasswordAllowed: 0x80,
  tempDuplicateAccount: 0x100,
  normalAccount: 0x200,
  interdomainTrustAccount: 0x800,
  workstationTrustAccount: 0x1000,
  serverTrustAccount: 0x2000,   // misnomer
  passwordDoesNotExpire: 0x10000,
  mnsLogonAccount: 0x20000,
  smartcardRequired: 0x40000,
  trustedForDelegation: 0x80000,
  notDelegated: 0x100000,
  useDesKeyOnly: 0x200000,
  preauthNotRequired: 0x400000,
  passwordExpired: 0x800000,
  trustedToAuthenticateForDelegation: 0x1000000,
  partialSecretsAccount: 0x4000000,
  usesAesKeys: 0x8000000,
};


// Build field lookups
const FIELD_LOOKUP = {};

['objectGUID', 'msExchMailboxGuid', 'schemaIDGUID', 'parentGUID', 'attributeSecurityGUID']
.forEach(function(name) {
  FIELD_LOOKUP[name] = GuidField;
});

["badPasswordTime", "lockoutTime", "lastLogoff", "lastLogon", "lastLogonTimestamp", "pwdLastSet", "accountExpires",
  "ms-Mcs-AdmPwdExpirationTime"]
.forEach(function(name) {
  FIELD_LOOKUP[name] = IntervalTimeField;
});

["isCriticalSystemObject", "showInAdvancedViewOnly",
  "isSingleValued", "treatAsLeaf", "isMemberOfPartialAttributeSet", "systemOnly",
  "defaultHidingValue", "printCollate", "printStaplingSupported", "printKeepPrintedJobs",
  "printDuplexSupported", "printColor", "deliverAndRedirect", "msExchHideFromAddressLists", "mDBUseDefaults"]
.forEach(function(name) {
  FIELD_LOOKUP[name] = BoolField;
});

['objectSid', 'sIDHistory']
.forEach(function(name) {
  FIELD_LOOKUP[name] = SidField;
});

["badPwdCount", "codePage", "countryCode", "logonCount", "instanceType", "localPolicyFlags",
  "msDS-SupportedEncryptionTypes", "primaryGroupID", "adminCount",
  "userAccountControl", "sAMAccountType", "uSNChanged", "uSNCreated", "groupType", "msDS-NcType", "msDS-PerUserTrustQuota", "modifiedCount",
  "systemFlags", "msDS-Behavior-Version", "searchFlags", "linkID", "schemaFlagsEx", "oMSyntax", "rangeUpper", "rangeLower",
  "objectClassCategory", "printMaxXExtent", "printMaxYExtent", "printMinXExtent", "printMinYExtent",
  "printMemory", "printNumberUp", "printEndTime", "printStartTime", "printMaxResolutionSupported", "priority",
  "versionNumber", "printPagesPerMinute", "printRate", "driverVersion", "gPOptions", "msExchRecipientDisplayType", "internetEncoding",
  "msDS-User-Account-Control-Computed", "msExchRecipientTypeDetails", "msExchRecipientDisplayType", "msExchResourceCapacity"]
.forEach(function(name) {
  FIELD_LOOKUP[name] = IntegerField;
});

['whenCreated', 'whenChanged']
.forEach(function(name) {
  FIELD_LOOKUP[name] = GeneralizedTimeField;
});

["userCertificate", "msDS-HasInstantiatedNCs", "nTSecurityDescriptor", "msExchMailboxSecurityDescriptor"]
.forEach(function(name) {
  FIELD_LOOKUP[name] = BinaryField;
});

["description", "cn", "name", "sn", "targetAddress",
  "objectClass", "operatingSystem", "company", "wWWHomePage",
  "operatingSystemServicePack", "operatingSystemVersion", "department",
  "userParameters", "proxyAddresses", "telephoneNumber",
  "mailNickname", "legacyExchangeDN", "mail", "msExchHomeServerName", "userPrincipalName",
  "sAMAccountName", "servicePrincipalName", "showInAddressBook", "keywords",
  "givenName", "serviceDNSName", "serviceDNSNameType", "serviceClassName", "serviceBindingInformation",
  "domainReplica", "attributeDisplayNames", "shellPropertyPages", "adminContextMenu",
  "classDisplayName", "contextMenu", "adminMultiselectPropertyPages", "adminPropertyPages", "iconPath",
  "textEncodedORAddress", "displayName", "physicalDeliveryOfficeName", "adminDescription", "subClassOf", "systemPossSuperiors",
  "attributeSyntax", "lDAPDisplayName", "governsID", "systemMayContain", "systemMustContain", "defaultSecurityDescriptor",
  "rDNAttID", "auxiliaryClass", "adminDisplayName", "attributeID", "mayContain", "possSuperiors",
  "dnsRoot", "addressType",
  "printMediaSupported", "printMediaReady", "printRateUnit", "printLanguage", "printSpooling", "printShareName",
  "printerName", "portName", "uNCName", "printBinNames", "printOrientationsSupported", "driverName", "shortServerName",
  "serverName", "gPLink",
  "msExchShadowProxyAddresses", "msExchADCGlobalNames", "msExchPoliciesIncluded", "msExchUMDtmfMap",
  "protocolSettings", "scriptPath", "msDS-PrincipalName", "msExchVersion",
  "info", "msExchAdmins"]
.forEach(function(name) {
  FIELD_LOOKUP[name] = StringField;
});

["distinguishedName", "frsComputerReferenceBL", "memberOf",
  "objectCategory", "altRecipient", "altRecipientBL",
  "rIDSetReferences",
  "homeMTA", "homeMDB",
  "serverReference", "serverReferenceBL", "member",,
  "msDS-IsPartialReplicaFor",
  "msDs-masteredBy",
  "msDS-hasMasterNCs", "hasMasterNCs", "hasPartialReplicaNCs", "msDS-HasDomainNCs", "dMDLocation",
  "defaultObjectCategory",
  "msDS-SDReferenceDomain", "msDS-NC-Replica-Locations",
  "managedObjects", "authOrig", "authOrigBL", "publicDelegates", "publicDelegatesBL",
  "msExchDelegateListBL", "msExchDelegateListLink", "msExchMailboxTemplateLink",
  "fSMORoleOwner"]
.forEach(function(name) {
  FIELD_LOOKUP[name] = DNField;
});

["rightsGuid"]
.forEach(function(name) {
  FIELD_LOOKUP[name] = StringGuidField;
});


const IGNORE_FIELDS = new Set([
  // repsFrom: Attributes about where this object is replicated from.
  //   Changes often, and probably not worth decoding.
  // https://msdn.microsoft.com/en-us/library/cc220807.aspx
  "repsFrom",
  "repsTo",

  // replUpToDateVector: likewise
  // https://msdn.microsoft.com/en-us/library/cc220806.aspx
  "replUpToDateVector",

  "dSCorePropagationData",

  // Large, private, opaque, "safe senders" outlook data that changes too often
  "msExchSafeSendersHash",
  "msExchBlockedSendersHash",
  "msExchRecordedName",
  "comment",

  // These attributes change ridiculously often, bloat the git archive,
  // and are not even that reliable; lastLogon only counts for the domain
  // controller we're actually reading from
  'lastLogon',
  'logonCount',
]);

const es = require('../es.js');

const MAPPING = {
  'ldap-object': {
    include_in_all: false,
    dynamic: false,
    properties: {
      ldap: {
        properties: Object.keys(FIELD_LOOKUP).reduce(function(result, attr) {
          result[attr] = FIELD_LOOKUP[attr].mapping;
          return result;
        }, {}),
      },
      common: es.COMMON_MAPPING,
      ldapDecoded: {
        properties: {
          userAccountControl: {
            properties: Object.keys(UAC_FLAGS).reduce(function(result, flag) {
              result[flag] = { type: 'boolean' };
              return result;
            }, {}),
          },
          parentDistinguishedName: {
            type: 'text',
            analyzer: 'lowercase',
          },
          parentDistinguishedNameAll: {
            type: 'text',
            analyzer: 'lowercase',
          },
          referencedDistinguishedNames: {
            type: 'text',
            analyzer: 'lowercase',
          },
        },
      }
    }
  }
};

module.exports.MAPPING = MAPPING;
module.exports.FIELD_LOOKUP = FIELD_LOOKUP;
module.exports.IGNORE_FIELDS = IGNORE_FIELDS;
module.exports.DefaultField = DefaultField;
module.exports.UAC_FLAGS = UAC_FLAGS;
