export interface LogCommonProperties {
  ip?: string | string[];
  hostname?: string | string[];
  fqdn?: string | string[];
  fqdnBreakdown?: string[];
  samName?: string | string[];
  serviceName?: string | string[];
  sid?: string | string[];
  port?: number | number[];
  domain?: string | string[];
  upn?: string | string[];
  logonId?: string | string[];
}

export interface LogCommon {
  recordFinder: string;
  receivingPort: number;
  reportingIp: string;
  receivedTime: Date;
  eventTime?: Date;
  tag: string[];
  message?: string;
  ipProtocol?: number;
  all?: LogCommonProperties;
  source?: LogCommonProperties;
  target?: LogCommonProperties;
}

export interface BaseLogEntry {
  log: LogCommon;
}

export interface VistaLogEntry extends BaseLogEntry {
  msvistalog: {
    system: {
      provider: {
        guid: string;
        eventSourceName: string;
      };

      eventId: number;

      /** Type of event, e.g., AUDIT_FAILURE */
      eventType: string;

      // Always uppercase
      samName: string;

      severity: number;
      severityName: string;
      version: number;
      task: number;
      taskName: string;
      opcode: number;
      opcodeName: string;
      recordNumber: number;
      correlation?: {
        activityId: string;
        relatedActivityId: string;
      };
      execution: {
        processId: number;
        threadId: number;
      };
      channel: string;
      computer: string;
    };

    otherFields: string[];
    unparsedFields: string[];

    firewall?: {
      direction?: string;
      layer?: string;
      application?: string;
      layerRunTimeId?: number;
      filterRunTimeId?: number;

      // 4957
      ruleId?: string;
      ruleName?: string;
      ruleAttr?: string;
      profile?: string;

      // SIDs
      remoteUserId?: string;
      removeMachineId?: string;
    };

    logon?: {
      // See https://www.ultimatewindowssecurity.com/securitylog/encyclopedia/event.aspx?eventID=4624
      //  Fields headed to common:
      //    SubjectUserSid, SubjectUserName, SubjectDomainName, SubjectLogonId
      //    TargetUserSid, TargetUserName, TargetDomainName, TargetLogonId
      //    IpAddress, IpPort -> source.ip, source.port
      logonType: number;
      logonProcessName: string;
      authenticationPackageName: string;
      workstationName: string;
      logonGuid: string;
      keyLength: number;
      processName: string;
      transmittedServices: string;
      lmPackageName: string;
      processId: number;
      tokenElevationType: string;
      privilege: string;

      statusCode: number;
      subStatusCode: number;

      impersonationLevel: string;

      // Event 4656
      objectServer: string;
      objectType: string;
      objectName: string;
      operationType: string;
      transactionId: string;
      accessList: string;
      propertyList: string;

      /** Distinguished name */
      memberName: string;
      memberSid: string;

      shareName: string;
      ticketEncryptionType: number;
    };
    crypto?: {
      keyName?: string;
      keyType?: string;
      providerName?: string;
      algorithmName?: string;
      module?: string;
      returnCode?: number;
      operation?: string;
    };
    service?: {
      serviceName?: string;
      state?: string;
    };
    networkPolicy?: {
      proxyPolicyName?: string;
      networkPolicyName?: string;
      reasonCode?: number;
      loggingResult?: string;
      reason?: string;
      authenticationType?: string;
      nasIpv4Address?: string;
      calledStationId?: string;
      callingStationId?: string;
      nasIdentifier?: string;
      nasPortType?: string;
      clientName?: string;
      clientIpAddress?: string;
      authenticationProvider?: string;
      authenticationServer?: string;
    };
  };
}

