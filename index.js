import "dotenv/config";
import blessed from "blessed";
import figlet from "figlet";
import { ethers } from "ethers";
import puppeteer from "puppeteer";

const RPC_URL_SEPOLIA = process.env.RPC_URL_SEPOLIA;
const RPC_URL_T1 = process.env.RPC_URL_T1;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const NETWORK_NAME = "SEPOLIA & T1";
const WEB_URL_DEPOSIT = "https://devnet.t1protocol.com/bridge?transactionType=Deposit";
const WEB_URL_WITHDRAW = "https://devnet.t1protocol.com/bridge?transactionType=Withdraw";
const destChainIdT1 = 299792;
const destChainIdSepolia = 11155111;
const Router_Sepolia = "0xAFdF5cb097D6FB2EB8B1FFbAB180e667458e18F4";
const Router_T1 = "0x627B3692969b7330b8Faed2A8836A41EB4aC1918";
const BridgeABI = [
  "function sendMessage(address _to, uint256 _value, bytes _message, uint256 _gasLimit, uint64 _destChainId, address _callbackAddress) external payable"
];


let walletInfo = {
  address: "",
  balanceEthSepolia: "0.00",
  balanceEthT1: "0.00",
  network: NETWORK_NAME,
  status: "Initializing"
};

let transactionLogs = [];
let bridgeRunning = false;
let bridgeCancelled = false;
let globalWallet = null;

function getShortAddress(address) {
  return address.slice(0, 6) + "..." + address.slice(-4);
}

function addLog(message, type) {
  const timestamp = new Date().toLocaleTimeString();
  let coloredMessage = message;
  if (type === "bridge") {
    coloredMessage = `{bright-magenta-fg}${message}{/bright-magenta-fg}`;
  } else if (type === "system") {
    coloredMessage = `{bright-white-fg}${message}{/bright-white-fg}`;
  } else if (type === "error") {
    coloredMessage = `{bright-red-fg}${message}{/bright-red-fg}`;
  } else if (type === "success") {
    coloredMessage = `{bright-green-fg}${message}{/bright-green-fg}`;
  } else if (type === "warning") {
    coloredMessage = `{bright-yellow-fg}${message}{/bright-yellow-fg}`;
  }
  transactionLogs.push(`{bright-cyan-fg}[{/bright-cyan-fg} {bold}{grey-fg}${timestamp}{/grey-fg}{/bold} {bright-cyan-fg}]{/bright-cyan-fg} {bold}${coloredMessage}{/bold}`);
  updateLogs();
}

function getRandomDelay() {
  return Math.random() * (60000 - 30000) + 30000;
}

function getRandomNumber(min, max) {
  return Math.random() * (max - min) + min;
}

function getShortHash(hash) {
  return hash.slice(0, 6) + "..." + hash.slice(-4);
}

function updateLogs() {
  logsBox.setContent(transactionLogs.join("\n"));
  logsBox.setScrollPerc(100);
  safeRender();
}

function clearTransactionLogs() {
  transactionLogs = [];
  updateLogs();
  addLog("Transaction logs telah dihapus.", "system");
}

async function waitWithCancel(delay, type) {
  return Promise.race([
    new Promise(resolve => setTimeout(resolve, delay)),
    new Promise(resolve => {
      const interval = setInterval(() => {
        if (type === "bridge" && bridgeCancelled) { clearInterval(interval); resolve(); }
      }, 100);
    })
  ]);
}

const screen = blessed.screen({
  smartCSR: true,
  title: "T1 Bridge",
  fullUnicode: true,
  mouse: true
});
let renderTimeout;
function safeRender() {
  if (renderTimeout) clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => { screen.render(); }, 50);
}

const headerBox = blessed.box({
  top: 0,
  left: "center",
  width: "100%",
  tags: true,
  style: { fg: "white", bg: "default" }
});

