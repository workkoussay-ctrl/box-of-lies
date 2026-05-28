const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// ✅ Serve static files from ROOT (not 'public')
app.use(express.static(__dirname));

// ✅ Serve index.html from root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 🇹🇳 Tunisian trivia
const tunisianQuestions = [
  { q: "من هو أول لاعب تونسي في الدوري الإسباني؟", a: "عادل العالمي" },
  { q: "فريق التطواني يلعب في أي مدينة؟", a: "تطاوين" },
  { q: "كم مرة فازت تونس بكأس أفريقيا؟", a: "مرة واحدة" }
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
      gameStarted: false
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
      socket.emit('joinError', 'الغرفة ممتلئة!');
    }
  });

  socket.on('startGame', (roomCode) => {
    const room = rooms[roomCode];
    if (!room || room.players.length < 2) return;
    
    room.gameStarted = true;
    const contents = ['💰 $10,000', '🎁 Prize', '😈 Forfeit'];
    
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
    // ⬇️ ADD THIS - Host needs player list to pick winner
  socket.on('getPlayersForWinner', (roomCode) => {
    const room = rooms[roomCode];
    if (room) {
      io.to(room.host).emit('playersForWinner', { players: room.players });
    }
  });

  socket.on('challengeWinner', ({ roomCode, winnerId }) => {
    const room = rooms[roomCode];
    const winner = room.players.find(p => p.id === winnerId);
    io.to(roomCode).emit('swapPhase', { winnerId, winnerName: winner?.name });
    io.to(winnerId).emit('playersToSwap', { 
      players: room.players.filter(p => p.id !== winnerId) 
    });
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
      setTimeout(() => {
        io.to(roomCode).emit('finalReveal', { players: room.players });
      }, 3000);
    }
  });

  socket.on('endGame', (roomCode) => {
    io.to(roomCode).emit('finalReveal', { players: rooms[roomCode]?.players || [] });
  });
  // ===== RAPID FIRE LOGIC =====
  
  // Banque de questions 🇹🇳
  const triviaBank = [
    { q: "أي فريق تونسي فاز بدوري أبطال أفريقيا 2011؟", a: "الترجي الرياضي" },
    { q: "من هو هداف المنتخب التونسي التاريخي؟", a: "عصام جمعة" },
    { q: "مسلسل 'مكتوب' من بطولة أي ممثلة شهيرة؟", a: "هند صبري" },
    { q: "ما هو لقب المنتخب التونسي؟", a: "نسور قرطاج" },
    { q: "في أي مدينة يقع ملعب 'مصطفى بن جنات'؟", a: "رادس" },
    { q: "من هو 'فيلسوف' السينما التونسية الكوميدية؟", a: "علي بنور" }
  ];

  // Le Host demande une nouvelle question
  socket.on('getQuestion', (roomCode) => {
    const room = rooms[roomCode];
    if (!room) return;
    
    // On choisit une question au hasard
    const randomQ = triviaBank[Math.floor(Math.random() * triviaBank.length)];
    
    // On débloque les buzzers des joueurs
    room.buzzerLocked = false; 
    
    // On envoie la question SEULEMENT au Host (avec la réponse)
    io.to(room.host).emit('hostQuestion', randomQ);
    
    // On dit aux joueurs : "Préparez-vous à buzzer !"
    room.players.forEach(p => {
      io.to(p.id).emit('readyToBuzz');
    });
  });

  // Un joueur appuie sur le BUZZER
  socket.on('buzz', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    // Si personne n'a encore buzzé (verrou ouvert)
    if (room && !room.buzzerLocked) {
      room.buzzerLocked = true; // On ferme le verrou IMMÉDIATEMENT
      
      // On informe TOUT LE MONDE qui a gagné la vitesse
      io.to(roomCode).emit('buzzWinner', { playerName });
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
        io.to(roomCode).emit('updateLobby', {
          players: room.players,
          playerCount: room.players.length,
          maxPlayers: 3
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 Server running on port ${PORT}`);
});
