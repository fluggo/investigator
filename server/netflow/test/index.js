// https://mochajs.org/
// http://chaijs.com/api/bdd/
'use strict';

const chai = require('chai'), expect = chai.expect;
const netflow = require('../index');

describe('Relative date utils', function() {
  const util = require('../../../common/util');

  describe('parseRelativeDate function', function() {
    it('parses dates', function() {
      expect(util.parseRelativeDate('2005-03-11')).to.deep.equal({
        date: new Date(2005, 2, 11),
        relative: null,
        rounding: null
      });

      expect(util.parseRelativeDate('2005-03-11 09:00')).to.deep.equal({
        date: new Date(2005, 2, 11, 9, 0),
        relative: null,
        rounding: null
      });

      expect(util.parseRelativeDate('2005-03-11 15:00')).to.deep.equal({
        date: new Date(2005, 2, 11, 15, 0),
        relative: null,
        rounding: null
      });

      expect(util.parseRelativeDate('2005-03-11 09:00 PM')).to.deep.equal({
        date: new Date(2005, 2, 11, 21, 0),
        relative: null,
        rounding: null
      });
    });

    it('parses relative times', function() {
      expect(util.parseRelativeDate('now')).to.deep.equal({
        date: null,
        relative: null,
        rounding: null
      });

      expect(util.parseRelativeDate('now-3w')).to.deep.equal({
        date: null,
        relative: {value: -3, unit: 'w'},
        rounding: null
      });

      expect(util.parseRelativeDate('now/w')).to.deep.equal({
        date: null,
        relative: null,
        rounding: 'w'
      });

      expect(util.parseRelativeDate('now-3w/M')).to.deep.equal({
        date: null,
        relative: {value: -3, unit: 'w'},
        rounding: 'M'
      });
    });
  });

  describe('createRelativeDate function', function() {
    it('does its thing', function() {
      expect(util.createRelativeDate('now', false, new Date(2005, 3, 11)).toString()).to.equal(new Date(2005, 3, 11).toString());
      expect(util.createRelativeDate('now-3d', false, new Date(2005, 3, 11)).toString()).to.equal(new Date(2005, 3, 8).toString());
      expect(util.createRelativeDate('now/M', false, new Date(2005, 3, 11)).toString()).to.equal(new Date(2005, 3, 1).toString());
      expect(util.createRelativeDate('now/y', false, new Date(2005, 3, 11)).toString()).to.equal(new Date(2005, 0, 1).toString());

      expect(util.createRelativeDate('now', true, new Date(2005, 3, 11)).toString()).to.equal(new Date(2005, 3, 11).toString());
      expect(util.createRelativeDate('now-3d', true, new Date(2005, 3, 11)).toString()).to.equal(new Date(2005, 3, 8).toString());
      expect(util.createRelativeDate('now/M', true, new Date(2005, 3, 11)).toString()).to.equal(new Date(2005, 4, 1).toString());
      expect(util.createRelativeDate('now/y', true, new Date(2005, 3, 11)).toString()).to.equal(new Date(2006, 0, 1).toString());
    });
  });
});