figlet.text("NT EXHAUST".toUpperCase(), { font: "Speed", horizontalLayout: "default" }, (err, data) => {
  if (err) headerBox.setContent("{center}{bold}NT Exhaust{/bold}{/center}");
  else headerBox.setContent(`{center}{bold}{bright-cyan-fg}${data}{/bright-cyan-fg}{/bold}{/center}`);
  safeRender();
});

const descriptionBox = blessed.box({
  left: "center",
  width: "100%",
  content: "{center}{bold}{bright-yellow-fg}✦ ✦ T1 BRIDGE TOOL ✦ ✦{/bright-yellow-fg}{/bold}{/center}",
  tags: true,
  style: { fg: "white", bg: "default" }
});

const logsBox = blessed.box({
  label: " Transaction Logs ",
  left: 0,
  border: { type: "line" },
  scrollable: true,
  alwaysScroll: true,
  mouse: true,
  keys: true,
  vi: true,
  tags: true,
  scrollbar: { ch: " ", inverse: true, style: { bg: "blue" } },
  content: "",
  style: { border: { fg: "bright-cyan" }, bg: "default" }
});

const walletBox = blessed.box({
  label: " Informasi Wallet ",
  border: { type: "line" },
  tags: true,
  style: { border: { fg: "magenta" }, fg: "white", bg: "default", align: "left", valign: "top" },
  content: "Loading data wallet..."
});

const mainMenu = blessed.list({
  label: " Menu ",
  left: "60%",
  keys: true,
  vi: true,
  mouse: true,
  border: { type: "line" },
  style: { fg: "white", bg: "default", border: { fg: "red" }, selected: { bg: "green", fg: "black" } },
  items: getMainMenuItems()
});

const bridgeSubMenu = blessed.list({
  label: " T1 Bridge Sub Menu ",
  left: "60%",
  keys: true,
  vi: true,
  mouse: true,
  border: { type: "line" },
  style: { fg: "white", bg: "default", border: { fg: "red" }, selected: { bg: "cyan", fg: "black" } },
  items: getBridgeMenuItems()
});
bridgeSubMenu.hide();

const promptBox = blessed.prompt({
  parent: screen,
  border: "line",
  height: 5,
  width: "60%",
  top: "center",
  left: "center",
  label: "{bright-blue-fg}Bridge Prompt{/bright-blue-fg}",
  tags: true,
  keys: true,
  vi: true,
  mouse: true,
  style: { fg: "bright-red", bg: "default", border: { fg: "red" } }
});

screen.append(headerBox);
screen.append(descriptionBox);
screen.append(logsBox);
screen.append(walletBox);
screen.append(mainMenu);
screen.append(bridgeSubMenu);

function getMainMenuItems() {
  let items = ["T1 Bridge", "Clear Transaction Logs", "Refresh", "Exit"];
  if (bridgeRunning) {
    items.unshift("Stop All Transactions");
  }
  return items;
}

function getBridgeMenuItems() {
  let items = ["Auto Bridge ETH Sepolia & T1", "Clear Transaction Logs", "Back To Main Menu", "Refresh"];
  if (bridgeRunning) {
    items.splice(1, 0, "Stop Transaction");
  }
  return items;
}

function updateWallet() {
  const shortAddress = walletInfo.address ? getShortAddress(walletInfo.address) : "N/A";
  const ethSepolia = walletInfo.balanceEthSepolia ? Number(walletInfo.balanceEthSepolia).toFixed(4) : "0.0000";
  const ethT1 = walletInfo.balanceEthT1 ? Number(walletInfo.balanceEthT1).toFixed(4) : "0.0000";
  const content = `┌── Address          : {bright-yellow-fg}${shortAddress}{/bright-yellow-fg}
│   ├── ETH Sepolia  : {bright-green-fg}${ethSepolia}{/bright-green-fg}
│   └── ETH T1       : {bright-green-fg}${ethT1}{/bright-green-fg}
└── Networks         : {bright-cyan-fg}${NETWORK_NAME}{/bright-cyan-fg}
`;
  walletBox.setContent(content);
  safeRender();
}

