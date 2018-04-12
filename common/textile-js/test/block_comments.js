/* eslint-disable prefer-const, no-multi-str, quotes */
const test = require( 'tape' );
const textile = require( '../src' );
// block_comments.yml

test( 'Textile comments', function ( t ) {
  let tx = "###. Here's a comment.\n\n\
h3. Hello\n\n\
###. And\n\
another\n\
one.\n\n\
Goodbye.\n\
";
  t.is( textile.convert( tx ),
    "<h3>Hello</h3>\n\n\
<p>Goodbye.</p>", tx );
  t.end();
});


test( 'Textile comments', function ( t ) {
  let tx = "Some text here.\n\n\
###. This is a textile comment block.\n\
It will be removed from your document.\n\n\
More text to follow.\n\
";
  t.is( textile.convert( tx ),
    "<p>Some text here.</p>\n\n\
<p>More text to follow.</p>", tx );
  t.end();
});


test( 'Textile comments extended', function ( t ) {
  let tx = "Some text here.\n\n\
###.. This is a textile comment block.\n\
It will be removed from your document.\n\n\
This is also a comment.\n\n\
p. More text to follow.\n\
";
  t.is( textile.convert( tx ),
    "<p>Some text here.</p>\n\n\
<p>More text to follow.</p>", tx );
  t.end();
});

