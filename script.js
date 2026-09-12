/* GDLE - Geometry Dash guessing game
   Data sources:
   - GDBrowser community API for level metadata/search.
   - Pointercrate API for the ranked Demon List.

   IMAGE API:
   The optional image endpoint below is deliberately isolated so it can be
   replaced if its public format changes. If it fails, GDLE creates a clean
   metadata card automatically instead of breaking the game.
*/
const GDBROWSER='https://gdbrowser.com/api';
const POINTERCRATE='https://pointercrate.com/api/v2/demons/listed/';
const IMAGE_API='https://gd-level-api.liamt.xyz';

const fallbackLevels=[
 {id:'128',name:'1st level',author:'real storm'},
 {id:'10565798',name:'Bloodbath',author:'Riot'},
 {id:'4284013',name:'Nine Circles',author:'Zobros'},
 {id:'11261085',name:'Slaughterhouse',author:'icedcave'}
];
let currentMode='name', currentTime=15, currentLevel=null, timerId=null, endAt=0, score=0, roundDone=false;
let demonCache=[];

const $=id=>document.getElementById(id);
function showSection(id){document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));$(id)?.classList.add('active');window.scrollTo({top:0,behavior:'smooth'});}

document.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>showSection(b.dataset.section));
document.querySelectorAll('.mode-card').forEach(b=>b.onclick=()=>{if(b.dataset.daily) startDaily(currentMode);else {currentMode=b.dataset.mode;prepareGame();}});
document.querySelectorAll('.time-buttons button').forEach(b=>b.onclick=()=>setTime(+b.dataset.time));
$('timeSlider').oninput=e=>setTime(+e.target.value);
$('startBtn').onclick=startGame;
$('submitBtn').onclick=submitAnswer;
$('nextBtn').onclick=startGame;
$('answer').addEventListener('keydown',e=>{if(e.key==='Enter')submitAnswer()});
$('percent').addEventListener('keydown',e=>{if(e.key==='Enter')submitAnswer()});
document.querySelectorAll('.daily-mode').forEach(b=>b.onclick=()=>{currentMode=b.dataset.dailyMode;startDaily(currentMode)});

function setTime(v){currentTime=v;$('timeValue').textContent=v;$('timeSlider').value=v}
function prepareGame(){showSection('play');$('setupPanel').classList.remove('hidden');$('gamePanel').classList.add('hidden');const titles={name:['Guess the Level','Identify the level from its image.'],namePercent:['Level + Percentage','Guess the level and the progress shown.'],position:['Extreme Position','Guess the current Pointercrate position.']};$('setupTitle').textContent=titles[currentMode][0];$('setupDescription').textContent=titles[currentMode][1]+' Choose your time limit.'}

async function getLevel(id){const r=await fetch(`${GDBROWSER}/level/${encodeURIComponent(id)}`);if(!r.ok)throw new Error('GDBrowser error');return r.json()}
async function searchLevels(q){const r=await fetch(`${GDBROWSER}/search/${encodeURIComponent(q)}`);if(!r.ok)throw new Error('Search error');return r.json()}

async function getRandomLevel(){
  // Search-based randomization is used because the GD servers do not expose a
  // simple "give me one random level" endpoint. Several broad searches are
  // sampled, then one result is selected locally.
  const queries=['the','a','i','gd','level','x','y'];
  try{
    const q=queries[Math.floor(Math.random()*queries.length)];
    const data=await searchLevels(q);
    const arr=Array.isArray(data)?data:(data?.levels||data?.data||[]);
    if(arr.length){return arr[Math.floor(Math.random()*arr.length)]}
  }catch(e){}
  return fallbackLevels[Math.floor(Math.random()*fallbackLevels.length)];
}

function normalize(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'')}
function levenshtein(a,b){a=normalize(a);b=normalize(b);const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++){for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1))}}return d[a.length][b.length]}
function nameCorrect(input,answer){const a=normalize(input),b=normalize(answer);if(!a)return false;return a===b || (a.length>=5 && (b.includes(a)||a.includes(b))) || levenshtein(a,b)<=Math.max(1,Math.floor(b.length*.12))}

