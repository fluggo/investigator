import * as d3time from 'd3-time';
import * as async from 'async';
import * as es from '../es';
import * as util from '../../common/util';
import { Netmask } from 'netmask';
import config = require('../config');

export const NETFLOW_TEMPLATE: any = {
  template: 'netflow-*',
  settings: {
    'index.codec': 'best_compression',
    'index.refresh_interval': '30s',

    'index.number_of_shards': config.number_of_shards,
  },
  mappings: {
    _default_: {
      _all: {
        enabled: false
      },
      dynamic: true,
      dynamic_templates: [
        {
          custom_strings: {
            match_mapping_type: 'string',
            mapping: {
              type: 'keyword',
            }
          }
        }
      ],
    },
    "netflow9": {
      properties: {
        '@timestamp': {
          type: 'date'
        },
        receivedTime: {
          type: 'date'
        },
        reporting_ip: {
          type: 'ip'
        },
        startTime: {
          type: 'date'
        },
        observationTime: {
          type: 'date',
          index: false,
          doc_values: false,
        },
        flowStart: {
          type: 'date',
          index: false,
          doc_values: false,
        },
        first_switched: {
          type: 'date',
          index: false,
          doc_values: false,
        },
        last_switched: {
          type: 'date',
          index: false,
          doc_values: false,
        },

        // Suggest smaller sizes for these items
        direction: {
          type: 'byte'
        },
        dst_mask: {
          type: 'byte',
          index: false,
          doc_values: false,
        },
        src_mask: {
          type: 'byte',
          index: false,
          doc_values: false,
        },

        ipv4_dst_addr: {
          type: 'ip'
        },
        ipv4_src_addr: {
          type: 'ip'
        },
        ipv4_next_hop: {
          type: 'ip'
        },
        icmpCodeIPv4: {
          type: 'byte'
        },
        icmpTypeIPv4: {
          type: 'byte'
        },

        // We don't want to index these fields (in_permanent_bytes may someday be useful,
        // but it makes no sense to search on the others), but we do want them available
        // for aggregation, so turn doc_values on manually
        in_bytes: {
          type: 'long',
          index: false,
        },
        in_permanent_bytes: {
          type: 'long',
          index: false,
        },
        in_permanent_pkts: {
          type: 'long',
          index: false,
        },
        in_pkts: {
          type: 'long',
          index: false,
        },

        protocol: {
          type: 'byte'
        },
        tcp_flags: {
          properties: {
            urg: { type: 'boolean' },
            ack: { type: 'boolean' },
            psh: { type: 'boolean' },
            rst: { type: 'boolean' },
            syn: { type: 'boolean' },
            fin: { type: 'boolean' },
          }
        },

      },
    },
  },
  aliases: {
    'netflow': {}
  }
};

interface NetflowEntry {
  netflow9: {
    "@timestamp": Date | string;
    receivedTime: Date | string;
    reporting_ip: string;
    startTime: Date | string;
    observationTime: Date | string;
    flowStart: Date | string;
    first_switched: Date | string;
    last_switched: Date | string;
    direction: number;
    dst_mask: number;
    src_mask: number;

    ipv4_dst_addr: string;
    ipv4_src_addr: string;
    ipv4_next_hop: string;

    icmpCodeIPv4: number;
    icmpTypeIPv4: number;

    in_bytes: number;
    in_permanent_bytes: number;
    in_permanent_pkts: number;
    in_pkts: number;

    protocol: number;

    tcp_flags?: {
      urg: boolean;
      ack: boolean;
      psh: boolean;
      rst: boolean;
      syn: boolean;
      fin: boolean;
    }
  }
}

/*
  Important fields:
    reporting_ip
    startTime - Beginning of flow
    @timestamp - End of flow
    ipv4_src_addr
    l4_src_port
    input_snmp
    ipv4_dst_addr
    l4_dst_port
    output_snmp
    protocol: 1 - ICMP, 6 - TCP, 17 - UDP
    icmpTypeIPv4
    icmpCodeIPv4
    firewallExtendedEvent
    in_permanent_bytes
    in_bytes

  Other:
    inputACL
    outputACL
    username
*/

enum Protocol {
  ICMP = 1,
  IGMP = 2,
  TCP = 6,
  UDP = 17,
  GRE = 47,
  EIGRP = 88,
  PIM = 103,
}

const enum TcpFlag {
  RST = 'rst',
  PSH = 'psh',
  SYN = 'syn',
  ACK = 'ack',
  URG = 'urg',
  FIN = 'fin',
}