async function updateWalletData() {
  try {
    const providerSepolia = new ethers.JsonRpcProvider(RPC_URL_SEPOLIA);
    const providerT1 = new ethers.JsonRpcProvider(RPC_URL_T1);
    const wallet = new ethers.Wallet(PRIVATE_KEY, providerSepolia);
    globalWallet = wallet;
    walletInfo.address = wallet.address;
    const ethBalanceSepolia = await providerSepolia.getBalance(wallet.address);
    walletInfo.balanceEthSepolia = ethers.formatEther(ethBalanceSepolia);
    const ethBalanceT1 = await providerT1.getBalance(wallet.address);
    walletInfo.balanceEthT1 = ethers.formatEther(ethBalanceT1);
    updateWallet();
    addLog("Saldo & Wallet Updated !!", "system");
  } catch (error) {
    addLog("Gagal mengambil data wallet: " + error.message, "system");
  }
}

function stopAllTransactions() {
  if (bridgeRunning) {
    bridgeCancelled = true;
    addLog("Stop All Transactions command received. Semua transaksi telah dihentikan.", "system");
  }
}

async function injectTxDataToWeb(txData, transactionType) {
  try {
    const targetURL = transactionType === "Deposit" ? WEB_URL_DEPOSIT : WEB_URL_WITHDRAW;
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      userDataDir: './puppeteer_data'
    });
    const page = await browser.newPage();
    page.on("console", (msg) => {
      console.log("PAGE LOG:", msg.text());
    });

    await page.goto(targetURL, { waitUntil: "networkidle2" });
    await page.waitForSelector("body");

    const injectionResult = await page.evaluate(({ wallet, txData }) => {
      let stateStr = localStorage.getItem("bridgeTransactionsV2");
      let stateObj = stateStr
        ? JSON.parse(stateStr)
        : {
            state: {
              page: 1,
              total: 0,
              frontTransactions: {},
              pageTransactions: []
            },
            version: 0
          };
        const lowerWallet = wallet.toLowerCase();
        if (!stateObj.state.frontTransactions) {
        stateObj.state.frontTransactions = {};
      }
      if (!stateObj.state.frontTransactions[lowerWallet]) {
        stateObj.state.frontTransactions[lowerWallet] = [];
      }
      stateObj.state.frontTransactions[lowerWallet].unshift(txData);  
      localStorage.setItem("bridgeTransactionsV2", JSON.stringify(stateObj));
      return stateObj;
    }, { wallet: txData.from, txData });
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await browser.close();
    addLog("T1: Succesfully Inject Transaction To Web.", "success");
  } catch (error) {
    addLog("Inject Error: " + error.message, "error");
  }
}

async function bridgeFromSepoliaToT1(i, amount) {
  addLog(`T1: Melakukan Bridge Sepolia ➯  T1, Ammount ${ethers.formatEther(amount)} ETH `, "bridge");
  const providerSepolia = new ethers.JsonRpcProvider(RPC_URL_SEPOLIA);
  const walletSepolia = new ethers.Wallet(PRIVATE_KEY, providerSepolia);
  const contractSepolia = new ethers.Contract(Router_Sepolia, BridgeABI, walletSepolia);
  const extraFee = ethers.parseEther("0.000000000000168");
  const totalValue = amount + extraFee;
  try {
    const tx = await contractSepolia.sendMessage(
      walletSepolia.address,
      amount,
      "0x",            
      168000,       
      destChainIdT1,
      walletSepolia.address,
      { value: totalValue, gasLimit: 500000 }
    );
    addLog(`T1: Transaction Sent. Hash: ${getShortHash(tx.hash)}`, "bridge");
    const receipt = await tx.wait();
    if (receipt.status === 1) {
      addLog(`T1: Transaction Successfully. Hash: ${getShortHash(tx.hash)} .`, "success");
      const blockNumber = receipt.blockNumber;
      const txData = {
        hash: tx.hash,
        amount: amount.toString(),
        isL1: true,
        timestamp: Date.now(),
        initiatedAt: Math.floor(Date.now() / 1000),
        txStatus: 0,
        fromBlockNumber: blockNumber,
        from: walletSepolia.address
      };
      await injectTxDataToWeb(txData, "Deposit");
      await updateWalletData();
    } else {
      addLog(`T1: Transaksi gagal.`, "error");
    }
  } catch (error) {
    addLog(`T1: Error - ${error.message}`, "error");
  }
}

