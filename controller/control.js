const mqtt = require('mqtt');
const { MongoClient } = require('mongodb');

/* ------------------ CONFIG ------------------ */
const BROKER_ADDRESS = 'mqtt://localhost:1883';
const DATA_TOPICS = [
    'sensors/temperature/data', 
    'sensors/pressure/data'
];
const PORT = 5001;
const MONGO_URL = 'mongodb://localhost:27017';
const DB_NAME = 'pt_db';
const COLLECTION_NAME = 'sensor_readings';
const HOST_NAME = '0.0.0.0'
const CONTROL_INTERVAL_MS = 10000;
const MQTT_CLIENT_ID = 'mqtt_controller_001';
const MQTT_OPTIONS = { qos: 1, retain: false };

/* ------------------ STATE ------------------ */
let collection;
const table = {};  // In-memory sensor + valve states
const alerts = [];

/* ------------------ MONGODB ------------------ */
async function connectDB() {
    const client = new MongoClient(MONGO_URL);
    await client.connect();
    const db = client.db(DB_NAME);
    collection = db.collection(COLLECTION_NAME);
    console.log('Controller connected to MongoDB');
}

/* ------------------ MQTT SETUP ------------------ */
async function setupMQTT() {
    const mqttClient = mqtt.connect(BROKER_ADDRESS, {
        clientId: MQTT_CLIENT_ID,
        clean: true
    });

    mqttClient.on('connect', () => {
        console.log('Controller connected to MQTT Broker');
        
        // Subscribe to SAME topics as index.js
        DATA_TOPICS.forEach(topic => {
            mqttClient.subscribe(topic, MQTT_OPTIONS);
            console.log(`Subscribed to ${topic}`);
        });
    });

    mqttClient.on('message', (topic, message) => {
        const payload = message.toString();
        let value = parseFloat(payload);
        
        // Handle RAW numeric values from sensors (same as index.js)
        if (topic === 'sensors/temperature/data' && !Number.isNaN(value)) {
            table.temperature = value;
            console.log(`Controller: Temperature = ${value}°C`);
        } 
        else if (topic === 'sensors/pressure/data' && !Number.isNaN(value)) {
            table.pressure = value;
            console.log(`Controller: Pressure = ${value} bar`);
        }
    });

    mqttClient.on('error', (err) => {
        console.error('MQTT error:', err.message);
    });

    return mqttClient;
}

/* ------------------ CONTROL LOOP ------------------ */
setInterval(() => {
    check_and_act(table);
}, CONTROL_INTERVAL_MS);

/* ------------------ CONTROL LOGIC ------------------ */
function check_and_act(table) {
    check_and_act_for_temperature(table);
    check_and_act_for_pressure(table);
}

function sendSNS(message) {
    console.log("SNS Notification:", message);
    alerts.push({ message, timestamp: new Date() });
}

function check_and_act_for_temperature(table) {
    if (table.temperature === undefined) return;

    if (!isTemperatureGreaterThanMax(table.temperature) &&
        !isTemperatureLessThanMin(table.temperature)) {
        if (table.cool_valve) updateValve("cool_valve", false);
        if (table.heat_valve) updateValve("heat_valve", false);
        return;
    }

    if (isTemperatureGreaterThanMax(table.temperature) && !table.cool_valve) {
        updateValve("cool_valve", true);
        updateValve("heat_valve", false);
    }

    if (isTemperatureLessThanMin(table.temperature) && !table.heat_valve) {
        updateValve("heat_valve", true);
        updateValve("cool_valve", false);
    }

    if (isTemperatureGreaterThanMax(table.temperature) && table.cool_valve) {
        sendSNS(`Temperature is too high: ${table.temperature}°C. Cooling valve is OPEN.`);
    }
    
    if (isTemperatureLessThanMin(table.temperature) && table.heat_valve) {
        sendSNS(`Temperature is too low: ${table.temperature}°C. Heating valve is OPEN.`);
    }
}

function check_and_act_for_pressure(table) {
    if (table.pressure === undefined) return;

    if (!isPressureGreaterThanMax(table.pressure) &&
        !isPressureLessThanMin(table.pressure)) {
        if (table.pressureIn_valve) updateValve("pressureIn_valve", false);
        if (table.pressureOut_valve) updateValve("pressureOut_valve", false);
        return;
    }

    if (isPressureGreaterThanMax(table.pressure) && !table.pressureOut_valve) {
        updateValve("pressureOut_valve", true);
        updateValve("pressureIn_valve", false);
    }

    if (isPressureLessThanMin(table.pressure) && !table.pressureIn_valve) {
        updateValve("pressureIn_valve", true);
        updateValve("pressureOut_valve", false);
    }

    if (isPressureGreaterThanMax(table.pressure) && table.pressureOut_valve) {
        sendSNS(`Pressure is too high: ${table.pressure} atm. Pressure OUT valve is OPEN.`);
    }
    
    if (isPressureLessThanMin(table.pressure) && table.pressureIn_valve) {
        sendSNS(`Pressure is too low: ${table.pressure} atm. Pressure IN valve is OPEN.`);
    }
}

/* ------------------ THRESHOLDS ------------------ */
function isTemperatureGreaterThanMax(t) { return t > 95; }
function isTemperatureLessThanMin(t) { return t < 15; }
function isPressureGreaterThanMax(p) { return p > 8.1; }
function isPressureLessThanMin(p) { return p < 2.1; }

/* ------------------ VALVE ACTUATION ------------------ */
async function updateValve(valve, state) {
    try {
        table[valve] = state;

        // Store valves in SAME collection as sensors for index.js compatibility
        await collection.updateOne(
            { sensorType: valve },  // Use sensorType to match index.js structure
            {
                $set: {
                    sensorType: valve,
                    valve_on: state,
                    timestamp: new Date(),
                    source: 'CONTROLLER'
                }
            },
            { upsert: true }
        );

        console.log(` Valve ${valve} → ${state ? "OPEN" : "CLOSED"}`);
    } catch (err) {
        console.error("Valve command failed:", err.message);
    }
}

/* ------------------ ALERTS ENDPOINT (Optional HTTP) ------------------ */
const express = require('express');
const alertsApp = express();
alertsApp.use(require('cors')());

alertsApp.get('/alerts', (req, res) => {
    res.json(alerts.slice(-3));  // Last 3 alerts
});


/* ------------------ STARTUP ------------------ */
(async () => {
    await connectDB();
    await setupMQTT();
    
    // Optional: Start alerts HTTP server on different port
    alertsApp.listen(PORT, HOST_NAME, () => {
    });
    
    console.log(`MQTT Controller running on PORT: http://${HOST_NAME}:${PORT}`);
})();
