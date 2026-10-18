const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const model = require('../model.js');
const raw = [
  {id:1, uuid:'old-1', prev_id:null, data:{structograms:[{name:'Maximumkeresés'}]}, created_at:'2026-10-17T10:00:00Z'},
  {id:2, uuid:'new-2', prev_id:1, data:{structograms:[{name:'Maximumkeresés'}]}, created_at:'2026-10-18T12:00:00Z'},
  {id:3, uuid:'separate-3', prev_id:null, name:'Összegzés', created_at:'2026-10-18T13:00:00Z'},
];
const rows = model.normalize(raw);
assert.equal(model.groups(rows).length, 2);
assert.deepEqual(model.groups(rows)[1].versions.map(x=>x.uuid), ['new-2','old-1']);
assert.equal(model.title(rows[0]), 'Maximumkeresés');
assert.equal(model.link(rows[0]), 'https://progalap.elte.hu/stuki/?uuid=old-1');
assert.equal(model.normalize([raw[0],raw[0],{uuid:'javascript:alert(1)'}]).length, 1);
assert.throws(()=>model.normalize({error:'not a list'}));
assert.equal(model.groups(model.normalize([{id:1,uuid:'a',prev_id:2},{id:2,uuid:'b',prev_id:1}]))[0].versions.length,2);
assert.equal(model.groups(model.normalize([{id:1,uuid:'a',prev_id:99}]))[0].versions.length,1);
const fork = model.normalize([...raw,{id:4,uuid:'fork-4',prev_id:1}]);
assert.equal(model.groups(fork).length,3);
console.log('PASS: version chains, forks, cycles, missing parents, deduplication, names and safe URLs');

