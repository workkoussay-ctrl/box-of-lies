const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 🇹🇳 Banque de Questions Tunisiennes
const triviaBank = [
  { q: "أي فريق  فاز بدوري أبطال أفريقيا 2014؟", a: "TP MAZEMBE" },
  { q: "من هو هداف المنتخب التونسي التاريخي؟", a: "عصام جمعة" },
  { q: "مسلسل 'مكتوب' من بطولة أي ممثلة شهيرة؟", a: "هند صبري" },
  { q: "Dans le feuilleton dramatique Maktoub, quel est le métier du personnage principal interprété par Dhafer El Abidine ?؟", a: "Médecin" },
  { q: "في أي مدينة يقع ملعب 'الطيب المهيري'؟", a: "صفاقس" },
  { q: "من هو بطل مسلسل 'النوبة'؟", a: "عبد الحميد بوشناق (المخرج) / الشاذلي" },
  { q: "le plus athlete medailles aux jeu olympique tunisiens c'est qui?'؟", a: "Mohammed Gammoudi" },
  { q: "ما هي الأكلة الشعبية التونسية الأولى؟", a: "الكسكسي" },
  { q: "De quel célèbre quartier populaire de Tunis la série dramatique Denya Okhra tire-t-elle son nom ?؟", a: "Jbal Lahmer" },
  { q: "من هو المعلق الرياضي التونسي الشهير؟", a: "عصام الشوالي" }
];

// Boîtes par défaut
const defaultBoxes = [
  { type: 'grand', label: '👑 10DT' },
  { type: 'forfeit', label: '😈 10 pompes' },
  { type: 'forfeit', label: '🖐️ giflet des tes amis' }
];

const rooms = {};

io.on('connection', (socket) => {

  socket.on('createRoom', () => {
    const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[roomCode] = {
      host: socket.id,
      players: [],
      currentRound: 0,
      totalRounds: 3,
      gameStarted: false,
      boxesCustom: null,
      questions: [],
      qIndex: 0,
      buzzerLocked: true
    };
    socket.join(roomCode);
    socket.emit('roomCreated', roomCode);
  });

  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (room && !room.gameStarted && room.players.length < 3) {
      room.players.push({ id: socket.id, name: playerName, box: null });
      socket.join(roomCode);
      io.to(roomCode).emit('updateLobby', {
        players: room.players,
        playerCount: room.players.length,
        maxPlayers: 3
      });
    } else {
      socket.emit('joinError', 'الغرفة ممتلئة أو غير موجودة!');
    }
  });

  // HOST configure les boîtes
  socket.on('setBoxes', ({ roomCode, grandLabel, forfeit1Label, forfeit2Label }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.boxesCustom = [
      { type: 'grand', label: grandLabel?.trim() || '👑 10DT' },
      { type: 'forfeit', label: forfeit1Label?.trim() || '😈 10 pompes' },
      { type: 'forfeit', label: forfeit2Label?.trim() || '🖐️ giflet' }
    ];
    io.to(roomCode).emit('boxesReady');
  });

  socket.on('startGame', (roomCode) => {
    const room = rooms[roomCode];
    if (!room || room.players.length < 2) return;

    room.gameStarted = true;
    const contents = room.boxesCustom ? [...room.boxesCustom] : [...defaultBoxes];

    // Mélange
    for (let i = contents.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [contents[i], contents[j]] = [contents[j], contents[i]];
    }

    room.players.forEach((p, i) => { p.box = contents[i]; });
    room.players.forEach(p => { io.to(p.id).emit('revealBox', { content: p.box }); });
    io.to(room.host).emit('hostView', { players: room.players });
    io.to(roomCode).emit('gameStarted');
  });

  socket.on('nextRound', (roomCode) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.currentRound++;
    const challenges = ['capitals', 'cardGame', 'rapidFire', 'guessWho'];
    const challenge = challenges[Math.floor(Math.random() * challenges.length)];
    io.to(roomCode).emit('challenge', {
      type: challenge,
      round: room.currentRound,
      totalRounds: room.totalRounds
    });
  });

  // ===== RAPID FIRE (10 QUESTIONS) =====
  socket.on('startRapidFire', (roomCode) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.questions = [...triviaBank].sort(() => 0.5 - Math.random()).slice(0, 10);
    room.qIndex = 0;
    sendQuestion(room, roomCode);
  });

  socket.on('nextQuestion', (roomCode) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.qIndex++;
    sendQuestion(room, roomCode);
  });

  function sendQuestion(room, roomCode) {
    if (room.qIndex >= room.questions.length) {
      io.to(room.host).emit('quizFinished');
      return;
    }
    const currentQ = room.questions[room.qIndex];
    room.buzzerLocked = false;
    io.to(room.host).emit('newQuestion', {
      q: currentQ.q,
      a: currentQ.a,
      current: room.qIndex + 1,
      total: room.questions.length
    });
    room.players.forEach(p => { io.to(p.id).emit('buzzerActive'); });
  }

  socket.on('buzz', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (room && !room.buzzerLocked) {
      room.buzzerLocked = true;
      io.to(roomCode).emit('buzzWinner', { playerName });
    }
  });

  // ===== FIN ROUND & SWAP =====
  socket.on('getPlayersForWinner', (roomCode) => {
    const room = rooms[roomCode];
    if (room) io.to(room.host).emit('playersForWinner', { players: room.players });
  });

  socket.on('challengeWinner', ({ roomCode, winnerId }) => {
    const room = rooms[roomCode];
    const winner = room.players.find(p => p.id === winnerId);
    io.to(roomCode).emit('swapPhase', { winnerId, winnerName: winner?.name });
    io.to(winnerId).emit('playersToSwap', { players: room.players.filter(p => p.id !== winnerId) });
  });

  socket.on('swapChoice', ({ roomCode, winnerId, targetId, keep }) => {
    const room = rooms[roomCode];
    const winner = room.players.find(p => p.id === winnerId);
    if (!keep && targetId) {
      const target = room.players.find(p => p.id === targetId);
      [winner.box, target.box] = [target.box, winner.box];
      io.to(winnerId).emit('revealBox', { content: winner.box });
      io.to(targetId).emit('revealBox', { content: target.box });
    }
    io.to(roomCode).emit('swapResult', { winnerName: winner.name, swapped: !keep });
    if (room.currentRound >= room.totalRounds) {
      setTimeout(() => { io.to(roomCode).emit('finalReveal', { players: room.players }); }, 3000);
    }
  });

  socket.on('disconnect', () => {
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      if (socket.id === room.host) {
        io.to(roomCode).emit('hostLeft');
        delete rooms[roomCode];
      } else {
        room.players = room.players.filter(p => p.id !== socket.id);
        io.to(roomCode).emit('updateLobby', { players: room.players, playerCount: room.players.length });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => { console.log(`🎮 Server running on port ${PORT}`); });
