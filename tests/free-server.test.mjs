import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

test('free preview serves local assets and has no assistant API or private-file access', async () => {
  const port = 19000 + process.pid % 10000;
  const server = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: new URL('../', import.meta.url), env: {...process.env, STUDYFLOW_PORT:String(port)}, stdio:['ignore','pipe','pipe'],
  });
  try {
    await new Promise((resolve,reject) => {
      const timer=setTimeout(()=>reject(new Error('Preview did not start')),5000);
      server.stdout.once('data',()=>{clearTimeout(timer);resolve();});
      server.once('error',e=>{clearTimeout(timer);reject(e);});
      server.once('exit',code=>{clearTimeout(timer);reject(new Error(`Preview exited ${code}`));});
    });
    const url=`http://127.0.0.1:${port}`;
    assert.equal((await fetch(url)).status,200);
    assert.equal((await fetch(url+'/src/studyflow/planner.mjs')).status,200);
    for(const path of ['/api/assistant','/.git/config','/ai-key.txt','/scripts/assistant.mjs']) {
      assert.equal((await fetch(url+path)).status,404,path);
    }
    assert.equal((await fetch(url+'/api/assistant',{method:'POST',body:'null'})).status,405);
  } finally { server.kill(); }
});