async function bridgeFromT1ToSepolia(i, amount) {
  addLog(`T1: Melakukan Bridge T1 ➯  Sepolia, Ammount ${ethers.formatEther(amount)} ETH `, "bridge");
  const providerT1 = new ethers.JsonRpcProvider(RPC_URL_T1);
  const walletT1 = new ethers.Wallet(PRIVATE_KEY, providerT1);
  const contractT1 = new ethers.Contract(Router_T1, BridgeABI, walletT1);
  try {
    const tx = await contractT1.sendMessage(
      walletT1.address,
      amount,
      "0x",
      0,
      destChainIdSepolia,
      walletT1.address,
      { value: amount, gasLimit: 500000 }
    );
    addLog(`T1: Transaction Sent. Hash: ${getShortHash(tx.hash)}`, "bridge");
    const receipt = await tx.wait();
    if (receipt.status === 1) {
      addLog(`T1: Transaction Successfully. Hash: ${getShortHash(tx.hash)}`, "success");
      const txData = {
        hash: tx.hash,
        amount: amount.toString(),
        isL1: false,
        timestamp: Date.now(),
        initiatedAt: Math.floor(Date.now() / 1000),
        txStatus: 0,
        fromBlockNumber: receipt.blockNumber,
        from: walletT1.address
      };
      await injectTxDataToWeb(txData, "Withdraw");
      await updateWalletData();
    } else {
      addLog(`T1: Transaction Failed.`, "error");
    }
  } catch (error) {
    addLog(`T1: Error - ${error.message}`, "error");
  }
}


async function runAutoBridge() {
  promptBox.setFront();
  promptBox.readInput("Masukkan Jumlah Berapa Kali Bridge:", "", async (err, value) => {
    promptBox.hide();
    safeRender();
    if (err || !value) {
      addLog("T1 Bridge: Input tidak valid atau dibatalkan.", "bridge");
      return;
    }
    const loopCount = parseInt(value);
    if (isNaN(loopCount)) {
      addLog("T1 Bridge: Input harus berupa angka.", "bridge");
      return;
    }
    addLog(`T1 Bridge: Anda memasukkan ${loopCount} Kali Auto bridge.`, "bridge");
    if (bridgeRunning) {
      addLog("T1 Bridge: Transaksi Sedang Berjalan. Silahkan stop transaksi terlebih dahulu.", "system");
      return;
    }
    bridgeRunning = true;
    bridgeCancelled = false;
    mainMenu.setItems(getMainMenuItems());
    bridgeSubMenu.setItems(getBridgeMenuItems());
    bridgeSubMenu.show();
    safeRender();
    for (let i = 1; i <= loopCount; i++) {
      if (bridgeCancelled) {
        addLog(`T1 Bridge: Auto bridge dihentikan pada cycle ke ${i}.`, "bridge");
        break;
      }
      const randomAmount = getRandomNumber(0.0001, 0.001);
      const amount = ethers.parseEther(randomAmount.toFixed(6));
      if (i % 2 === 1) {
        await bridgeFromSepoliaToT1(i, amount);
      } else {
        await bridgeFromT1ToSepolia(i, amount);
      }

      if (i < loopCount) {
        const delayTime = getRandomDelay();
        const minutes = Math.floor(delayTime / 60000);
        const seconds = Math.floor((delayTime % 60000) / 1000);
        addLog(`T1 Bridge: Bridge Ke  ${i} Selesai.`, "bridge");
        addLog(`T1 Bridge: Menunggu ${minutes} menit ${seconds} detik sebelum transaksi berikutnya...`, "bridge");
        await waitWithCancel(delayTime, "bridge");
        if (bridgeCancelled) {
          addLog("T1 Bridge: Auto bridge dihentikan saat waktu tunggu.", "bridge");
          break;
        }
      }
    }
    bridgeRunning = false;
    mainMenu.setItems(getMainMenuItems());
    bridgeSubMenu.setItems(getBridgeMenuItems());
    safeRender();
    addLog("T1 Bridge: Auto bridge selesai.", "bridge");
  });
}

