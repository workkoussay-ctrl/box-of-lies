const socket = io();
let myRole = '';
let playerName = '';
let roomCode = '';
let myBox = null;
let myId = null;
let buzzerCtx = null;

// ===== SON BUZZER =====
function playBuzzerSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!buzzerCtx) buzzerCtx = new AudioContext();
    if (buzzerCtx.state === 'suspended') buzzerCtx.resume();

    const now = buzzerCtx.currentTime;
    const osc = buzzerCtx.createOscillator();
    const gain = buzzerCtx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(1000, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.12);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    osc.connect(gain);
    gain.connect(buzzerCtx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  } catch (e) {}
}

// ===== ROLE SELECT =====
function selectRole(role) {
  myRole = role;
  document.getElementById('splash').classList.remove('active');
  if (role === 'host') {
    document.getElementById('hostScreen').classList.add('active');
    socket.emit('createRoom');
  } else {
    document.getElementById('joinScreen').classList.add('active');
  }
}

socket.on('connect', () => { myId = socket.id; });

socket.on('roomCreated', (code) => {
  roomCode = code;
  document.getElementById('hostRoomCode').textContent = code;
});

// ===== JOIN ROOM =====
function joinRoom() {
  playerName = document.getElementById('playerName').value.trim();
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!playerName || !code) { showError('املأ كل الحقول!'); return; }
  socket.emit('joinRoom', { roomCode: code, playerName });
  roomCode = code;
}

socket.on('joinError', (msg) => { showError(msg); });

// ===== LOBBY =====
socket.on('updateLobby', (data) => {
  if (myRole === 'host') { renderLobby(data); }
  if (myRole === 'player') {
    document.getElementById('joinScreen').classList.remove('active');
    document.getElementById('gameScreen').classList.add('active');
    document.getElementById('gameContent').innerHTML = `
      <div class="glass-card">
        <h3>⏳ في انتظار اللاعبين...</h3>
        <p style="font-size:2em; margin-top:10px;">${data.playerCount}/3</p>
      </div>
    `;
  }
});

function renderLobby(data) {
  const grid = document.getElementById('lobbyPlayers');
  const slots = [0, 1, 2];
  grid.innerHTML = slots.map((i) => {
    const player = data.players[i];
    return `<div class="player-card ${player ? 'filled' : ''}">
      ${player ? '🎮 ' + player.name : '⭕ فارغ'}
    </div>`;
  }).join('');

  const startBtn = document.getElementById('startBtn');
  if (data.playerCount >= 2) { startBtn.classList.remove('hidden'); }
  else { startBtn.classList.add('hidden'); }
}

// ===== HOST CONFIGURE BOXES =====
function submitBoxes() {
  if (myRole !== 'host') return;
  const grandLabel = document.getElementById('grandLabel').value;
  const forfeit1Label = document.getElementById('forfeit1Label').value;
  const forfeit2Label = document.getElementById('forfeit2Label').value;
  socket.emit('setBoxes', { roomCode, grandLabel, forfeit1Label, forfeit2Label });
}

socket.on('boxesReady', () => {
  const setup = document.getElementById('boxSetup');
  if (setup) {
    setup.innerHTML = `<h3 style="color:#43e97b;">✅ تم تجهيز الصناديق!</h3>`;
  }
});

// ===== START GAME =====
function startGame() { socket.emit('startGame', roomCode); }

socket.on('gameStarted', () => {
  if (myRole === 'host') { document.getElementById('hostScreen').classList.remove('active'); }
  document.getElementById('gameScreen').classList.add('active');
});

// ===== REVEAL BOX (Players) =====
socket.on('revealBox', (data) => {
  myBox = data.content.label;
  const boxType = data.content.type;
  let boxClass = boxType === 'grand' ? 'box-grand' : 'box-forfeit';

  document.getElementById('gameContent').innerHTML = `
    <div class="glass-card box-reveal">
      <h3>🎁 صندوقك السري!</h3>
      <div class="box-content ${boxClass}">${data.content.label}</div>
      <p style="opacity:0.7;">🤫 لا تخبر أحداً!</p>
    </div>
  `;
});

