const express = require('express');
const bodyParser = require('body-parser');
const Binance = require('node-binance-api');

const binance = new Binance().options({
  APIKEY: 'zmywCXfuboPp4d3J3zUJS1BYWwEtsY4JHWS29ghDAfXMAQ6jaqc6EvSbukD4blfk', // Gerçek API anahtarınızla değiştirin
  APISECRET: 'jWk9MlkTluS70RYr3jokAgOBmwYGb3q5DQF5HIfLQGQEVfb2IpL0bOj9UfJ19BrX' // Gerçek API gizli anahtarınızla değiştirin
});

const kaldirac = 2
const islemmiktariusdt = 5

const app = express();
app.set('trust proxy', true);

app.use(bodyParser.json());

const allowedIps = ['52.89.214.238', '34.212.75.30', '54.218.53.128', '52.32.178.7', '159.146.40.124'];
app.use((req, res, next) => {
    const clientIp = req.ip;
    const normalizedClientIp = clientIp.startsWith('::ffff:') ? clientIp.substring(7) : clientIp;

    if (allowedIps.includes(normalizedClientIp)) {
        next();
    } else {
        console.log(normalizedClientIp); // Güncellenmiş IP adresini gösterir
        res.status(403).send('Access Denied');
    }
});

let currentPositions = {}; 

app.post('/webhook', async (req, res) => {
    console.log('Received Webhook:', req.body);
    const { coin, status } = req.body;

    // İlgili coin için mevcut pozisyonu al veya yoksa "initial" ata
    const currentPosition = currentPositions[coin] || "initial";

    // Mevcut pozisyon varsa ve farklı bir işlem gerekiyorsa, mevcut pozisyonu kapat
    if (currentPosition !== "initial") {
        let closingTime = new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
        console.log(`Closing current position for ${coin} at ${closingTime}`);
        await closePosition(coin, currentPosition);
    }

    // Yeni pozisyonu aç
    if (status === "sell" && currentPosition !== "sell") {
        let closingTime = new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
        console.log(`Processing sell order for ${coin} at ${closingTime}`);
        await setLeverage(coin, kaldirac);
        await placeOrder(coin, islemmiktariusdt, "sell");
    } else if (status === "buy" && currentPosition !== "buy") {
        let closingTime = new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
        console.log(`Processing buy order for ${coin} at ${closingTime}`);
        await setLeverage(coin, kaldirac);
        await placeOrder(coin, islemmiktariusdt, "buy");
    }

    // Güncel pozisyonu kaydet
    currentPositions[coin] = status;

    res.status(200).send('OK');
});



const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
    console.log(`Webhook receiver listening on port ${PORT}`);
});

async function setLeverage(symbol, leverage) {
    try {
      const response = await binance.futuresLeverage(symbol, leverage);
      console.log("Leverage set to:", response.leverage);
      return response.leverage;
    } catch (error) {
      console.error("Error setting leverage:", error.body);
      throw error;
    }
}
async function placeOrder(symbol, amountInDollars, ordertype) {
    try {
        const marketPrice = await binance.futuresMarkPrice(symbol);
        let quantity = amountInDollars / marketPrice.markPrice;
        quantity = parseFloat(quantity.toFixed(0));

        if (ordertype == "buy") {
            binance.futuresMarketBuy(symbol, quantity, {}, (error, response) => {
                if (error) {
                  console.error('Hata:', error.body);
                } else {
                  console.log('Short İşlem Başarıyla Açıldı:', response);
                }
            })

        } else {
            binance.futuresMarketSell(symbol, quantity, {}, (error, response) => {
                if (error) {
                  console.error('Hata:', error.body);
                } else {
                  console.log('Short İşlem Başarıyla Açıldı:', response);
                }
            })
        }
    } catch (error) {
        console.error("Error placing order:", error.body);
        throw error;
    }
}
async function closePosition(symbol, currentPosition) {
    console.log(`Attempting to close position for ${symbol}`);
    try {
        const position = await binance.futuresPositionRisk();
        const symbolPosition = position.filter(p => p.symbol === symbol)[0];
        const quantity = Math.abs(symbolPosition.positionAmt);

        if (quantity > 0) {
            if(currentPosition == "sell") {
                const closeOrder = await binance.futuresMarketBuy(symbol, quantity);
                console.log("Position closed:", closeOrder.side);
            } else {
                const closeOrder = await binance.futuresMarketSell(symbol, quantity);
                console.log("Position closed:", closeOrder.side);
            }
        } else {
            console.log("No open position to close for", symbol);
        }
    } catch (error) {
        console.error("Error closing position:", error.body);
        throw error;
    }
}