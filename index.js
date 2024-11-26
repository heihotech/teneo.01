const axios = require("axios");
const chalk = require("chalk");
const WebSocket = require("ws");
const { HttpsProxyAgent } = require("https-proxy-agent");
const readline = require("readline");
const accounts = require("./account.js");
const proxies = require("./proxy.js");
const { useProxy } = require("./config.js");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let sockets = [];
let pingIntervals = [];
let countdownIntervals = [];
let potentialPoints = [];
let countdowns = [];
let pointsTotals = [];
let pointsToday = [];
let lastUpdateds = [];
let messages = [];
let userIds = [];

const authorization =
  "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlra25uZ3JneHV4Z2pocGxicGV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjU0MzgxNTAsImV4cCI6MjA0MTAxNDE1MH0.DRAvf8nH1ojnJBc3rD_Nw6t1AV8X_g6gmY_HByG2Mag";
const apikey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlra25uZ3JneHV4Z2pocGxicGV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjU0MzgxNTAsImV4cCI6MjA0MTAxNDE1MH0.DRAvf8nH1ojnJBc3rD_Nw6t1AV8X_g6gmY_HByG2Mag";

function displayHeader() {
  // console.log("");
  // console.log(chalk.yellow(" ============================================"));
  // console.log(chalk.yellow("|                 Teneo Bot                  |"));
  // console.log(chalk.yellow("|         github.com/recitativonika          |"));
  // console.log(chalk.yellow(" ============================================"));
  // console.log("");
  // console.log(chalk.cyan(`_____________________________________________`));
}

function displayAccountData(index) {
  // console.log(
  //   chalk.cyan(`================= Account ${index + 1} =================`)
  // );
  // console.log(chalk.whiteBright(`Email: ${accounts[index].email}`));
  // console.log(chalk.green(`Points Total: ${pointsTotals[index]}`));
  // console.log(chalk.green(`Points Today: ${pointsToday[index]}`));
  // const proxy = proxies[index % proxies.length];
  // if (useProxy) {
  //   console.log(
  //     chalk.hex("#FFA500")(
  //       `Proxy: ${proxy.host}:${proxy.port} (User: ${proxy.username})`
  //     )
  //   );
  // }
  // console.log(chalk.cyan(`_____________________________________________`));
}

function logAllAccounts() {
  console.clear();
  displayHeader();
  for (let i = 0; i < accounts.length; i++) {
    displayAccountData(i);
  }
  console.log("\nStatus:");
  for (let i = 0; i < accounts.length; i++) {
    console.log(
      `${pointsTotals[i]} - ${accounts[i].email}: Potential Points: ${potentialPoints[i]}, Countdown: ${countdowns[i]}`
    );
  }
}

async function connectWebSocket(index) {
  if (sockets[index]) return;
  const version = "v0.2";
  const url = "wss://secure.ws.teneo.pro";
  const wsUrl = `${url}/websocket?userId=${encodeURIComponent(
    userIds[index]
  )}&version=${encodeURIComponent(version)}`;

  const proxy = proxies[index % proxies.length];
  const agent = useProxy
    ? new HttpsProxyAgent(
        `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`
      )
    : null;

  sockets[index] = new WebSocket(wsUrl, { agent });

  sockets[index].onopen = async () => {
    lastUpdateds[index] = new Date().toISOString();
    // console.log(`Account ${index + 1} Connected`, lastUpdateds[index]);
    startPinging(index);
    startCountdownAndPoints(index);
  };

  sockets[index].onmessage = async (event) => {
    const data = JSON.parse(event.data);
    if (data.pointsTotal !== undefined && data.pointsToday !== undefined) {
      lastUpdateds[index] = new Date().toISOString();
      pointsTotals[index] = data.pointsTotal;
      pointsToday[index] = data.pointsToday;
      messages[index] = data.message;

      logAllAccounts();
    }

    if (data.message === "Pulse from server") {
      // console.log(
      //   `Pulse from server received for Account ${
      //     index + 1
      //   }. Restarting WebSocket connection in 10 seconds...`
      // );
      setTimeout(() => {
        disconnectWebSocket(index);
        connectWebSocket(index);
      }, 10000);
    }
  };

  sockets[index].onclose = () => {
    sockets[index] = null;
    // console.log(`Account ${index + 1} Disconnected`);
    stopPinging(index);
  };

  sockets[index].onerror = (error) => {
    console.error(`WebSocket error for Account ${index + 1}:`, error);
  };
}

