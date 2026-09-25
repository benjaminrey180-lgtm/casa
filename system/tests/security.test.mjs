import test from 'node:test';import assert from 'node:assert/strict';
import {allowedOrigin} from '../security.mjs';
test('Origen: solo hosts locales exactos y túnel pinggy HTTPS',()=>{
 for(const ok of ['http://localhost:4310','http://127.0.0.1:4310','https://abc.a.free.pinggy.net'])assert.ok(allowedOrigin(ok),ok);
 for(const bad of ['http://localhost.atacante.com','http://127.0.0.1.atacante.com','https://atacante.com/?localhost','http://abc.pinggy.net','https://pinggy.net.atacante.com','null','no es url'])assert.ok(!allowedOrigin(bad),bad);
});