// ===== HOST VIEW =====
socket.on('hostView', (data) => {
  document.getElementById('gameContent').innerHTML = `
    <div class="glass-card">
      <h3>👑 صناديق اللاعبين</h3>
      ${data.players.map(p => `
        <div class="player-card filled" style="margin:10px auto; max-width:300px">
          ${p.name}: <strong>${p.box.label}</strong>
        </div>
      `).join('')}
      <button class="btn btn-start" onclick="nextRound()" style="margin-top:20px">⏭ ابدأ الجولة</button>
    </div>
  `;
});

function nextRound() { socket.emit('nextRound', roomCode); }

// ===== CHALLENGE =====
socket.on('challenge', (data) => {
  document.body.className = 'bg-' + data.type;
  document.getElementById('roundBadge').innerHTML = `<span class="glass-card" style="padding:5px 15px;">🏆 الجولة ${data.round}/${data.totalRounds}</span>`;

  const names = { capitals: '🌍 عواصم الدول', cardGame: '🃏 لعبة ورق', rapidFire: '⚡ أسئلة سريعة 🇹🇳', guessWho: '🕵️ من هو؟' };
  const content = document.getElementById('gameContent');

  if (myRole === 'host') {
    content.innerHTML = `
      <div class="glass-card">
        <h2 class="challenge-title">${names[data.type]}</h2>
        ${data.type === 'rapidFire' ?
          `<div id="hostQuiz">
             <button class="btn btn-host" onclick="startQuiz()">🚀 ابدأ الأسئلة</button>
           </div>` : `<p>العبوا التحدي!</p>`}
        <hr style="margin:20px 0; opacity:0.2">
        <h3>اختر الفائز بالجولة:</h3>
        <div id="winnerButtons" style="display:flex; flex-direction:column; gap:10px; margin-top:15px"></div>
      </div>
    `;
    socket.emit('getPlayersForWinner', roomCode);
  } else {
    if (data.type === 'rapidFire') {
      content.innerHTML = `<div class="glass-card"><h2 class="challenge-title">⚡ استعد!</h2><div id="buzzerArea"><p>انتظر المضيف...</p></div></div>`;
    } else {
      content.innerHTML = `<div class="glass-card"><h2>${names[data.type]}</h2><p>العب مع أصدقائك!</p></div>`;
    }
  }
});

// Winner selection
socket.on('playersForWinner', (data) => {
  const div = document.getElementById('winnerButtons');
  if (div) {
    div.innerHTML = data.players.map(p => `<button class="btn" onclick="pickWinner('${p.id}')">${p.name}</button>`).join('');
  }
});
function pickWinner(winnerId) { socket.emit('challengeWinner', { roomCode, winnerId }); }

// ===== RAPID FIRE =====
function startQuiz() { socket.emit('startRapidFire', roomCode); }
function goNextQuestion() { socket.emit('nextQuestion', roomCode); }

socket.on('newQuestion', (data) => {
  const box = document.getElementById('hostQuiz');
  if (box) {
    box.innerHTML = `
      <div style="background:rgba(0,0,0,0.4); padding:15px; border-radius:15px; margin-bottom:15px;">
        <p>السؤال ${data.current}/10</p>
        <p style="font-size:1.2em; font-weight:bold; margin:10px 0;">❓ ${data.q}</p>
        <p style="color:#43e97b;">✅ الجواب: ${data.a}</p>
      </div>
      <div id="liveBuzz" style="color:#feca57; font-size:1.4em; font-weight:bold; min-height:40px;">⏳ انتظر البَزّ...</div>
      <button class="btn btn-host" onclick="goNextQuestion()">▶️ السؤال التالي</button>
    `;
  }
});

socket.on('buzzerActive', () => {
  const area = document.getElementById('buzzerArea');
  if (area) { area.innerHTML = `<p>🔥 اضغط بسرعة!</p><div class="buzzer-btn" onclick="sendBuzz()">BUZZ!</div>`; }
});

