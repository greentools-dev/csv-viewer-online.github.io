import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectFormat,
  parseCsvLine,
  csvToJson,
  jsonToCsv,
  jsonToSqlInsert,
  sortObjectKeys,
  computeJsonDepth,
  countJsonKeys,
} from './dataTransforms';

test('detectFormat identifies JSON, CSV, and Base64 accurately', () => {
  assert.equal(detectFormat('{"name":"Alice","age":30}'), 'json');
  assert.equal(detectFormat('id,name,role\n1,Alice,Engineer\n2,Bob,Designer'), 'csv');
  assert.equal(detectFormat('SGVsbG8gV29ybGQh'), 'base64');
});

test('parseCsvLine handles quoted commas and escaped quotes', () => {
  const row = parseCsvLine('101,"Acme, Inc.","He said ""Hello""",42.5');
  assert.deepEqual(row, ['101', 'Acme, Inc.', 'He said "Hello"', '42.5']);
});

test('csvToJson converts CSV with automatic number and boolean coercion', () => {
  const csv = 'id,name,active,score\n1,Ada,true,98.5\n2,Grace,false,100';
  const res = csvToJson(csv);
  assert.equal(res.length, 2);
  assert.deepEqual(res[0], { id: 1, name: 'Ada', active: true, score: 98.5 });
  assert.deepEqual(res[1], { id: 2, name: 'Grace', active: false, score: 100 });
});

test('jsonToCsv flattens nested objects and quotes commas', () => {
  const data = [
    { id: 1, user: { name: 'Linus, T.' }, role: 'Kernel' },
    { id: 2, user: { name: 'Ken' }, role: 'Unix' },
  ];
  const csv = jsonToCsv(data);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'id,user.name,role');
  assert.equal(lines[1], '1,"Linus, T.",Kernel');
  assert.equal(lines[2], '2,Ken,Unix');
});

test('jsonToSqlInsert builds valid SQL INSERT statements', () => {
  const data = [{ id: 1, name: "O'Reilly", active: true }];
  const sql = jsonToSqlInsert(data, 'users');
  assert.ok(sql.includes('INSERT INTO users (id, name, active)'));
  assert.ok(sql.includes("(1, 'O''Reilly', TRUE)"));
});

test('sortObjectKeys recursively sorts keys alphabetically', () => {
  const input = { z: 1, a: { d: 4, b: 2 } };
  const sorted = sortObjectKeys(input) as Record<string, unknown>;
  assert.deepEqual(Object.keys(sorted), ['a', 'z']);
  assert.deepEqual(Object.keys(sorted.a as Record<string, unknown>), ['b', 'd']);
});

test('computeJsonDepth and countJsonKeys calculate accurate structure metrics', () => {
  const sample = { a: 1, b: { c: [1, 2, { d: 3 }] } };
  assert.equal(computeJsonDepth(sample), 4);
  assert.equal(countJsonKeys(sample), 4);
});
