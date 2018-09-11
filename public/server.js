"use strict";

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;
const DRONE_PURCHASE_COST = 5;
const DRONE_RADIUS = 10;
const MOTHERSHIP_RADIUS = 50;
const STONE_MIN_RADIUS = 20;
const STONE_MAX_VALUE = 50;
const STONE_MIN_VALUE = 2;
const STONE_SPAWN_DELAY_MX = 2500;
const DRONE_SPEED_PX_PER_MS = 0.09;

class Game {

  constructor({ playerList, eventHandler }) {
    // this.playerList = playerList;
    this.eventHandler = eventHandler;
    this.data = null;
    this.isOngoing = false;
  }

  start() {
    this.data = {
      startDatetimeStamp: Date.now(),
      lastStoneSpawnDatetimeStamp: Date.now(),
      stoneList: [],
      playerList: [
        {
          droneIdSeed: 0,
          droneList: [],
          stoneReserve: 20,
          mothership: {
            health: MOTHERSHIP_MAX_HEALTH,
            x: 0,
            y: GAME_HEIGHT / 2,
            r: MOTHERSHIP_RADIUS
          }
        },
        {
          droneIdSeed: 0,
          droneList: [],
          stoneReserve: 20,
          mothership: {
            health: MOTHERSHIP_MAX_HEALTH,
            x: GAME_WIDTH,
            y: GAME_HEIGHT / 2,
            r: MOTHERSHIP_RADIUS
          }
        }
      ]
    };
    this.isOngoing = true;
    [0, 1].forEach(playerNumber => this.spawnDrone(playerNumber));
    [0, 1, 2, 3, 4, 5].forEach(() => this.spawnStone());
    this.loop();
  }

  opponentOf(playerNumber) {
    if (playerNumber === 0) return 1;
    return 0;
  }

  spawnStone() {
    let value = Math.floor(Math.random() * (STONE_MAX_VALUE - STONE_MIN_VALUE)) + STONE_MIN_VALUE;
    let stone = {
      x: Math.floor(Math.random() * GAME_WIDTH),
      y: Math.floor(Math.random() * GAME_HEIGHT),
      value,
      r: (Math.ceil(value / 2) + STONE_MIN_RADIUS)
    };
    this.data.stoneList.push(stone);
  }

  spawnDrone(playerNumber) {
    let player = this.data.playerList[playerNumber];
    console.log(player.stoneReserve, DRONE_PURCHASE_COST)
    if (player.stoneReserve < DRONE_PURCHASE_COST) {
      this.eventHandler('message', [playerNumber], { message: "Not enough stones." });
      return;
    }
    let id = player.droneIdSeed++;
    let drone = {
      id,
      x: (playerNumber === 0 ? player.mothership.x + MOTHERSHIP_RADIUS * 2 : player.mothership.x - MOTHERSHIP_RADIUS * 2),
      y: player.mothership.y,
      r: DRONE_RADIUS,
      carryingStone: null,
      pathList: []
    };
    drone.pathList.push({
      x1: drone.x,
      y1: drone.y,
      x2: GAME_WIDTH / 2,
      y2: GAME_HEIGHT / 2,
      startDatetimeStamp: (Date.now())
    });
    player.stoneReserve -= DRONE_PURCHASE_COST;
    player.droneList.push(drone);
  }

  publishGameData() {
    // console.log('RAW DATA', this.data);

    let { playerList, stoneList, startDatetimeStamp } = this.data;
    let duration = Date.now() - startDatetimeStamp;
    stoneList = stoneList.map(stone => {
      let { x, y, r } = stone;
      return { x, y, r };
    });

    [0, 1].forEach(playerNumber => {
      let stoneReserve, mothership, droneList;

      ({ stoneReserve, mothership, droneList } = playerList[playerNumber]);
      let own = {
        mothership,
        stoneReserve,
        droneList: droneList.map(drone => {
          let { id, x, y, r, carryingStone, pathList } = drone;
          return { id, x, y, r, carryingStone, pathList };
        })
      };

      ({ stoneReserve, mothership, droneList } = playerList[this.opponentOf(playerNumber)]);
      let opponent = {
        mothership,
        stoneReserve,
        droneList: droneList.map(drone => {
          let { x, y, r, carryingStone } = drone;
          return { x, y, r, carryingStone };
        })
      };

      this.eventHandler('game-data', playerNumber, { stoneList, duration, own, opponent });
    });
  }

  moveObjects(now) {
    const velocity = DRONE_SPEED_PX_PER_MS;
    [0, 1].forEach(playerNumber => {
      let { droneList } = this.data.playerList[playerNumber];
      droneList.forEach(drone => {
        if (drone.pathList.length === 0) return;
        let { x1, y1, x2, y2, startDatetimeStamp } = drone.pathList[0];
        let D = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
        let d = (now - startDatetimeStamp) * velocity;
        if (d > D) {
          drone.pathList.shift();
          d = D;
        }
        let x = x1 + (d / D) * (x2 - x1);
        let y = y1 + (d / D) * (y2 - y1);
        drone.x = x;
        drone.y = y;
      });
    });
  }

  loop() {
    if (!this.isOngoing) return;
    let now = Date.now();
    let diff = now - this.data.startDatetimeStamp;
    if (now - this.data.lastStoneSpawnDatetimeStamp > STONE_SPAWN_DELAY_MX) {
      this.data.lastStoneSpawnDatetimeStamp = now;
      this.spawnStone();
    }
    this.moveObjects(now, diff);
    this.publishGameData();
    setTimeout(() => this.loop(), 10);
  }

  forfeit(playerNumber, reason) {

  }

  moveDrone(playerNumber, { x, y, id }) {
    let drone = this.data.playerList[playerNumber].droneList.find(drone => drone.id === id);
    if (!drone) return;
    drone.pathList[0] = {
      x1: drone.x,
      y1: drone.y,
      x2: x,
      y2: y,
      startDatetimeStamp: (Date.now())
    };
  }

}


let pendingPlayer = null;

module.exports = {

  io: (socket) => {
    console.log(`${socket.id} - Connected.`);

    socket.once('disconnect', () => {
      console.log(`${socket.id} - Disconnected.`);
      socket.removeAllListeners();
      if (pendingPlayer && (socket.id === pendingPlayer.id)) {
        console.log(`${socket.id} - Leaves after waiting.`);
        pendingPlayer = null;
      } else if (!socket.game) {
        console.log(`${socket.id} - Leaves before joining a game or waiting.`);
      } else if (socket.game.isOngoing) {
        console.log(`${socket.id} - Forfeits.`);
        socket.game.forfeit(socket.playerNumber, 'disconnect');
      } else {
        console.log(`${socket.id} - Leaves as winner.`);
      }
    });

    if (!pendingPlayer) {
      pendingPlayer = socket;
      console.log(`${socket.id} - Waiting.`);
      return;
    }

    console.log('New game:', socket.id, 'vs', pendingPlayer.id);

    let playerList = [socket, pendingPlayer];
    pendingPlayer = null;

    let game = new Game({
      playerList,
      eventHandler: (event, playerNumber, data) => {
        // console.log(event, playerNumber, data);
        playerList[playerNumber].emit(event, data);
      }
    });

    playerList.forEach((player, playerNumber) => {
      player.game = game;
      player.playerNumber = playerNumber;
      player.on('command:move-drone', ({ x, y, id }) => {
        game.moveDrone(playerNumber, { x, y, id });
      });
      player.on('command:spawn-drone', ({ x, y, id }) => {
        game.spawnDrone(playerNumber);
      });
    });

    game.start();

  }

};