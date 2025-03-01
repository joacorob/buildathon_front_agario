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

let globalVouchers = [];

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

async function getVoucherList() {
    try {
        const response = await fetch("http://localhost:8080/graphql", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Connection: "keep-alive",
                DNT: "1",
                Origin: "http://localhost:8080",
                "Accept-Encoding": "gzip, deflate, br",
            },
            body: JSON.stringify({
                query: `
                    query vouchers($first: Int, $after: String) {
                        vouchers(first: $first, after: $after) {
                            edges {
                                node {
                                    index
                                    input {
                                        index
                                        timestamp
                                        msgSender
                                        blockNumber
                                    }
                                    destination
                                    payload
                                    proof {
                                        validity {
                                            inputIndexWithinEpoch
                                            outputIndexWithinInput
                                            outputHashesRootHash
                                            vouchersEpochRootHash
                                            noticesEpochRootHash
                                            machineStateHash
                                            outputHashInOutputHashesSiblings
                                            outputHashesInEpochSiblings
                                        }
                                        context
                                    }
                                }
                                cursor
                            }
                            pageInfo {
                                hasNextPage
                                endCursor
                            }
                        }
                    }
                `,
                variables: {
                    first: 10, // Adjust as needed
                    after: null, // Use for pagination if necessary
                },
            }),
        });

        if (!response.ok) {
            throw new Error(
                `GraphQL request failed with status ${response.status}`
            );
        }

        const result = await response.json();
        if (result.errors) {
            console.error("GraphQL errors:", result.errors);
            throw new Error("GraphQL returned errors");
        }

        return result.data;
    } catch (error) {
        console.error("Error fetching vouchers:", error);
        return { vouchers: { edges: [] } }; // Return empty array to avoid breaking the UI
    }
}

// --------This function needs to be refined-------------------
async function fetchAccountData() {
    web3 = new Web3(provider);
    console.log({ web3 });
    const accounts = await web3.eth.getAccounts();
    mainAccount = accounts[0];
    window.mainAccount = mainAccount;

    console.log("Connected account:", mainAccount);

    document.querySelector("#notconnected").style.display = "none";
    document.querySelector("#connected").style.display = "block";

    // Mock data for testing
    const vocuherList = await getVoucherList();

    // Extract vouchers array with just destination and payload
    const vouchers = vocuherList.vouchers.edges.map((edge) => ({
        destination: edge.node.destination,
        payload: edge.node.payload,
        proof: edge.node.proof,
    }));

    globalVouchers = vouchers;

    // Populate vouchers list
    const vouchersList = document.getElementById("vouchers-list");
    vouchersList.innerHTML = ""; // Clear existing content

    if (vouchers.length === 0) {
        vouchersList.innerHTML = "<p>No vouchers found</p>";
    } else {
        vouchers.forEach((voucher, index) => {
            const voucherElement = document.createElement("div");
            voucherElement.className = "voucher-item";

            // Convert payload from wei to ETH for display
            const ethValue = web3.utils.fromWei(voucher.payload, "ether");

            voucherElement.innerHTML = `
                <div class="voucher-content">
                    <p><strong>Voucher #${index + 1}</strong></p>
                    <p>Amount: ${ethValue} ETH</p>
                    <button class="claim-button" onclick="claimVoucher(${index})">
                        Claim Voucher
                    </button>
                </div>
            `;
            vouchersList.appendChild(voucherElement);
        });
    }

    console.log("Vouchers:", vouchers);
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
                value: web3.utils.toWei("1", "ether"),
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

function initTabs() {
    const tabButtons = document.querySelectorAll(".tab-button");

    tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
            // Remove active class from all buttons and content
            document
                .querySelectorAll(".tab-button")
                .forEach((btn) => btn.classList.remove("active"));
            document
                .querySelectorAll(".tab-content")
                .forEach((content) => content.classList.remove("active"));

            // Add active class to clicked button and corresponding content
            button.classList.add("active");
            const tabId = button.getAttribute("data-tab");
            document.getElementById(`${tabId}-tab`).classList.add("active");
        });
    });
}

window.addEventListener("load", async () => {
    init();
    initTabs();
    document.querySelector("#btn-connect").addEventListener("click", connect);
    document
        .querySelector("#btn-disconnect")
        .addEventListener("click", disconnect);
    document.querySelector("#startButton").addEventListener("click", startGame);
});

