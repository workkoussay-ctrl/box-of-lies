const socket = io();
let myRole = '';
let playerName = '';
let roomCode = '';
let myBox = null;
let myId = null;

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

// ===== ROOM CREATED =====
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
  if (myRole === 'host') {
    renderLobby(data);
  }
  if (myRole === 'player') {
    document.getElementById('joinScreen').classList.remove('active');
    document.getElementById('gameScreen').classList.add('active');
    document.getElementById('gameContent').innerHTML = `
      <h3>⏳ في انتظار اللاعبين...</h3>
      <p style="font-size:1.5em">${data.playerCount}/3</p>
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
  if (data.playerCount >= 2) {
    startBtn.classList.remove('hidden');
  } else {
    startBtn.classList.add('hidden');
  }
}

// ===== START GAME =====
function startGame() {
  socket.emit('startGame', roomCode);
}

socket.on('gameStarted', () => {
  if (myRole === 'host') {
    document.getElementById('hostScreen').classList.remove('active');
  }
  document.getElementById('gameScreen').classList.add('active');
});

// ===== REVEAL BOX (Players) =====
socket.on('revealBox', (data) => {
  myBox = data.content;
  let boxClass = 'box-prize';
  if (data.content.includes('$10,000')) boxClass = 'box-grand';
  if (data.content.includes('Forfeit')) boxClass = 'box-forfeit';
  
  document.getElementById('gameContent').innerHTML = `
    <div class="box-reveal">
      <h3>🎁 صندوقك السري!</h3>
      <div class="box-content ${boxClass}">${data.content}</div>
      <p style="margin-top:10px; opacity:0.7;">🤫 لا تخبر أحداً!</p>
    </div>
    <p style="opacity:0.6">⏳ انتظر المضيف...</p>
  `;
});

// ===== HOST VIEW =====
socket.on('hostView', (data) => {
  document.getElementById('gameContent').innerHTML = `
    <h3>👑 صناديق اللاعبين</h3>
    ${data.players.map(p => `
      <div class="player-card filled" style="margin:8px auto; max-width:300px">
        ${p.name}: <strong>${p.box}</strong>
      </div>
    `).join('')}
    <button class="btn btn-start" onclick="nextRound()" style="margin-top:20px">
      ⏭ ابدأ الجولة الأولى
    </button>
  `;
});

// ===== NEXT ROUND =====
function nextRound() {
  socket.emit('nextRound', roomCode);
}

// ===== CHALLENGE =====
// ===== CHALLENGE (Look Premium) =====
socket.on('challenge', (data) => {
  // On change le background du body selon le type
  document.body.className = ''; // Reset
  document.body.classList.add('bg-' + data.type); // Ajoute la classe capitals, rapidFire, etc.

  document.getElementById('roundBadge').innerHTML = 
    `<span class="glass-card" style="padding: 5px 15px;">🏆 الجولة ${data.round}/${data.totalRounds}</span>`;
  
  const names = {
    capitals: '🌍 عواصم الدول',
    cardGame: '🃏 لعبة ورق',
    rapidFire: '⚡ أسئلة سريعة 🇹🇳',
    guessWho: '🕵️ من هو؟'
  };
  
  const content = document.getElementById('gameContent');
  
  if (myRole === 'host') {
    content.innerHTML = `
      <div class="glass-card">
        <h2 class="challenge-title">${names[data.type]}</h2>
        <p>العبوا التحدي الآن!</p>
        <div style="margin-top:30px">
          <h3>من هو الفائز؟</h3>
          <div id="winnerButtons" style="display:flex; flex-direction:column; gap:10px; margin-top:15px"></div>
        </div>
      </div>
    `;
    socket.emit('getPlayersForWinner', roomCode);
  } else {
    // Si c'est le Rapid Fire, on affiche un Gros Buzzer !
    if (data.type === 'rapidFire') {
       content.innerHTML = `
        <div class="glass-card">
          <h2 class="challenge-title">⚡ RAPID FIRE!</h2>
          <p>أسرع واحد يضغط على الزر!</p>
          <div class="buzzer-btn" onclick="this.style.transform='scale(0.8)'; setTimeout(()=>this.style.transform='scale(1)', 100)"></div>
          <p style="opacity:0.6">انتظر المضيف ليعلن النتيجة</p>
        </div>
      `;
    } else {
      content.innerHTML = `
        <div class="glass-card">
          <h2 class="challenge-title">${names[data.type]}</h2>
          <div class="timer-circle">...</div>
          <p style="margin-top:20px">🎮 استعد للتحدي مع أصدقائك!</p>
        </div>
      `;
    }
  }
});

// Host gets player buttons to pick winner
socket.on('playersForWinner', (data) => {
  const div = document.getElementById('winnerButtons');
  if (div) {
    div.innerHTML = data.players.map(p => `
      <button class="btn" onclick="pickWinner('${p.id}')">${p.name}</button>
    `).join('');
  }
});

function pickWinner(winnerId) {
  socket.emit('challengeWinner', { roomCode, winnerId });
}

// ===== SWAP PHASE =====
socket.on('swapPhase', (data) => {
  if (myRole === 'host') {
    document.getElementById('gameContent').innerHTML = `
      <div class="box-reveal">
        <h3>🔄 ${data.winnerName} فاز!</h3>
        <p>ينتظر قراره...</p>
      </div>
    `;
  } else if (myId === data.winnerId) {
    // Winner sees swap options (added below)
    document.getElementById('gameContent').innerHTML = `
      <div class="box-reveal">
        <h3>🎉 أنت الفائز!</h3>
        <p>صندوقك: ${myBox}</p>
      </div>
      <div id="swapArea"></div>
    `;
  } else {
    document.getElementById('gameContent').innerHTML = `
      <div class="box-reveal">
        <h3>⏳ ${data.winnerName} فاز</h3>
        <p>ينتظر قراره...</p>
      </div>
    `;
  }
});

// Winner gets swap choices
socket.on('playersToSwap', (data) => {
  const area = document.getElementById('swapArea');
  if (area) {
    area.innerHTML = `
      <div class="swap-options">
        <div class="swap-choice" onclick="keepBox()" style="border-color:#43e97b">
          🛑 أحتفظ بصندوقي
        </div>
        ${data.players.map(p => `
          <div class="swap-choice" onclick="swapWith('${p.id}')">
            🔄 بدّل مع ${p.name}
          </div>
        `).join('')}
      </div>
    `;
  }
});

function keepBox() {
  socket.emit('swapChoice', { roomCode, winnerId: myId, keep: true });
}

function swapWith(targetId) {
  socket.emit('swapChoice', { roomCode, winnerId: myId, targetId, keep: false });
}

// ===== SWAP RESULT =====
socket.on('swapResult', (data) => {
  document.getElementById('gameContent').innerHTML = `
    <div class="box-reveal">
      <h3>${data.winnerName}</h3>
      <p style="font-size:1.3em">${data.swapped ? '🔄 بدّل الصندوق!' : '🛑 احتفظ بصندوقه'}</p>
    </div>
    ${myRole === 'host' ? 
      '<button class="btn btn-start" onclick="nextRound()">⏭ الجولة التالية</button>' 
      : '<p style="opacity:0.6">⏳ انتظر المضيف...</p>'}
  `;
});

// ===== FINAL =====
socket.on('finalReveal', (data) => {
  document.getElementById('roundBadge').innerHTML = '🏁 النهاية!';
  document.getElementById('gameContent').innerHTML = `
    <h2 style="margin:20px 0">🎉 النتائج النهائية!</h2>
    ${data.players.map(p => {
      const isWinner = p.box.includes('$10,000');
      return `
        <div class="final-card ${isWinner ? 'box-grand winner-glow' : ''}">
          <strong>${p.name}</strong>
          <p style="font-size:1.3em; margin-top:5px">${p.box}</p>
          ${isWinner ? '<p style="font-size:1.4em">👑 الفائز!</p>' : ''}
        </div>
      `;
    }).join('')}
    <button class="btn btn-host" onclick="location.reload()">🔄 لعبة جديدة</button>
  `;
});

socket.on('hostLeft', () => {
  document.getElementById('gameContent').innerHTML = `
    <h2>😢 المضيف غادر</h2>
    <button class="btn" onclick="location.reload()">🔄 رجوع</button>
  `;
});

function showError(msg) {
  const el = document.getElementById('errorMsg');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
  }
}

console.log('🎁 Game ready!');