// Create the query for the given query text and tag mappings
function createNetflowQuery(terms: util.QueryTerm[], startTime: Date, endTime: Date, reportingIp: string | null) {
  const result: any = {
    bool: {
      filter: [
        // First, a broader range query that can be cached
        {
          range: {
            '@timestamp': {
              gte: d3time.timeHour.floor(startTime),
              lt: d3time.timeHour.ceil(endTime),
            }
          }
        },

        // And now a more specific time range (see https://www.elastic.co/guide/en/elasticsearch/guide/current/_filter_order.html)
        // We do floor/ceil to avoid the graph being misinterpreted at the endpoints (bars with partial data)
        {
          range: {
            '@timestamp': {
              gte: d3time.timeMinute.floor(startTime),
              lt: d3time.timeMinute.ceil(endTime),
            }
          }
        },
      ],
      must: [],
      should: [],
      must_not: [],
    }
  };

  if(reportingIp) {
    // The reporting IP filter should go second, because it, too, can be cached
    result.bool.filter.splice(1, 0, { term: { reporting_ip: reportingIp } });
  }

  /*
    Query terms:
      10.0.0.1
        IP addresses by themselves search IP source/dest fields;
        any IP address given is acceptable
      10.0.0.0/24
        Same as above, but for ranges
      dst:10.0.0.1 src:10.0.0.2
        Destination and source IP addresses; ranges also work; dest is alias for 
      port:445
        Search either source or dest port
      dstport:445 srcport:13566
        Destination and source ports
      proto:6 tcp
        They mean the same thing
      udp icmp
        Yeah them too
  */

  // Lists of terms
  const ipTest = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?$/;

  function ipQuery(ip: string, srcdst?: 'src' | 'dst') {
    var options = [];

    if(!srcdst || srcdst === 'src')
      options.push({ term: { ipv4_src_addr: ip } });

    if(!srcdst || srcdst === 'dst')
      options.push({ term: { ipv4_dst_addr: ip } });

    if(options.length === 1)
      return options[0];

    return { bool: { should: options, minimum_should_match: 1 } };
  }

  function ipRangeQuery(block: Netmask, srcdst?: 'src' | 'dst') {
    var options = [];

    if(!srcdst || srcdst === 'src')
      options.push({ range: { ipv4_src_addr: { gte: block.base, lte: block.broadcast } } });

    if(!srcdst || srcdst === 'dst')
      options.push({ range: { ipv4_dst_addr: { gte: block.base, lte: block.broadcast } } });

    if(options.length === 1)
      return options[0];

    return { bool: { should: options, minimum_should_match: 1 } };
  }

  function portQuery(port: number, srcdst?: 'src' | 'dst') {
    var options = [];

    if(!srcdst || srcdst === 'src')
      options.push({ term: { l4_src_port: port } });

    if(!srcdst || srcdst === 'dst')
      options.push({ term: { l4_dst_port: port } });

    if(options.length === 1)
      return options[0];

    return { bool: { should: options, minimum_should_match: 1 } };
  }

  function protoQuery(proto: Protocol) {
    return { term: { protocol: proto } };
  }

  function tcpFlagQuery(flag: TcpFlag) {
    return { term: { ['tcp_flags.' + flag]: true } };
  }

  terms.forEach(function(term) {
    if(term.type === 'term') {
      if(ipTest.test(term.term)) {
        const block = new Netmask(term.term);

        if(block.bitmask === 32)
          result.bool[term.req].push(ipQuery(block.base));
        else
          result.bool[term.req].push(ipRangeQuery(block));
      }
      else if(term.term === 'udp') {
        result.bool[term.req].push(protoQuery(Protocol.UDP));
      }
      else if(term.term === 'tcp') {
        result.bool[term.req].push(protoQuery(Protocol.TCP));
      }
      else if(term.term === 'icmp') {
        result.bool[term.req].push(protoQuery(Protocol.ICMP));
      }
      else if(term.term === 'igmp') {
        result.bool[term.req].push(protoQuery(Protocol.IGMP));
      }
      else if(term.term === 'gre') {
        result.bool[term.req].push(protoQuery(Protocol.GRE));
      }
      else if(term.term === 'eigrp') {
        result.bool[term.req].push(protoQuery(Protocol.EIGRP));
      }
      else if(term.term === 'pim') {
        result.bool[term.req].push(protoQuery(Protocol.PIM));
      }
      else if(term.term === 'tcp.rst') {
        result.bool[term.req].push(tcpFlagQuery(TcpFlag.RST));
      }
      else if(term.term === 'tcp.syn') {
        result.bool[term.req].push(tcpFlagQuery(TcpFlag.SYN));
      }
      else if(term.term === 'tcp.ack') {
        result.bool[term.req].push(tcpFlagQuery(TcpFlag.ACK));
      }
      else if(term.term === 'tcp.psh') {
        result.bool[term.req].push(tcpFlagQuery(TcpFlag.PSH));
      }
      else if(term.term === 'tcp.urg') {
        result.bool[term.req].push(tcpFlagQuery(TcpFlag.URG));
      }
      else if(term.term === 'tcp.fin') {
        result.bool[term.req].push(tcpFlagQuery(TcpFlag.FIN));
      }
      else {
        console.log('Failed to parse ' + term.term);
      }
    }
    else if(term.type === 'dst' || term.type === 'dest') {
      let block = new Netmask(term.term);

      if(block.bitmask === 32)
        result.bool[term.req].push(ipQuery(block.base, 'dst'));
      else
        result.bool[term.req].push(ipRangeQuery(block, 'dst'));
    }
    else if(term.type === 'src') {
      let block = new Netmask(term.term);

      if(block.bitmask === 32)
        result.bool[term.req].push(ipQuery(block.base, 'src'));
      else
        result.bool[term.req].push(ipRangeQuery(block, 'src'));
    }
    else if(term.type === 'port') {
      const port = +term.term;

      if(!Number.isNaN(port))
        result.bool[term.req].push(portQuery(port));
    }
    else if(term.type === 'dstport' || term.type === 'destport') {
      const port = +term.term;

      if(!Number.isNaN(port))
        result.bool[term.req].push(portQuery(port, 'dst'));
    }
    else if(term.type === 'srcport') {
      const port = +term.term;

      if(!Number.isNaN(port))
        result.bool[term.req].push(portQuery(port, 'src'));
    }
    else if(term.type === 'proto') {
      const port = +term.term;

      if(!Number.isNaN(port))
        result.bool[term.req].push(protoQuery(port));
    }
  });

  if(result.bool.should.length)
    result.bool.minimum_should_match = 1;

  // Make the entire query cacheable
  return {
    constant_score: {
      filter: result
    }
  };
}

