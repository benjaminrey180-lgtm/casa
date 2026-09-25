import test from 'node:test';import assert from 'node:assert/strict';
import {allowedOrigin,allowedHost} from '../security.mjs';
const tunnel='https://abc.a.free.pinggy.net';
test('Origen: hosts locales exactos y solo el PUBLIC_ORIGIN configurado',()=>{
 for(const ok of ['http://localhost:4310','http://127.0.0.1:4310'])assert.ok(allowedOrigin(ok,undefined),ok);
 assert.ok(allowedOrigin(tunnel,tunnel));assert.ok(allowedOrigin(tunnel,tunnel+'/'));
 for(const bad of ['http://localhost.atacante.com','http://127.0.0.1.atacante.com','https://atacante.com/?localhost','https://evil.a.free.pinggy.net','http://abc.a.free.pinggy.net','null','no es url',undefined])assert.ok(!allowedOrigin(bad,tunnel),String(bad));
 assert.ok(!allowedOrigin(tunnel,undefined),'sin PUBLIC_ORIGIN no se acepta el túnel');
});
test('Host: frena DNS rebinding',()=>{
 for(const ok of ['127.0.0.1:4310','localhost:4310','localhost'])assert.ok(allowedHost(ok,undefined),ok);
 assert.ok(allowedHost('abc.a.free.pinggy.net',tunnel));
 for(const bad of ['rebind.atacante.com','evil.a.free.pinggy.net','',undefined])assert.ok(!allowedHost(bad,tunnel),String(bad));
});
