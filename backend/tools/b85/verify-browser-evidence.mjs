import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const r=JSON.parse(await readFile('.work/b85/browser-result.json','utf8'));
const checks={
 realEdge:r.browser==='Microsoft Edge headless (real Chromium)',
 loginUi:r.loginUi===true,
 authenticatedBrowser:r.login===true,
 demonstrationBanner:r.syntheticBanner===true,
 fiveBiomes:r.fiveBiomes===true,
 renderedCharts:r.charts>15,
 queriesThroughBrowser:r.cardQueries>=15,
 noUnexpectedHttpErrors:r.errors.every(e=>e.status===401&&e.path==='/api/user/current'),
 noExternalPageRequests:r.blockedExternalHosts.length===0,
 environmentalDecisions:['approve','reject','healthy','degraded'].every(s=>r.renderedText.includes(s)),
 endings:['good','medium','bad'].every(s=>r.renderedText.includes(s)),
 timeAndUtc:r.renderedText.includes('10.22')&&r.renderedText.includes('UTC'),
};
for(const [name,pass] of Object.entries(checks))assert.ok(pass,name);
await writeFile('.work/b85/browser-validation.json',JSON.stringify({passed:Object.keys(checks).length,checks,date:new Date().toISOString()},null,2));
console.log(JSON.stringify({browserEvidence:'PASS',checks:Object.keys(checks).length}));