function adjustLayout() {
  const screenHeight = screen.height;
  const screenWidth = screen.width;
  const headerHeight = Math.max(8, Math.floor(screenHeight * 0.15));
  headerBox.top = 0;
  headerBox.height = headerHeight;
  headerBox.width = "100%";
  descriptionBox.top = "25%";
  descriptionBox.height = Math.floor(screenHeight * 0.05);
  logsBox.top = headerHeight + descriptionBox.height;
  logsBox.left = 0;
  logsBox.width = Math.floor(screenWidth * 0.6);
  logsBox.height = screenHeight - (headerHeight + descriptionBox.height);
  walletBox.top = headerHeight + descriptionBox.height;
  walletBox.left = Math.floor(screenWidth * 0.6);
  walletBox.width = Math.floor(screenWidth * 0.4);
  walletBox.height = Math.floor(screenHeight * 0.35);
  mainMenu.top = headerHeight + descriptionBox.height + walletBox.height;
  mainMenu.left = Math.floor(screenWidth * 0.6);
  mainMenu.width = Math.floor(screenWidth * 0.4);
  mainMenu.height = screenHeight - (headerHeight + descriptionBox.height + walletBox.height);
  bridgeSubMenu.top = mainMenu.top;
  bridgeSubMenu.left = mainMenu.left;
  bridgeSubMenu.width = mainMenu.width;
  bridgeSubMenu.height = mainMenu.height;
  safeRender();
}

screen.on("resize", adjustLayout);
adjustLayout();

mainMenu.on("select", (item) => {
  const selected = item.getText();
  if (selected === "Stop All Transactions") {
    stopAllTransactions();
    mainMenu.setItems(getMainMenuItems());
    mainMenu.focus();
    safeRender();
  } else if (selected === "T1 Bridge") {
    bridgeSubMenu.show();
    bridgeSubMenu.focus();
    safeRender();
  } else if (selected === "Clear Transaction Logs") {
    clearTransactionLogs();
  } else if (selected === "Refresh") {
    updateWalletData();
    updateLogs();
    safeRender();
    addLog("Refreshed", "system");
  } else if (selected === "Exit") {
    process.exit(0);
  }
});

bridgeSubMenu.on("select", (item) => {
  const selected = item.getText();
  if (selected === "Auto Bridge ETH Sepolia & T1") {
    runAutoBridge();
  } else if (selected === "Stop Transaction") {
    if (bridgeRunning) {
      bridgeCancelled = true;
      addLog("T1 Bridge: Perintah Stop Transaction diterima.", "bridge");
    } else {
      addLog("T1 Bridge: Tidak ada transaksi yang berjalan.", "bridge");
    }
  } else if (selected === "Clear Transaction Logs") {
    clearTransactionLogs();
  } else if (selected === "Back To Main Menu") {
    bridgeSubMenu.hide();
    mainMenu.show();
    mainMenu.focus();
    safeRender();
  } else if (selected === "Refresh") {
    updateWalletData();
    updateLogs();
    safeRender();
    addLog("Refreshed", "system");
  }
});

screen.key(["escape", "q", "C-c"], () => process.exit(0));
screen.key(["C-up"], () => { logsBox.scroll(-1); safeRender(); });
screen.key(["C-down"], () => { logsBox.scroll(1); safeRender(); });

safeRender();
mainMenu.focus();
addLog("Dont Forget To Subscribe YT And Telegram @NTExhaust!!", "system");
updateLogs();
updateWalletData();