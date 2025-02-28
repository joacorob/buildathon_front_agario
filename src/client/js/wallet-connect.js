"use strict";

// Unpkg imports
const Web3Modal = window.Web3Modal.default;
const WalletConnectProvider = window.WalletConnectProvider.default;
const EvmChains = window.EvmChains;

// Web3modal instance
let web3Modal;
// Wallet provider instance
let provider;
// Web3 instance
let web3;
// User account
let mainAccount;

function init() {
    console.log("Initializing Web3Modal");

    const providerOptions = {
        walletconnect: {
            package: WalletConnectProvider,
            options: {
                infuraId: "", // Update with your Infura key
            },
        },
    };

    web3Modal = new Web3Modal({
        cacheProvider: true, // optional
        providerOptions, // required
    });
}

async function fetchAccountData() {
    console.log('fetching account data')
    web3 = new Web3(provider);
    const accounts = await web3.eth.getAccounts();
    mainAccount = accounts[0];
    // 💡 Hacer mainAccount accesible desde otros scripts
    window.mainAccount = mainAccount;
    console.log("Connected account:", mainAccount);
    document.querySelector("#notconnected").style.display = "none";
    document.querySelector("#connected").style.display = "block";
    

    // dummy data we need to query smart contract to see if a deposit was already made or not.
    let accountBalance = 0
    // if account balance is 0 then display
    if(accountBalance===0){
        console.log('account balance',accountBalance)
        document.querySelector("#startButton").style.display = "none";
    }
}

async function handleDeposit(){
    // the logic in this function is to be implemented. 
    try {
        // Define the recipient address and amount
        // Call web3.eth.sendTransaction()
        // Handle the transaction response
        // Update UI based on success
    } catch (error) {
        // Handle errors
    }
}

async function refreshAccountData() {
    document.querySelector("#connected").style.display = "none";
    document.querySelector("#notconnected").style.display = "block";
    document.querySelector("#btn-connect").setAttribute("disabled", "disabled");

    await fetchAccountData();

    document.querySelector("#btn-connect").removeAttribute("disabled");
}

async function connect() {
    console.log("Opening wallet connection");
    try {
        provider = await web3Modal.connect();
    } catch (e) {
        console.log("Could not get a wallet connection", e);
        return;
    }

    provider.on("accountsChanged", (accounts) => fetchAccountData());
    provider.on("chainChanged", (chainId) => fetchAccountData());
    provider.on("networkChanged", (networkId) => fetchAccountData());

    await refreshAccountData();
}

async function disconnect() {
    if (provider?.close) {
        await provider.close();
        await web3Modal.clearCachedProvider();
        provider = null;
    }

    document.querySelector("#notconnected").style.display = "block";
    document.querySelector("#connected").style.display = "none";
}

function startGame() {
    const playerName = document.querySelector("#playerNameInput").value.trim();
    if (!playerName) {
        alert("Please enter a valid name");
        return;
    }

    if (!mainAccount) {
        alert("Please connect your wallet first");
        return;
    }

    console.log(`Starting game for ${playerName} with wallet ${mainAccount}`);
    document.getElementById("spawn_cell").play();
    // Here you can implement game logic
}

window.addEventListener("load", async () => {
    init();
    document.querySelector("#btn-connect").addEventListener("click", connect);
    document
        .querySelector("#btn-disconnect")
        .addEventListener("click", disconnect);
    document.querySelector("#startButton").addEventListener("click", startGame);
    
    // onclick listner to handle funding account.
    document.querySelector("#fundButton").addEventListener("click", handleDeposit);
});

module.exports = { mainAccount, web3, provider };
