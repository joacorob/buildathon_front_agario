"use strict";

// Unpkg imports
const Web3Modal = window.Web3Modal.default;
const WalletConnectProvider = window.WalletConnectProvider.default;
const EvmChains = window.EvmChains;

// Web3Modal instance
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
    web3 = new Web3(provider);
    console.log({ web3 });
    const accounts = await web3.eth.getAccounts();
    mainAccount = accounts[0];
    // 💡 Make mainAccount accessible from other scripts
    window.mainAccount = mainAccount;

    console.log("Connected account:", mainAccount);

    document.querySelector("#notconnected").style.display = "none";
    document.querySelector("#connected").style.display = "block";
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
        web3 = new Web3(provider);
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

function getEtherPortalContract() {
    const portalAddress = "0xFfdbe43d4c855BF7e0f105c400A50857f53AB044";
    console.log({ web3, provider });
    // Minimum required ABI for depositEther
    const etherPortalABI = [
        {
            inputs: [
                { internalType: "address", name: "_dapp", type: "address" },
                {
                    internalType: "bytes",
                    name: "_execLayerData",
                    type: "bytes",
                },
            ],
            name: "depositEther",
            outputs: [],
            stateMutability: "payable",
            type: "function",
        },
    ];

    return new web3.eth.Contract(etherPortalABI, portalAddress);
}

async function waitForTransactionConfirmation(txHash) {
    console.log(`Waiting for confirmation of transaction: ${txHash}`);

    while (true) {
        try {
            const receipt = await web3.eth.getTransactionReceipt(txHash);
            if (receipt && receipt.status) {
                console.log("Transaction confirmed:", receipt);
                return receipt;
            }
        } catch (error) {
            console.error("Error verifying transaction:", error);
        }
        // Wait 3 seconds before checking again
        await new Promise((resolve) => setTimeout(resolve, 3000));
    }
}

async function payGame() {
    try {
        const etherPortalContract = getEtherPortalContract();
        const execLayerData = "0x";
        const dappAddress = "0xab7528bb862fB57E8A2BCd567a2e929a0Be56a5e";

        console.log("Sending transaction to deposit Ether...");

        // Send transaction
        const tx = await etherPortalContract.methods
            .depositEther(dappAddress, execLayerData)
            .send({
                from: mainAccount,
                value: web3.utils.toWei("0.001", "ether"),
            });

        console.log("Transaction sent. Waiting for confirmation...");

        // Wait for confirmation
        await waitForTransactionConfirmation(tx.transactionHash);

        console.log("Transaction confirmed. Starting the game...");
    } catch (error) {
        console.error("Error depositing Ether in EtherPortal:", error);
        alert("There was an error processing the transaction");
        return;
    }
}

async function startGame() {
    // Verify if a valid player name is provided
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
    // Implement game logic here
}

window.addEventListener("load", async () => {
    init();
    document.querySelector("#btn-connect").addEventListener("click", connect);
    document
        .querySelector("#btn-disconnect")
        .addEventListener("click", disconnect);
    document.querySelector("#startButton").addEventListener("click", startGame);
});

module.exports = { mainAccount, web3, provider, payGame };