describe('Netflow service', function() {
  const startDate = new Date(2016, 2, 3, 4, 5, 6);
  const endDate = new Date(2016, 2, 3, 6, 5, 6);

  const filter1 = {
    range: {
      '@timestamp': {
        gte: new Date(2016, 2, 3, 4, 0, 0),
        lt: new Date(2016, 2, 3, 7, 0, 0),
      }
    }
  };

  const filter2 = {
    // Rounded to the minute because that's the granularity of our netflow records
    range: {
      '@timestamp': {
        gte: new Date(2016, 2, 3, 4, 5, 0),
        lt: new Date(2016, 2, 3, 6, 6, 0),
      }
    }
  };

  describe('createNetflowQuery', function() {
    it('does IP addresses', function() {
      let query = netflow.createNetflowQuery(netflow.parseQueryTerms('10.5.35.120'), startDate, endDate);

      expect(query.constant_score.filter.bool).to.deep.equal({
        should: [
          { bool: {
            should: [
              { term: { ipv4_src_addr: '10.5.35.120' } },
              { term: { ipv4_dst_addr: '10.5.35.120' } },
            ],
            minimum_should_match: 1
          }}
        ],
        must: [],
        must_not: [],
        filter: [filter1, filter2],
        minimum_should_match: 1
      });

      // Required address
      query = netflow.createNetflowQuery(netflow.parseQueryTerms('+10.5.35.120'), startDate, endDate);

      expect(query.constant_score.filter.bool).to.deep.equal({
        must: [
          { bool: {
            should: [
              { term: { ipv4_src_addr: '10.5.35.120' } },
              { term: { ipv4_dst_addr: '10.5.35.120' } },
            ],
            minimum_should_match: 1
          }}
        ],
        should: [],
        must_not: [],
        filter: [filter1, filter2],
      });

      // Source address
      query = netflow.createNetflowQuery(netflow.parseQueryTerms('src:10.5.35.120'), startDate, endDate);

      expect(query.constant_score.filter.bool).to.deep.equal({
        should: [
          { term: { ipv4_src_addr: '10.5.35.120' } },
        ],
        must: [],
        must_not: [],
        filter: [filter1, filter2],
        minimum_should_match: 1
      });

      // Destination address
      query = netflow.createNetflowQuery(netflow.parseQueryTerms('dst:10.5.35.120'), startDate, endDate);

      expect(query.constant_score.filter.bool).to.deep.equal({
        should: [
          { term: { ipv4_dst_addr: '10.5.35.120' } },
        ],
        must: [],
        must_not: [],
        filter: [filter1, filter2],
        minimum_should_match: 1
      });

      // dst alias "dest"
      query = netflow.createNetflowQuery(netflow.parseQueryTerms('dest:10.5.35.120'), startDate, endDate);

      expect(query.constant_score.filter.bool).to.deep.equal({
        should: [
          { term: { ipv4_dst_addr: '10.5.35.120' } },
        ],
        must: [],
        must_not: [],
        filter: [filter1, filter2],
        minimum_should_match: 1
      });

      // Combination
      query = netflow.createNetflowQuery(netflow.parseQueryTerms('dst:10.5.35.120 src:10.5.15.12'), startDate, endDate);

      expect(query.constant_score.filter.bool).to.deep.equal({
        should: [
          { term: { ipv4_dst_addr: '10.5.35.120' } },
          { term: { ipv4_src_addr: '10.5.15.12' } },
        ],
        must: [],
        must_not: [],
        filter: [filter1, filter2],
        minimum_should_match: 1
      });
    });   // end does IP addresses

    it('does protocols', function() {
      let query = netflow.createNetflowQuery(netflow.parseQueryTerms('proto:6'), startDate, endDate);

      expect(query.constant_score.filter.bool).to.deep.equal({
        should: [
          { term: { protocol: 6 } }
        ],
        must: [],
        must_not: [],
        filter: [filter1, filter2],
        minimum_should_match: 1
      });

      // TCP alias
      query = netflow.createNetflowQuery(netflow.parseQueryTerms('tcp'), startDate, endDate);

      expect(query.constant_score.filter.bool).to.deep.equal({
        should: [
          { term: { protocol: 6 } }
        ],
        must: [],
        must_not: [],
        filter: [filter1, filter2],
        minimum_should_match: 1
      });

      // UDP alias
      query = netflow.createNetflowQuery(netflow.parseQueryTerms('udp'), startDate, endDate);

      expect(query.constant_score.filter.bool).to.deep.equal({
        should: [
          { term: { protocol: 17 } }
        ],
        must: [],
        must_not: [],
        filter: [filter1, filter2],
        minimum_should_match: 1
      });

      // ICMP alias
      query = netflow.createNetflowQuery(netflow.parseQueryTerms('icmp'), startDate, endDate);

      expect(query.constant_score.filter.bool).to.deep.equal({
        should: [
          { term: { protocol: 1 } }
        ],
        must: [],
        must_not: [],
        filter: [filter1, filter2],
        minimum_should_match: 1
      });
    });   // end does protocols

    it('does ports', function() {
      let query = netflow.createNetflowQuery(netflow.parseQueryTerms('port:443'), startDate, endDate);

      expect(query.constant_score.filter.bool).to.deep.equal({
        should: [
          { bool: {
            should: [
              { term: { l4_src_port: 443 } },
              { term: { l4_dst_port: 443 } },
            ],
            minimum_should_match: 1}}
        ],
        must: [],
        must_not: [],
        filter: [filter1, filter2],
        minimum_should_match: 1
      });

      query = netflow.createNetflowQuery(netflow.parseQueryTerms('dstport:443'), startDate, endDate);

      expect(query.constant_score.filter.bool).to.deep.equal({
        should: [
          { term: { l4_dst_port: 443 } },
        ],
        must: [],
        must_not: [],
        filter: [filter1, filter2],
        minimum_should_match: 1
      });

      query = netflow.createNetflowQuery(netflow.parseQueryTerms('destport:443'), startDate, endDate);

      expect(query.constant_score.filter.bool).to.deep.equal({
        should: [
          { term: { l4_dst_port: 443 } },
        ],
        must: [],
        must_not: [],
        filter: [filter1, filter2],
        minimum_should_match: 1
      });

      query = netflow.createNetflowQuery(netflow.parseQueryTerms('srcport:443'), startDate, endDate);

      expect(query.constant_score.filter.bool).to.deep.equal({
        should: [
          { term: { l4_src_port: 443 } },
        ],
        must: [],
        must_not: [],
        filter: [filter1, filter2],
        minimum_should_match: 1
      });
    });   // end does ports

    it('does CIDRs', function() {
      let query = netflow.createNetflowQuery(netflow.parseQueryTerms('10.0.0.0/8'), startDate, endDate);

      expect(query.constant_score.filter.bool).to.deep.equal({
        should: [
          { bool: {
            should: [
              { range: { ipv4_src_addr: { gte: '10.0.0.0', lte: '10.255.255.255' } } },
              { range: { ipv4_dst_addr: { gte: '10.0.0.0', lte: '10.255.255.255' } } },
            ],
            minimum_should_match: 1
          }}
        ],
        must: [],
        must_not: [],
        filter: [filter1, filter2],
        minimum_should_match: 1
      });

      query = netflow.createNetflowQuery(netflow.parseQueryTerms('-10.0.0.0/8'), startDate, endDate);

      expect(query.constant_score.filter.bool).to.deep.equal({
        must_not: [
          { bool: {
            should: [
              { range: { ipv4_src_addr: { gte: '10.0.0.0', lte: '10.255.255.255' } } },
              { range: { ipv4_dst_addr: { gte: '10.0.0.0', lte: '10.255.255.255' } } },
            ],
            minimum_should_match: 1
          }}
        ],
        must: [],
        should: [],
        filter: [filter1, filter2],
      });
    });   // end does CIDRs
  });   // end createWikiQuery
});