async function imageFor(level){
  // Public card endpoint used by the 2026 GD Level API project. If its route
  // changes or is unavailable, the fallback card below is generated locally.
  const id=level.id;
  const candidates=[`${IMAGE_API}/level/${id}/card.png`,`${IMAGE_API}/levels/${id}/card.png`,`${IMAGE_API}/card/${id}.png`];
  for(const url of candidates){if(await testImage(url))return url}
  return makeFallbackCard(level);
}
function testImage(url){return new Promise(resolve=>{const im=new Image();let done=false;const finish=v=>{if(done)return;done=true;resolve(v)};im.onload=()=>finish(im.naturalWidth>100);im.onerror=()=>finish(false);im.src=url+'?v='+Date.now()})}
function makeFallbackCard(level){const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const c=canvas.getContext('2d');let h=0;for(const ch of String(level.id||level.name))h=(h*31+ch.charCodeAt(0))>>>0;const hue=h%360;const g=c.createLinearGradient(0,0,1280,720);g.addColorStop(0,`hsl(${hue},70%,18%)`);g.addColorStop(1,`hsl(${(hue+80)%360},70%,8%)`);c.fillStyle=g;c.fillRect(0,0,1280,720);c.fillStyle='rgba(255,255,255,.07)';for(let i=0;i<16;i++){c.beginPath();c.arc((h>>i)%1280,(h*13+i*71)%720,80+i*11,0,Math.PI*2);c.fill()}c.fillStyle='#fff';c.font='900 58px system-ui';c.fillText('MYSTERY LEVEL',70,100);c.font='700 36px system-ui';c.fillStyle='rgba(255,255,255,.7)';c.fillText('GDLE • image fallback',70,155);return canvas.toDataURL('image/jpeg',.85)}

async function startGame(){
  clearInterval(timerId);roundDone=false;$('feedback').textContent='';$('feedback').className='feedback';$('nextBtn').classList.add('hidden');$('submitBtn').disabled=false;$('answer').value='';$('percent').value='';
  $('setupPanel').classList.add('hidden');$('gamePanel').classList.remove('hidden');$('modeLabel').textContent=currentMode==='name'?'GUESS THE LEVEL':currentMode==='namePercent'?'LEVEL + PERCENTAGE':'EXTREME POSITION';$('questionText').textContent=currentMode==='position'?'What is this level\'s current Demon List position?':'What level is this?';
  $('answer').classList.toggle('hidden',false);$('percent').classList.toggle('hidden',currentMode!=='namePercent');$('answer').placeholder=currentMode==='position'?'Level name...':'Level name...';
  try{currentLevel=await getRandomLevel();if(currentMode==='position'){currentLevel=await getRandomExtreme()}const full=await getLevel(currentLevel.id||currentLevel.levelID||currentLevel.id);currentLevel={...currentLevel,...full};$('levelImage').src=await imageFor(currentLevel);if(currentMode==='position')$('questionText').textContent="What is this level's current Demon List position?";startTimer()}catch(e){$('feedback').textContent='Could not load a level. Try again.';$('feedback').className='feedback bad';}
}
async function getRandomExtreme(){
  if(!demonCache.length){const r=await fetch(POINTERCRATE);const data=await r.json();demonCache=Array.isArray(data)?data:(data?.data||[])}
  const d=demonCache[Math.floor(Math.random()*demonCache.length)];return {id:d.id,name:d.name,position:d.position,author:d.publisher||d.creator||''}
}
function startTimer(){endAt=performance.now()+currentTime*1000;updateTimer();timerId=setInterval(updateTimer,50)}
function updateTimer(){const left=Math.max(0,endAt-performance.now());$('timer').textContent=(left/1000).toFixed(1);$('timerBar').style.width=(left/(currentTime*1000)*100)+'%';if(left<=0){clearInterval(timerId);finishRound(false,'Time\'s up!')}}
function finishRound(correct,msg){if(roundDone)return;roundDone=true;clearInterval(timerId);$('submitBtn').disabled=true;$('nextBtn').classList.remove('hidden');$('feedback').textContent=msg;$('feedback').className='feedback '+(correct?'ok':'bad');$('scoreLine').textContent=`Score: ${score}`}
function submitAnswer(){if(roundDone||!currentLevel)return;const nameOk=nameCorrect($('answer').value,currentLevel.name);let correct=nameOk;let details='';if(currentMode==='namePercent'){const p=Number($('percent').value);const target=Number(currentLevel.percent??currentLevel.progress??currentLevel.bestPercent??randomPercent(currentLevel.id));const pOk=Number.isFinite(p)&&Math.abs(p-target)<=2;correct=nameOk&&pOk;details=`Correct: ${currentLevel.name} • ${target}%`;}else if(currentMode==='position'){const guessed=Number($('percent').value||$('answer').value);correct=Number.isFinite(guessed)&&guessed===Number(currentLevel.position);details=`Correct: #${currentLevel.position} — ${currentLevel.name}`;}else details=`Correct: ${currentLevel.name}`;if(correct){score+=1;finishRound(true,'✓ Correct! '+details)}else finishRound(false,'✕ '+details)}
function randomPercent(seed){let n=0;for(const c of String(seed))n=(n*33+c.charCodeAt(0))%101;return Math.max(1,n)}