function disconnectWebSocket(index) {
  if (sockets[index]) {
    sockets[index].close();
    sockets[index] = null;
    stopPinging(index);
  }
}

function startPinging(index) {
  stopPinging(index);
  pingIntervals[index] = setInterval(async () => {
    if (sockets[index] && sockets[index].readyState === WebSocket.OPEN) {
      const proxy = proxies[index % proxies.length];
      const agent = useProxy ? new HttpsProxyAgent(proxy) : null;
      // const agent = useProxy ? new HttpsProxyAgent(`http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`) : null;

      sockets[index].send(JSON.stringify({ type: "PING" }), { agent });
      logAllAccounts();
    }
  }, 10000);
}

function stopPinging(index) {
  if (pingIntervals[index]) {
    clearInterval(pingIntervals[index]);
    pingIntervals[index] = null;
  }
}

function startCountdownAndPoints(index) {
  clearInterval(countdownIntervals[index]);
  updateCountdownAndPoints(index);
  countdownIntervals[index] = setInterval(
    () => updateCountdownAndPoints(index),
    1000
  );
}

async function updateCountdownAndPoints(index) {
  if (lastUpdateds[index]) {
    const nextHeartbeat = new Date(lastUpdateds[index]);
    nextHeartbeat.setMinutes(nextHeartbeat.getMinutes() + 15);
    const now = new Date();
    const diff = nextHeartbeat.getTime() - now.getTime();

    if (diff > 0) {
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      countdowns[index] = `${minutes}m ${seconds}s`;

      const maxPoints = 25;
      const timeElapsed =
        now.getTime() - new Date(lastUpdateds[index]).getTime();
      const timeElapsedMinutes = timeElapsed / (60 * 1000);
      let newPoints = Math.min(
        maxPoints,
        (timeElapsedMinutes / 15) * maxPoints
      );
      newPoints = parseFloat(newPoints.toFixed(2));

      if (Math.random() < 0.1) {
        const bonus = Math.random() * 2;
        newPoints = Math.min(maxPoints, newPoints + bonus);
        newPoints = parseFloat(newPoints.toFixed(2));
      }

      potentialPoints[index] = newPoints;
    } else {
      countdowns[index] = "Calculating...";
      potentialPoints[index] = 25;

      const timeSinceLastUpdate = now - new Date(lastUpdateds[index]);
      if (timeSinceLastUpdate > 60000) {
        // console.log(
        //   `Account ${
        //     index + 1
        //   } has been "Calculating..." for more than 1 minute. Restarting WebSocket.`
        // );
        disconnectWebSocket(index);
        connectWebSocket(index);
      }
    }
  } else {
    countdowns[index] = "Calculating...";
    potentialPoints[index] = 0;
  }

  logAllAccounts();
}

async function getUserId(index) {
  const loginUrl =
    "https://ikknngrgxuxgjhplbpey.supabase.co/auth/v1/token?grant_type=password";

  const proxy = proxies[index % proxies.length];
  const agent = useProxy
    ? new HttpsProxyAgent(
        `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`
      )
    : null;

  try {
    const response = await axios.post(
      loginUrl,
      {
        email: accounts[index].email,
        password: accounts[index].password,
      },
      {
        headers: {
          Authorization: authorization,
          apikey: apikey,
        },
        httpsAgent: agent,
      }
    );

    userIds[index] = response.data.user.id;
    logAllAccounts();

    const profileUrl = `https://ikknngrgxuxgjhplbpey.supabase.co/rest/v1/profiles?select=personal_code&id=eq.${userIds[index]}`;
    const profileResponse = await axios.get(profileUrl, {
      headers: {
        Authorization: authorization,
        apikey: apikey,
      },
      httpsAgent: agent,
    });

    // console.log(`Profile Data for Account ${index + 1}:`, profileResponse.data);
    startCountdownAndPoints(index);
    await connectWebSocket(index);
  } catch (error) {
    console.error(
      `Error for Account ${index + 1}:`,
      error.response ? error.response.data : error.message
    );
  }
}

displayHeader();

for (let i = 0; i < accounts.length; i++) {
  potentialPoints[i] = 0;
  countdowns[i] = "Calculating...";
  pointsTotals[i] = 0;
  pointsToday[i] = 0;
  lastUpdateds[i] = null;
  messages[i] = "";
  userIds[i] = null;
  getUserId(i);
}
