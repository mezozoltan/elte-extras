const assert=require('node:assert/strict');
const {analyze}=require('../output-diff.js');
for (const [expected,actual] of [['same','same'],['1','2'],['12','1 2'],['1 23','12 3'],['hello world','helloworld'],['x','X'],['1 2','1 3\n']]) {
  assert.equal(analyze(expected,actual),null,JSON.stringify({expected,actual}));
}
assert.match(analyze('answer','answer\n').en,/Extra newline/);
assert.match(analyze('answer\n','answer').en,/Missing newline/);
assert.match(analyze('answer','answer\n\n').hu,/\\n\\n/);
assert.equal(analyze('answer','answer ').kind,'trailing-whitespace');
assert.equal(analyze('a\nb\n','a\r\nb\r\n').kind,'line-endings');
assert.match(analyze('a\nb','a\r\nb').en,/LF.*CRLF/);
assert.equal(analyze('1 2 3','1\n2 3\n').kind,'whitespace');
assert.match(analyze('1 2 3','1\n2 3\n').detail.hu,/Záró whitespace/);
assert.equal(analyze('x y','x\ty').kind,'whitespace');
assert.equal(analyze('x y','x\u00a0y').kind,'whitespace');
assert.equal(analyze('hello','hel\u200blo').kind,'unicode');
assert.equal(analyze('hello','\ufeffhello').kind,'unicode');
assert.equal(analyze('café','cafe\u0301').kind,'unicode');
assert.equal(analyze('a\u200Db','ab'),null); // Joiners can change visible glyphs.
assert.equal(analyze('', '\n').kind,'trailing-whitespace');
assert.equal(analyze(null,'x'),null);
assert.equal(analyze('x'.repeat(1000001),'x'.repeat(1000001)+'\n'),null);
assert.match(analyze('a\n😀 x','a\n😀\tx').detail.en,/line 2, character 2/);
console.log('PASS: extra/missing final newlines, spaces, tabs, LF/CRLF, NBSP, zero-width/BOM, canonical Unicode, token-boundary safety, visible mismatches, empty output, size cap, Unicode positions');
