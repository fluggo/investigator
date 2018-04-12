'use strict';

const fs = require('fs');
const record = JSON.parse(fs.readFileSync('ldap/0/0/000bce7a-5c95-4a43-b573-185e8db8f445.json'));

const sdStr = record.ldap.nTSecurityDescriptor;
//console.log(sdStr);
const sd = new Buffer(sdStr, 'base64');

console.log(sd.toString('hex'));

// Extended Rights Reference
// https://technet.microsoft.com/en-us/library/ff405676.aspx

const securityDescriptorFlags = {
  // https://msdn.microsoft.com/en-us/library/cc230366.aspx
  selfRelative: 0x8000,
  rmControlValid: 0x4000,
  saclProtected: 0x2000,
  daclProtected: 0x1000,
  saclAutoInherited: 0x0800,
  daclAutoInherited: 0x0400,
  saclComputedInheritanceRequired: 0x0200,
  daclComputedInheritanceRequired: 0x0100,
  daclTrusted: 0x0080,
  serverSecurity: 0x0040,
  saclDefaulted: 0x0020,
  saclPresent: 0x0010,
  daclDefaulted: 0x0008,
  daclPresent: 0x0004,
  groupDefaulted: 0x0002,
  ownerDefaulted: 0x0001
};

const ACE_TYPES = [
  // https://msdn.microsoft.com/en-us/library/cc230296.aspx
  'access_allowed',
  'access_denied',
  'system_audit',
  'system_alarm',
  'access_allowed_compound',
  'access_allowed_object',
  'access_denied_object',
  'system_audit_object',
  'system_alarm_object',
  'access_allowed_callback',
  'access_denied_callback',
  'access_allowed_callback_object',
  'access_denied_callback_object',
  'system_audit_callback',
  'system_alarm_callback',
  'system_audit_callback_object',
  'system_alarm_callback_object',
  'system_mandatory_label',
  'system_resource_attribute',
  'system_scoped_policy_id'
];

const ACE_FLAGS = {
  // https://msdn.microsoft.com/en-us/library/cc230296.aspx
  containerInherit: 0x02,
  failedAccess: 0x80,
  inheritOnly: 0x08,
  inherited: 0x10,
  noPropagateInherit: 0x04,
  objectInherit: 0x01,
  successfulAccess: 0x40
};

const ACCESS_MASK = {
  // https://msdn.microsoft.com/en-us/library/cc230294.aspx
  genericRead: 0x80000000,
  genericWrite: 0x40000000,
  genericExecute: 0x20000000,
  genericAll: 0x10000000,
  maximumAllowed: 0x02000000,
  accessSystemSecurity: 0x0100000000,
  synchronize: 0x00100000,
  writeOwner: 0x00080000,
  writeDacl: 0x00040000,
  readControl: 0x00020000,
  delete: 0x00010000,
};

const ACCESS_MASK_ACCESS_ALLOWED_OBJECT = {
  // https://msdn.microsoft.com/en-us/library/cc230294.aspx
  genericRead: 0x80000000,
  genericWrite: 0x40000000,
  genericExecute: 0x20000000,
  genericAll: 0x10000000,
  maximumAllowed: 0x02000000,
  accessSystemSecurity: 0x0100000000,
  synchronize: 0x00100000,
  writeOwner: 0x00080000,
  writeDacl: 0x00040000,
  readControl: 0x00020000,
  delete: 0x00010000,

  // https://msdn.microsoft.com/en-us/library/cc230289.aspx
  controlAccess: 0x0100,
  createChild: 0x0001,
  deleteChild: 0x0002,
  readProperty: 0x0010,
  writeProperty: 0x0020,
  self: 0x0008,
};

function flagsToObject(flagList, flags) {
  return Object.keys(flagList).reduce((obj, key) => {
    // Shorthand: don't add flags that are false
    if((flagList[key] & flags) !== 0)
      obj[key] = true;

    //obj[key] = (flagList[key] & flags) !== 0;
    return obj;
  }, {});
}

