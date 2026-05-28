const socket = io();
let myRole = '';
let playerName = '';
let roomCode = '';
let myBox = null;
let roundNumber = 0;

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

// ===== ROOM CREATED =====
socket.on('roomCreated', (code) => {
  roomCode = code;
  document.getElementById('hostRoomCode').textContent = code;
});

// ===== JOIN ROOM =====
function joinRoom() {
  playerName = document.getElementById('playerName').value.trim();
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  
  if (!playerName || !code) {
    showError('املأ كل الحقول!');
    return;
  }
  
  socket.emit('joinRoom', { roomCode: code, playerName });
}

socket.on('joinError', (msg) => {
  showError(msg);
});

// ===== LOBBY UPDATE =====
socket.on('updateLobby', (data) => {
  if (myRole === 'host') {
    renderLobby(data);
  }
  
  if (myRole === 'player' && data.playerCount >= 1) {
    document.getElementById('joinScreen').classList.remove('active');
    document.getElementById('gameScreen').classList.add('active');
    document.getElementById('gameContent').innerHTML = `
      <h3>⏳ في انتظار اللاعبين...</h3>
      <p>${data.playerCount}/4</p>
    `;
  }
});

function renderLobby(data) {
  const grid = document.getElementById('lobbyPlayers');
  const playerSlots = [0, 1, 2, 3];
  
  grid.innerHTML = playerSlots.map((i) => {
    const player = data.players[i];
    return `<div class="player-card ${player ? 'filled' : ''}">
      ${player ? '🎮 ' + player.name : '⭕ فارغ'}
    </div>`;
  }).join('');
  
  // Show start button when 3-4 players
  const startBtn = document.getElementById('startBtn');
  if (data.playerCount >= 3) {
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
  document.getElementById('gameContent').innerHTML = '<h3>🎮 اللعبة بدأت!</h3>';
});

// ===== REVEAL BOX =====
socket.on('revealBox', (data) => {
  myBox = data.content;
  let boxClass = 'box-prize';
  if (data.content.includes('$10,000')) boxClass = 'box-grand';
  if (data.content.includes('Forfeit')) boxClass = 'box-forfeit';
  
  document.getElementById('gameContent').innerHTML = `
    <div class="box-reveal">
      <h3>🎁 صندوقك السري!</h3>
      <div class="box-content ${boxClass}">${data.content}</div>
      <p style="margin-top:10px; opacity:0.7;">🤫 لا تخبر أحداً عن صندوقك!</p>
    </div>
  `;
});

// ===== HOST VIEW =====
socket.on('hostView', (data) => {
  document.getElementById('gameContent').innerHTML = `
    <h3>👑 نظرة المضيف</h3>
    ${data.players.map(p => `
      <div class="player-card" style="margin:5px 0">
        ${p.name}: ${p.box}
      </div>
    `).join('')}
    <button class="btn btn-start" onclick="nextRound()" style="margin-top:20px">
      ⏭ الجولة التالية
    </button>
  `;
});

// ===== NEXT ROUND =====
function nextRound() {
  socket.emit('nextRound', roomCode);
}

// ===== CHALLENGE =====
socket.on('challenge', (data) => {
  roundNumber = data.round;
  document.getElementById('roundBadge').innerHTML = 
    `🏆 الجولة ${data.round}/${data.totalRounds}`;
  
  const challengeNames = {
    capitals: '🌍 عواصم الدول',
    cardGame: '🃏 لعبة ورق',
    rapidFire: '⚡ أسئلة سريعة 🇹🇳',
    guessWho: '🕵️ من هو؟'
  };
  
  document.getElementById('gameContent').innerHTML = `
    <h2 class="challenge-title">${challengeNames[data.type]}</h2>
    <p>التحدي العشوائي رقم ${data.round}</p>
    <p style="margin-top:20px; opacity:0.7;">⏳ في انتظار إعلان الفائز...</p>
  `;
});

// ===== SWAP PHASE =====
socket.on('swapPhase', (data) => {
  document.getElementById('gameContent').innerHTML = `
    <div class="box-reveal">
      <h3>🔄 ${data.winnerName} هو الفائز!</h3>
      <p>فاز في التحدي وسيختار التبادل...</p>
    </div>
  `;
});

socket.on('playersToSwap', (data) => {
  document.getElementById('gameContent').innerHTML += `
    <div class="swap-options">
      <p style="margin:15px 0">من تريد التبادل معه؟</p>
      <div class="swap-choice" onclick="keepBox()" style="border-color:#43e97b">
        🛑 أحتفظ بصندوقي
      </div>
      ${data.players.map(p => `
        <div class="swap-choice" onclick="swapWith('${p.id}')">
          🔄 ${p.name}
        </div>
      `).join('')}
    </div>
  `;
});

function keepBox() {
  socket.emit('swapChoice', { roomCode, keep: true });
}

function swapWith(targetId) {
  socket.emit('swapChoice', { roomCode, keep: false, targetId });
}

// ===== SWAP RESULT =====
socket.on('swapResult', (data) => {
  document.getElementById('gameContent').innerHTML = `
    <div class="box-reveal">
      <h3>${data.winnerName}</h3>
      <p>${data.swapped ? '🔄 تم التبادل!' : '🛑 بقي على صندوقه'}</p>
    </div>
    <button class="btn btn-start" onclick="nextRound()">⏭ الجولة التالية</button>
  `;
});

// ===== FINAL REVEAL =====
socket.on('finalReveal', (data) => {
  const players = data.players;
  const winner = players.find(p => p.box.includes('$10,000'));
  
  document.getElementById('roundBadge').innerHTML = '🏁 النهاية!';
  document.getElementById('gameContent').innerHTML = `
    <h2 style="margin:20px 0">🎉 الكشف النهائي!</h2>
    ${players.map(p => {
      const isWinner = p.box.includes('$10,000');
      return `
        <div class="final-card ${isWinner ? 'box-grand winner-glow' : 'box-prize'}">
          <strong>${p.name}</strong>
          <p style="font-size:1.3em; margin-top:5px">${p.box}</p>
          ${isWinner ? '<p style="font-size:1.5em">👑 الفائز الأكبر!</p>' : ''}
        </div>
      `;
    }).join('')}
    <button class="btn btn-host" onclick="location.reload()">🔄 لعبة جديدة</button>
  `;
});

// ===== HOST LEFT =====
socket.on('hostLeft', () => {
  document.getElementById('gameContent').innerHTML = `
    <h2>😢 المضيف غادر</h2>
    <p>انتهت اللعبة</p>
    <button class="btn" onclick="location.reload()">🔄 رجوع</button>
  `;
});

// ===== UTILS =====
function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

console.log('🎁 Box of Lies ready! 🇹🇳');