const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static('public'));

// 🇹🇳 Tunisian trivia (3 players version)
const tunisianQuestions = [
  { q: "من هو أول لاعب تونسي في الدوري الإسباني؟", a: "عادل العالمي" },
  { q: "فريق التطواني يلعب في أي مدينة؟", a: "تطاوين" },
  { q: "مسلسل 'شرفة الحي القديم' من إنتاج أي عام؟", a: "2007" },
  { q: "كم مرة فازت تونس بكأس أفريقيا للأمم؟", a: "مرة واحدة" },
  { q: "من هو لاعب الوسط في نادي باريس سان جيرمان؟", a: "يوسف الشخالي" },
  { q: "ما اسم البرنامج التونسي الكوميدي الشهير؟", a: "المساء وداعا" },
  { q: "أي فريق تونسي فاز بدوري الأبطال 2011؟", a: "الترجي" },
  { q: "ما اسم ملعب المنزه الوطني؟", a: "ملعب 7 نوفمبر" },
  { q: "مسلسل 'نوارة' بدأ في أي عام؟", a: "2006" },
  { q: "من هو صانع ألعاب المنتخب التونسي 2018؟", a: "وهبي الخزري" }
];

const rooms = {};

io.on('connection', (socket) => {
  console.log('🟢 New connection:', socket.id);

  // Create room
  socket.on('createRoom', () => {
    const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[roomCode] = {
      host: socket.id,
      players: [],
      currentRound: 0,
      totalRounds: 3,  // ⬅️ Less rounds for 3 players
      gameStarted: false
    };
    socket.join(roomCode);
    socket.emit('roomCreated', roomCode);
    console.log('🏠 Room created:', roomCode);
  });

  // Join room (max 3 players now!)
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (room && !room.gameStarted && room.players.length < 3) {  // ⬅️ Changed to 3
      room.players.push({
        id: socket.id,
        name: playerName,
        box: null
      });
      socket.join(roomCode);
      io.to(roomCode).emit('updateLobby', {
        players: room.players,
        playerCount: room.players.length,
        maxPlayers: 3  // ⬅️ Added
      });
      console.log(`👤 ${playerName} joined room ${roomCode}`);
    } else {
      socket.emit('joinError', 'الغرفة ممتلئة أو غير موجودة!');
    }
  });

  // Start game
  socket.on('startGame', (roomCode) => {
    const room = rooms[roomCode];
    if (!room || room.players.length < 2) return;  // ⬅️ Min 2 players now
    
    room.gameStarted = true;
    
    // ⬅️ 3 boxes only: $10K, Prize, Forfeit
    const contents = [
      '💰 $10,000',
      '🎁 Prize',
      '😈 Forfeit'
    ];
    
    // Shuffle
    for (let i = contents.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [contents[i], contents[j]] = [contents[j], contents[i]];
    }
    
    room.boxContents = contents;
    room.players.forEach((p, i) => {
      p.box = contents[i];
    });

    // Send each player their secret box
    room.players.forEach(p => {
      io.to(p.id).emit('revealBox', { content: p.box });
    });

    // Host sees everything
    io.to(room.host).emit('hostView', { players: room.players });

    io.to(roomCode).emit('gameStarted');
    console.log('🎮 Game started in room:', roomCode);
  });

  // Next round - random challenge
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

  // Challenge winner announced
  socket.on('challengeWinner', ({ roomCode, winnerId }) => {
    const room = rooms[roomCode];
    if (!room) return;
    
    const winner = room.players.find(p => p.id === winnerId);
    io.to(roomCode).emit('swapPhase', {
      winnerId,
      winnerName: winner?.name || 'Unknown'
    });
    
    // Send player list to winner (only 2 others now)
    io.to(winnerId).emit('playersToSwap', {
      players: room.players.filter(p => p.id !== winnerId)
    });
  });

  // Swap choice
  socket.on('swapChoice', ({ roomCode, winnerId, targetId, keep }) => {
    const room = rooms[roomCode];
    if (!room) return;
    
    const winner = room.players.find(p => p.id === winnerId);
    
    if (!keep && targetId) {
      const target = room.players.find(p => p.id === targetId);
      const tempBox = winner.box;
      winner.box = target.box;
      target.box = tempBox;
      
      io.to(winnerId).emit('revealBox', { content: winner.box });
      io.to(targetId).emit('revealBox', { content: target.box });
    }

    io.to(roomCode).emit('swapResult', {
      winnerName: winner.name,
      swapped: !keep
    });

    // Check if game over (3 rounds max)
    if (room.currentRound >= room.totalRounds) {
      setTimeout(() => {
        io.to(roomCode).emit('finalReveal', { players: room.players });
      }, 3000);
    }
  });

  // Rapid fire buzz
  socket.on('rapidFireBuzz', ({ roomCode, playerName }) => {
    io.to(rooms[roomCode]?.host).emit('buzzReceived', { playerName });
  });

  // Guess who - host sends clue
  socket.on('sendClue', ({ roomCode, clue }) => {
    io.to(roomCode).emit('newClue', { clue });
  });

  // Guess who - player guess
  socket.on('playerGuess', ({ roomCode, playerName, guess }) => {
    io.to(rooms[roomCode]?.host).emit('guessReceived', { playerName, guess });
  });

  // End game
  socket.on('endGame', (roomCode) => {
    io.to(roomCode).emit('finalReveal', { players: rooms[roomCode]?.players || [] });
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('🔴 Disconnected:', socket.id);
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
  console.log(`🎮 Box of Lies (3 players) running on port ${PORT}`);
});