async function claimVoucher(indexVoucher) {
    try {
        const voucher = globalVouchers[indexVoucher];

        if (!voucher) {
            throw new Error("Invalid voucher index.");
        }

        const { destination, payload, proof } = voucher;
        console.log("Voucher Data:", { destination, payload, proof });

        const contractAddress = "0xab7528bb862fB57E8A2BCd567a2e929a0Be56a5e";

        // ABI con la definición correcta de "Proof"
        const contractABI = [
            {
                inputs: [
                    {
                        internalType: "address",
                        name: "_destination",
                        type: "address",
                    },
                    { internalType: "bytes", name: "_payload", type: "bytes" },
                    {
                        internalType: "struct Proof",
                        name: "_proof",
                        type: "tuple",
                        components: [
                            {
                                internalType: "struct OutputValidityProof",
                                name: "validity",
                                type: "tuple",
                                components: [
                                    {
                                        internalType: "uint64",
                                        name: "inputIndexWithinEpoch",
                                        type: "uint64",
                                    },
                                    {
                                        internalType: "uint64",
                                        name: "outputIndexWithinInput",
                                        type: "uint64",
                                    },
                                    {
                                        internalType: "bytes32",
                                        name: "outputHashesRootHash",
                                        type: "bytes32",
                                    },
                                    {
                                        internalType: "bytes32",
                                        name: "vouchersEpochRootHash",
                                        type: "bytes32",
                                    },
                                    {
                                        internalType: "bytes32",
                                        name: "noticesEpochRootHash",
                                        type: "bytes32",
                                    },
                                    {
                                        internalType: "bytes32",
                                        name: "machineStateHash",
                                        type: "bytes32",
                                    },
                                    {
                                        internalType: "bytes32[]",
                                        name: "outputHashInOutputHashesSiblings",
                                        type: "bytes32[]",
                                    },
                                    {
                                        internalType: "bytes32[]",
                                        name: "outputHashesInEpochSiblings",
                                        type: "bytes32[]",
                                    },
                                ],
                            },
                            {
                                internalType: "bytes",
                                name: "context",
                                type: "bytes",
                            },
                        ],
                    },
                ],
                name: "executeVoucher",
                outputs: [{ internalType: "bool", name: "", type: "bool" }],
                stateMutability: "nonpayable",
                type: "function",
            },
        ];

        // Inicializar el contrato
        const contract = new web3.eth.Contract(contractABI, contractAddress);

        if (!proof || !proof.validity || !proof.context) {
            throw new Error("Invalid proof format received.");
        }

        // Convertir proof a formato correcto
        const formattedProof = {
            validity: {
                inputIndexWithinEpoch: Number(
                    proof.validity.inputIndexWithinEpoch
                ), // Convertir uint64
                outputIndexWithinInput: Number(
                    proof.validity.outputIndexWithinInput
                ), // Convertir uint64
                outputHashesRootHash: proof.validity.outputHashesRootHash,
                vouchersEpochRootHash: proof.validity.vouchersEpochRootHash,
                noticesEpochRootHash: proof.validity.noticesEpochRootHash,
                machineStateHash: proof.validity.machineStateHash,
                outputHashInOutputHashesSiblings:
                    proof.validity.outputHashInOutputHashesSiblings.map((e) =>
                        e.toString()
                    ), // Asegurar formato bytes32[]
                outputHashesInEpochSiblings:
                    proof.validity.outputHashesInEpochSiblings.map((e) =>
                        e.toString()
                    ), // Asegurar formato bytes32[]
            },
            context: proof.context.toString(), // Convertir a bytes válido
        };

        console.log("Executing Voucher Transaction...", {
            destination,
            payload,
            formattedProof,
        });

        // Enviar transacción a executeVoucher
        const tx = await contract.methods
            .executeVoucher(destination, payload, formattedProof)
            .send({
                from: mainAccount,
            });

        console.log("Transaction submitted. Waiting for confirmation...");

        await waitForTransactionConfirmation(tx.transactionHash);

        console.log("Voucher successfully claimed!");
        alert("Voucher successfully claimed!");
    } catch (error) {
        console.error("Error executing voucher:", error);
        alert("Failed to claim voucher");
    }
}

// Make it available globally since we're using onclick in the HTML
window.claimVoucher = claimVoucher;

module.exports = { mainAccount, web3, provider, payGame };