const INTERVALS = [1, 2, 5, 10, 15, 20, 30, 60, 120, 4 * 60, 6 * 60, 24 * 60];

/**
 * Chooses the number of minutes between data points to meet a maximum of 1500 data points.
 * @param start Start date.
 * @param end End date.
 */
function chooseInterval(start: Date, end: Date): number {
  // Max 1500 data points
  const GOAL = 1500;
  const minutes = (end.getTime() - start.getTime()) / 60000;

  var intervalIndex = 0;

  while(intervalIndex < INTERVALS.length && minutes / INTERVALS[intervalIndex] > GOAL) {
    intervalIndex++;
  }

  if(intervalIndex === INTERVALS.length) {
    return minutes / GOAL;
  }

  return INTERVALS[intervalIndex];
}


export function search(query: util.NetflowSearchQuery, callback: (err: any, results?: es.SearchResponse<NetflowEntry>) => void) {
  const startTime = util.createRelativeDate(query.start, false);

  if(!startTime)
    return callback(new Error('Invalid start date for the query.'));

  const endTime = util.createRelativeDate(query.end, true);

  if(!endTime)
    return callback(new Error('Invalid end date for the query.'));

  var newQuery = createNetflowQuery(util.parseQueryTerms(query.q), startTime, endTime, query.reportingIp);
  var globalQuery = createNetflowQuery(util.parseQueryTerms(query.q), startTime, endTime, null);

  const interval = chooseInterval(startTime, endTime);

  const aggs = {
    by_time: {
      date_histogram: {
        field: '@timestamp',
        interval: interval + 'm',
        min_doc_count: 0,
        extended_bounds: { min: startTime, max: endTime },
      },
      aggs: {
        in_bytes: {
          sum: {
            field: 'in_bytes'
          }
        },
        top_by_srcip: {
          terms: {
            field: 'ipv4_src_addr',
            size: 10,
            order: { in_bytes: 'desc' }
          },
          aggs: {
            in_bytes: {
              sum: {
                field: 'in_bytes'
              }
            },
          },
        },
        top_by_dstip: {
          terms: {
            field: 'ipv4_dst_addr',
            size: 10,
            order: { in_bytes: 'desc' }
          },
          aggs: {
            in_bytes: {
              sum: {
                field: 'in_bytes'
              }
            },
          },
        },
        top_by_srcport_bytes: {
          terms: {
            field: 'l4_src_port',
            size: 10,
            order: { in_bytes: 'desc' }
          },
          aggs: {
            in_bytes: {
              sum: {
                field: 'in_bytes'
              }
            },
          },
        },
        top_by_dstport_bytes: {
          terms: {
            field: 'l4_dst_port',
            size: 10,
            order: { in_bytes: 'desc' }
          },
          aggs: {
            in_bytes: {
              sum: {
                field: 'in_bytes'
              }
            },
          },
        },
      }
    },
    top_by_srcip: {
      terms: {
        field: 'ipv4_src_addr',
        size: 10,
        order: { in_bytes: 'desc' }
      },
      aggs: {
        in_bytes: {
          sum: {
            field: 'in_bytes'
          }
        },
      },
    },
    top_by_dstip: {
      terms: {
        field: 'ipv4_dst_addr',
        size: 10,
        order: { in_bytes: 'desc' }
      },
      aggs: {
        in_bytes: {
          sum: {
            field: 'in_bytes'
          }
        },
      },
    },
    top_by_srcport_bytes: {
      terms: {
        field: 'l4_src_port',
        size: 10,
        order: { in_bytes: 'desc' }
      },
      aggs: {
        in_bytes: {
          sum: {
            field: 'in_bytes'
          }
        },
      },
    },
    top_by_dstport_bytes: {
      terms: {
        field: 'l4_dst_port',
        size: 10,
        order: { in_bytes: 'desc' }
      },
      aggs: {
        in_bytes: {
          sum: {
            field: 'in_bytes'
          }
        },
      },
    },
    packets_across_sources: {
      global: {},
      aggs: {
        global: {
          filter: globalQuery,
          aggs: {
            by_reporting_ip: {
              terms: {
                field: 'reporting_ip'
              },
            }
          }
        }
      }
    }
  };

  es.client.search<NetflowEntry>({
    index: 'netflow',
    type: 'netflow9',
    body: {
      query: newQuery,
      size: 0,
      aggs: aggs,
    },
  }, callback);
}