function sendBuzz() {
  playBuzzerSound();
  socket.emit('buzz', { roomCode, playerName });
}

socket.on('buzzWinner', (data) => {
  playBuzzerSound();
  const lb = document.getElementById('liveBuzz');
  if (lb) lb.innerHTML = `🥇 ${data.playerName} ضغط أولاً!`;
  const area = document.getElementById('buzzerArea');
  if (area) area.innerHTML = `<div style="padding:20px; background:rgba(67,233,123,0.2); border-radius:15px;"><h2>🥇 ${data.playerName}</h2><p>أجاب أولاً!</p></div>`;
});

socket.on('quizFinished', () => {
  const hq = document.getElementById('hostQuiz');
  if (hq) hq.innerHTML = `<h2>🏁 انتهت الأسئلة!</h2><p>اختر الفائز الآن من الأسفل</p>`;
});

// ===== SWAP =====
socket.on('swapPhase', (data) => {
  const content = document.getElementById('gameContent');
  if (myRole === 'host') {
    content.innerHTML = `<div class="glass-card"><h3>🔄 ${data.winnerName} فاز!</h3><p>ينتظر قراره...</p></div>`;
  } else if (myId === data.winnerId) {
    content.innerHTML = `<div class="glass-card"><h3>🎉 أنت الفائز!</h3><p>صندوقك الحالي: ${myBox}</p><div id="swapArea"></div></div>`;
  } else {
    content.innerHTML = `<div class="glass-card"><h3>⏳ ${data.winnerName} فاز</h3><p>يقرر الآن...</p></div>`;
  }
});

socket.on('playersToSwap', (data) => {
  const area = document.getElementById('swapArea');
  if (area) {
    area.innerHTML = `<div class="swap-options">
      <div class="swap-choice" onclick="keepBox()" style="border-color:#43e97b">🛑 أحتفظ بصندوقي</div>
      ${data.players.map(p => `<div class="swap-choice" onclick="swapWith('${p.id}')">🔄 بدّل مع ${p.name}</div>`).join('')}
    </div>`;
  }
});

function keepBox() { socket.emit('swapChoice', { roomCode, winnerId: myId, keep: true }); }
function swapWith(targetId) { socket.emit('swapChoice', { roomCode, winnerId: myId, targetId, keep: false }); }

socket.on('swapResult', (data) => {
  document.getElementById('gameContent').innerHTML = `
    <div class="glass-card">
      <h3>${data.winnerName}</h3>
      <p style="font-size:1.3em">${data.swapped ? '🔄 بدّل الصندوق!' : '🛑 احتفظ بصندوقه'}</p>
    </div>
    ${myRole === 'host' ? `<button class="btn btn-start" onclick="nextRound()">⏭ الجولة التالية</button>` : `<p>⏳ انتظر المضيف...</p>`}
  `;
});

// ===== FINAL =====
socket.on('finalReveal', (data) => {
  document.getElementById('roundBadge').innerHTML = '🏁 النهاية!';
  document.getElementById('gameContent').innerHTML = `
    <div class="glass-card">
      <h2 style="margin-bottom:20px">🎉 النتائج النهائية!</h2>
      ${data.players.map(p => {
        const isWinner = p.box.type === 'grand';
        return `<div class="final-card ${isWinner ? 'winner-glow' : ''}"><strong>${p.name}</strong><br>${p.box.label}${isWinner ? '<br>👑 الفائز!' : ''}</div>`;
      }).join('')}
      <button class="btn btn-host" onclick="location.reload()">🔄 لعبة جديدة</button>
    </div>
  `;
});

socket.on('hostLeft', () => {
  document.getElementById('gameContent').innerHTML = `
    <div class="glass-card"><h2>😢 المضيف غادر</h2>
    <button class="btn" onclick="location.reload()">🔄 رجوع</button></div>
  `;
});

function showError(msg) {
  const el = document.getElementById('errorMsg');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 3000); }
}

console.log('🎁 Game ready!');
