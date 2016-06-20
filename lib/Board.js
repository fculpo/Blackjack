var uuid = require('node-uuid')
  , Player = require('./Player')
  , config = require('../config')
  , Stack = require('./Stack')
  , st_map = require('./modules/strategies')["map"]
  , st_euro = require('./modules/strategies')["european"]
  , logger = require('./logs');

var Board = function (io) {
  this.io = io;
  this.uuid = uuid.v4();
  this.config = config;
  this.penetrationRate = config.penetrationRate;
  this.shoe = new Stack();
  this.shoe.fill(config.howManyDecks);
  this.shoe.shuffle(5);
  this.discardShoe = new Stack(0, 1);
  this.players = {};
  this.playersNb = 0;
  this.callID = 0;
  this.dealer = new Player(0,0,"dealer");
};

Board.prototype.toJSON = function () {
  return {uuid: this.uuid, playersNb: this.playersNb, players: this.players}
}

Board.prototype.start = function () {

}

Board.prototype.run = function() {
  this.dealHand();
}

Board.prototype.runCount = function () {
  var self = this;
  self.dealCount();
  this.callID = setInterval(function() {
    self.dealCount();
  }, 2000);
}

Board.prototype.dealFromDeck = function () {
  if (((this.shoe.cards.length / this.shoe.totalCardsNb) + this.penetrationRate) > 1) {
    return this.shoe.deal();
  } else {
    // Re-shuffle the Deck
    logger.info("RESHUFFLE");
    this.shoe.empty();
    this.discardShoe.empty();
    this.shoe.fill(this.config.howManyDecks);
    this.shoe.shuffle(5);
    // deal as usual
    return this.shoe.deal();
  }
}

Board.prototype.sendUpdate = function (cb) {
  var self = this;
  var players = [];

  for (var key in this.players) {
    if (this.players.hasOwnProperty(key)) {
      var player = self.players[key].toString();
      players.push(player)
    }
  }

  var dealerCards = [];
  self.dealer.hand.forEach(function(card2) {
    dealerCards.push(card2.toURL());
  });
  self.io.emit('updateBoard', { board: self.uuid, count: self.shoe.runningCount, players : players, dealer: { cards: dealerCards } });
}

Board.prototype.addPlayer = function (id, pos, cb) {
  if (this.config.howManyPlayersMax > this.playersNb) {
    if ((pos > 0) && (pos <= this.config.howManyPlayersMax)) {
      var freePos = true;
      for (var key in this.players) {
        if (this.players.hasOwnProperty(key)) {
          var player = this.players[key];
          logger.info(player);
          if (player.position === pos) {
            freePos = false;
          }
        }
      }
      if (freePos === true) {
        this.players[id] = new Player(id, pos, this.config.startingStack);
        this.playersNb++;
        logger.info("[ " + this.uuid + " ] Successfully added Player " + id + " at position " + pos);
        cb("ok");
      } else {
        logger.info("[ " + this.uuid + " ] Requested position " + pos + " is already taken !");
      }
    } else {
      logger.info("[ " + this.uuid + " ] Invalid Position asked ! Max Players = " + this.config.howManyPlayersMax);
    }
  } else {
    logger.info("[ " + this.uuid + " ] Maximum number of players is reached !");
  }
}

Board.prototype.removePlayer = function (id) {
  if (this.players.hasOwnProperty(id)) {
    delete this.players[id];
    this.playersNb--;
    logger.info("Removed player " + id);
  } else {
    logger.info("This player doesn't exist !");
  }
}

Board.prototype.dealHand = function () {
  var self = this;
  this.discardAll();

  // First card for each players
  for (var key in this.players) {
    if (this.players.hasOwnProperty(key)) {
      this.players[key].hand.push(this.dealFromDeck());
    }
  }

  // Dealer's card
  this.dealer.hand.push(this.dealFromDeck());

  // Second card for each players
  for (var key in this.players) {
    if (this.players.hasOwnProperty(key)) {
      this.players[key].hand.push(this.dealFromDeck());
    }
  }

  // Refresh clients
  this.sendUpdate();

}

Board.prototype.dealCount = function () {
  var self = this;
  this.discardAll();

  for (var i = 0; i<2; i++) { // Two cards
    for (var key in this.players) {
      if (this.players.hasOwnProperty(key)) {
        this.players[key].hand.push(this.dealFromDeck());
      }
    }
  }

  this.sendUpdate();
}

Board.prototype.dealHandNoBJ = function () {
  var self = this;

  this.discardAll();

  for (var key in this.players) {
    if (this.players.hasOwnProperty(key)) {
      this.players[key].hand.push(this.dealFromDeck());
    }
  }

  this.dealer.hand.push(this.dealFromDeck());

  for (var key in this.players) {
    if (this.players.hasOwnProperty(key)) {
      this.players[key].hand.push(this.dealFromDeck());
    }
  }

  for (var key in this.players) {
    if (this.players.hasOwnProperty(key)) {
      if (this.players[key].score() === 21) {
        this.discardAll();
        this.dealHandNoBJ();
      }
    }
  }

  for (var key in this.players) {
    if (this.players.hasOwnProperty(key)) {
      this.players[key].stats.totalRounds++;
    }
  }

  this.sendUpdate();

}

Board.prototype.discardAll = function () {
  for (var key in this.players) {
    if (this.players.hasOwnProperty(key)) {
      while (this.players[key].hand.length > 0) {
        this.discardShoe.addCard(this.players[key].hand.shift());
      }
    }
  }

  for (var h = 0; h < this.dealer.hand.length; h++) {
    this.discardShoe.addCard(this.dealer.hand.shift());
  }
}

Board.prototype.checkAction = function (socket, action) {
  var self = this;
  var ans, res;
  var score = this.players[socket.id].scoreStrategy();

  var mapActions = {
    "hit" : "T",
    "stand" : "R",
    "double" : "D",
    "split" : "S",
    "surrender" : "A"
  };

  var inverseMapActions = {
    "T" : "HIT",
    "R" : "STAND",
    "D" : "DOUBLE",
    "S" : "SPLIT",
    "A" : "SURRENDER",
    "AT" : "SURRENDER",
    "AR" : "SURRENDER"
  }

  var answer = (st_euro[score])[st_map[this.dealer.hand[0].rank]];
  // TODO (modularize if surrender is ok or not)
  if (mapActions[action] === answer[0]) {
    this.players[socket.id].stats.streak++;
    if (this.players[socket.id].stats.streak > this.players[socket.id].stats.maxStreak) {
      this.players[socket.id].stats.maxStreak = this.players[socket.id].stats.streak;
    }
    this.players[socket.id].stats.wonRounds++;
    res = "OK";
  } else {
    this.players[socket.id].stats.streak = 0;
    res="KO";
  }

  ans = inverseMapActions[answer];

  this.players[socket.id].stats.score = (this.players[socket.id].stats.wonRounds / this.players[socket.id].stats.totalRounds).toFixed(3);
  socket.emit("answer", { "res": res, "ans": ans,  "score": self.players[socket.id].stats });

  setTimeout(function() {
    self.run();
  }, 2000);
}

module.exports = Board;