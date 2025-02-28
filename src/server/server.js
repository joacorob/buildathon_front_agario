/*jslint bitwise: true, node: true */
"use strict";

const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const SAT = require("sat");

require("dotenv").config();

const { ethers } = require("ethers");

// Contract and dApp addresses
const CONTRACT_ADDRESS = "0x59b22D57D4f067708AB0c00552767405926dc768";
const DAPP_ADDRESS = "0xab7528bb862fB57E8A2BCd567a2e929a0Be56a5e";

const contractABI = [
    "function addInput(address _dapp, bytes _input) external returns (bytes32)",
];

// Set up provider and signer (make sure to use a secure private key)
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL); // Ensure `RPC_URL` is defined
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider); // Define `PRIVATE_KEY`

const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, signer);

const gameLogic = require("./game-logic");
const loggingRepository = require("./repositories/logging-repository");
const chatRepository = require("./repositories/chat-repository");
const config = require("../../config");
const util = require("./lib/util");
const mapUtils = require("./map/map");
const { getPosition } = require("./lib/entityUtils");

let map = new mapUtils.Map(config);

let sockets = {};
let spectators = [];
const INIT_MASS_LOG = util.mathLog(config.defaultPlayerMass, config.slowBase);

let leaderboard = [];
let leaderboardChanged = false;

const Vector = SAT.Vector;

app.use(express.static(__dirname + "/../client"));

async function handlePlayerEatenTransfer(gotEaten, eater, massEaten) {
    try {
        // Get player instances
        const victimPlayer = map.players.data[gotEaten.playerIndex];
        const winnerPlayer = map.players.data[eater.playerIndex];

        // Check if both players have wallets
        if (!victimPlayer?.wallet || !winnerPlayer?.wallet) {
            console.log(
                "[WARN] A player does not have a wallet, no transfer occurs."
            );
            return;
        }

        // Create payload in JSON format and convert to HEX
        const transferPayload = {
            win: winnerPlayer.wallet,
            loss: victimPlayer.wallet,
        };
        const hexPayload = ethers.toUtf8Bytes(JSON.stringify(transferPayload));

        // Send the transaction to the contract
        const tx = await contract.addInput(DAPP_ADDRESS, hexPayload);
        await tx.wait(); // Wait for transaction confirmation

        console.log("[WEB3] Transfer successfully sent, hash:", tx.hash);
    } catch (err) {
        console.error("[WEB3] Error sending transfer:", err);
    }
}

io.on("connection", function (socket) {
    let type = socket.handshake.query.type;
    console.log("User connected: ", type);
    switch (type) {
        case "player":
            addPlayer(socket);
            break;
        case "spectator":
            addSpectator(socket);
            break;
        default:
            console.log("Unknown user type, no action taken.");
    }
});

function generateSpawnpoint() {
    let radius = util.massToRadius(config.defaultPlayerMass);
    return getPosition(
        config.newPlayerInitialPosition === "farthest",
        radius,
        map.players.data
    );
}

const addPlayer = (socket) => {
    var currentPlayer = new mapUtils.playerUtils.Player(socket.id);

    socket.on("gotit", function (clientPlayerData) {
        console.log(
            "[INFO] Player " +
                clientPlayerData.name +
                " connecting! " +
                clientPlayerData.wallet
        );
        currentPlayer.init(generateSpawnpoint(), config.defaultPlayerMass);

        if (map.players.findIndexByID(socket.id) > -1) {
            console.log("[INFO] Player ID already connected, kicking.");
            socket.disconnect();
        } else if (!util.validNick(clientPlayerData.name)) {
            socket.emit("kick", "Invalid username.");
            socket.disconnect();
        } else {
            console.log(
                "[INFO] Player " + clientPlayerData.name + " connected!"
            );
            sockets[socket.id] = socket;
            currentPlayer.clientProvidedData(clientPlayerData);

            currentPlayer.wallet = clientPlayerData.wallet || null;

            map.players.pushNew(currentPlayer);
            io.emit("playerJoin", { name: currentPlayer.name });
            console.log("Total players: " + map.players.data.length);
        }
    });

    socket.on("disconnect", () => {
        map.players.removePlayerByID(currentPlayer.id);
        console.log("[INFO] User " + currentPlayer.name + " has disconnected");
        socket.broadcast.emit("playerDisconnect", { name: currentPlayer.name });
    });
};

setInterval(() => {
    map.players.data.forEach((player) => {
        if (
            player.lastHeartbeat <
            new Date().getTime() - config.maxHeartbeatInterval
        ) {
            sockets[player.id]?.emit(
                "kick",
                "Last heartbeat received too long ago."
            );
            sockets[player.id]?.disconnect();
        }
    });
}, 1000 / 60);

var ipaddress =
    process.env.OPENSHIFT_NODEJS_IP || process.env.IP || config.host;
var serverport =
    process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || config.port;
http.listen(serverport, ipaddress, () =>
    console.log("[DEBUG] Listening on " + ipaddress + ":" + serverport)
);