export function setTemplate(callback: (err: any) => void) {
  es.client.indices.putTemplate({
    name: 'netflow-template',
    body: NETFLOW_TEMPLATE,
  }, callback);
}


export function healthCheck(callback: (err: any, results?: es.SearchResponse<NetflowEntry>) => void) {
  es.client.search<NetflowEntry>({
    index: 'netflow',
    type: 'netflow9',
    body: {
      query: {
        bool: {
          filter: [
            {
              range: {
                '@timestamp': {
                  gte: 'now-30m/m',
                  lt: 'now',
                }
              }
            },
          ],
        },
      },
      size: 0,
      aggs: {
        by_reporting_ip: {
          terms: {
            field: 'reporting_ip',
            size: 100,
          },
          aggs: {
            max_length: {
              max: {
                script: {
                  inline: "doc['@timestamp'].value - doc['startTime'].value",
                  lang: 'painless'
                }
              }
            },
            in_bytes_count: {
              value_count: {
                field: 'in_bytes'
              }
            },
            in_permanent_bytes_count: {
              value_count: {
                field: 'in_permanent_bytes'
              }
            },
          }
        }
      }
    },
  }, callback);
}


export function rawSearch(query: util.NetflowSearchQuery, callback: (err: any, results?: es.SearchResponse<NetflowEntry>) => void) {
  const startTime = util.createRelativeDate(query.start, false);

  if(!startTime)
    return callback(new Error('Invalid start date for the query.'));

  const endTime = util.createRelativeDate(query.end, true);

  if(!endTime)
    return callback(new Error('Invalid end date for the query.'));

  var newQuery = createNetflowQuery(util.parseQueryTerms(query.q), startTime, endTime, query.reportingIp || '0.0.0.0');
  var globalQuery = createNetflowQuery(util.parseQueryTerms(query.q), startTime, endTime, null);

  var interval = chooseInterval(startTime, endTime);

  const aggs = {
    packets_across_sources: {
      global: {},
      aggs: {
        global: {
          filter: globalQuery,
          aggs: {
            by_reporting_ip: {
              terms: {
                field: 'reporting_ip'
              },
            }
          }
        }
      }
    }
  };

  return es.client.search<NetflowEntry>({
    index: 'netflow',
    type: 'netflow9',
    body: {
      query: newQuery,
      from: query.from || 0,
      size: query.size || 50,
      sort: {'@timestamp': 'desc'},
      aggs: aggs,
    },
  }, callback);
}