async function startDaily(mode){currentMode=mode;prepareGame();await startGame();}
function dailySeed(){const d=new Date();return `${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`}

async function loadDemonList(){const el=$('demonList');el.innerHTML='<small>Loading…</small>';try{const r=await fetch(POINTERCRATE);const data=await r.json();demonCache=Array.isArray(data)?data:(data?.data||[]);el.innerHTML=demonCache.slice(0,150).map((d,i)=>`<div class="list-item"><span><b>#${d.position||i+1} — ${escapeHtml(d.name)}</b><br><small>${escapeHtml(d.publisher||d.creator||'')}</small></span><small>${escapeHtml(String(d.verifier||''))}</small></div>`).join('')}catch(e){el.innerHTML='<small>Could not load Pointercrate right now.</small>'}}
async function loadExtremes(){const el=$('extremeList');el.innerHTML='<small>Loading…</small>';try{const q=$('extremeSearch').value.trim()||'demon';const data=await searchLevels(q);const arr=Array.isArray(data)?data:(data?.levels||data?.data||[]);el.innerHTML=arr.filter(x=>String(x.difficulty||'').toLowerCase().includes('extreme')||x.demonList).slice(0,100).map(x=>`<div class="list-item"><span><b>${escapeHtml(x.name||'Unknown')}</b><br><small>${escapeHtml(x.author||x.creator||'')}</small></span><small>${x.demonList?'#'+x.demonList:'Extreme Demon'}</small></div>`).join('')||'<small>No results. Try a different search.</small>'}catch(e){el.innerHTML='<small>Could not load extreme demons.</small>'}}
async function loadAllLevels(){const el=$('allLevelList');el.innerHTML='<small>Loading…</small>';const q=$('levelSearch').value.trim()||'level';try{const data=await searchLevels(q);const arr=Array.isArray(data)?data:(data?.levels||data?.data||[]);el.innerHTML=arr.slice(0,100).map(x=>`<div class="list-item"><span><b>${escapeHtml(x.name||'Unknown')}</b><br><small>ID ${escapeHtml(String(x.id||x.levelID||''))} • ${escapeHtml(x.author||x.creator||'')}</small></span><small>${escapeHtml(x.difficulty||'')}</small></div>`).join('')||'<small>No results.</small>'}catch(e){el.innerHTML='<small>Could not search levels.</small>'}}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

$('loadExtremes').onclick=loadExtremes;$('searchLevels').onclick=loadAllLevels;
$('dailyDate').textContent=`Daily seed: ${dailySeed()} • resets at 00:00 UTC`;
loadDemonList();