function readACL(buffer, offset) {
  // https://msdn.microsoft.com/en-us/library/cc230297.aspx
  var revision = buffer.readUInt8(offset);
  var aceCount = buffer.readUInt16LE(offset + 4);

  // Read the ACEs
  offset += 8;
  var aceList = [];

  for(var aceIndex = 0; aceIndex < aceCount; aceIndex++) {
    // https://msdn.microsoft.com/en-us/library/cc230296.aspx
    let aceType = buffer.readUInt8(offset);
    let aceFlags = buffer.readUInt8(offset + 1);
    let aceSize = buffer.readUInt16LE(offset + 2);

    let entry = {
      type: ACE_TYPES[aceType],
      flags: flagsToObject(ACE_FLAGS, aceFlags),
    };

    if(aceType === 0x05) {
      //console.error(buffer.slice(offset, offset + 12 + 16 + 16 + 32).toString('hex'));

      // ACCESS_ALLOWED_OBJECT_ACE
      // https://msdn.microsoft.com/en-us/library/cc230289.aspx
      // Microsoft's documentation is misleading; if the GUID
      // flags are not set, the GUIDs are actually missing from the structure.
      entry.mask = flagsToObject(ACCESS_MASK_ACCESS_ALLOWED_OBJECT, buffer.readUInt32LE(offset + 4));
      let typeFlags = buffer.readUInt32LE(offset + 8);

      let fieldOffset = offset + 12;

      if(typeFlags & 0x01) {
        // Object type is present; this is a GUID
        entry.objectType = readGuid(buffer, fieldOffset);
        fieldOffset += 16;
      }

      if(typeFlags & 0x02) {
        // Inherited object type is present; this is a GUID
        entry.inheritedObjectType = readGuid(buffer, fieldOffset);
        fieldOffset += 16;
      }

      entry.sid = readSid(buffer, fieldOffset);
    }
    else if(aceType === 0x00) {
      // ACCESS_ALLOWED_ACE
      // https://msdn.microsoft.com/en-us/library/cc230286.aspx
      entry.mask = flagsToObject(ACCESS_MASK, buffer.readUInt32LE(offset + 4));
      entry.sid = readSid(buffer, offset + 8);
    }

    aceList.push(entry);

    offset += aceSize;
  }

  return aceList;
}

var result = {
  revision: sd.readUInt8(0)
};

if(result.revision !== 1) {
  console.error('Unable to read descriptor; bad revision.');
  return;
}

const control = sd.readUInt16LE(2);
//console.error(control.toString(16));

result.control = flagsToObject(securityDescriptorFlags, control);

const offsets = {
  offsetOwner: sd.readUInt32LE(4),
  offsetGroup: sd.readUInt32LE(8),
  offsetSacl: sd.readUInt32LE(12),
  offsetDacl: sd.readUInt32LE(16),
};

if(offsets.offsetOwner !== 0)
  result.owner = readSid(sd, offsets.offsetOwner);

if(offsets.offsetGroup !== 0)
  result.group = readSid(sd, offsets.offsetGroup);

if(offsets.offsetDacl !== 0)
  result.dacl = readACL(sd, offsets.offsetDacl);

if(offsets.offsetSacl !== 0)
  result.sacl = readACL(sd, offsets.offsetSacl);

function readSid(buffer, offset) {
  // https://msdn.microsoft.com/en-us/library/gg465313.aspx
  // https://msdn.microsoft.com/en-us/library/ff632068.aspx
  var sid = 'S-1-';

  var revision = buffer.readUInt8(offset);

  if(revision !== 1)
    throw new Error(`Bad revision ${revision} for SID`);

  var subAuthorityCount = buffer.readUInt8(offset + 1);

  // Technically the authority field is 6 bytes, but
  // the only known SIDs only use the last one
  // https://msdn.microsoft.com/en-us/library/dd302645.aspx
  var authority = buffer.readUInt8(offset + 7);

  sid = sid + authority;

  for(var i = 0; i < subAuthorityCount; i++) {
    sid = sid + '-' + buffer.readUInt32LE(offset + 8 + i * 4);
  }

  //console.error(buffer.slice(offset, offset + 8 + subAuthorityCount * 4).toString('hex'));

  return sid;
}

function hexpad(value, length) {
  value = value.toString(16);
  return '0'.repeat(Math.max(0, length - value.length)) + value;
}

function readGuid(buffer, offset) {
  return hexpad(buffer.readUInt32LE(offset), 8) + '-' +
    hexpad(buffer.readUInt16LE(offset + 4), 4) + '-' +
    hexpad(buffer.readUInt16LE(offset + 6), 4) + '-' +
    hexpad(buffer.readUInt16BE(offset + 8), 4) + '-' +
    hexpad(buffer.readUInt16BE(offset + 10), 4) +
    hexpad(buffer.readUInt32BE(offset + 12), 8);
}


//console.log(JSON.stringify(readACL(sd, offsets.offsetDacl), null, 2));
console.log(JSON.stringify(result, null, 2));

