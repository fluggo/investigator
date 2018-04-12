/* eslint-disable prefer-const, no-multi-str, quotes */
const test = require( 'tape' );
const textile = require( '../src' );
// filter_pba.yml

test( 'correct application of double quote entity when using styles', function ( t ) {
  let tx = "p{background: #white url(\"../chunky_bacon.jpg\")}. The quick brown \"cartoon\" fox jumps over the lazy dog";
  t.is( textile.convert( tx ),
    "<p style=\"background:#white url(&quot;../chunky_bacon.jpg&quot;)\">The quick brown &#8220;cartoon&#8221; fox jumps over the lazy dog</p>", tx );
  t.end();
});

test( 'correct application of single quote entity when using styles', function ( t ) {
  let tx = "p{background: #white url('../chunky_bacon.jpg')}. The quick brown 'cartoon' fox jumps over the lazy dog";
  t.is( textile.convert( tx ),
    "<p style=\"background:#white url(&#39;../chunky_bacon.jpg&#39;)\">The quick brown &#8216;cartoon&#8217; fox jumps over the lazy dog</p>", tx );
  t.end();
});