export interface WsaLogEntry extends BaseLogEntry {
  wsa: {
    elapsedTime: number;
    transactionResult: string;
    upstreamConnection: string;
    upstreamServer: string;
    urlCategory: string;
    aclDecision: string;

    /** Part of the ACL decision before the first underscore */
    aclDecisionBase: string;
    avgBandwidthKbps: number;

    bandwidthThrottled: boolean;

    request: {
      httpMethod: string;
      clientIp: string;
      url: string;
      username: string;
      samName: string;
      urlCategory: string;
      outboundMalwareVerdict?: string;
      outboundMalwareThreatName?: string;
      size?: number;
    };

    response?: {
      httpResponseCode: number;
      size: number;
      mimeType: string;
      urlCategory: string;
      malwareCategory: string;
      sha256Hash: string;
    };

    verdict?: {
      webReputationScore: number;
      ciscoDataSecurity: string;
      externalDlp: string;
      reputationThreatType: string;
      safeSearch: string;
      webroot?: {
        verdict?: string;
      };
      mcafee?: {
        verdict?: string;
        virusType?: string;
        virusName?: string;
      };
      sophos?: {
        verdict?: string;
        virusName?: string;
      };
      avc?: {
        appName?: string;
        appType?: string;
        appBehavior?: string;
      };
      amp?: {
        verdict?: string;
        threatName?: string;
        reputationScore?: number;
        uploaded?: boolean;
        filename?: string;
      };
    };

    policies?: {
      decision?: string;
      identity?: string;
      outboundMalware?: string;
      dataSecurity?: string;
      externalDlp?: string;
      routingPolicy?: string;
    }
  };
}

export interface CylanceLogEntry extends BaseLogEntry {
  cylance: {
    eventType: string;
    eventName: string;

    // Device system security
    device?: string;
    agentVersion?: string;
    ip?: string;
    mac?: string;
    samName?: string;
    message?: string;

    // Exploit attempt
    processId?: number;
    processName?: string;
    os?: string;
    loginName?: string;
    violationType?: string;
    zone?: string;

    // Threat
    fileName?: string;
    fullPath?: string;
    driveType?: string;
    sha256?: string;
    md5?: string;
    status?: string;
    cylanceScore?: number;
    fileType?: string;
    isRunning?: boolean;
    autoRun?: boolean;
    detectedBy?: string;
    threatClass?: string;
    threatSubClass?: string;

    policy?: string;
    category?: string;
    userName?: string;
    userEmail?: string;
    reason?: string;
    auditMessage?: string;

    externalDevice?: {
      type?: string;
      vendorId?: string;
      name?: string;
      productId?: string;
      serialNumber?: string;
    }
  };
}

export interface SqlLogEntry extends BaseLogEntry {
  sql: {
    TSQLCommand: string;
    TextData: string;
    EventType: string;
    DatabaseName: string;
    DBUserName: string;
    NTUserName: string;
    NTDomainName: string;
    HostName: string;
    ApplicationName: string;
    LoginName: string;
    ServerName: string;

    /** User who originated the session. */
    SessionLoginName: string;
    SchemaName: string;
    ObjectName: string;
    ObjectType: string;
    OwnerName: string;
    AlterTableActionList: string;
    TargetObjectType: string;
    TargetUserName: string;
    NestLevel: number;
    Parameters: string;
    DefaultSchema: string;
    PropertyName: string;
    PropertyValue: string;
    TargetObjectName: string;
    TargetLoginName: string;
    SID: string;
    LoginSid: string;
    TargetLoginSid: string;

    /** True for a system process, false for a user process. */
    IsSystem: boolean;
    Success: boolean;

    DatabaseID: number;
    RequestID: number;
    GroupID: number;
    Error: number;
    Severity: number;

    /** Session ID. */
    SPID: number;
    State: number;
    ClientProcessID: number;
    Duration: number;
    EventClass: number;
    EventSubClass: number;
    Permissions: number;

    /** Token that describes the current transaction. */
    XactSequence: number;

    /** Sequence of the event in the request. */
    EventSequence: number;

    /** Number of page reads. */
    Reads: number;

    /** Number of page writes. */
    Writes: number;

    /** CPU time in milliseconds. */
    CPU: number;

    /** Means different things depending on the type.
     *
     * See, for example:
     *
     * * https://docs.microsoft.com/en-us/sql/relational-databases/event-classes/lock-acquired-event-class?view=sql-server-2017
     */
    Type: number;

    StartTime: Date;
    EndTime: Date;
  }
}
